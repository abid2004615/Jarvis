/**
 * JARVIS Goal-Oriented Workflows — Planner
 *
 * Uses the AI provider to generate structured step plans from a goal description.
 * The planner calls the LLM once with a constrained prompt, then validates the
 * output against the live ToolRegistry. Invalid steps are rejected before the
 * goal ever starts executing.
 *
 * The planner never executes tools. It only produces a validated plan.
 */

import type { GoalStep, StepRisk } from "./types";
import { GOAL_LIMITS } from "./types";
import { validateGoalPlan } from "./validator";
import { getToolRegistry } from "@/lib/tools/registry";
import type { AssistantContext } from "@/lib/ai/types";

// ── Planner Types ─────────────────────────────────────────────────────────────

export interface PlanResult {
  success: boolean;
  steps?: GoalStep[];
  error?: string;
}

export interface GoalPlannerConfig {
  maxSteps?: number;
  timeoutMs?: number;
}

// ── AI-Based Planner ──────────────────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are a goal planning assistant for JARVIS, a Mac assistant.

Given a user goal, produce a JSON array of steps to accomplish it.

RULES:
- Each step must reference a registered tool by ID (see available tools below)
- Steps must be in logical execution order
- Steps may declare dependencies on other step IDs
- Every step must include a verification description
- No step may contain shell commands, AppleScript, arbitrary executables, or path traversal
- No step may contain secrets, API keys, or credentials
- No step may contain arbitrary coordinates
- Keep descriptions concise (under 200 chars)
- Limit to ${GOAL_LIMITS.MAX_STEPS} steps maximum

OUTPUT FORMAT: Return ONLY a JSON array, no markdown fences, no explanation.

Each element:
{
  "id": "step_1",
  "description": "Human-readable description",
  "toolId": "registered_tool_id",
  "arguments": {},
  "dependencies": [],
  "risk": "safe" | "confirmation",
  "requiresConfirmation": false,
  "verification": "What to verify after this step"
}`;

function buildPlanUserMessage(
  goalTitle: string,
  goalDescription: string,
  availableTools: string[],
): string {
  return `Goal: ${goalTitle}
Description: ${goalDescription}

Available tools (use only these IDs): ${availableTools.join(", ")}

Produce a step-by-step plan as a JSON array.`;
}

/**
 * Generate a plan using the AI provider. The planner uses the same
 * OpenAI-compatible API as the rest of the system.
 */
export async function generatePlan(
  goalTitle: string,
  goalDescription: string,
  config?: GoalPlannerConfig,
): Promise<PlanResult> {
  const maxSteps = config?.maxSteps ?? GOAL_LIMITS.MAX_STEPS;
  const timeoutMs = config?.timeoutMs ?? 30000;

  // Get available tools from the registry
  const registry = getToolRegistry();
  const allTools = registry.getAllTools();
  const availableTools = allTools.map((t: { name: string }) => t.name);

  // Build the context for the LLM call
  const context: AssistantContext = {
    conversationId: `goal-planner-${Date.now()}`,
    messages: [],
    systemPrompt: PLAN_SYSTEM_PROMPT,
    maxTokens: 2048,
  };

  const userMessage = buildPlanUserMessage(goalTitle, goalDescription, availableTools);

  try {
    const provider = getAIProvider();
    if (!provider) {
      return { success: false, error: "AI provider not available for planning" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await callProvider(provider, context, userMessage);
    clearTimeout(timeoutId);

    // Parse the response
    const steps = parsePlanResponse(response.text, availableTools);
    if (!steps) {
      return { success: false, error: "Failed to parse plan from AI response" };
    }

    // Validate the plan
    const validation = validateGoalPlan(steps);
    if (!validation.valid) {
      return { success: false, error: `Invalid plan: ${validation.error}` };
    }

    // Bound to maxSteps
    const bounded = steps.slice(0, maxSteps);

    // Infer risk levels from tool registry
    for (const step of bounded) {
      if (step.toolId) {
        const tool = registry.getTool(step.toolId);
        if (tool) {
          step.risk = tool.riskLevel as StepRisk;
          step.requiresConfirmation = tool.requiresUserConfirmation ?? false;
        }
      }
    }

    return { success: true, steps: bounded };
  } catch (error) {
    return {
      success: false,
      error: `Planning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ── Fallback Rule-Based Planner ───────────────────────────────────────────────

/**
 * Generate a simple plan without LLM, using keyword matching.
 * Used when the AI provider is unavailable.
 */
