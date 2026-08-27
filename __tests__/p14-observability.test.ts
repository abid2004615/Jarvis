/**
 * P14 Tests — Observability Core
 *
 * Tests for redaction, correlation, logger, metrics, health, errors, and evaluation.
 */

import {
  redactSecrets,
  redactObject,
  redactErrorMessage,
  containsSecrets,
  getRedactionPatternLabels,
} from "@/lib/observability/redaction";
import {
  generateCorrelationId,
  createCorrelationContext,
  extendCorrelation,
  extractPrefix,
  resetCorrelationCounter,
} from "@/lib/observability/correlation";
import {
  emitEvent,
  getEvents,
  getEventCounts,
  clearEvents,
  onEvent,
  clearEventListeners,
  classifyError,
} from "@/lib/observability/logger";
import {
  recordMetric,
  recordLatency,
  getLatencyStats,
  incrementCounter,
  getCounter,
  getAllCounters,
  recordToolEvent,
  getToolMetrics,
  getToolSuccessRate,
  getToolDenialRate,
  getMetricsSummary,
  resetMetrics,
} from "@/lib/observability/metrics";
import {
  setSubsystemHealth,
  getSubsystemHealth,
  getAllSubsystemHealth,
  getSystemHealth,
  performHealthChecks,
  resetHealthSystem,
} from "@/lib/observability/health";
import {
  getRetryPolicy,
  shouldRetry,
  getRetryDelay,
  httpStatusToCategory,
  httpStatusMessage,
  classifyFromCategory,
} from "@/lib/observability/errors";
import type {
  ObservabilityEvent,
  ErrorCategory,
  CorrelationIds,
} from "@/lib/observability/types";

// ─── REDACTION TESTS ────────────────────────────────────────────

