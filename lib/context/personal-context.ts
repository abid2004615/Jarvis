/**
 * JARVIS Personal Context — bounded, read-only projection
 *
 * A single aggregated snapshot of the user's personal layer for tools, the
 * dashboard, and HUD surfaces. It is a PROJECTION: it reads live managers and
 * never mutates state, and it is NEVER merged into permanent conversation
 * history. Size is explicitly bounded to prevent context bloat.
 *
 * Personal context does not replace memory, memory context, or the briefing;
 * it is a distinct read-only lens.
 */

import { getTaskManager } from "@/lib/tasks/manager";
import type { TaskSummary } from "@/lib/tasks/types";
import { getReminderManager } from "@/lib/reminders/manager";
import type { ReminderSummary } from "@/lib/reminders/types";
import { getAutomationManager } from "@/lib/automation/manager";
import { getFrontmostApplication } from "@/lib/macos";
import { evaluateHealth, type HealthReport } from "@/lib/health";

export interface PersonalContextSnapshot {
  generatedAt: number;
  frontmostApp?: string;
  openTasks: TaskSummary[];
  upcomingReminders: ReminderSummary[];
  activeAutomations: number;
  automationsNextRuns: Array<{ name: string; nextRunAt?: number }>;
  health: HealthReport;
}

export interface PersonalContextOptions {
  now?: number;
  maxTasks?: number;
  maxReminders?: number;
  maxAutomationRuns?: number;
}

const DEFAULT_MAX_TASKS = 8;
const DEFAULT_MAX_REMINDERS = 6;
const DEFAULT_MAX_AUTOMATION_RUNS = 4;

/** Build the bounded personal-context projection (read-only). */
export function buildPersonalContext(options: PersonalContextOptions = {}): PersonalContextSnapshot {
  const t = options.now ?? Date.now();
  const maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
  const maxReminders = options.maxReminders ?? DEFAULT_MAX_REMINDERS;
  const maxAutomationRuns = options.maxAutomationRuns ?? DEFAULT_MAX_AUTOMATION_RUNS;

  const openTasks = getTaskManager()
    .getAll()
    .filter((task) => task.status !== "completed" && task.status !== "cancelled")
    .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, maxTasks)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      tags: task.tags,
    }));

  const upcomingReminders = getReminderManager()
    .getAll()
    .filter((r) => r.enabled && r.dueAt > t)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, maxReminders);

  const automations = getAutomationManager().getAll().filter((a) => a.enabled);
  const automationsNextRuns = automations
    .filter((a) => a.nextRunAt !== undefined)
    .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
    .slice(0, maxAutomationRuns)
    .map((a) => ({ name: a.name, nextRunAt: a.nextRunAt }));

  const frontmost = getFrontmostApplication();

  return {
    generatedAt: t,
    frontmostApp: frontmost.available && frontmost.name ? frontmost.name : undefined,
    openTasks,
    upcomingReminders,
    activeAutomations: automations.length,
    automationsNextRuns,
    health: evaluateHealth(),
  };
}

/** Compact text projection (bounded). Returns null when everything is empty. */
export function formatPersonalContext(snapshot: PersonalContextSnapshot): string | null {
  const lines: string[] = [];

  if (snapshot.frontmostApp) {
    lines.push(`Frontmost app: ${snapshot.frontmostApp}`);
  }
  if (snapshot.openTasks.length > 0) {
    lines.push(
      `Open tasks (${snapshot.openTasks.length}): ${snapshot.openTasks
        .map((task) => task.title + (task.dueAt ? ` (due ${new Date(task.dueAt).toLocaleString()})` : ""))
        .join("; ")}`,
    );
  }
  if (snapshot.upcomingReminders.length > 0) {
    lines.push(
      `Upcoming reminders: ${snapshot.upcomingReminders
        .map((r) => `${r.title} at ${new Date(r.dueAt).toLocaleString()}`)
        .join("; ")}`,
    );
  }
  if (snapshot.activeAutomations > 0) {
    lines.push(
      `Active automations (${snapshot.activeAutomations})${snapshot.automationsNextRuns.length > 0 ? `: next ${snapshot.automationsNextRuns.map((a) => a.name).join(", ")}` : ""}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
