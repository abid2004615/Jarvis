/**
 * JARVIS Goal-Oriented Workflows — Observer
 *
 * Collects relevant state after each step execution. The observer
 * captures lightweight system state to enable verification.
 * Observations are bounded and never contain secrets, screenshots,
 * or clipboard contents.
 */

import type { Goal, GoalStep } from "./types";

/** Observation of the state after a step execution. */
export interface StepObservation {
  stepId: string;
  timestamp: number;
  stepResult?: unknown;
  systemState?: Record<string, unknown>;
  screenChanged?: boolean;
  applicationState?: Record<string, unknown>;
}

/** Configuration for observation collection. */
export interface ObserverConfig {
  captureSystemState?: boolean;
  captureApplicationState?: boolean;
  captureScreenState?: boolean;
}

const DEFAULT_CONFIG: ObserverConfig = {
  captureSystemState: true,
  captureApplicationState: true,
  captureScreenState: false,
};

/**
 * Collect observation after a step execution.
 * Captures bounded, non-sensitive state.
 */
export async function collectObservation(
  step: GoalStep,
  goal: Goal,
  stepResult: unknown,
  config?: ObserverConfig,
): Promise<StepObservation> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const observation: StepObservation = {
    stepId: step.id,
    timestamp: Date.now(),
    stepResult,
  };

  if (cfg.captureSystemState) {
    observation.systemState = await collectSystemState();
  }

  if (cfg.captureApplicationState) {
    observation.applicationState = await collectApplicationState();
  }

  return observation;
}

/**
 * Collect lightweight system state.
 * Never captures secrets, keys, or sensitive data.
 */
async function collectSystemState(): Promise<Record<string, unknown>> {
  try {
    const { executeToolSafely } = await import("@/lib/tools/registry");
    const { getToolRegistry } = await import("@/lib/tools/registry");

    const registry = getToolRegistry();
    const state: Record<string, unknown> = {};

    // Collect basic system metrics (read-only tools only)
    const safeTools = ["get_frontmost_application", "get_volume_status"];
    for (const toolId of safeTools) {
      if (registry.hasTool(toolId)) {
        try {
          const result = await executeToolSafely(toolId, {});
          if (result.success) {
            state[toolId] = result.result;
          }
        } catch {
          // Ignore collection errors — observation is best-effort
        }
      }
    }

    return state;
  } catch {
    return {};
  }
}

/**
 * Collect application state.
 * Never captures window contents, screen data, or sensitive info.
 */
async function collectApplicationState(): Promise<Record<string, unknown>> {
  try {
    const { executeToolSafely } = await import("@/lib/tools/registry");
    const { getToolRegistry } = await import("@/lib/tools/registry");

    const registry = getToolRegistry();
    const state: Record<string, unknown> = {};

    if (registry.hasTool("get_frontmost_application")) {
      try {
        const result = await executeToolSafely("get_frontmost_application", {});
        if (result.success) {
          state.frontmost = result.result;
        }
      } catch {
        // Best-effort
      }
    }

    if (registry.hasTool("get_running_applications")) {
      try {
        const result = await executeToolSafely("get_running_applications", {});
        if (result.success) {
          state.running = result.result;
        }
      } catch {
        // Best-effort
      }
    }

    return state;
  } catch {
    return {};
  }
}
