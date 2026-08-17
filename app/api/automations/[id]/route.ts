/**
 * JARVIS Automation — single automation API
 *
 * GET  /api/automations/[id]  — fetch one automation
 * PATCH /api/automations/[id] — update name/description/trigger/action/enabled
 * DELETE /api/automations/[id] — delete (requires { confirm: true })
 *
 * Delete is confirmation-gated: the client must send an explicit confirm flag,
 * matching the pipeline's delete_automation tool behavior. The client can
 * never supply authorization flags.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAutomationManager } from "@/lib/automation";
import { toAutomationSummary } from "@/lib/automation/model";

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

type Params = { params: Promise<{ id: string }> };

/** GET one automation. */
export async function GET(_request: NextRequest, context: Params): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const automation = getAutomationManager().get(id);
    if (!automation) {
      return errorResponse("NOT_FOUND", "Automation not found", 404);
    }
    return NextResponse.json({ automation: toAutomationSummary(automation) });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

/** PATCH — partial update, validated server-side. */
export async function PATCH(request: NextRequest, context: Params): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
    }

    const manager = getAutomationManager();
    const result = manager.update(id, body);
    if (result.error) {
      return errorResponse("INVALID_REQUEST", result.error, 400);
    }
    return NextResponse.json({
      success: true,
      automation: result.automation ? toAutomationSummary(result.automation) : null,
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

/** DELETE — requires an explicit confirm flag (mirrors pipeline gating). */
export async function DELETE(request: NextRequest, context: Params): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "confirm must be true", 400);
    }
    const confirm = (body as { confirm?: unknown } | null)?.confirm;
    if (confirm !== true) {
      return errorResponse("INVALID_REQUEST", "confirm must be true", 400);
    }

    const result = getAutomationManager().delete(id);
    if (!result.success) {
      return errorResponse("NOT_FOUND", result.error ?? "Automation not found", 404);
    }
    return NextResponse.json({ success: true });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

/** POST — run an automation now (gated actions still need confirmation). */
export async function POST(_request: NextRequest, context: Params): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const manager = getAutomationManager();
    const automation = manager.get(id);
    if (!automation) {
      return errorResponse("NOT_FOUND", "Automation not found", 404);
    }
    const outcome = await manager.executeAutomation(id);
    return NextResponse.json({
      success: outcome.status === "executed" || outcome.status === "waiting_for_confirmation",
      status: outcome.status,
      message: outcome.message,
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: { Allow: "GET, PATCH, POST, DELETE, OPTIONS" },
  });
}
