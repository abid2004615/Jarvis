/**
 * JARVIS System Health — Evaluation with documented thresholds
 *
 * Converts raw telemetry into labeled health levels using documented
 * thresholds. All thresholds are fixed and intentional:
 *
 *   CPU    attention >= 80%, critical >= 95%
 *   Memory attention >= 80%, critical >= 95%
 *   Disk   attention >= 85%, critical >= 95%
 *   Battery attention <= 20%, critical <= 10%  (percent remaining)
 *
 * Levels: "ok" | "attention" | "critical" | "unknown" (unknown = no data).
 * Health reporting never fabricates data: missing telemetry yields "unknown".
 */

import {
  getBatteryStatus,
  getCPUUsage,
  getDiskUsage,
  getMemoryUsage,
} from "@/lib/macos";

export type HealthLevel = "ok" | "attention" | "critical" | "unknown";

export const HEALTH_THRESHOLDS = {
  cpu: { attention: 80, critical: 95 },
  memory: { attention: 80, critical: 95 },
  disk: { attention: 85, critical: 95 },
  battery: { attention: 20, critical: 10 },
} as const;

export interface MetricHealth {
  metric: "cpu" | "memory" | "disk" | "battery";
  level: HealthLevel;
  /** Current value as a percentage (percent remaining for battery). */
  percent?: number;
  threshold: { attention: number; critical: number };
  note?: string;
}

export interface HealthReport {
  metrics: MetricHealth[];
  /** "ok" when every reported metric is ok; worst level otherwise. */
  overall: HealthLevel;
  generatedAt: number;
}

/** Classify a value against fixed attention/critical thresholds. */
export function classifyHealth(
  metric: "cpu" | "memory" | "disk" | "battery",
  percent: number | undefined,
): Omit<MetricHealth, "metric"> {
  const threshold = HEALTH_THRESHOLDS[metric];
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return { level: "unknown", threshold, note: "No data available" };
  }
  const clamped = Math.max(0, Math.min(100, percent));
  if (metric === "battery") {
    // Lower is worse for battery.
    if (clamped <= threshold.critical) {
      return { level: "critical", percent: clamped, threshold, note: "Battery critically low" };
    }
    if (clamped <= threshold.attention) {
      return { level: "attention", percent: clamped, threshold, note: "Battery low" };
    }
    return { level: "ok", percent: clamped, threshold };
  }
  if (clamped >= threshold.critical) {
    return { level: "critical", percent: clamped, threshold, note: `${metric} critically high` };
  }
  if (clamped >= threshold.attention) {
    return { level: "attention", percent: clamped, threshold, note: `${metric} high` };
  }
  return { level: "ok", percent: clamped, threshold };
}

const WORST_ORDER: Record<HealthLevel, number> = { critical: 3, attention: 2, unknown: 1, ok: 0 };

/** Overall = worst (most severe) reported level. */
export function overallHealth(metrics: MetricHealth[]): HealthLevel {
  let worst: HealthLevel = "ok";
  for (const m of metrics) {
    if (WORST_ORDER[m.level] > WORST_ORDER[worst]) worst = m.level;
  }
  return worst;
}

/** Read live telemetry and classify each metric. Never fabricates data. */
export function evaluateHealth(): HealthReport {
  const cpu = getCPUUsage();
  const memory = getMemoryUsage();
  const disk = getDiskUsage();
  const battery = getBatteryStatus();

  const metrics: MetricHealth[] = [
    { metric: "cpu", ...classifyHealth("cpu", cpu.available ? cpu.percentUsed : undefined) },
    { metric: "memory", ...classifyHealth("memory", memory.available ? memory.percentUsed : undefined) },
    { metric: "disk", ...classifyHealth("disk", disk.available ? disk.percentUsed : undefined) },
    { metric: "battery", ...classifyHealth("battery", battery.available ? battery.percentCharged : undefined) },
  ];

  return { metrics, overall: overallHealth(metrics), generatedAt: Date.now() };
}

/** Human-readable one-line health summary. */
export function formatHealthReport(report: HealthReport): string {
  const parts = report.metrics.map((m) => {
    if (m.level === "unknown") return `${m.metric}: no data`;
    return `${m.metric}: ${m.percent}% (${m.level})`;
  });
  return `Overall: ${report.overall} — ${parts.join("; ")}`;
}
