/**
 * JARVIS Goal-Oriented Workflows — Pipeline Wiring
 *
 * Connects the GoalManager's step runner to the runtime pipeline so every
 * goal step execution goes through the SAME ActionChain/ToolRegistry/
 * PermissionManager/Confirmation system as normal conversation. There is
 * deliberately no goal-specific execution bypass.
 */

import { getGoalManager } from "./manager";
import type { GoalStepRunner } from "./manager";
import type { GoalStep, Goal } from "./types";

let wired = false;

/**
 * Wire the goal manager to a specific pipeline instance.
 * Called from the pipeline constructor with `this`.
 */
export function wireGoalsToPipeline(
  runGoalStep: (
    step: { toolId?: string; arguments?: Record<string, unknown>; description: string; id: string },
    goal: { id: string; title: string },
    options?: { conversationId?: string; userInput?: string },
  ) => Promise<{
    pendingConfirmation?: { id: string };
    toolsExecuted?: Array<{ success: boolean; result?: unknown; error?: string }>;
    message?: string;
  }>,
): void {
  if (wired) return;
  const manager = getGoalManager();

  const runner: GoalStepRunner = async (step: GoalStep, goal: Goal) => {
    try {
      const response = await runGoalStep(step, goal);

      // Check if it's a confirmation request
      if (response.pendingConfirmation) {
        return {
          success: true,
          needsConfirmation: true,
          pendingConfirmationId: response.pendingConfirmation.id,
        };
      }

      // Check if the step executed successfully
      const toolsExecuted = response.toolsExecuted ?? [];
      const lastResult = toolsExecuted[toolsExecuted.length - 1];

      if (lastResult && lastResult.success) {
        return {
          success: true,
          result: lastResult.result,
        };
      }

      return {
        success: false,
        error: lastResult?.error ?? response.message ?? "Step execution failed",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown execution error",
      };
    }
  };

  manager.setRunner(runner);
  wired = true;
}

export function resetGoalWiring(): void {
  wired = false;
}