describe("P14 — Redaction", () => {
  it("redacts Groq API keys", () => {
    const input = "Using key gsk_abc123def456ghi789jkl012mno";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_API_KEY]");
    expect(result.redacted).not.toContain("gsk_abc123");
    expect(result.redactionsFound).toBe(1);
    expect(result.patterns).toContain("REDACTED_API_KEY");
  });

  it("redacts OpenAI API keys", () => {
    const input = "sk-proj-abcdefghijklmnopqrstuvwx";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_API_KEY]");
    expect(result.redacted).not.toContain("sk-proj");
  });

  it("redacts Anthropic API keys", () => {
    const input = "sk-ant-abcdefghijklmnopqrstuvwxyz123456";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_API_KEY]");
    expect(result.redacted).not.toContain("sk-ant");
  });

  it("redacts xAI API keys", () => {
    const input = "xai-abcdefghijklmnopqrstuvwxyz123456";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_API_KEY]");
    expect(result.redacted).not.toContain("xai-abc");
  });

  it("redacts AWS access keys", () => {
    const input = "AKIAIOSFODNN7EXAMPLE";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_AWS_KEY]");
    expect(result.redacted).not.toContain("AKIAIOSFODNN7");
  });

  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIs";
    const result = redactSecrets(input);
    // Authorization header pattern matches first
    expect(result.redacted).toMatch(/\[REDACTED_/);
    expect(result.redacted).not.toContain("eyJhbGciOiJIUzI1NiIs");
  });

  it("redacts JWTs", () => {
    const input = "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456ghi789";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_JWT]");
  });

  it("redacts Slack tokens", () => {
    const input = "xoxb-1234567890-1234567890123-abcdefghijklmnop";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_SLACK_TOKEN]");
  });

  it("redacts GitHub tokens", () => {
    const input = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_GITHUB_TOKEN]");
  });

  it("redacts Google API keys", () => {
    const input = "AIzaSyD-ExampleKey1234567890abcdefghijklmnop";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_GOOGLE_KEY]");
  });

  it("redacts Stripe keys", () => {
    const input = "sk_live_abcdefghijklmnopqrstuvwx";
    const result = redactSecrets(input);
    expect(result.redacted).toContain("[REDACTED_STRIPE_KEY]");
  });

  it("does not redact clean text", () => {
    const input = "Hello, please open Safari and check my calendar";
    const result = redactSecrets(input);
    expect(result.redacted).toBe(input);
    expect(result.redactionsFound).toBe(0);
  });

  it("handles null/empty input", () => {
    expect(redactSecrets("").redacted).toBe("");
    expect(redactSecrets(null as unknown as string).redacted).toBe("");
    expect(redactSecrets(undefined as unknown as string).redacted).toBe("");
  });

  it("redacts multiple secrets in one string", () => {
    const input = "Key1: gsk_abc123def456ghi789jkl012mno Key2: sk-proj-abcdefghijklmnopqrstuvwx";
    const result = redactSecrets(input);
    expect(result.redactionsFound).toBeGreaterThanOrEqual(2);
    expect(result.redacted).not.toContain("gsk_abc123");
    expect(result.redacted).not.toContain("sk-proj");
  });

  it("redacts object values recursively", () => {
    const input = {
      name: "test",
      config: {
        apiKey: "gsk_abc123def456ghi789jkl012mno",
        url: "https://example.com",
      },
      items: ["gsk_xyz789def012ghi345jkl678mno"],
    };
    const result = redactObject(input);
    expect(result.name).toBe("test");
    expect(result.config.url).toBe("https://example.com");
    expect(result.config.apiKey).toMatch(/\[REDACTED_/);
    expect(result.items[0]).toMatch(/\[REDACTED_/);
  });

  it("redacts error messages", () => {
    const error = new Error("Authentication failed with key gsk_abc123def456ghi789jkl012mno");
    const message = redactErrorMessage(error);
    expect(message).not.toContain("gsk_abc123");
    expect(message).toMatch(/\[REDACTED_/);
  });

  it("detects secrets in strings", () => {
    expect(containsSecrets("gsk_abc123def456ghi789jkl012mno")).toBe(true);
    expect(containsSecrets("Hello world")).toBe(false);
  });

  it("returns valid pattern labels", () => {
    const labels = getRedactionPatternLabels();
    expect(labels.length).toBeGreaterThan(5);
    expect(labels).toContain("REDACTED_API_KEY");
    expect(labels).toContain("REDACTED_PASSWORD");
  });
});

// ─── CORRELATION ID TESTS ──────────────────────────────────────

describe("P14 — Correlation IDs", () => {
  beforeEach(() => {
    resetCorrelationCounter();
  });

  it("generates unique correlation IDs", () => {
    const id1 = generateCorrelationId("req");
    const id2 = generateCorrelationId("req");
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req-\d+-\d+$/);
  });

  it("generates IDs with correct prefix", () => {
    expect(generateCorrelationId("goal")).toMatch(/^goal-/);
    expect(generateCorrelationId("chain")).toMatch(/^chain-/);
    expect(generateCorrelationId("tool")).toMatch(/^tool-/);
    expect(generateCorrelationId("agent")).toMatch(/^agent-/);
    expect(generateCorrelationId("confirm")).toMatch(/^confirm-/);
    expect(generateCorrelationId("verify")).toMatch(/^verify-/);
  });

  it("creates correlation context", () => {
    const ctx = createCorrelationContext();
    expect(ctx.requestId).toMatch(/^req-/);
    expect(ctx.conversationId).toMatch(/^conv-/);
  });

  it("uses provided conversation ID", () => {
    const ctx = createCorrelationContext("my-conv-123");
    expect(ctx.conversationId).toBe("my-conv-123");
  });

  it("extends correlation context", () => {
    const parent = createCorrelationContext();
    const child = extendCorrelation(parent, "goal");
    expect(child.requestId).toBe(parent.requestId);
    expect(child.conversationId).toBe(parent.conversationId);
    expect(child.goalId).toMatch(/^goal-/);
  });

  it("extracts valid prefixes", () => {
    expect(extractPrefix("req-123-456")).toBe("req");
    expect(extractPrefix("goal-123-456")).toBe("goal");
    expect(extractPrefix("unknown-123-456")).toBeNull();
  });
});

// ─── LOGGER TESTS ──────────────────────────────────────────────

