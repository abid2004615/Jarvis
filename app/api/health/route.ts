/**
 * GET /api/health
 *
 * Returns safe structured health status of all subsystems.
 * Never returns secrets, API keys, or internal prompts.
 */

import { NextResponse } from "next/server";
import { performHealthChecks, getSystemHealth } from "@/lib/observability/health";
import { emitEvent } from "@/lib/observability/logger";
import { createCorrelationContext } from "@/lib/observability/correlation";

export async function GET() {
  const correlation = createCorrelationContext();

  emitEvent({
    category: "system",
    eventType: "system_health_check",
    message: "Health check requested",
    correlationIds: correlation,
  });

  try {
    const health = performHealthChecks();

    return NextResponse.json({
      status: health.overall,
      uptime: health.uptime,
      subsystems: health.subsystems.map((s) => ({
        name: s.subsystem,
        status: s.status,
        message: s.message,
      })),
      checkedAt: new Date(health.checkedAt).toISOString(),
    });
  } catch (error) {
    emitEvent({
      category: "system",
      eventType: "system_health_check",
      severity: "error",
      message: "Health check failed",
      correlationIds: correlation,
      error,
    });

    return NextResponse.json(
      {
        status: "unavailable",
        error: "Health check failed",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
