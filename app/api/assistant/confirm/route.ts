/**
 * JARVIS Tool Confirmation API Endpoint
 * Accepts approval/denial decisions for pending tool calls
 * routed through the JARVIS pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import type { AssistantAPIResponse, ErrorResponse } from "@/lib/ai/types";
import { validateConfirmationRequest } from "@/lib/ai/validation";
import { getJarvisPipeline } from "@/lib/runtime/pipeline";

/**
 * Format error response for client (no internal details, no stack traces)
 */
function errorResponse(
  code: ErrorResponse["code"],
  message: string,
  status: number,
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      code,
    },
    { status },
  );
}

/**
 * Handle POST request - route a confirmation decision through the pipeline
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (request.method !== "POST") {
      return errorResponse("INVALID_REQUEST", "Only POST requests are allowed", 405);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
    }

    const validation = validateConfirmationRequest(body);
    if (!validation.valid || !validation.data) {
      return errorResponse("INVALID_REQUEST", validation.error || "Invalid request", 400);
    }

    const { toolId, approved, reason } = validation.data;

    const pipeline = getJarvisPipeline();
    const result = await pipeline.handleConfirmation({
      toolId,
      approved,
      reason,
    });

    const response: AssistantAPIResponse = {
      conversationId: result.conversationId,
      message: result.message,
      state: result.state,
      toolsExecuted: result.toolsExecuted,
      pendingConfirmation: result.pendingConfirmation,
      actionChain: result.actionChain,
      error: result.error,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    void error;
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
}

/**
 * Handle OPTIONS for CORS/preflight
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}