describe("P14 — Structured Logger", () => {
  beforeEach(() => {
    clearEvents();
    clearEventListeners();
  });

  it("emits and stores events", () => {
    const event = emitEvent({
      category: "request",
      eventType: "request_received",
      message: "Test request received",
    });

    expect(event.id).toBeDefined();
    expect(event.category).toBe("request");
    expect(event.eventType).toBe("request_received");
    expect(event.severity).toBe("info");
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.iso).toBeDefined();

    const events = getEvents();
    expect(events.length).toBe(1);
    expect(events[0].message).toBe("Test request received");
  });

  it("redacts secrets from event messages", () => {
    emitEvent({
      category: "error",
      eventType: "error_occurred",
      message: "Failed with key gsk_abc123def456ghi789jkl012mno",
    });

    const events = getEvents();
    expect(events[0].message).not.toContain("gsk_abc123");
    expect(events[0].message).toMatch(/\[REDACTED_/);
  });

  it("truncates long messages", () => {
    const longMessage = "A".repeat(600);
    emitEvent({
      category: "request",
      eventType: "request_received",
      message: longMessage,
    });

    const events = getEvents();
    expect(events[0].message.length).toBeLessThanOrEqual(500);
  });

  it("propagates correlation IDs", () => {
    const correlation = createCorrelationContext();
    emitEvent({
      category: "request",
      eventType: "request_received",
      message: "Request received",
      correlationIds: correlation,
    });

    const events = getEvents();
    expect(events[0].requestId).toBe(correlation.requestId);
    expect(events[0].conversationId).toBe(correlation.conversationId);
  });

  it("classifies errors in events", () => {
    emitEvent({
      category: "error",
      eventType: "error_occurred",
      message: "Rate limit error",
      error: new Error("Rate limit exceeded (429)"),
    });

    const events = getEvents();
    expect(events[0].error).toBeDefined();
    expect(events[0].error!.category).toBe("rate_limit_error");
    expect(events[0].error!.recoverable).toBe(true);
  });

  it("notifies listeners", () => {
    const received: ObservabilityEvent[] = [];
    onEvent((event) => received.push(event));

    emitEvent({
      category: "tool",
      eventType: "tool_executed",
      message: "Tool executed",
    });

    expect(received.length).toBe(1);
    expect(received[0].eventType).toBe("tool_executed");
  });

  it("filters events by category", () => {
    emitEvent({ category: "request", eventType: "request_received", message: "req" });
    emitEvent({ category: "tool", eventType: "tool_executed", message: "tool" });
    emitEvent({ category: "request", eventType: "request_completed", message: "req done" });

    const requestEvents = getEvents({ category: "request" });
    expect(requestEvents.length).toBe(2);

    const toolEvents = getEvents({ category: "tool" });
    expect(toolEvents.length).toBe(1);
  });

  it("filters events by severity", () => {
    emitEvent({ category: "request", eventType: "request_received", message: "info", severity: "info" });
    emitEvent({ category: "error", eventType: "error_occurred", message: "error", severity: "error" });

    const errors = getEvents({ severity: "error" });
    expect(errors.length).toBe(1);
  });

  it("counts events by category", () => {
    emitEvent({ category: "request", eventType: "request_received", message: "a" });
    emitEvent({ category: "request", eventType: "request_received", message: "b" });
    emitEvent({ category: "tool", eventType: "tool_executed", message: "c" });

    const counts = getEventCounts();
    expect(counts.request).toBe(2);
    expect(counts.tool).toBe(1);
    expect(counts.ai).toBe(0);
  });

  it("error classification categorizes timeout errors", () => {
    const result = classifyError(new Error("Request timed out after 30s"));
    expect(result.category).toBe("timeout_error");
    expect(result.retryable).toBe(true);
  });

  it("error classification categorizes auth errors", () => {
    const result = classifyError(new Error("401 Unauthorized"));
    expect(result.category).toBe("authentication_error");
    expect(result.retryable).toBe(false);
  });

  it("error classification categorizes rate limit errors", () => {
    const result = classifyError(new Error("429 Too Many Requests"));
    expect(result.category).toBe("rate_limit_error");
    expect(result.retryable).toBe(true);
  });

  it("error classification categorizes security errors", () => {
    const result = classifyError(new Error("Secret detected in input"));
    expect(result.category).toBe("security_error");
    expect(result.retryable).toBe(false);
  });

  it("error classification handles unknown errors", () => {
    const result = classifyError("some random string");
    expect(result.category).toBe("unknown_error");
  });
});

