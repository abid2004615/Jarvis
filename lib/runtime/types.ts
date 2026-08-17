/**
 * JARVIS Runtime Type Definitions
 * Strongly typed state machine for unified interaction loop
 */

/**
 * Core JARVIS runtime state enum
 * Defines all possible states in the JARVIS interaction loop
 */
export enum JarvisRuntimeState {
  IDLE = "idle",
  LISTENING = "listening",
  THINKING = "thinking",
  PLANNING = "planning",
  EXECUTING = "executing",
  WAITING_FOR_CONFIRMATION = "waiting_for_confirmation",
  RESPONDING = "responding",
  ERROR = "error",
  OFFLINE = "offline",
}

/**
 * Orb display modes that runtime states can map to
 */
export type OrbModeLike =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "PROCESSING"
  | "SYSTEM"
  | "SPEAKING"
  | "ERROR"
  | "SUCCESS"
  | "ALERT";

/**
 * Convert runtime state to orb mode for visualization
 */
export const RUNTIME_STATE_TO_ORB_MODE: Record<JarvisRuntimeState, OrbModeLike> = {
  [JarvisRuntimeState.IDLE]: "IDLE",
  [JarvisRuntimeState.LISTENING]: "LISTENING",
  [JarvisRuntimeState.THINKING]: "THINKING",
  [JarvisRuntimeState.PLANNING]: "THINKING",
  [JarvisRuntimeState.EXECUTING]: "PROCESSING",
  [JarvisRuntimeState.WAITING_FOR_CONFIRMATION]: "SYSTEM",
  [JarvisRuntimeState.RESPONDING]: "SPEAKING",
  [JarvisRuntimeState.ERROR]: "ERROR",
  [JarvisRuntimeState.OFFLINE]: "ALERT",
};

/**
 * Structured tool call pending execution or confirmation
 */
export interface PendingToolCall {
  id: string;
  name: string;
  description: string;
  humanReadableAction?: string;
  arguments: Record<string, unknown>;
  riskLevel: "safe" | "confirmation" | "restricted";
  requiresUserConfirmation: boolean;
}

/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result: unknown;
  error?: string;
  duration: number;
}

/**
 * Complete response from the JARVIS pipeline
 */
export interface JarvisResponse {
  conversationId: string;
  userInput: string;
  state: JarvisRuntimeState;
  message: string;
  toolsExecuted?: ToolExecutionResult[];
  pendingConfirmation?: PendingToolCall;
  actionChain?: ActionChainStatus;
  error?: string;
  timestamp: number;
}

/**
 * Confirmation decision for a pending tool call
 */
export interface ConfirmationDecision {
  toolId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Lifecycle states of a multi-step action chain.
 * Reuses the existing runtime-state vocabulary where possible; the chain's
 * state is exposed for the HUD / action status without duplicating the
 * runtime state machine.
 */
export type ActionChainState =
  | "planning"
  | "executing"
  | "waiting_for_confirmation"
  | "partial_success"
  | "completed"
  | "error";

/**
 * Per-step status of an action chain.
 */
export type ActionChainStepStatus =
  | "pending"
  | "approved"
  | "denied"
  | "executed"
  | "failed"
  | "skipped";

/**
 * A single step's observable status (no internal arguments/results).
 */
export interface ActionChainStepStatusInfo {
  toolName: string;
  status: ActionChainStepStatus;
  humanReadableAction?: string;
}

/**
 * Structured, observable state of an action chain.
 * Safe to send to the client: contains no arguments, results, or internals.
 */
export interface ActionChainStatus {
  id: string;
  state: ActionChainState;
  steps: ActionChainStepStatusInfo[];
}
