/**
 * JARVIS Automation API
 *
 * Server-authoritative automation management. Every input is validated
 * server-side. The client can never mark an automation as authorized:
 * `requiresConfirmation` and `enabled` are derived/managed here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAutomationManager, wireAutomationsToPipeline, startAutomationScheduler } from "@/lib/automation";
import { toAutomationSummary } from "@/lib/automation/model";
import { startPersonalServices } from "@/lib/personal/wiring";

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/** GET /api/automations — list all automations. */
export async function GET(): Promise<NextResponse> {
  try {
    startPersonalServices();
    wireAutomationsToPipeline();
    startAutomationScheduler();
    const automations = getAutomationManager().list();
    return NextResponse.json({ count: automations.length, automations });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

/** POST /api/automations — create a validated automation. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
    }

    const manager = getAutomationManager();
    const result = manager.create(body);
    if (result.error) {
      return errorResponse("INVALID_REQUEST", result.error, 400);
    }
    return NextResponse.json(
      { success: true, automation: result.automation ? toAutomationSummary(result.automation) : null },
      { status: 201 },
    );
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: { Allow: "GET, POST, OPTIONS" },
  });
}
