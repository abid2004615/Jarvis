/**
 * JARVIS Action Chain — controlled multi-step tool execution.
 *
 * A chain is a validated, ordered list of tool calls produced by a single AI
 * turn. It preserves execution order, marks invalid/unknown calls without
 * executing them, and exposes a structured status for the HUD. The pipeline
 * drives execution: safe steps run directly, confirmation-gated steps pause
 * the chain until the user approves (or denies) that exact step, and the
 * chain resumes after each decision.
 *
 * This module only models and validates the chain. It never executes tools
 * and never makes security decisions — execution and confirmation gating live
 * in the pipeline.
 */

import type { ToolCall } from "@/lib/ai/types";
import { ToolInputValidator, type RiskLevel } from "@/lib/tools/types";
import type { ToolRegistry } from "@/lib/tools/types";
import { describeToolAction, sanitizeArguments } from "@/lib/tools/registry";
import type {
  ActionChainState,
  ActionChainStatus,
  ActionChainStepStatus,
  ActionChainStepStatusInfo,
} from "@/lib/runtime/types";

/**
 * A single step of an action chain.
 */
export interface ActionChainStep {
  toolName: string;
  toolCall: ToolCall;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  status: ActionChainStepStatus;
  pendingToolId?: string;
  error?: string;
  result?: unknown;
  humanReadableAction: string;
}

/**
 * Ordered, validated tool-call chain.
 */
export class ActionChain {
  readonly id: string;
  readonly steps: ActionChainStep[];
  private position = 0;
  state: ActionChainState = "planning";

  constructor(toolCalls: ToolCall[], registry: ToolRegistry) {
    this.id = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.steps = [];

    for (const call of toolCalls ?? []) {
      const tool = registry.getTool(call.name);

      // Unknown tool: recorded as an honest failure, never executed.
      if (!tool) {
        this.steps.push({
          toolName: call.name,
          toolCall: call,
          riskLevel: "safe",
          requiresConfirmation: false,
          status: "failed",
          error: `Tool ${call.name} not found`,
          humanReadableAction: call.name,
        });
        continue;
      }

      // Malformed arguments: recorded as an honest failure, never executed.
      const validation = ToolInputValidator.validate(call.arguments ?? {}, tool.inputSchema);
      if (!validation.valid) {
        this.steps.push({
          toolName: call.name,
          toolCall: call,
          riskLevel: tool.riskLevel,
          requiresConfirmation: false,
          status: "failed",
          error: `Invalid arguments for ${call.name}: ${validation.error}`,
          humanReadableAction: call.name,
        });
        continue;
      }

      const safeArgs = sanitizeArguments(call.arguments ?? {});
      this.steps.push({
        toolName: call.name,
        toolCall: call,
        riskLevel: tool.riskLevel,
        requiresConfirmation: tool.requiresUserConfirmation || tool.riskLevel !== "safe",
        status: "pending",
        humanReadableAction: describeToolAction(call.name, tool.description, safeArgs),
      });
    }
  }

  /**
   * Whether there are unprocessed steps left.
   */
  hasRemaining(): boolean {
    return this.position < this.steps.length;
  }

  /**
   * The next unprocessed step, or null when the chain is exhausted.
   */
  peek(): ActionChainStep | null {
    return this.hasRemaining() ? this.steps[this.position] : null;
  }

  /**
   * Advance past the current step.
   */
  advance(): void {
    if (this.position < this.steps.length) {
      this.position += 1;
    }
  }

  /**
   * Index of the step waiting on a given pending-confirmation id.
   */
  getStepIndexByPendingToolId(pendingToolId: string): number {
    return this.steps.findIndex((s) => s.pendingToolId === pendingToolId);
  }

  /**
   * Observable status. Excludes internal arguments/results — safe for the
   * client and the HUD.
   */
  toStatus(): ActionChainStatus {
    const steps: ActionChainStepStatusInfo[] = this.steps.map((s) => ({
      toolName: s.toolName,
      status: s.status,
      ...(s.humanReadableAction ? { humanReadableAction: s.humanReadableAction } : {}),
    }));
    return { id: this.id, state: this.state, steps };
  }
}
