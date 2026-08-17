/**
 * JARVIS Automation — Scheduler
 *
 * A controlled, non-busy timer that:
 *  - recomputes schedules at startup (survives server restart)
 *  - fires due scheduled automations
 *  - evaluates condition watchers with hysteresis + cooldown
 *  - never overlaps executions, never runs faster than once per minute
 *
 * Execution always delegates to the AutomationManager (and therefore the
 * runtime pipeline): there is no scheduler-specific execution path, so no
 * confirmation bypass is possible.
 */

import { AUTOMATION_LIMITS, type Automation } from "./types";
import { getAutomationManager, type AutomationManager } from "./manager";
import { getNotificationBus } from "./notifier";

export interface SchedulerOptions {
  manager?: AutomationManager;
  tickMs?: number;
  now?: () => number;
}

export type SchedulerTickHandler = (now: number) => void | Promise<void>;

/**
 * Extra work run on every scheduler tick (single shared loop). Registered by
 * personal-layer modules (reminders) so there is exactly ONE scheduler in the
 * whole system. A handler that throws never breaks the scheduler.
 */
const tickHandlers = new Set<SchedulerTickHandler>();

export function registerSchedulerTickHandler(handler: SchedulerTickHandler): () => void {
  tickHandlers.add(handler);
  return () => {
    tickHandlers.delete(handler);
  };
}

export function clearSchedulerTickHandlers(): void {
  tickHandlers.clear();
}

/**
 * Exactly one scheduler loop may be active at a time. `start()` refuses to
 * create a second concurrent loop (defensive guard against duplicate
 * schedulers/state machines).
 */
let activeScheduler: AutomationScheduler | null = null;

export class AutomationScheduler {
  private readonly manager: AutomationManager;
  private readonly tickMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private running = false;

  constructor(options: SchedulerOptions = {}) {
    this.manager = options.manager ?? getAutomationManager();
    this.tickMs = options.tickMs ?? AUTOMATION_LIMITS.SCHEDULER_TICK_MS;
    this.now = options.now ?? (() => Date.now());
  }

  isStarted(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    if (activeScheduler && activeScheduler !== this) {
      console.warn("JARVIS: refusing to start a second scheduler loop — one scheduler is already active.");
      return;
    }
    this.started = true;
    activeScheduler = this;
    // Recover schedules on every start (server restart safety).
    this.manager.recomputeSchedule();
    this.timer = setTimeout(() => void this.tickLoop(), this.tickMs);
  }

  stop(): void {
    this.started = false;
    if (activeScheduler === this) {
      activeScheduler = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run one evaluation cycle. Awaiting the returned promise allows tests and
   * the timer to know when the cycle is complete. A cycle that is already in
   * progress is skipped (no overlapping executions).
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now();
      await this.fireDueAutomations(now);
      await this.evaluateConditions(now);
      await this.runTickHandlers(now);
    } finally {
      this.running = false;
    }
  }

  /** Invoke registered tick handlers (e.g. reminders) serially. */
  private async runTickHandlers(now: number): Promise<void> {
    for (const handler of [...tickHandlers]) {
      try {
        await handler(now);
      } catch {
        // A failing handler must never break the scheduler loop.
      }
    }
  }

  private async tickLoop(): Promise<void> {
    if (!this.started) return;
    await this.tick();
    if (this.started) {
      this.timer = setTimeout(() => void this.tickLoop(), this.tickMs);
    }
  }

  /** Fire every enabled scheduled automation that is due (serialized). */
  private async fireDueAutomations(now: number): Promise<void> {
    const due = this.manager.dueAutomations(now);
    for (const automation of due) {
      if (!automation.enabled) continue;
      if (this.manager.isInFlight(automation.id)) continue;
      if (this.manager.isRateLimited(automation.id)) continue;
      await this.manager.executeAutomation(automation.id);
    }
  }

  /**
   * Evaluate condition watchers. Uses hysteresis (armed flag) and a cooldown
   * so a continuously-true condition never re-notifies until it resets.
   */
  private async evaluateConditions(now: number): Promise<void> {
    const conditions = this.manager.enabledConditionAutomations();
    for (const automation of conditions) {
      const evaluated = this.manager.evaluateCondition(automation);
      this.manager.updateConditionPoll(automation.id, now);

      if (evaluated.matched) {
        if (automation.conditionArmed) {
          // Already triggered; no duplicate notifications.
          continue;
        }
        if (!this.manager.isConditionCooldownElapsed(automation, now)) {
          // Condition matched but we are in the notification cooldown: arm it
          // so we never notify later while it stays true, then keep waiting.
          this.manager.setConditionArmed(automation.id, true);
          continue;
        }
        // Fire the condition automation's action.
        await this.fireCondition(automation);
      } else {
        if (automation.conditionArmed) {
          this.manager.setConditionArmed(automation.id, false);
        }
      }
    }
  }

  private async fireCondition(automation: Automation): Promise<void> {
    const outcome = await this.manager.executeAutomation(automation.id, { fromCondition: true });
    if (outcome.status === "executed" || outcome.status === "waiting_for_confirmation") {
      this.manager.markConditionNotified(automation.id);
    } else if (outcome.status === "failed") {
      this.manager.markConditionNotified(automation.id);
    }
  }
}

let schedulerInstance: AutomationScheduler | null = null;

export function getAutomationScheduler(): AutomationScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new AutomationScheduler();
  }
  return schedulerInstance;
}

export function resetAutomationScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
  schedulerInstance = null;
}

export function startAutomationScheduler(): AutomationScheduler {
  const scheduler = getAutomationScheduler();
  scheduler.start();
  return scheduler;
}
