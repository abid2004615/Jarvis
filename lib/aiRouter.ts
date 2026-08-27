import type { OrbMode } from "@/lib/jarvisState";
import type { AssistantAPIResponse } from "@/lib/ai/types";
import { JarvisRuntimeState, RUNTIME_STATE_TO_ORB_MODE } from "@/lib/runtime/types";
import type { ActionChainStatus } from "@/lib/runtime/types";
import { routeAssistantCommand } from "@/lib/ai/fallback";
import type { FallbackResult } from "@/lib/ai/fallback";

export { routeAssistantCommand };
export type { FallbackResult };

export interface AssistantResult {
  mode: OrbMode;
  response: string;
  tool?: "getSystemStats" | "toggleMic" | "toggleCamera" | "openUrl" | "launchApp";
  state?: JarvisRuntimeState;
  actionChain?: ActionChainStatus;
  conversationId?: string;
}

/**
 * Call the JARVIS assistant API.
 * Never throws — gracefully degrades to the pattern-matching fallback
 * when the server is unreachable or the request fails.
 */
export async function callAIAssistant(input: string, conversationId?: string): Promise<AssistantResult> {
  if (typeof fetch === "undefined") {
    return routeAssistantCommand(input);
  }

  try {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input, conversationId }),
    });

    if (!res.ok) {
      return routeAssistantCommand(input);
    }

    const data = (await res.json()) as AssistantAPIResponse;

    if (data.state === "error") {
      return {
        mode: "ERROR",
        response: data.message || "An unexpected error occurred.",
      };
    }

    const mode = data.state ? (RUNTIME_STATE_TO_ORB_MODE[data.state as JarvisRuntimeState] as OrbMode) : "THINKING";

    return {
      mode,
      response: data.message,
      state: data.state ? (data.state as JarvisRuntimeState) : undefined,
      actionChain: data.actionChain ?? undefined,
      conversationId: data.conversationId,
      tool: data.toolsExecuted?.[0]?.toolName as
        | "getSystemStats"
        | "toggleMic"
        | "toggleCamera"
        | "openUrl"
        | "launchApp"
        | undefined,
    };
  } catch (error) {
    void error;
    return routeAssistantCommand(input);
  }
}
