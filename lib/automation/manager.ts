/**
 * JARVIS Automation — Manager
 *
 * Single authority for automation CRUD, scheduling math, condition
 * evaluation, rate limiting, cooldowns, and failure backoff. The manager
 * never executes tools itself — it delegates to an injected executor
 * (the runtime pipeline) so scheduled execution uses the SAME
 * ToolRegistry/PermissionManager/confirmation path as normal execution.
 *
 * The manager does not import the pipeline (no cycles); wiring lives in
 * lib/automation/wiring.ts.
 */

import {
  AUTOMATION_LIMITS,
  type Automation,
  type AutomationAction,
  type AutomationExecutionOutcome,
  type AutomationSummary,
  type AutomationTrigger,
  type ConditionTrigger,
} from "./types";
import { toolRequiresScheduledConfirmation, validateAutomationInput } from "./validator";
import { computeNextRunAt, toAutomationSummary } from "./model";
import { AutomationFileStore, type AutomationStore } from "./store";
import { buildAutomationNotification, getNotificationBus } from "./notifier";
import { getBatteryStatus, getCPUUsage, getDiskUsage, getMemoryUsage, getRunningApplications } from "@/lib/macos";

/**
 * Runtime sample used for condition evaluation.
 */
export interface ConditionSample {
  battery?: number;
  cpu?: number;
  memory?: number;
  disk?: number;
  applications?: string[];
}

export type ConditionReader = () => ConditionSample;

export interface AutomationExecutorMeta {
  automationId: string;
  name: string;
  trigger: AutomationTrigger;
}

/**
 * Executor contract fulfilled by JarvisPipeline.executeAutomationTool.
 */
export type AutomationExecutor = (
  action: AutomationAction,
  meta: AutomationExecutorMeta,
) => Promise<AutomationExecutionOutcome>;

export interface AutomationManagerOptions {
  store?: AutomationStore;
  conditionReader?: ConditionReader;
  now?: () => number;
  executor?: AutomationExecutor;
}

function defaultConditionReader(): ConditionSample {
  const sample: ConditionSample = {};
  const battery = getBatteryStatus();
  if (battery.available && typeof battery.percentCharged === "number") sample.battery = battery.percentCharged;
  const cpu = getCPUUsage();
  if (cpu.available && typeof cpu.percentUsed === "number") sample.cpu = cpu.percentUsed;
  const memory = getMemoryUsage();
  if (memory.available && typeof memory.percentUsed === "number") sample.memory = memory.percentUsed;
  const disk = getDiskUsage();
  if (disk.available && typeof disk.percentUsed === "number") sample.disk = disk.percentUsed;
  const apps = getRunningApplications();
  if (apps.available && Array.isArray(apps.applications)) {
    sample.applications = apps.applications.map((a) => a.name);
  }
  return sample;
}

export class AutomationManager {
  private readonly store: AutomationStore;
  private conditionReader: ConditionReader;
  private readonly now: () => number;
  private executor: AutomationExecutor | null;
  private automations: Automation[] = [];
  private loaded = false;
  private readonly executionTimestamps: Map<string, number[]> = new Map();
  private readonly inFlight: Set<string> = new Set();

  constructor(options: AutomationManagerOptions = {}) {
    this.store = options.store ?? new AutomationFileStore();
    this.conditionReader = options.conditionReader ?? defaultConditionReader;
    this.now = options.now ?? (() => Date.now());
    this.executor = options.executor ?? null;
  }

  /** Override the condition reader (tests / alternate sources). */
  setConditionReader(reader: ConditionReader): void {
    this.conditionReader = reader;
  }

  /** Inject the execution delegate (normally the pipeline). */
  setExecutor(executor: AutomationExecutor | null): void {
    this.executor = executor;
  }

  getExecutor(): AutomationExecutor | null {
    return this.executor;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.automations = this.store.load();
    this.loaded = true;
  }

  private persist(): void {
    this.store.save(this.automations);
  }

