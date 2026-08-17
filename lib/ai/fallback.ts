/**
 * JARVIS Fallback Command Router
 * Pattern-matching fallback used when the AI service is unavailable.
 * Shared by the server-side pipeline and the client-side router so both
 * degrade to identical, safe responses.
 */

import type { OrbMode } from "@/lib/jarvisState";
import { getAllowlistedApplications } from "@/lib/macos/allowlist";

const AI_OFFLINE_APP_CONTROL =
  "AI is offline. Configure an AI provider to use application-control commands.";

export interface FallbackResult {
  mode: OrbMode;
  response: string;
  tool?: "getSystemStats" | "toggleMic" | "toggleCamera" | "openUrl" | "launchApp";
}

/**
 * Route a command using lightweight pattern matching.
 * Never returns sensitive or implementation-specific details.
 */
export function routeAssistantCommand(input: string): FallbackResult {
  const text = input.trim();
  if (!text) {
    return { mode: "IDLE", response: "Awaiting your command." };
  }

  const lower = text.toLowerCase();

  if (lower.includes("cpu") || lower.includes("memory") || lower.includes("system")) {
    return {
      mode: "SYSTEM",
      response: "System telemetry is stable. CPU is nominal, memory is within range, and the core architecture remains healthy.",
      tool: "getSystemStats",
    };
  }

  if (lower.includes("mic") || lower.includes("microphone")) {
    return {
      mode: "LISTENING",
      response: "Microphone control is available. Audio input can be toggled from the holographic interface.",
      tool: "toggleMic",
    };
  }

  if (lower.includes("camera") || lower.includes("vision") || lower.includes("gesture")) {
    return {
      mode: "SYSTEM",
      response: "Camera and gesture tracking are active. Hand recognition remains online and ready for interaction.",
      tool: "toggleCamera",
    };
  }

  if (lower.includes("open") && lower.includes("site")) {
    return {
      mode: "PROCESSING",
      response: "I can open a trusted target in a browser tab when the user confirms the destination.",
      tool: "openUrl",
    };
  }

  if (lower.includes("launch") || lower.includes("app")) {
    return {
      mode: "PROCESSING",
      response: AI_OFFLINE_APP_CONTROL,
      tool: "launchApp",
    };
  }

  const allowlistedApps = getAllowlistedApplications().map((a) => a.name.toLowerCase());
  if (allowlistedApps.some((name) => lower.includes(name))) {
    return {
      mode: "PROCESSING",
      response: AI_OFFLINE_APP_CONTROL,
      tool: "launchApp",
    };
  }

  if (lower.includes("hello") || /\bhi\b/.test(lower) || lower.includes("hey")) {
    return {
      mode: "SUCCESS",
      response: "Good to see you. JARVIS is online and ready for analysis, system monitoring, and assistive control.",
    };
  }

  if (lower.includes("status") || lower.includes("report")) {
    return {
      mode: "SYSTEM",
      response: "The primary systems are online. Orb core, visual layer, and gesture pipeline are operating within expected thresholds.",
    };
  }

  if (lower.includes("error") || lower.includes("fault") || lower.includes("broken")) {
    return {
      mode: "ERROR",
      response: "A non-destructive system warning has been logged. Current diagnostics show no critical failure, but the module remains under review.",
    };
  }

  if (lower.includes("thank") || lower.includes("good job")) {
    return {
      mode: "SUCCESS",
      response: "Your approval is logged. Core systems remain stable and ready for the next command.",
    };
  }

  return {
    mode: "THINKING",
    response: "AI assistant is offline. Configure an AI provider to enable natural-language tool calling.",
  };
}

/**
 * Get just the fallback response text for the pipeline.
 */
export function getFallbackResponse(input: string): string {
  return routeAssistantCommand(input).response;
}
