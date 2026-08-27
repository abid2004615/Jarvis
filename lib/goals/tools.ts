/**
 * JARVIS Goal-Oriented Workflows — ToolRegistry Tools
 *
 * These tools let the model (and only the server) manage goals. All inputs
 * are strictly validated server-side; the client cannot call tools.
 *
 * Safety notes:
 *  - goal_create requires explicitApproval — the model is instructed to
 *    only create goals when the user explicitly requests multi-step work.
 *  - goal_confirm is safe because the GoalManager validates the confirmation
 *    against pending confirmations server-side.
 *  - goal_cancel is safe (never executes remaining steps).
 *  - Goals execute through the same ActionChain/PermissionManager/Confirmation
 *    as normal conversation. There is deliberately no goal-specific execution bypass.
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { getGoalManager } from "./manager";
import { generatePlan, generateSimplePlan } from "./planner";
import { GOAL_LIMITS } from "./types";

function goalInputSchemaHint(): Record<string, unknown> {
  return {
    type: "object",
    description:
      "Goal: {title:'...', description:'...', type:'one_shot'|'multi_step'|'conditional'|'monitoring', priority:'low'|'normal'|'high'|'urgent'}",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      type: { type: "string" },
      priority: { type: "string" },
    },
    required: ["title"],
    additionalProperties: true,
  };
}

export const GOAL_CREATE_TOOL: ToolDefinition = {
  name: "goal_create",
  description:
    "Create a multi-step goal with a validated plan. Use ONLY when the user explicitly requests " +
    "multi-step work (e.g. 'prepare my Mac for a presentation', 'help me get ready', " +
    "'make sure Safari is open and my app is ready'). Do NOT create goals for simple single-step " +
    "requests (e.g. 'what time is it?', 'open Safari'). The plan is generated via AI and validated " +
    "against registered tools before execution.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short goal title, e.g. 'Prepare Mac for presentation'" },
      description: { type: "string", description: "Goal description" },
      type: {
        type: "string",
        description: "one_shot|multi_step|conditional|monitoring (default: multi_step)",
        enum: ["one_shot", "multi_step", "conditional", "monitoring"],
      },
      priority: {
        type: "string",
        description: "low|normal|high|urgent (default: normal)",
        enum: ["low", "normal", "high", "urgent"],
      },
      explicitApproval: {
        type: "boolean",
        description: "Must be true. Set only when the user explicitly requested this multi-step work.",
      },
    },
    required: ["title", "explicitApproval"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    if (input.explicitApproval !== true) {
      return {
        success: false,
        message:
          "I can create a goal only when you explicitly ask for multi-step work. " +
          "What would you like to accomplish?",
      };
    }

    const manager = getGoalManager();
    const result = manager.create({
      title: String(input.title ?? ""),
      description: String(input.description ?? input.title ?? ""),
      type: (input.type as "one_shot" | "multi_step" | "conditional" | "monitoring") ?? "multi_step",
      priority: (input.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
    });

    if (result.error) {
      return { success: false, message: result.error };
    }

    const goal = result.goal!;

    // Generate plan
    const planResult = await generatePlan(goal.title, goal.description);
    if (!planResult.success || !planResult.steps) {
      // Try fallback plan
      const fallback = generateSimplePlan(goal.title, goal.description);
      if (!fallback.success || !fallback.steps) {
        manager.delete(goal.id);
        return {
          success: false,
          message: `Could not generate a plan: ${planResult.error ?? fallback.error}`,
        };
      }
      manager.setPlan(goal.id, fallback.steps);
      return {
        success: true,
        goalId: goal.id,
        goal: { title: goal.title, type: goal.type, status: "ready", steps: fallback.steps.length },
        message: `Goal "${goal.title}" created with ${fallback.steps.length} step(s) (basic plan).`,
      };
    }

    manager.setPlan(goal.id, planResult.steps);
    return {
      success: true,
      goalId: goal.id,
      goal: {
        title: goal.title,
        type: goal.type,
        status: "ready",
        steps: planResult.steps.map((s) => ({ id: s.id, description: s.description, risk: s.risk })),
      },
      message: `Goal "${goal.title}" created with ${planResult.steps.length} step(s). Say "start this goal" to begin.`,
    };
  },
};

export const GOAL_START_TOOL: ToolDefinition = {
  name: "goal_start",
  description:
    "Start or resume execution of a goal. The goal executes one step at a time. " +
    "If a step requires user confirmation, the goal pauses until the user responds.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const manager = getGoalManager();
    const result = manager.start(id);

    if (result.error) {
      return { success: false, message: result.error };
    }

    const goal = manager.get(id);
    if (!goal) {
      return { success: false, message: `Goal '${id}' not found` };
    }

    // Execute the first/current step
    const execResult = await manager.executeStep(id);

    if (execResult.pendingConfirmationId) {
      return {
        success: true,
        status: "waiting_for_confirmation",
        goalId: id,
        pendingConfirmationId: execResult.pendingConfirmationId,
        message: `Step requires your approval. Please confirm or deny.`,
      };
    }

    if (execResult.goalComplete) {
      return {
        success: true,
        status: "completed",
        goalId: id,
        message: `Goal "${goal.title}" completed successfully.`,
      };
    }

    if (execResult.goalFailed) {
      return {
        success: false,
        status: "failed",
        goalId: id,
        message: `Goal failed: ${execResult.error}`,
      };
    }

    if (execResult.success) {
      return {
        success: true,
        status: "running",
        goalId: id,
        progress: goal.progress,
        message: `Step completed. Progress: ${goal.progress}%`,
      };
    }

    return {
      success: false,
      status: "error",
      goalId: id,
      message: execResult.error ?? "Step execution failed",
    };
  },
};

export const GOAL_STEP_TOOL: ToolDefinition = {
  name: "goal_step",
  description:
    "Execute the next step of a running goal. Use when the user says 'continue', " +
    "'next step', or 'keep going'.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const manager = getGoalManager();
    const goal = manager.get(id);

    if (!goal) {
      return { success: false, message: `Goal '${id}' not found` };
    }

    if (goal.status !== "running") {
      return { success: false, message: `Goal is not running (status: ${goal.status})` };
    }

    const execResult = await manager.executeStep(id);

    if (execResult.pendingConfirmationId) {
      return {
        success: true,
        status: "waiting_for_confirmation",
        goalId: id,
        pendingConfirmationId: execResult.pendingConfirmationId,
        message: `Step requires your approval.`,
      };
    }

    if (execResult.goalComplete) {
      return {
        success: true,
        status: "completed",
        goalId: id,
        message: `Goal completed.`,
      };
    }

    if (execResult.goalFailed) {
      return {
        success: false,
        status: "failed",
        goalId: id,
        message: `Goal failed: ${execResult.error}`,
      };
    }

    return {
      success: execResult.success,
      status: execResult.success ? "running" : "error",
      goalId: id,
      progress: goal.progress,
      message: execResult.success
        ? `Step completed. Progress: ${goal.progress}%`
        : execResult.error ?? "Step failed",
    };
  },
};

export const GOAL_STATUS_TOOL: ToolDefinition = {
  name: "goal_status",
  description: "Get the status and progress of a goal.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id (omit for most recent active goal)" },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = input.id ? String(input.id) : undefined;
    const manager = getGoalManager();

    let goal;
    if (id) {
      goal = manager.get(id);
    } else {
      goal = manager.getActiveGoal();
    }

    if (!goal) {
      return { success: false, message: id ? `Goal '${id}' not found` : "No active goals" };
    }

    const currentStep = goal.plan[goal.currentStepIndex];
    return {
      success: true,
      goal: {
        id: goal.id,
        title: goal.title,
        status: goal.status,
        progress: goal.progress,
        currentStep: currentStep?.description,
        totalSteps: goal.plan.length,
        completedSteps: goal.plan.filter((s) => s.status === "executed").length,
        error: goal.error,
      },
    };
  },
};

export const GOAL_LIST_TOOL: ToolDefinition = {
  name: "goal_list",
  description: "List all goals.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const goals = getGoalManager().list();
    return {
      count: goals.length,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        type: g.type,
      })),
    };
  },
};

export const GOAL_PAUSE_TOOL: ToolDefinition = {
  name: "goal_pause",
  description: "Pause a running goal. The goal can be resumed later.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getGoalManager().pause(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, goalId: id, message: "Goal paused." };
  },
};

export const GOAL_RESUME_TOOL: ToolDefinition = {
  name: "goal_resume",
  description: "Resume a paused goal.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getGoalManager().start(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, goalId: id, message: "Goal resumed." };
  },
};

export const GOAL_CANCEL_TOOL: ToolDefinition = {
  name: "goal_cancel",
  description: "Cancel a goal. Never executes remaining steps.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getGoalManager().cancel(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, goalId: id, message: "Goal cancelled." };
  },
};

export const GOAL_DELETE_TOOL: ToolDefinition = {
  name: "goal_delete",
  description: "Delete a completed, failed, or cancelled goal.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Goal id" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getGoalManager().delete(id);
    if (!result.success) {
      return { success: false, message: result.error ?? "Goal not found" };
    }
    return { success: true, goalId: id, message: "Goal deleted." };
  },
};

export const GOAL_CONFIRM_TOOL: ToolDefinition = {
  name: "goal_confirm",
  description:
    "Confirm or deny a step in a goal that requires user approval. " +
    "The GoalManager validates the confirmation server-side.",
  inputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string", description: "Goal id" },
      stepId: { type: "string", description: "Step id" },
      approved: { type: "boolean", description: "true to approve, false to deny" },
    },
    required: ["goalId", "stepId", "approved"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const goalId = String(input.goalId ?? "");
    const stepId = String(input.stepId ?? "");
    const approved = input.approved === true;

    const manager = getGoalManager();
    const result = manager.handleConfirmation(goalId, stepId, approved);

    if (result.error) {
      return { success: false, message: result.error };
    }

    if (approved) {
      // Execute the next step
      const execResult = await manager.executeStep(goalId);
      if (execResult.goalComplete) {
        return { success: true, status: "completed", message: "Step approved and goal completed." };
      }
      if (execResult.pendingConfirmationId) {
        return { success: true, status: "waiting_for_confirmation", message: "Next step also requires approval." };
      }
      return {
        success: true,
        status: "running",
        progress: manager.get(goalId)?.progress,
        message: `Step approved. Progress: ${manager.get(goalId)?.progress ?? 0}%`,
      };
    }

    return { success: true, status: "denied", message: "Step denied. Goal continues with next step." };
  },
};

/** All goal management tools, registered by the shared registry. */
export function getGoalTools(): ToolDefinition[] {
  return [
    GOAL_CREATE_TOOL,
    GOAL_START_TOOL,
    GOAL_STEP_TOOL,
    GOAL_STATUS_TOOL,
    GOAL_LIST_TOOL,
    GOAL_PAUSE_TOOL,
    GOAL_RESUME_TOOL,
    GOAL_CANCEL_TOOL,
    GOAL_DELETE_TOOL,
    GOAL_CONFIRM_TOOL,
  ];
}

export function goalToolNames(): string[] {
  return getGoalTools().map((t) => t.name);
}
