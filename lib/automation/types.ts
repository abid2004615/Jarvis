/**
 * JARVIS Automation — Type Definitions
 *
 * Automations are USER-CONTROLLED scheduled/conditional tasks. They are NOT
 * an unrestricted autonomous agent: every automation references a registered
 * ToolRegistry tool by ID, auto-runs only non-destructive tools, and keeps
 * confirmation-gated tools gated at execution time (no scheduler bypass).
 *
 * Automation storage is separate from conversation context and persistent
 * user memory. No secrets, commands, paths, or credentials are ever stored.
 */

export type AutomationTriggerType = "once" | "daily" | "weekly" | "interval" | "condition";

/** Time of day, 24h, "HH:MM". */
export type TimeOfDay = string;

/**
 * Shared scheduling triggers. All fields are strictly validated by the
 * validator; unknown fields are rejected.
 */
export interface OnceTrigger {
  type: "once";
  /** ISO date "YYYY-MM-DD" (optional: today if omitted). */
  date?: string;
  /** "HH:MM" */
  at?: string;
}

export interface DailyTrigger {
  type: "daily";
  /** "HH:MM" — required. */
  at: string;
}

export interface WeeklyTrigger {
  type: "weekly";
  /** "HH:MM" — required. */
  at: string;
  /** 0 (Sunday) - 6 (Saturday). */
  dayOfWeek: number;
}

export interface IntervalTrigger {
  type: "interval";
  /** Whole minutes. Must be >= AUTOMATION_LIMITS.MIN_INTERVAL_MINUTES. */
  minutes: number;
}

export type ConditionMetric = "battery" | "cpu" | "memory" | "disk" | "application";

export type ConditionOperator = "<" | "<=" | ">" | ">=" | "==" | "running" | "not_running";

export interface ConditionTrigger {
  type: "condition";
  /** Numeric metrics for battery/cpu/memory/disk; "application" for app checks. */
  metric: ConditionMetric;
  operator: ConditionOperator;
  /** Numeric threshold for numeric metrics; an application name for application checks. */
  value: number | string;
}

export type AutomationTrigger =
  | OnceTrigger
  | DailyTrigger
  | WeeklyTrigger
  | IntervalTrigger
  | ConditionTrigger;

/**
 * Automation action. References a registered ToolRegistry tool by ID.
 * NEVER a shell command, path, or arbitrary executable.
 */
export interface AutomationAction {
  toolId: string;
  arguments: Record<string, unknown>;
}

export type AutomationResult = "success" | "failed" | "disabled";

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  /** Derived server-side: true when the action tool is confirmation-gated. */
  requiresConfirmation: boolean;
  /** Consecutive failures; >= LIMIT disables the automation. */
  consecutiveFailures: number;
  lastResult?: AutomationResult;
  /** Condition hysteresis: true while the condition is currently true. */
  conditionArmed?: boolean;
  /** When the last condition notification was emitted (cooldown source). */
  lastNotificationAt?: number;
}

/**
 * Input accepted from the model/API. The client can NEVER provide
 * id, createdAt, requiresConfirmation, enabled-as-trust, or authorization
 * flags — those are derived/owned server-side.
 */
export interface AutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
}

/** Validation outcome. */
export interface AutomationValidationResult {
  valid: boolean;
  error?: string;
}

/** Public automation record (safe for the client/HUD: no internals). */
export interface AutomationSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: { toolId: string };
  requiresConfirmation: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastResult?: AutomationResult;
  consecutiveFailures: number;
}

/** Serialized on-disk shape. */
export interface AutomationStoreData {
  version: number;
  updatedAt: number;
  automations: Automation[];
}

export const AUTOMATION_STORAGE_DIR = ".jarvis";
export const AUTOMATION_STORAGE_FILE = "automations.json";

export const AUTOMATION_LIMITS = {
  MAX_AUTOMATIONS: 50,
  MAX_NAME_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_MESSAGE_LENGTH: 500,
  MIN_INTERVAL_MINUTES: 1,
  /** Scheduler must not run more frequently than once per minute. */
  SCHEDULER_TICK_MS: 60_000,
  CONDITION_POLL_MS: 60_000,
  /** Max executions of a single automation per rolling hour. */
  MAX_EXECUTIONS_PER_HOUR: 20,
  /** Max simultaneous executions across the whole system. */
  MAX_CONCURRENT_EXECUTIONS: 1,
  /** Cooldown between condition notifications of the same automation. */
  NOTIFICATION_COOLDOWN_MS: 5 * 60_000,
  /** Disable an automation after this many consecutive failures. */
  MAX_CONSECUTIVE_FAILURES: 3,
  MAX_NOTIFICATIONS: 50,
} as const;

/**
 * Tools allowed to run automatically when scheduled/triggered (all read-only
 * reporters plus notify_user). Any other tool scheduled as an action must be
 * confirmation-gated at execution time.
 */
export const AUTO_RUN_TOOL_IDS: readonly string[] = [
  "notify_user",
  "get_system_summary",
  "get_cpu_usage",
  "get_memory_usage",
  "get_disk_usage",
  "get_battery_status",
  "get_network_status",
  "get_system_uptime",
  "get_process_summary",
  "get_current_time",
  "get_system_status",
  "get_app_status",
  "get_running_applications",
  "get_frontmost_application",
  "get_active_window",
  "recall_user_memory",
];

/**
 * Tools that may be SCHEDULED but ALWAYS require user confirmation at
 * execution time (stateful/control actions). Scheduling one of these never
 * grants permission to bypass confirmation.
 */
export const GATED_SCHEDULED_TOOL_IDS: readonly string[] = [
  "launch_application",
  "quit_application",
  "open_folder",
  "set_volume",
  "set_brightness",
  "take_screenshot",
];

/** Every tool ID that may appear as an automation action. */
export const SCHEDULABLE_TOOL_IDS: readonly string[] = [
  ...AUTO_RUN_TOOL_IDS,
  ...GATED_SCHEDULED_TOOL_IDS,
];

/** Outcome of an attempted automation execution. */
export interface AutomationExecutionOutcome {
  status: "executed" | "waiting_for_confirmation" | "skipped" | "failed" | "not_found" | "rate_limited" | "disabled";
  message: string;
  pendingConfirmationId?: string;
  result?: unknown;
}