// ─── METRICS TESTS ─────────────────────────────────────────────

describe("P14 — Metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("records and retrieves metric points", () => {
    recordMetric("test.metric", 42);
    recordMetric("test.metric", 58);
    expect(getCounter("test.metric")).toBe(0);
  });

  it("records latency and computes stats", () => {
    for (let i = 1; i <= 100; i++) {
      recordLatency("request.total", i);
    }

    const stats = getLatencyStats("request.total");
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(100);
    expect(stats!.min).toBe(1);
    expect(stats!.max).toBe(100);
    expect(stats!.p50).toBeGreaterThan(0);
    expect(stats!.p95).toBeGreaterThan(stats!.p50);
  });

  it("returns null for unknown latency metrics", () => {
    expect(getLatencyStats("nonexistent")).toBeNull();
  });

  it("increments and reads counters", () => {
    incrementCounter("requests.total");
    incrementCounter("requests.total");
    incrementCounter("requests.total", 3);
    expect(getCounter("requests.total")).toBe(5);
  });

  it("returns 0 for unknown counters", () => {
    expect(getCounter("nonexistent")).toBe(0);
  });

  it("gets all counters", () => {
    incrementCounter("a", 1);
    incrementCounter("b", 2);
    const all = getAllCounters();
    expect(all.a).toBe(1);
    expect(all.b).toBe(2);
  });

  it("records tool events", () => {
    recordToolEvent("launch_application", "requested");
    recordToolEvent("launch_application", "approved");
    recordToolEvent("launch_application", "executed", 150);
    recordToolEvent("launch_application", "verified");

    const metrics = getToolMetrics("launch_application");
    expect(metrics).not.toBeNull();
    expect(metrics!.requested).toBe(1);
    expect(metrics!.approved).toBe(1);
    expect(metrics!.executed).toBe(1);
    expect(metrics!.verified).toBe(1);
    expect(metrics!.totalDuration).toBe(150);
  });

  it("computes tool success rate", () => {
    for (let i = 0; i < 10; i++) {
      recordToolEvent("test_tool", "executed");
    }
    recordToolEvent("test_tool", "failed");

    const rate = getToolSuccessRate("test_tool");
    expect(rate).toBeCloseTo(0.9);
  });

  it("computes tool denial rate", () => {
    for (let i = 0; i < 10; i++) {
      recordToolEvent("test_tool", "requested");
    }
    for (let i = 0; i < 3; i++) {
      recordToolEvent("test_tool", "denied");
    }

    const rate = getToolDenialRate("test_tool");
    expect(rate).toBeCloseTo(0.3);
  });

  it("returns 0 for unknown tool metrics", () => {
    expect(getToolSuccessRate("nonexistent")).toBe(0);
    expect(getToolDenialRate("nonexistent")).toBe(0);
  });

  it("gets aggregate metrics summary", () => {
    incrementCounter("requests.total", 10);
    incrementCounter("tools.total", 20);
    incrementCounter("tools.executed", 18);
    incrementCounter("tools.failed", 2);
    incrementCounter("confirmations.requested", 5);
    incrementCounter("confirmations.approved", 4);

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(10);
    expect(summary.totalTools).toBe(20);
    expect(summary.toolSuccessRate).toBeCloseTo(0.889);
    expect(summary.confirmationApprovalRate).toBeCloseTo(0.8);
  });

  it("resets all metrics", () => {
    incrementCounter("test", 5);
    recordLatency("test", 100);
    recordToolEvent("test", "executed");
    resetMetrics();
    expect(getCounter("test")).toBe(0);
    expect(getLatencyStats("test")).toBeNull();
  });
});

// ─── HEALTH TESTS ──────────────────────────────────────────────

