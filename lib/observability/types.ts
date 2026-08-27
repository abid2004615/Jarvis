/**
 * P14 — Observability Types
 *
 * Structured event types for the JARVIS observability layer.
 * Records outcomes and events, never chain-of-thought or private prompts.
 */

export type EventCategory =
  | "request"
  | "ai"
  | "agent"
  | "goal"
  | "tool"
  | "confirmation"
  | "verification"
  | "voice"
  | "vision"
  | "automation"
  | "memory"
  | "personalization"
  | "system"
  | "security"
  | "error";

export type EventSeverity = "info" | "warn" | "error" | "critical";

export type RequestEventType =
  | "request_received"
  | "request_completed"
  | "request_failed"
  | "request_timeout";

export type AIEventType =
  | "ai_request_started"
  | "ai_request_completed"
  | "ai_request_failed"
  | "ai_request_retrying"
  | "ai_fallback_used"
  | "ai_rate_limited";

export type AgentEventType =
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "agent_timeout";

export type GoalEventType =
  | "goal_started"
  | "goal_step_started"
  | "goal_step_completed"
  | "goal_step_failed"
  | "goal_completed"
  | "goal_failed"
  | "goal_paused"
  | "goal_resumed"
  | "goal_cancelled"
  | "goal_replan_requested";

export type ToolEventType =
  | "tool_registered"
  | "tool_requested"
  | "tool_validated"
  | "tool_denied"
  | "tool_executed"
  | "tool_failed"
  | "tool_verified"
  | "tool_duplicate_prevented";

export type ConfirmationEventType =
  | "confirmation_requested"
  | "confirmation_approved"
  | "confirmation_denied"
  | "confirmation_expired"
  | "confirmation_already_resolved";

export type VerificationEventType =
  | "verification_started"
  | "verification_passed"
  | "verification_failed"
  | "verification_mismatch";

export type VoiceEventType =
  | "voice_session_started"
  | "voice_session_completed"
  | "voice_recognition_started"
  | "voice_recognition_completed"
  | "voice_recognition_failed"
  | "tts_started"
  | "tts_completed"
  | "tts_failed"
  | "wake_word_detected";

export type VisionEventType =
  | "vision_capture_started"
  | "vision_capture_completed"
  | "vision_capture_failed"
  | "ocr_started"
  | "ocr_completed"
  | "ocr_failed"
  | "vision_permission_check";

export type AutomationEventType =
  | "automation_created"
  | "automation_triggered"
  | "automation_completed"
  | "automation_failed"
  | "automation_disabled";

export type MemoryEventType =
  | "memory_read"
  | "memory_write"
  | "memory_forget"
  | "memory_clear"
  | "memory_rejected";

export type PersonalizationEventType =
  | "personalization_read"
  | "personalization_write"
  | "personalization_rejected"
  | "personalization_disabled"
  | "personalization_cleared";

export type SystemEventType =
  | "system_startup"
  | "system_shutdown"
  | "system_health_check"
  | "system_storage_error"
  | "system_config_error";

export type SecurityEventType =
  | "security_secret_rejected"
  | "security_injection_blocked"
  | "security_unauthorized_access"
  | "security_prompt_injection_detected"
  | "security_credential_detected"
  | "security_permission_violation";

export type ErrorEventType =
  | "error_occurred"
  | "error_recovered"
  | "error_unrecoverable"
  | "error_boundary_exceeded";

export type ObservabilityEventType =
  | RequestEventType
  | AIEventType
  | AgentEventType
  | GoalEventType
  | ToolEventType
  | ConfirmationEventType
  | VerificationEventType
  | VoiceEventType
  | VisionEventType
  | AutomationEventType
  | MemoryEventType
  | PersonalizationEventType
  | SystemEventType
  | SecurityEventType
  | ErrorEventType;

export interface ObservabilityEvent {
  id: string;
  timestamp: number;
  iso: string;
  category: EventCategory;
  eventType: ObservabilityEventType;
  severity: EventSeverity;
  requestId?: string;
  conversationId?: string;
  goalId?: string;
  chainId?: string;
  agentRunId?: string;
  toolExecutionId?: string;
  confirmationId?: string;
  verificationId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    category: ErrorCategory;
    recoverable: boolean;
  };
}

export type ErrorCategory =
  | "configuration_error"
  | "authentication_error"
  | "rate_limit_error"
  | "network_error"
  | "timeout_error"
  | "validation_error"
  | "permission_error"
  | "confirmation_required"
  | "execution_error"
  | "verification_error"
  | "agent_error"
  | "goal_error"
  | "vision_error"
  | "voice_error"
  | "storage_error"
  | "security_error"
  | "user_input_required"
  | "unknown_error";

export interface ErrorClassification {
  category: ErrorCategory;
  recoverable: boolean;
  retryable: boolean;
  severity: EventSeverity;
  userMessage: string;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface LatencyMetric {
  p50: number;
  p95: number;
  p99: number;
  count: number;
  min: number;
  max: number;
}

export interface HealthStatus {
  subsystem: string;
  status: "healthy" | "degraded" | "unavailable" | "misconfigured";
  lastChecked: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "unavailable";
  uptime: number;
  subsystems: HealthStatus[];
  checkedAt: number;
}

export interface DiagnosticsSnapshot {
  version: string;
  uptime: number;
  provider: string;
  model: string;
  testMode: boolean;
  subsystemHealth: HealthStatus[];
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTools: number;
    toolSuccessRate: number;
    confirmationApprovalRate: number;
    averageLatency: number;
  };
}

export interface RedactionResult {
  redacted: string;
  redactionsFound: number;
  patterns: string[];
}

export type CorrelationIdPrefix =
  | "req"
  | "conv"
  | "goal"
  | "chain"
  | "agent"
  | "tool"
  | "confirm"
  | "verify";

export interface CorrelationIds {
  requestId: string;
  conversationId?: string;
  goalId?: string;
  chainId?: string;
  agentRunId?: string;
  toolExecutionId?: string;
  confirmationId?: string;
  verificationId?: string;
}