export function generateSimplePlan(
  goalTitle: string,
  goalDescription: string,
): PlanResult {
  const description = `${goalTitle} ${goalDescription}`.toLowerCase();
  const steps: GoalStep[] = [];
  let stepNum = 1;

  // Detect system check requests
  if (description.includes("battery") || description.includes("power")) {
    steps.push(makeStep(stepNum++, "Check battery status", "get_battery_status", {}, "safe"));
  }
  if (description.includes("cpu") || description.includes("processor")) {
    steps.push(makeStep(stepNum++, "Check CPU usage", "get_cpu_usage", {}, "safe"));
  }
  if (description.includes("memory") || description.includes("ram")) {
    steps.push(makeStep(stepNum++, "Check memory usage", "get_memory_usage", {}, "safe"));
  }
  if (description.includes("disk") || description.includes("storage")) {
    steps.push(makeStep(stepNum++, "Check disk usage", "get_disk_usage", {}, "safe"));
  }
  if (description.includes("system") || description.includes("summary") || description.includes("health")) {
    steps.push(makeStep(stepNum++, "Get system summary", "get_system_summary", {}, "safe"));
  }

  // Detect application requests
  const appMatch = description.match(/(?:open|launch)\s+(\w+)/);
  if (appMatch) {
    const app = appMatch[1];
    steps.push(makeStep(stepNum++, `Launch ${app}`, "launch_application", { application: app }, "confirmation"));
  }

  // Detect Safari/URL requests
  if (description.includes("safari") && (description.includes("open") || description.includes("launch"))) {
    if (!appMatch || appMatch[1].toLowerCase() !== "safari") {
      steps.push(makeStep(stepNum++, "Launch Safari", "launch_application", { application: "Safari" }, "confirmation"));
    }
  }

  const urlMatch = description.match(/(?:go to|open|navigate)\s+(https?:\/\/\S+)/);
  if (urlMatch) {
    steps.push(makeStep(stepNum++, `Navigate to ${urlMatch[1]}`, "open_safari_url", { url: urlMatch[1] }, "safe"));
  }

  // Detect volume requests
  const volMatch = description.match(/(?:set|adjust)\s+volume\s+(?:to\s+)?(\d+)/);
  if (volMatch) {
    steps.push(makeStep(stepNum++, `Set volume to ${volMatch[1]}`, "set_volume", { level: parseInt(volMatch[1]) }, "confirmation"));
  }

  // Detect application listing
  if (description.includes("running") || description.includes("applications") || description.includes("apps")) {
    steps.push(makeStep(stepNum++, "List running applications", "get_running_applications", {}, "safe"));
  }

  if (steps.length === 0) {
    return { success: false, error: "Could not generate a plan from the goal description. Please provide more details." };
  }

  return { success: true, steps };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(
  num: number,
  description: string,
  toolId: string,
  args: Record<string, unknown>,
  risk: StepRisk,
): GoalStep {
  return {
    id: `step_${num}`,
    description,
    toolId,
    arguments: args,
    risk,
    requiresConfirmation: risk === "confirmation",
    verification: `Verify ${description.toLowerCase()} completed`,
    status: "pending",
    retryCount: 0,
  };
}

function parsePlanResponse(text: string, availableTools: string[]): GoalStep[] | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return null;

    const steps: GoalStep[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;

      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== "string" || typeof obj.description !== "string") continue;

      // Validate toolId against available tools
      const toolId = typeof obj.toolId === "string" ? obj.toolId : undefined;
      if (toolId && !availableTools.includes(toolId)) continue;

      steps.push({
        id: obj.id,
        description: obj.description,
        toolId,
        arguments: typeof obj.arguments === "object" && obj.arguments !== null
          ? (obj.arguments as Record<string, unknown>)
          : undefined,
        dependencies: Array.isArray(obj.dependencies)
          ? obj.dependencies.filter((d): d is string => typeof d === "string")
          : undefined,
        risk: ["safe", "confirmation", "restricted"].includes(obj.risk as string)
          ? (obj.risk as StepRisk)
          : "safe",
        requiresConfirmation: typeof obj.requiresConfirmation === "boolean"
          ? obj.requiresConfirmation
          : false,
        verification: typeof obj.verification === "string"
          ? obj.verification
          : `Verify step ${i + 1}`,
        status: "pending",
        retryCount: 0,
      });
    }

    return steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}

// ── AI Provider Access ────────────────────────────────────────────────────────

function getAIProvider(): { complete: (context: AssistantContext, userMessage: string) => Promise<{ text: string }> } | null {
  try {
    // Dynamic import to avoid circular dependencies
    const { getAssistantService } = require("@/lib/ai/router") as typeof import("@/lib/ai/router");
    const service = getAssistantService();
    if (!service) return null;
    return {
      complete: async (context: AssistantContext, userMessage: string) => {
        const result = await service.processMessage(userMessage, context);
        return { text: result.response };
      },
    };
  } catch {
    return null;
  }
}

async function callProvider(
  provider: { complete: (context: AssistantContext, userMessage: string) => Promise<{ text: string }> },
  context: AssistantContext,
  userMessage: string,
): Promise<{ text: string }> {
  return provider.complete(context, userMessage);
}