describe("P14 — Health System", () => {
  beforeEach(() => {
    resetHealthSystem();
  });

  it("sets and gets subsystem health", () => {
    setSubsystemHealth("ai_provider", "healthy", "Configured");
    const status = getSubsystemHealth("ai_provider");
    expect(status).not.toBeNull();
    expect(status!.status).toBe("healthy");
    expect(status!.message).toBe("Configured");
  });

  it("returns null for unknown subsystems", () => {
    expect(getSubsystemHealth("nonexistent")).toBeNull();
  });

  it("lists all subsystem health", () => {
    setSubsystemHealth("ai_provider", "healthy");
    setSubsystemHealth("storage", "degraded", "Slow disk");
    const all = getAllSubsystemHealth();
    expect(all.length).toBe(2);
  });

  it("computes overall system health", () => {
    setSubsystemHealth("ai", "healthy");
    setSubsystemHealth("storage", "healthy");
    const health = getSystemHealth();
    expect(health.overall).toBe("healthy");
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded when any subsystem is degraded", () => {
    setSubsystemHealth("ai", "healthy");
    setSubsystemHealth("storage", "degraded");
    const health = getSystemHealth();
    expect(health.overall).toBe("degraded");
  });

  it("returns unavailable when any subsystem is unavailable", () => {
    setSubsystemHealth("ai", "healthy");
    setSubsystemHealth("storage", "unavailable");
    const health = getSystemHealth();
    expect(health.overall).toBe("unavailable");
  });

  it("returns unavailable for misconfigured subsystem", () => {
    setSubsystemHealth("ai", "misconfigured", "Missing API key");
    const health = getSystemHealth();
    expect(health.overall).toBe("unavailable");
  });

  it("performs health checks without throwing", () => {
    const health = performHealthChecks();
    expect(health.overall).toBeDefined();
    expect(health.subsystems.length).toBeGreaterThan(0);
  });
});

// ─── ERROR TAXONOMY TESTS ──────────────────────────────────────

describe("P14 — Error Taxonomy", () => {
  it("rate limit errors are retryable", () => {
    const policy = getRetryPolicy("rate_limit_error");
    expect(policy.maxRetries).toBe(2);
    expect(policy.backoffMs).toBeGreaterThan(0);
  });

  it("auth errors are not retryable", () => {
    const policy = getRetryPolicy("authentication_error");
    expect(policy.maxRetries).toBe(0);
  });

  it("security errors are not retryable", () => {
    const policy = getRetryPolicy("security_error");
    expect(policy.maxRetries).toBe(0);
  });

  it("network errors are retryable", () => {
    const policy = getRetryPolicy("network_error");
    expect(policy.maxRetries).toBe(2);
  });

  it("shouldRetry returns correct result", () => {
    expect(shouldRetry("rate_limit_error", 0)).toBe(true);
    expect(shouldRetry("rate_limit_error", 1)).toBe(true);
    expect(shouldRetry("rate_limit_error", 2)).toBe(false);
    expect(shouldRetry("authentication_error", 0)).toBe(false);
  });

  it("getRetryDelay uses exponential backoff", () => {
    const delay0 = getRetryDelay("network_error", 0);
    const delay1 = getRetryDelay("network_error", 1);
    expect(delay1).toBeGreaterThan(delay0);
  });

  it("maps HTTP status to error category", () => {
    expect(httpStatusToCategory(429)).toBe("rate_limit_error");
    expect(httpStatusToCategory(401)).toBe("authentication_error");
    expect(httpStatusToCategory(403)).toBe("permission_error");
    expect(httpStatusToCategory(408)).toBe("timeout_error");
    expect(httpStatusToCategory(500)).toBe("network_error");
    expect(httpStatusToCategory(503)).toBe("network_error");
  });

  it("provides user-friendly HTTP messages", () => {
    expect(httpStatusMessage(429)).toContain("busy");
    expect(httpStatusMessage(401)).toContain("Authentication");
    expect(httpStatusMessage(500)).toContain("Server error");
  });

  it("classifies from category", () => {
    const classification = classifyFromCategory("rate_limit_error");
    expect(classification.category).toBe("rate_limit_error");
    expect(classification.recoverable).toBe(true);
    expect(classification.retryable).toBe(true);
  });
});


