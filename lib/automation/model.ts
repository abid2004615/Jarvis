/**
 * JARVIS Automation — Model Helpers
 *
 * Structural validation of stored records, next-run scheduling math, and
 * client-safe summaries. Scheduling math is pure (no side effects) so it can
 * be tested exhaustively.
 */

import {
  AUTOMATION_LIMITS,
  type Automation,
  type AutomationSummary,
  type AutomationTrigger,
  type ConditionTrigger,
} from "./types";

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse "HH:MM" → minutes since midnight, or null. */
export function timeToMinutes(time: string): number | null {
  const match = TIME_OF_DAY_RE.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Parse "YYYY-MM-DD" → epoch ms at local midnight, or null. */
export function dateToMidnight(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const ms = new Date(y, m - 1, d).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Next scheduled execution for a trigger, strictly after `now`.
 * Returns null when a once-trigger has no future occurrence.
 */
export function computeNextRunAt(
  trigger: AutomationTrigger,
  now: number,
  lastRunAt?: number,
): number | null {
  switch (trigger.type) {
    case "once": {
      const atMinutes = trigger.at !== undefined ? timeToMinutes(trigger.at) : 0;
      if (atMinutes === null) return null;
      const dayStart = trigger.date !== undefined
        ? dateToMidnight(trigger.date)
        : startOfDay(now);
      if (dayStart === null) return null;
      const scheduled = dayStart + atMinutes * 60_000;
      return scheduled > now ? scheduled : null;
    }
    case "daily": {
      const atMinutes = timeToMinutes(trigger.at);
      if (atMinutes === null) return null;
      let scheduled = startOfDay(now) + atMinutes * 60_000;
      if (scheduled <= now) scheduled += 24 * 60 * 60_000;
      return scheduled;
    }
    case "weekly": {
      const atMinutes = timeToMinutes(trigger.at);
      if (atMinutes === null) return null;
      const day = new Date(now).getDay();
      let delta = (trigger.dayOfWeek - day + 7) % 7;
      let scheduled = startOfDay(now) + atMinutes * 60_000 + delta * 24 * 60 * 60_000;
      if (scheduled <= now) scheduled += 7 * 24 * 60 * 60_000;
      return scheduled;
    }
    case "interval": {
      const minutes = trigger.minutes;
      if (!Number.isFinite(minutes) || minutes < AUTOMATION_LIMITS.MIN_INTERVAL_MINUTES) {
        return null;
      }
      const base = lastRunAt ?? now;
      return base + minutes * 60_000;
    }
    case "condition": {
      return now + AUTOMATION_LIMITS.CONDITION_POLL_MS;
    }
  }
}

/** Whether a trigger type repeats after firing. */
export function isRecurringTrigger(trigger: AutomationTrigger): boolean {
  return trigger.type !== "once";
}

/** Structural validation of a stored automation record. */
export function isAutomationLike(value: unknown): value is Automation {
  if (!value || typeof value !== "object") return false;
  const a = value as Automation;
  return (
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.enabled === "boolean" &&
    typeof a.createdAt === "number" &&
    typeof a.updatedAt === "number" &&
    typeof a.requiresConfirmation === "boolean" &&
    typeof a.consecutiveFailures === "number" &&
    isTriggerLike(a.trigger) &&
    isActionLike(a.action)
  );
}

function isTriggerLike(trigger: unknown): boolean {
  if (!trigger || typeof trigger !== "object") return false;
  const t = trigger as AutomationTrigger;
  if (!["once", "daily", "weekly", "interval", "condition"].includes(t.type)) return false;
  if (t.type === "condition") {
    const c = t as ConditionTrigger;
    return ["battery", "cpu", "memory", "disk", "application"].includes(c.metric) &&
      typeof c.value === "number" || typeof c.value === "string";
  }
  return true;
}

function isActionLike(action: unknown): boolean {
  if (!action || typeof action !== "object") return false;
  const a = action as { toolId?: unknown; arguments?: unknown };
  return typeof a.toolId === "string" &&
    typeof a.arguments === "object" &&
    a.arguments !== null &&
    !Array.isArray(a.arguments);
}

/** Client-safe summary: never exposes arguments or internals. */
export function toAutomationSummary(automation: Automation): AutomationSummary {
  return {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    enabled: automation.enabled,
    trigger: automation.trigger,
    action: { toolId: automation.action.toolId },
    requiresConfirmation: automation.requiresConfirmation,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
    lastRunAt: automation.lastRunAt,
    nextRunAt: automation.nextRunAt,
    lastResult: automation.lastResult,
    consecutiveFailures: automation.consecutiveFailures,
  };
}
