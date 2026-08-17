/**
 * JARVIS Personal Routines — ToolRegistry Tools
 *
 * These tools let the model (and only the server) manage routines. All inputs
 * are strictly validated server-side; steps must reference REGISTERED tools.
 *
 * Safety notes:
 *  - create_routine/update_routine validate every step against the live
 *    ToolRegistry (including per-tool schema + forbidden keys) server-side.
 *  - run_routine executes through the same ActionChain as normal conversation;
 *    confirmation-gated steps remain gated. No bypass.
 *  - delete_routine is confirmation-gated.
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { getRoutineManager } from "./manager";

function stepSchemaHint(): Record<string, unknown> {
  return {
    type: "array",
    items: {
      type: "object",
      description: "One step: a registered tool id + validated arguments",
      properties: {
        toolId: { type: "string", description: "A registered tool id, e.g. get_system_summary or get_cpu_usage" },
        arguments: { type: "object", description: "Tool arguments matching that tool's schema" },
        label: { type: "string", description: "Optional human-readable note" },
      },
      required: ["toolId", "arguments"],
      additionalProperties: false,
    },
    description: "Ordered steps (1-10)",
  };
}

export const CREATE_ROUTINE_TOOL: ToolDefinition = {
  name: "create_routine",
  description:
    "Create a routine: a named sequence of REGISTERED tool calls. Only use it when the user explicitly asks to save a routine " +
    "(e.g. 'save my morning routine'). Steps reference existing tool ids; each step runs through the normal tool system, so " +
    "control tools still require confirmation at run time.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short routine name, e.g. 'Morning check'" },
      description: { type: "string", description: "Optional one-line description" },
      steps: stepSchemaHint(),
    },
    required: ["name", "steps"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const result = getRoutineManager().create(input);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return {
      success: true,
      routineId: result.routine?.id,
      routine: {
        name: result.routine?.name,
        steps: result.routine?.steps.map((step) => ({ toolId: step.toolId, label: step.label })),
      },
      message: `Routine "${result.routine?.name}" created with ${result.routine?.steps.length} step(s).`,
    };
  },
};

export const LIST_ROUTINES_TOOL: ToolDefinition = {
  name: "list_routines",
  description: "List all routines (id, name, enabled, step tool ids).",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const routines = getRoutineManager().list();
    return { count: routines.length, routines };
  },
};

export const GET_ROUTINE_TOOL: ToolDefinition = {
  name: "get_routine",
  description: "Get a single routine by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const found = getRoutineManager().get(id);
    if (!found) {
      return { success: false, message: `Routine '${id}' not found` };
    }
    return { success: true, routine: found };
  },
};

export const UPDATE_ROUTINE_TOOL: ToolDefinition = {
  name: "update_routine",
  description: "Update a routine's name, description, or steps. Enabled state is managed with enable_routine/disable_routine.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Routine id" },
      name: { type: "string" },
      description: { type: "string" },
      steps: stepSchemaHint(),
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const { name, description, steps } = input as {
      name?: string;
      description?: string;
      steps?: unknown[];
    };
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (steps !== undefined) patch.steps = steps;
    const result = getRoutineManager().update(id, patch);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, routineId: id, message: `Routine "${result.routine?.name}" updated.` };
  },
};

export const ENABLE_ROUTINE_TOOL: ToolDefinition = {
  name: "enable_routine",
  description: "Enable a routine so it can be run again.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getRoutineManager().enable(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, routineId: id, message: `Routine "${result.routine?.name}" enabled.` };
  },
};

export const DISABLE_ROUTINE_TOOL: ToolDefinition = {
  name: "disable_routine",
  description: "Disable a routine so it stops running until re-enabled.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getRoutineManager().disable(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, routineId: id, message: `Routine "${result.routine?.name}" disabled.` };
  },
};

export const RUN_ROUTINE_TOOL: ToolDefinition = {
  name: "run_routine",
  description:
    "Run a routine now. Steps execute through the normal tool system: confirmation-gated tools still require user confirmation at run time.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const outcome = await getRoutineManager().runRoutine(id);
    return { success: outcome.success, status: outcome.status, message: outcome.message };
  },
};

export const DELETE_ROUTINE_TOOL: ToolDefinition = {
  name: "delete_routine",
  description: "Delete a routine. Requires user confirmation (confirmation-gated tool).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getRoutineManager().delete(id);
    if (!result.success) {
      return { success: false, message: result.error ?? "Routine not found" };
    }
    return { success: true, routineId: id, message: "Routine deleted." };
  },
};

/** All routine management tools, registered by the shared registry. */
export function getRoutineTools(): ToolDefinition[] {
  return [
    CREATE_ROUTINE_TOOL,
    LIST_ROUTINES_TOOL,
    GET_ROUTINE_TOOL,
    UPDATE_ROUTINE_TOOL,
    ENABLE_ROUTINE_TOOL,
    DISABLE_ROUTINE_TOOL,
    RUN_ROUTINE_TOOL,
    DELETE_ROUTINE_TOOL,
  ];
}

export function routineToolNames(): string[] {
  return getRoutineTools().map((t) => t.name);
}