  private static deterministicId(now: number): string {
    return `auto-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------- CRUD ---

  create(input: unknown): { automation?: Automation; error?: string } {
    this.ensureLoaded();
    const validation = validateAutomationInput(input);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid automation" };
    }
    if (this.automations.length >= AUTOMATION_LIMITS.MAX_AUTOMATIONS) {
      return { error: `Maximum of ${AUTOMATION_LIMITS.MAX_AUTOMATIONS} automations reached` };
    }

    const now = this.now();
    const typed = input as { name: string; description?: string; trigger: AutomationTrigger; action: AutomationAction };
    const requiresConfirmation = toolRequiresScheduledConfirmation(typed.action.toolId);
    const nextRunAt = computeNextRunAt(typed.trigger, now);

    const automation: Automation = {
      id: AutomationManager.deterministicId(now),
      name: typed.name.trim(),
      description: typed.description?.trim() ?? "",
      enabled: true,
      trigger: typed.trigger,
      action: typed.action,
      createdAt: now,
      updatedAt: now,
      nextRunAt: nextRunAt ?? undefined,
      requiresConfirmation,
      consecutiveFailures: 0,
    };

    this.automations.push(automation);
    this.persist();
    return { automation: { ...automation } };
  }

  list(): AutomationSummary[] {
    this.ensureLoaded();
    return this.automations.map(toAutomationSummary);
  }

  getAll(): Automation[] {
    this.ensureLoaded();
    return this.automations.map((a) => ({ ...a }));
  }

  get(id: string): Automation | undefined {
    this.ensureLoaded();
    const found = this.automations.find((a) => a.id === id);
    return found ? { ...found } : undefined;
  }

  /**
   * Update mutable fields. Only name/description/trigger/action/enabled are
   * accepted; authorization is derived, never supplied.
   */
  update(id: string, patch: unknown): { automation?: Automation; error?: string } {
    this.ensureLoaded();
    const index = this.automations.findIndex((a) => a.id === id);
    if (index < 0) return { error: "Automation not found" };

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { error: "Invalid update payload" };
    }
    const allowedKeys = new Set(["name", "description", "trigger", "action", "enabled"]);
    for (const key of Object.keys(patch)) {
      if (!allowedKeys.has(key)) {
        return { error: `Unknown automation field '${key}' (cannot be set)` };
      }
    }

    const current = this.automations[index];
    const candidate: Record<string, unknown> = {};
    if ("name" in patch) candidate.name = (patch as { name: unknown }).name;
    if ("description" in patch) candidate.description = (patch as { description: unknown }).description;
    if ("trigger" in patch) candidate.trigger = (patch as { trigger: unknown }).trigger;
    if ("action" in patch) candidate.action = (patch as { action: unknown }).action;

    if (Object.keys(candidate).length > 0) {
      const validation = validateAutomationInput({
        name: candidate.name ?? current.name,
        description: candidate.description ?? current.description,
        trigger: candidate.trigger ?? current.trigger,
        action: candidate.action ?? current.action,
      });
      if (!validation.valid) {
        return { error: validation.error ?? "Invalid update" };
      }
    }

    const now = this.now();
    if ("name" in patch) current.name = (patch as { name: string }).name.trim();
    if ("description" in patch) current.description = ((patch as { description: unknown }).description as string | undefined)?.trim() ?? "";
    if ("trigger" in patch) current.trigger = patch.trigger as AutomationTrigger;
    if ("action" in patch) {
      const action = patch.action as AutomationAction;
      current.action = action;
      current.requiresConfirmation = toolRequiresScheduledConfirmation(action.toolId);
    }
    if ("enabled" in patch) {
      if (typeof (patch as { enabled: unknown }).enabled !== "boolean") {
        return { error: "'enabled' must be a boolean" };
      }
      current.enabled = (patch as { enabled: boolean }).enabled;
    }

    current.updatedAt = now;
    current.nextRunAt = computeNextRunAt(current.trigger, now, current.lastRunAt) ?? undefined;
    this.persist();
    return { automation: { ...current } };
  }

  enable(id: string): { automation?: Automation; error?: string } {
    return this.update(id, { enabled: true });
  }

  disable(id: string): { automation?: Automation; error?: string } {
    return this.update(id, { enabled: false });
  }

  disableAll(): { count: number } {
    this.ensureLoaded();
    for (const automation of this.automations) {
      automation.enabled = false;
      automation.updatedAt = this.now();
    }
    this.persist();
    return { count: this.automations.length };
  }

  delete(id: string): { success: boolean; error?: string } {
    this.ensureLoaded();
    const index = this.automations.findIndex((a) => a.id === id);
    if (index < 0) return { success: false, error: "Automation not found" };
    this.automations.splice(index, 1);
    this.executionTimestamps.delete(id);
    this.inFlight.delete(id);
    this.persist();
    return { success: true };
  }

  deleteAll(): { success: boolean; count: number } {
    this.ensureLoaded();
    const count = this.automations.length;
    this.automations = [];
    this.executionTimestamps.clear();
    this.inFlight.clear();
    this.persist();
    return { success: true, count };
  }

  count(): number {
    this.ensureLoaded();
    return this.automations.length;
  }

  // ------------------------------------------------------------ scheduling ---

  /** Recompute nextRunAt for every automation (startup / restart recovery). */
  recomputeSchedule(): void {
    this.ensureLoaded();
    const now = this.now();
    for (const automation of this.automations) {
      const next = computeNextRunAt(automation.trigger, now, automation.lastRunAt);
      if (automation.trigger.type === "condition") {
        // Condition watchers poll at a fixed cadence.
        automation.nextRunAt = now + AUTOMATION_LIMITS.CONDITION_POLL_MS;
      } else if (next !== null) {
        automation.nextRunAt = next;
      } else {
        automation.nextRunAt = undefined;
      }
    }
    this.persist();
  }

  /**
   * Automations currently due for execution (scheduled triggers only).
   * Condition triggers are evaluated separately by the scheduler.
   */
  dueAutomations(now?: number): Automation[] {
    this.ensureLoaded();
    const t = now ?? this.now();
    return this.automations.filter(
      (a) => a.enabled && a.trigger.type !== "condition" && a.nextRunAt !== undefined && a.nextRunAt <= t,
    );
  }

  enabledConditionAutomations(): Automation[] {
    this.ensureLoaded();
    return this.automations.filter((a) => a.enabled && a.trigger.type === "condition");
  }

  // -------------------------------------------------------------- conditions ---

  evaluateCondition(automation: Automation, sample?: ConditionSample): { matched: boolean; detail?: string } {
    const trigger = automation.trigger;
    if (trigger.type !== "condition") return { matched: false };
    const s = sample ?? this.conditionReader();
    const condition = trigger as ConditionTrigger;

    if (condition.metric === "application") {
      const apps = (s.applications ?? []).map((name) => name.toLowerCase());
      const target = String(condition.value).toLowerCase();
      const running = apps.includes(target);
      const matched = condition.operator === "running" ? running : !running;
      return {
        matched,
        detail: matched
          ? `${condition.value} is ${condition.operator === "running" ? "running" : "not running"}`
          : undefined,
      };
    }

    const value = s[condition.metric];
    if (typeof value !== "number") {
      return { matched: false, detail: `No data available for ${condition.metric}` };
    }
    const threshold = Number(condition.value);
    let matched = false;
    switch (condition.operator) {
      case "<": matched = value < threshold; break;
      case "<=": matched = value <= threshold; break;
      case ">": matched = value > threshold; break;
      case ">=": matched = value >= threshold; break;
      case "==": matched = value === threshold; break;
      default: matched = false;
    }
    return { matched, detail: `${condition.metric} is at ${value} (threshold ${condition.operator} ${threshold})` };
  }

  /**
   * Condition hysteresis state. True while the condition is matched so a
   * continuously-true condition never re-notifies until it resets.
   */
  setConditionArmed(id: string, armed: boolean): void {
    this.ensureLoaded();
    const automation = this.automations.find((a) => a.id === id);
    if (!automation) return;
    automation.conditionArmed = armed;
    automation.updatedAt = this.now();
    this.persist();
  }

  isConditionCooldownElapsed(automation: Automation, now?: number): boolean {
    const t = now ?? this.now();
    if (!automation.lastNotificationAt) return true;
    return t - automation.lastNotificationAt >= AUTOMATION_LIMITS.NOTIFICATION_COOLDOWN_MS;
  }

  // --------------------------------------------------------------- execution ---

  /** Executions of an automation within the last rolling hour. */
  executionsInLastHour(id: string): number {
    const now = this.now();
    const cutoff = now - 60 * 60_000;
    const timestamps = (this.executionTimestamps.get(id) ?? []).filter((t) => t > cutoff);
    this.executionTimestamps.set(id, timestamps);
    return timestamps.length;
  }

  isRateLimited(id: string): boolean {
    return this.executionsInLastHour(id) >= AUTOMATION_LIMITS.MAX_EXECUTIONS_PER_HOUR;
  }

  isInFlight(id: string): boolean {
    return this.inFlight.has(id);
  }

  /**
   * Execute an automation now (scheduled fire, run_now, or condition fire).
   * Delegates tool execution to the injected executor (the pipeline) so
   * confirmation gating, ToolRegistry validation, and PermissionManager all
   * apply. Handles rate limiting, records results, and notifies.
   */
  async executeAutomation(id: string, opts: { fromCondition?: boolean } = {}): Promise<AutomationExecutionOutcome> {
    this.ensureLoaded();
    const automation = this.automations.find((a) => a.id === id);
    if (!automation) {
      return { status: "not_found", message: "Automation not found" };
    }
    if (!automation.enabled) {
      return { status: "disabled", message: `Automation "${automation.name}" is disabled` };
    }
    if (this.isInFlight(id)) {
      return { status: "skipped", message: `Automation "${automation.name}" is already running` };
    }
    if (this.isRateLimited(id)) {
      return {
        status: "rate_limited",
        message: `Automation "${automation.name}" exceeded the hourly execution limit`,
      };
    }

    if (!this.executor) {
      return { status: "skipped", message: "Automation executor is not connected" };
    }

    this.inFlight.add(id);
    try {
      const outcome = await this.executor(automation.action, {
        automationId: automation.id,
        name: automation.name,
        trigger: automation.trigger,
      });

      if (outcome.status === "executed") {
        this.recordRun(id, "success");
        const notification = buildAutomationNotification(automation, outcome.message);
        getNotificationBus().push({ ...notification, automationId: automation.id });
      } else if (outcome.status === "waiting_for_confirmation") {
        // Do NOT record the run yet — it completes (or is denied) when the
        // user responds. Surface a notification so the HUD knows.
        getNotificationBus().push({
          title: `Confirmation needed: ${automation.name}`,
          body: outcome.message,
          automationId: automation.id,
        });
      } else if (outcome.status === "failed") {
        this.recordRun(id, "failed");
        getNotificationBus().push({
          title: `Automation failed: ${automation.name}`,
          body: outcome.message,
          automationId: automation.id,
        });
      }
      // "skipped"/"not_found"/"rate_limited"/"disabled" do not record runs.

      return outcome;
    } finally {
      this.inFlight.delete(id);
    }
  }

  /**
   * Record a completed run. On success resets the failure counter and
   * advances nextRunAt. On failure increments the counter and disables the
   * automation after MAX_CONSECUTIVE_FAILURES (with a notification).
   */
  recordRun(id: string, result: "success" | "failed"): void {
    this.ensureLoaded();
    const automation = this.automations.find((a) => a.id === id);
    if (!automation) return;

    const now = this.now();
    automation.lastRunAt = now;
    automation.lastResult = result;
    automation.updatedAt = now;

    const timestamps = this.executionTimestamps.get(id) ?? [];
    timestamps.push(now);
    this.executionTimestamps.set(id, timestamps);

    if (result === "success") {
      automation.consecutiveFailures = 0;
      const next = computeNextRunAt(automation.trigger, now, now);
      automation.nextRunAt = next ?? undefined;
    } else {
      automation.consecutiveFailures += 1;
      if (automation.consecutiveFailures >= AUTOMATION_LIMITS.MAX_CONSECUTIVE_FAILURES) {
        automation.enabled = false;
        automation.lastResult = "disabled";
        getNotificationBus().push({
          title: `Automation disabled: ${automation.name}`,
          body: `I disabled the automation because it failed repeatedly.`,
          automationId: automation.id,
        });
      }
    }
    this.persist();
  }

  /** Mark a condition automation as notified (cooldown + armed). */
  markConditionNotified(id: string): void {
    this.ensureLoaded();
    const automation = this.automations.find((a) => a.id === id);
    if (!automation) return;
    automation.conditionArmed = true;
    automation.lastNotificationAt = this.now();
    automation.updatedAt = this.now();
    this.persist();
  }

  /** Advance a condition automation's next poll time. */
  updateConditionPoll(id: string, now?: number): void {
    this.ensureLoaded();
    const automation = this.automations.find((a) => a.id === id);
    if (!automation) return;
    const t = now ?? this.now();
    automation.nextRunAt = t + AUTOMATION_LIMITS.CONDITION_POLL_MS;
    automation.updatedAt = t;
    this.persist();
  }
}

let instance: AutomationManager | null = null;

export function getAutomationManager(): AutomationManager {
  if (!instance) {
    instance = new AutomationManager();
  }
  return instance;
}

export function resetAutomationManager(): void {
  instance = null;
}

export function setAutomationManager(manager: AutomationManager | null): void {
  instance = manager;
}
