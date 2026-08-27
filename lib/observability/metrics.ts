/**
 * P14 — Metrics Collector
 *
 * Bounded in-memory metrics for performance tracking and tool analytics.
 * No heavy telemetry dependencies.
 */

import type { LatencyMetric, MetricPoint } from "./types";

const MAX_METRIC_POINTS = 10000;
const MAX_LATENCY_HISTORY = 1000;

const metricPoints: MetricPoint[] = [];
const latencyHistory: Map<string, number[]> = new Map();

// Counters
const counters: Map<string, number> = new Map();

// Tool-specific counters
interface ToolMetrics {
  requested: number;
  approved: number;
  denied: number;
  executed: number;
  failed: number;
  verified: number;
  totalDuration: number;
}

const toolMetrics: Map<string, ToolMetrics> = new Map();

/**
 * Record a metric point.
 */
export function recordMetric(name: string, value: number, tags?: Record<string, string>): void {
  metricPoints.push({
    name,
    value,
    timestamp: Date.now(),
    tags,
  });

  if (metricPoints.length > MAX_METRIC_POINTS) {
    metricPoints.shift();
  }
}

/**
 * Record a latency observation.
 */
export function recordLatency(name: string, durationMs: number): void {
  if (!latencyHistory.has(name)) {
    latencyHistory.set(name, []);
  }

  const history = latencyHistory.get(name)!;
  history.push(durationMs);

  if (history.length > MAX_LATENCY_HISTORY) {
    history.shift();
  }
}

/**
 * Compute latency statistics for a named metric.
 */
export function getLatencyStats(name: string): LatencyMetric | null {
  const history = latencyHistory.get(name);
  if (!history || history.length === 0) {
    return null;
  }

  const sorted = [...history].sort((a, b) => a - b);
  const count = sorted.length;

  return {
    p50: sorted[Math.floor(count * 0.5)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
    count,
    min: sorted[0],
    max: sorted[count - 1],
  };
}

/**
 * Increment a named counter.
 */
export function incrementCounter(name: string, amount: number = 1): void {
  counters.set(name, (counters.get(name) || 0) + amount);
}

/**
 * Get a counter value.
 */
export function getCounter(name: string): number {
  return counters.get(name) || 0;
}

/**
 * Get all counter values.
 */
export function getAllCounters(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of counters) {
    result[key] = value;
  }
  return result;
}

/**
 * Record a tool execution event.
 */
export function recordToolEvent(
  toolName: string,
  event: "requested" | "approved" | "denied" | "executed" | "failed" | "verified",
  durationMs?: number,
): void {
  if (!toolMetrics.has(toolName)) {
    toolMetrics.set(toolName, {
      requested: 0, approved: 0, denied: 0, executed: 0, failed: 0, verified: 0, totalDuration: 0,
    });
  }

  const metrics = toolMetrics.get(toolName)!;
  metrics[event]++;
  if (durationMs !== undefined) {
    metrics.totalDuration += durationMs;
  }
}

/**
 * Get metrics for a specific tool.
 */
export function getToolMetrics(toolName: string): ToolMetrics | null {
  return toolMetrics.get(toolName) || null;
}

/**
 * Get metrics for all tools.
 */
export function getAllToolMetrics(): Record<string, ToolMetrics> {
  const result: Record<string, ToolMetrics> = {};
  for (const [key, value] of toolMetrics) {
    result[key] = { ...value };
  }
  return result;
}

/**
 * Compute success rate for a tool.
 */
export function getToolSuccessRate(toolName: string): number {
  const metrics = toolMetrics.get(toolName);
  if (!metrics || metrics.executed === 0) {
    return 0;
  }
  return (metrics.executed - metrics.failed) / metrics.executed;
}

/**
 * Compute denial rate for a tool.
 */
export function getToolDenialRate(toolName: string): number {
  const metrics = toolMetrics.get(toolName);
  if (!metrics || metrics.requested === 0) {
    return 0;
  }
  return metrics.denied / metrics.requested;
}

/**
 * Get aggregate metrics summary.
 */
export function getMetricsSummary(): {
  totalRequests: number;
  totalTools: number;
  toolSuccessRate: number;
  averageLatency: number;
  confirmationApprovalRate: number;
  counters: Record<string, number>;
} {
  const totalRequests = getCounter("requests.total");
  const totalTools = getCounter("tools.total");
  const toolsExecuted = getCounter("tools.executed");
  const toolsFailed = getCounter("tools.failed");
  const confirmationsRequested = getCounter("confirmations.requested");
  const confirmationsApproved = getCounter("confirmations.approved");

  let toolSuccessRate = 0;
  if (toolsExecuted > 0) {
    toolSuccessRate = (toolsExecuted - toolsFailed) / toolsExecuted;
  }

  let confirmationApprovalRate = 0;
  if (confirmationsRequested > 0) {
    confirmationApprovalRate = confirmationsApproved / confirmationsRequested;
  }

  const latency = getLatencyStats("request.total");

  return {
    totalRequests,
    totalTools,
    toolSuccessRate,
    averageLatency: latency ? latency.p50 : 0,
    confirmationApprovalRate,
    counters: getAllCounters(),
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics(): void {
  metricPoints.length = 0;
  latencyHistory.clear();
  counters.clear();
  toolMetrics.clear();
}
