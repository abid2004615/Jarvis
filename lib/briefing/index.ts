/**
 * JARVIS Daily Briefing
 *
 * A bounded, read-only snapshot of the user's personal layer: open/overdue
 * tasks, upcoming reminders, active automations, system health, and the
 * frontmost application. Every field comes from real data — when a source has
 * no data it is reported honestly, never fabricated.
 *
 * The briefing never executes anything and never mutates state.
 */

import { getTaskManager } from "@/lib/tasks/manager";
import { getReminderManager } from "@/lib/reminders/manager";
import { getAutomationManager } from "@/lib/automation/manager";
import { getFrontmostApplication } from "@/lib/macos";
import { evaluateHealth, formatHealthReport, type HealthReport } from "@/lib/health";
import type { TaskSummary } from "@/lib/tasks/types";
import type { ReminderSummary } from "@/lib/reminders/types";

export interface BriefingTaskSection {
  open: number;
  overdue: number;
  dueToday: TaskSummary[];
  nextUp: TaskSummary[];
}

export interface BriefingReminderSection {
  upcoming: ReminderSummary[];
  overdue: number;
}

export interface BriefingAutomationSection {
  active: number;
  nextRuns: Array<{ id: string; name: string; nextRunAt?: number; requiresConfirmation: boolean }>;
}

export interface Briefing {
  generatedAt: number;
  tasks: BriefingTaskSection;
  reminders: BriefingReminderSection;
  automations: BriefingAutomationSection;
  health: HealthReport;
  frontmostApp?: string;
}

const MAX_TASKS = 6;
const MAX_REMINDERS = 5;
const MAX_AUTOMATION_RUNS = 5;

/** Build the briefing from real managers + telemetry. Never fabricates. */
export function buildBriefing(now?: number): Briefing {
  const t = now ?? Date.now();

  const tasks = getTaskManager().getAll();
  const reminders = getReminderManager().getAll();
  const automations = getAutomationManager().getAll();

  const open = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const overdue = open.filter((task) => task.dueAt !== undefined && task.dueAt < t);
  const dueToday = open
    .filter((task) => task.dueAt !== undefined && task.dueAt >= t && task.dueAt <= new Date(t).setHours(23, 59, 59, 999))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const overdueTasks = open
    .filter((task) => task.dueAt !== undefined && task.dueAt < t)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const nextUp = overdueTasks.slice(0, MAX_TASKS);

  const upcomingReminders = reminders
    .filter((r) => r.enabled && r.dueAt > t)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, MAX_REMINDERS);
  const overdueReminders = reminders.filter((r) => r.enabled && r.dueAt <= t).length;

  const activeAutomations = automations.filter((a) => a.enabled);
  const nextRuns = activeAutomations
    .filter((a) => a.nextRunAt !== undefined)
    .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
    .slice(0, MAX_AUTOMATION_RUNS)
    .map((a) => ({ id: a.id, name: a.name, nextRunAt: a.nextRunAt, requiresConfirmation: a.requiresConfirmation }));

  const frontmost = getFrontmostApplication();

  return {
    generatedAt: t,
    tasks: {
      open: open.length,
      overdue: overdue.length,
      dueToday: dueToday.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        tags: task.tags,
      })),
      nextUp: nextUp.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        tags: task.tags,
      })),
    },
    reminders: {
      upcoming: upcomingReminders,
      overdue: overdueReminders,
    },
    automations: { active: activeAutomations.length, nextRuns },
    health: evaluateHealth(),
    frontmostApp: frontmost.available && frontmost.name ? frontmost.name : undefined,
  };
}

/** Compact text rendering for HUD/dashboard. Bounded and honest. */
export function formatBriefing(briefing: Briefing): string {
  const lines: string[] = [];

  const taskLines = briefing.tasks.dueToday
    .slice(0, 5)
    .map((task) => `  - ${task.title}${task.dueAt ? ` (due ${new Date(task.dueAt).toLocaleString()})` : ""}`);
  lines.push(
    `Tasks: ${briefing.tasks.open} open (${briefing.tasks.overdue} overdue)` +
      (taskLines.length > 0 ? `\n${taskLines.join("\n")}` : ""),
  );

  const reminderLines = briefing.reminders.upcoming
    .slice(0, 5)
    .map((r) => `  - ${r.title} (${new Date(r.dueAt).toLocaleString()})`);
  lines.push(
    `Reminders: ${briefing.reminders.upcoming.length} upcoming` +
      (briefing.reminders.overdue > 0 ? ` (${briefing.reminders.overdue} missed)` : "") +
      (reminderLines.length > 0 ? `\n${reminderLines.join("\n")}` : ""),
  );

  lines.push(
    `Automations: ${briefing.automations.active} active` +
      (briefing.automations.nextRuns.length > 0
        ? `\n${briefing.automations.nextRuns
            .slice(0, 5)
            .map((a) => `  - ${a.name}${a.nextRunAt ? ` (next ${new Date(a.nextRunAt).toLocaleString()})` : ""}`)
            .join("\n")}`
        : ""),
  );

  lines.push(formatHealthReport(briefing.health));

  if (briefing.frontmostApp) {
    lines.push(`Frontmost application: ${briefing.frontmostApp}`);
  }

  return lines.join("\n");
}
