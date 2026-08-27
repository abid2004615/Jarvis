/**
 * GET /api/diagnostics
 *
 * Returns safe diagnostic information for development/debugging.
 * Never returns secrets, file contents, clipboard, screenshots, tokens, or prompts.
 * Read-only — no mutations allowed.
 */

import { NextResponse } from "next/server";
import { getSystemHealth, performHealthChecks } from "@/lib/observability/health";
import { getMetricsSummary } from "@/lib/observability/metrics";
import { getEventCounts } from "@/lib/observability/logger";
import { emitEvent } from "@/lib/observability/logger";
import { createCorrelationContext } from "@/lib/observability/correlation";
import { redactSecrets } from "@/lib/observability/redaction";

const STARTUP_TIME = Date.now();

export async function GET() {
  const correlation = createCorrelationContext();

  emitEvent({
    category: "system",
    eventType: "system_health_check",
    message: "Diagnostics requested",
    correlationIds: correlation,
  });

  try {
    performHealthChecks();
    const health = getSystemHealth();
    const metrics = getMetricsSummary();
    const eventCounts = getEventCounts();

    // Provider/model — safe to expose (no secrets)
    const provider = process.env.AI_PROVIDER || "unknown";
    const model = process.env.AI_MODEL || "unknown";

    // Test mode detection
    const testMode = process.env.NODE_ENV === "test";

    return NextResponse.json({
      version: "1.0.0",
      uptime: Date.now() - STARTUP_TIME,
      provider: redactSecrets(provider).redacted,
      model: redactSecrets(model).redacted,
      testMode,
      overallHealth: health.overall,
      subsystemHealth: health.subsystems.map((s) => ({
        name: s.subsystem,
        status: s.status,
        message: s.message,
      })),
      metrics: {
        totalRequests: metrics.totalRequests,
        totalTools: metrics.totalTools,
        toolSuccessRate: Math.round(metrics.toolSuccessRate * 100) / 100,
        averageLatency: Math.round(metrics.averageLatency),
        confirmationApprovalRate: Math.round(metrics.confirmationApprovalRate * 100) / 100,
      },
      eventCounts,
      checkedAt: new Date(health.checkedAt).toISOString(),
    });
  } catch (error) {
    emitEvent({
      category: "system",
      eventType: "system_health_check",
      severity: "error",
      message: "Diagnostics failed",
      correlationIds: correlation,
      error,
    });

    return NextResponse.json(
      {
        status: "unavailable",
        error: "Diagnostics unavailable",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
