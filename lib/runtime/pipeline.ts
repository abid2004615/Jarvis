/**
 * JARVIS Pipeline Orchestrator
 * Manages the complete Voice → AI → Tool → Response flow.
 *
 * Strongly typed state machine driving:
 *   listening → thinking → executing → responding → idle
 * with waiting_for_confirmation, error, and offline states.
 *
 * Every transition handles errors and degrades gracefully to a
 * safe pattern-matched fallback when the AI service is unavailable.
 */

import type { ToolCall, ToolResult, AssistantContext, AssistantProcessResult } from "@/lib/ai/types";
import { getAssistantService, initializeAIRouter } from "@/lib/ai/router";
import { getConversationContextManager } from "@/lib/runtime/context";
import {
  JarvisRuntimeState,
  type JarvisResponse,
  type PendingToolCall,
  type ToolExecutionResult,
} from "@/lib/runtime/types";
import {
  getToolRegistry,
  executeToolSafely,
  sanitizeArguments,
  describeToolAction,
} from "@/lib/tools/registry";
import type { ToolRegistry } from "@/lib/tools/types";
import { ActionChain } from "@/lib/runtime/action-chain";
import { logToolExecution } from "@/lib/audit/logger";
import { getFallbackResponse } from "@/lib/ai/fallback";
import { getMemoryManager } from "@/lib/memory/manager";
import { detectMemoryIntent } from "@/lib/memory/intent";
import { buildMemoryContext, insertMemorySystemMessage } from "@/lib/memory/context";
import { redactMemoryToolArgs } from "@/lib/memory/sanitizer";
import { getAutomationManager } from "@/lib/automation/manager";
import type { AutomationExecutorMeta } from "@/lib/automation/manager";
import { getNotificationBus } from "@/lib/automation/notifier";
import { registerAutomationTools } from "@/lib/automation/register";
import type { AutomationAction, AutomationExecutionOutcome } from "@/lib/automation/types";
import { registerTaskTools } from "@/lib/tasks/register";
import { registerReminderTools } from "@/lib/reminders/register";
import { wireRemindersToScheduler } from "@/lib/reminders/wiring";
import { registerRoutineTools } from "@/lib/routines/register";
import { getRoutineManager } from "@/lib/routines/manager";
import type { RoutineStep } from "@/lib/routines/types";
import { registerBriefingTools } from "@/lib/briefing/register";
import { registerGoalTools } from "@/lib/goals/register";
import { wireGoalsToPipeline } from "@/lib/goals/wiring";
import { registerPersonalizationTools } from "@/lib/personalization/register";
import { wirePersonalizationToPipeline, getPersonalizationContextForQuery, collectPipelineSignal } from "@/lib/personalization/wiring";
import { buildPersonalizationContext } from "@/lib/personalization/context";
import { getPersonalizationManager } from "@/lib/personalization/manager";

/**
 * Tools whose arguments may contain personal information. Their arguments are
 * redacted before reaching the audit log, which is documented to exclude
 * personal information.
 */
const MEMORY_TOOL_NAMES = new Set([
  "remember_user_preference",
  "recall_user_memory",
  "list_user_memories",
  "forget_user_memory",
  "clear_user_memory",
  "get_user_preferences",
  "set_user_preference",
  "update_user_preference",
  "disable_user_preference",
  "delete_user_preference",
  "get_usage_patterns",
  "get_recommendations",
  "dismiss_recommendation",
  "accept_recommendation",
]);

/**
 * Directive appended as the user message for the post-tool synthesis turn.
 * Tool results are already present in the conversation history as tool messages.
 */
const TOOL_SUMMARY_PROMPT =
  "Based on the tool results from your previous turn, respond naturally and concisely to the user's request. If a tool failed, explain what happened simply. Do not mention internal tool mechanics or raw JSON.";

/**
 * Natural user-facing message for AI provider rate limiting. Used instead of
 * the pattern-match fallback so the real reason is communicated honestly.
 */
const RATE_LIMIT_MESSAGE =
  "I'm temporarily rate-limited by the AI provider. Please try again shortly.";

export interface PipelineInputOptions {
  conversationId?: string;
  systemPrompt?: string;
}

export interface PipelineConstructorOptions {
  assistant?: AssistantLike | null;
  registry?: ToolRegistry | null;
  contextManager?: import("@/lib/runtime/context").ConversationContextManager | null;
}

/**
 * Minimal assistant contract the pipeline depends on.
 * The real AssistantService satisfies this; tests inject fakes.
 */
export interface AssistantLike {
  processMessage(input: string, context: AssistantContext): Promise<AssistantProcessResult>;
}

/**
 * Orchestrates the complete JARVIS pipeline
 */
export class JarvisPipeline {
  private currentState: JarvisRuntimeState = JarvisRuntimeState.IDLE;
  private online = true;
  private assistantOverride: AssistantLike | null = null;
  private registryOverride: ToolRegistry | null = null;
  private contextManagerOverride: import("@/lib/runtime/context").ConversationContextManager | null = null;
  private activeChains: Map<string, ActionChain> = new Map();
  private listeners: Set<(state: JarvisRuntimeState) => void> = new Set();

  constructor(options: PipelineConstructorOptions = {}) {
    this.assistantOverride = options.assistant ?? null;
    this.registryOverride = options.registry ?? null;
    this.contextManagerOverride = options.contextManager ?? null;
    // Automation management tools live in the shared registry. Registered on
    // construction (idempotent) so conversation-driven automation works.
    registerAutomationTools();
    // Personal layer tools (tasks, reminders, routines, briefing) share the
    // same registry. Registered idempotently on construction.
    registerTaskTools();
    registerReminderTools();
    registerRoutineTools();
    registerBriefingTools();
    // Goal-oriented workflows share the same registry and pipeline.
    registerGoalTools();
    // Personalization tools share the same registry and pipeline.
    registerPersonalizationTools();
    wirePersonalizationToPipeline();
    // Reminder firing runs on the SINGLE existing scheduler tick (no second
    // loop). Idempotent; wired at construction so fresh servers fire reminders.
    wireRemindersToScheduler();
    // Wire the automation manager to THIS pipeline so conversation-driven
    // automation (run_automation_now) and scheduled execution share the same
    // ToolRegistry/PermissionManager/confirmation path. Idempotent; the
    // singleton pipeline is authoritative in production.
    getAutomationManager().setExecutor((action, meta) => this.executeAutomationTool(action, meta));
    // Wire the routine manager's runner to THIS pipeline so routine steps flow
    // through the same ActionChain/confirmation path as normal conversation.
    getRoutineManager().setRunner((steps, meta) => this.runRoutineSteps(steps, meta));
    // Wire the goal manager's step runner to THIS pipeline so goal steps flow
    // through the same ActionChain/confirmation path as normal conversation.
    wireGoalsToPipeline((step, goal, options) => this.runGoalStep(step, goal, options));
  }

  /**
   * Get current runtime state
   */
  getState(): JarvisRuntimeState {
    return this.currentState;
  }

  /**
   * Whether the pipeline is online (connectivity available)
   */
  getOnline(): boolean {
    return this.online;
  }

  /**
   * Mark the pipeline online/offline
   */
  setOnline(online: boolean): void {
    this.online = online;
  }

  /**
   * Subscribe to runtime state transitions
   */
  subscribe(listener: (state: JarvisRuntimeState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Inject an assistant implementation (for tests and server setup)
   */
  setAssistant(assistant: AssistantLike | null): void {
    this.assistantOverride = assistant;
  }

  /**
   * Transition to a new state and notify listeners
   */
  private setState(state: JarvisRuntimeState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  /**
   * Get the active tool registry
   */
  private getRegistry(): ToolRegistry {
    return this.registryOverride ?? getToolRegistry();
  }

  /**
   * Get the active conversation context manager
   */
  private getContextManager(): import("@/lib/runtime/context").ConversationContextManager {
    return this.contextManagerOverride ?? getConversationContextManager();
  }

  /**
   * Process user input through the complete pipeline
   */
  async processUserInput(
    userInput: string,
    options: PipelineInputOptions = {},
  ): Promise<JarvisResponse> {
    const conversationId = options.conversationId || `jarvis-${Date.now()}`;
    const startTime = Date.now();

    try {
      if (!this.online) {
        return this.createErrorResponse(
          conversationId,
          "JARVIS is offline. Unable to process requests.",
          JarvisRuntimeState.OFFLINE,
          startTime,
        );
      }

      // State: → THINKING
      this.setState(JarvisRuntimeState.THINKING);

      const trimmedInput = userInput.trim();
      if (!trimmedInput) {
        return this.createErrorResponse(conversationId, "Empty input", JarvisRuntimeState.IDLE, startTime);
      }

      if (trimmedInput.length > 10000) {
        return this.createErrorResponse(conversationId, "Input exceeds maximum length", JarvisRuntimeState.IDLE, startTime);
      }

      const contextManager = this.getContextManager();
      contextManager.getConversation(conversationId);
      contextManager.addMessage(conversationId, "user", trimmedInput);

      const assistant = this.getAssistant();
      if (!assistant) {
        return this.respondWithFallback(conversationId, trimmedInput, startTime);
      }

      const messages = contextManager.getMessages(conversationId);
      let aiResult: AssistantProcessResult;
      try {
        // Inject relevant persistent memories as a system message placed
        // IMMEDIATELY BEFORE the current user message. The provider's dedup
        // guard checks the LAST message (the user message), so no duplicate
        // user message is emitted and no memory is appended after user input.
        const memoryText = buildMemoryContext(
          getMemoryManager().recall(trimmedInput, 6),
        );
        // Inject relevant personalization context (preferences + patterns).
        const personalizationText = getPersonalizationContextForQuery(trimmedInput);
        // Combine memory and personalization into a single system message.
        const combinedContext = [memoryText, personalizationText].filter(Boolean).join("\n\n");
        const aiMessages = combinedContext
          ? insertMemorySystemMessage(messages, combinedContext)
          : messages;

        if (process.env.NODE_ENV !== "production") {
          console.log(`[AI] pipeline: input="${trimmedInput.substring(0, 80)}" conversationId=${conversationId.substring(0, 20)} messages=${aiMessages.length}`);
        }
        aiResult = await assistant.processMessage(trimmedInput, {
          conversationId,
          messages: aiMessages,
          systemPrompt: options.systemPrompt,
        });
        if (process.env.NODE_ENV !== "production") {
          console.log(`[AI] pipeline result: response=${aiResult.response?.substring(0, 80) ?? "empty"} toolsUsed=${aiResult.toolsUsed.length} toolCalls=${aiResult.toolCalls?.length ?? 0}`);
        }
      } catch (error) {
        // Log a sanitized provider error so failures are not silently swallowed
        // into the fallback; safeProviderErrorMessage never exposes credentials.
        const rawError = error instanceof Error ? error.message : String(error);
        if (process.env.NODE_ENV !== "production") {
          console.error(`[AI] request failed: ${rawError}`);
        }
        // Rate limiting gets an honest, natural explanation instead of being
        // hidden behind the pattern-match fallback.
        if (/rate limit|429/i.test(rawError)) {
          contextManager.addMessage(conversationId, "assistant", RATE_LIMIT_MESSAGE);
          return this.respondWithMessage(conversationId, trimmedInput, RATE_LIMIT_MESSAGE, startTime);
        }
        // AI failure → graceful fallback response
        return this.respondWithFallback(conversationId, trimmedInput, startTime);
      }

      contextManager.addMessage(conversationId, "assistant", aiResult.response, aiResult.toolCalls);

      // Controlled multi-step action chain. Safe steps execute in order;
      // confirmation-gated steps pause the chain until the user approves or
      // denies that exact step; invalid/unknown calls are recorded as failures
      // and never executed.
      const chain = new ActionChain(aiResult.toolCalls ?? [], this.getRegistry());
      const conversationMeta = { conversationId, userInput: trimmedInput };

      if (chain.steps.length === 0) {
        // No tool calls: plain conversational turn.
        this.setState(JarvisRuntimeState.RESPONDING);
        const response: JarvisResponse = {
          conversationId,
          userInput: trimmedInput,
          state: JarvisRuntimeState.IDLE,
          message: aiResult.response,
          timestamp: Date.now(),
        };
        this.setState(JarvisRuntimeState.IDLE);
        return response;
      }

      // State: THINKING → PLANNING
      this.setState(JarvisRuntimeState.PLANNING);
      this.activeChains.set(chain.id, chain);
      return this.runActionChain(chain, conversationMeta, options.systemPrompt, aiResult, startTime);
    } catch (error) {
      const errorMsg = sanitizeErrorMessage(error);
      return this.createErrorResponse(conversationId, errorMsg, JarvisRuntimeState.ERROR, startTime);
    }
  }

  /**
   * Gracefully respond using the fallback command router
   */
  private respondWithFallback(
    conversationId: string,
    userInput: string,
    startTime: number,
  ): JarvisResponse {
    const responseText = getFallbackResponse(userInput);
    const contextManager = this.getContextManager();
    contextManager.addMessage(conversationId, "assistant", responseText);

    this.setState(JarvisRuntimeState.RESPONDING);
    const response: JarvisResponse = {
      conversationId,
      userInput,
      state: JarvisRuntimeState.IDLE,
      message: responseText,
      timestamp: Date.now(),
    };
    void startTime;
    this.setState(JarvisRuntimeState.IDLE);
    return response;
  }

  /**
   * Respond with a fixed, pre-authored message (e.g. rate-limit notice).
   */
  private respondWithMessage(
    conversationId: string,
    userInput: string,
    message: string,
    startTime: number,
  ): JarvisResponse {
    this.setState(JarvisRuntimeState.RESPONDING);
    const response: JarvisResponse = {
      conversationId,
      userInput,
      state: JarvisRuntimeState.IDLE,
      message,
      timestamp: Date.now(),
    };
    void startTime;
    this.setState(JarvisRuntimeState.IDLE);
    return response;
  }

  /**
   * Run an action chain step by step.
   *
   * Steps run immediately in order. Invalid steps are recorded as failures
   * without executing. Returns the final JarvisResponse with executed results
   * and a synthesized/derived message.
   */
  private async runActionChain(
    chain: ActionChain,
    meta: { conversationId: string; userInput: string },
    systemPrompt: string | undefined,
    aiResult: AssistantProcessResult,
    startTime: number,
  ): Promise<JarvisResponse> {
    const { conversationId, userInput } = meta;
    const contextManager = this.getContextManager();
    chain.state = "executing";
    this.setState(JarvisRuntimeState.EXECUTING);

    while (chain.hasRemaining()) {
      const step = chain.peek();
      if (!step) break;

      // Invalid/unknown steps were marked failed during planning and are never
      // executed, but they still surface as honest tool failures.
      if (step.status === "failed") {
        step.result = {
          toolName: step.toolName,
          success: false,
          result: null,
          error: step.error,
          duration: Date.now() - startTime,
        };
        chain.advance();
        continue;
      }

      // Explicit-intent gate for persistent memory: remember_user_preference
      // only runs when the user explicitly asked JARVIS to remember something.
      if (step.toolName === "remember_user_preference") {
        const intent = detectMemoryIntent(userInput);
        if (intent !== "remember") {
          step.status = "failed";
          step.error = "explicit_remember_intent_required";
          step.result = {
            toolName: step.toolName,
            success: false,
            result: null,
            error: "explicit_remember_intent_required",
            duration: Date.now() - startTime,
          };
          contextManager.addToolResults(conversationId, [
            {
              toolCallId: step.toolCall.id,
              success: false,
              output: null,
              error: "explicit_remember_intent_required",
            } satisfies ToolResult,
          ]);
          chain.advance();
          continue;
        }
      }

      // Explicit-intent gate for personalization: set_user_preference only runs
      // when the user explicitly asked to set/save a preference.
      if (step.toolName === "set_user_preference") {
        const hasExplicitIntent = detectMemoryIntent(userInput) === "remember"
          || /\b(prefer|preference|always|never|set|save|use)\b/i.test(userInput);
        if (!hasExplicitIntent) {
          step.status = "failed";
          step.error = "explicit_preference_intent_required";
          step.result = {
            toolName: step.toolName,
            success: false,
            result: null,
            error: "explicit_preference_intent_required",
            duration: Date.now() - startTime,
          };
          contextManager.addToolResults(conversationId, [
            {
              toolCallId: step.toolCall.id,
              success: false,
              output: null,
              error: "explicit_preference_intent_required",
            } satisfies ToolResult,
          ]);
          chain.advance();
          continue;
        }
      }

      // Safe step: execute now.
      const result = await this.executeTool(step.toolName, step.toolCall.arguments, startTime, true);
      step.result = result;
      step.status = result.success ? "executed" : "failed";

      // Collect learning signals for personalization (only on success).
      if (result.success) {
        collectPipelineSignal(
          "confirmation_approved" as any,
          step.toolName,
        );
      }

      contextManager.addToolResults(conversationId, [
        {
          toolCallId: step.toolCall.id,
          success: result.success,
          output: result.result,
          error: result.error,
        } satisfies ToolResult,
      ]);

      chain.advance();
    }

    return this.finalizeActionChain(chain, meta, systemPrompt, aiResult, startTime);
  }

  /**
   * Run a routine's steps through the SAME ActionChain path as normal
   * conversation. Confirmation-gated steps pause into the standard pending
   * confirmation flow; safe steps execute immediately; invalid steps are
   * recorded as failures. This is the routine manager's injected runner — there
   * is deliberately no routine-specific execution bypass.
   */
  async runRoutineSteps(
    steps: RoutineStep[],
    meta: { routineId: string; name: string },
    options: { conversationId?: string; userInput?: string } = {},
  ): Promise<JarvisResponse> {
    const conversationId = options.conversationId ?? `routine-${meta.routineId}`;
    const userInput = options.userInput ?? `Run routine ${meta.name}`;

    const toolCalls: ToolCall[] = steps.map((step, index) => ({
      id: `routine-${index}-${Date.now().toString(36)}`,
      name: step.toolId,
      arguments: step.arguments,
    }));

    const chain = new ActionChain(toolCalls, this.getRegistry());
    this.activeChains.set(chain.id, chain);
    return this.runActionChain(
      chain,
      { conversationId, userInput },
      undefined,
      { response: "", toolsUsed: [], toolCalls },
      Date.now(),
    );
  }

  /**
   * Run a single goal step through the SAME ActionChain path as normal
   * conversation. Confirmation-gated steps pause into the standard pending
   * confirmation flow; safe steps execute immediately. There is deliberately
   * no goal-specific execution bypass.
   */
  async runGoalStep(
    step: { toolId?: string; arguments?: Record<string, unknown>; description: string; id: string },
    goal: { id: string; title: string },
    options: { conversationId?: string; userInput?: string } = {},
  ): Promise<JarvisResponse> {
    if (!step.toolId) {
      return {
        conversationId: options.conversationId ?? `goal-${goal.id}`,
        userInput: options.userInput ?? `Goal step: ${step.description}`,
        state: JarvisRuntimeState.IDLE,
        message: `Step '${step.id}' has no tool to execute`,
        timestamp: Date.now(),
      };
    }

    const conversationId = options.conversationId ?? `goal-${goal.id}`;
    const userInput = options.userInput ?? `Goal "${goal.title}" step: ${step.description}`;

    const toolCalls: ToolCall[] = [{
      id: `goal-${goal.id}-${step.id}-${Date.now().toString(36)}`,
      name: step.toolId,
      arguments: step.arguments ?? {},
    }];

    const chain = new ActionChain(toolCalls, this.getRegistry());
    this.activeChains.set(chain.id, chain);
    return this.runActionChain(
      chain,
      { conversationId, userInput },
      undefined,
      { response: "", toolsUsed: [], toolCalls },
      Date.now(),
    );
  }

  /**
   * Finalize an exhausted action chain: synthesize a natural response when
   * possible, otherwise derive a concise summary from step outcomes.
   */
  private async finalizeActionChain(
    chain: ActionChain,
    meta: { conversationId: string; userInput: string },
    systemPrompt: string | undefined,
    aiResult: AssistantProcessResult,
    startTime: number,
  ): Promise<JarvisResponse> {
    const { conversationId, userInput } = meta;
    const contextManager = this.getContextManager();
    this.activeChains.delete(chain.id);

    // The chain steps are the single source of truth: every executed or failed
    // step stored its ToolExecutionResult, denied steps carry no result. This
    // keeps results intact across pause/resume boundaries.
    const toolsToExecute: ToolExecutionResult[] = chain.steps
      .filter((s) => s.status === "executed" || s.status === "failed")
      .map((s) => s.result as ToolExecutionResult)
      .filter((r): r is ToolExecutionResult => Boolean(r));
    const deniedNames = chain.steps.filter((s) => s.status === "denied").map((s) => s.toolName);
    const failedSteps = chain.steps.filter((s) => s.status === "failed").map((s) => s.toolName);

    // Post-tool synthesis: the provider often returns only tool_calls with an
    // empty text response. Run one more turn with the tool results in history
    // so JARVIS answers the user naturally (e.g. "Your CPU usage is 18%").
    // On any failure we fall back to the derived summary. When the chain had
    // denials or failures we ALSO skip synthesis so the honest summary
    // (including "Cancelled execution of ...") is never overwritten.
    let finalAi = aiResult;
    if (
      toolsToExecute.length > 0 &&
      !aiResult.response?.trim() &&
      deniedNames.length === 0 &&
      failedSteps.length === 0
    ) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[AI] synthesis turn: toolCalls=${aiResult.toolCalls?.length ?? 0} toolsExecuted=${toolsToExecute.length}`);
      }
      const synthesized = await this.synthesizeToolResponse(conversationId, systemPrompt, aiResult);
      if (synthesized) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[AI] synthesis result: response=${synthesized.response?.substring(0, 80) ?? "empty"}`);
        }
        finalAi = synthesized;
      } else {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[AI] synthesis failed, using derived summary`);
        }
      }
    }

    if (failedSteps.length > 0 || deniedNames.length > 0) {
      chain.state = "partial_success";
    } else if (toolsToExecute.length > 0) {
      chain.state = "completed";
    } else {
      chain.state = "error";
    }

    const message = finalAi.response?.trim()
      ? finalAi.response
      : this.buildFinalMessage(chain, toolsToExecute, deniedNames, failedSteps);

    if (finalAi.response?.trim() && message === finalAi.response) {
      contextManager.updateLastAssistantMessage(conversationId, message);
    } else if (!finalAi.response?.trim()) {
      contextManager.addMessage(conversationId, "assistant", message);
    }

    // State: EXECUTING → RESPONDING
    this.setState(JarvisRuntimeState.RESPONDING);

    const executed = toolsToExecute.length > 0 ? toolsToExecute : undefined;

    const response: JarvisResponse = {
      conversationId,
      userInput,
      state: JarvisRuntimeState.IDLE,
      message,
      toolsExecuted: executed,
      actionChain: chain.toStatus(),
      timestamp: Date.now(),
    };

    // State: RESPONDING → IDLE
    this.setState(JarvisRuntimeState.IDLE);
    return response;
  }

  /**
   * Derive a concise, honest summary when no natural synthesis is available.
   */
  private buildFinalMessage(
    chain: ActionChain,
    toolsToExecute: ToolExecutionResult[],
    deniedNames: string[],
    failedSteps: string[],
  ): string {
    const deniedOnly =
      deniedNames.length > 0 && toolsToExecute.length === 0 && failedSteps.length === 0;
    if (deniedOnly) {
      return `Cancelled execution of ${deniedNames.join(", ")}.`;
    }

    const parts: string[] = [];
    if (deniedNames.length > 0) {
      parts.push(`Cancelled execution of ${deniedNames.join(", ")}.`);
    }
    for (const result of toolsToExecute) {
      const value = result.result as { message?: unknown } | string | null | undefined;
      if (
        result.success &&
        typeof value === "object" &&
        value !== null &&
        typeof value.message === "string"
      ) {
        parts.push(value.message);
      } else if (result.success && typeof value === "string") {
        parts.push(value);
      }
    }
    if (failedSteps.length > 0) {
      parts.push("Some actions could not be completed.");
    }

    if (parts.length > 0) {
      return parts.join(" ");
    }

    const executedNames = chain.steps.filter((s) => s.status === "executed").map((s) => s.toolName);
    if (executedNames.length > 0) {
      return `${executedNames.join(", ")} executed successfully`;
    }
    return "No action was taken.";
  }

  /**
   * Generate a natural final response from tool results via one extra AI turn.
   * The tool results are already stored in conversation history as tool
   * messages, so the provider renders the full tool-call chain. On any failure
   * or empty result we keep the original response (graceful degradation).
   */
  private async synthesizeToolResponse(
    conversationId: string,
    systemPrompt: string | undefined,
    original?: AssistantProcessResult,
  ): Promise<AssistantProcessResult | null> {
    const assistant = this.getAssistant();
    if (!assistant) return null;

    try {
      const messages = this.getContextManager().getMessages(conversationId);
      const result = await assistant.processMessage(TOOL_SUMMARY_PROMPT, {
        conversationId,
        messages,
        systemPrompt,
      });
      const finalText = result.response?.trim();
      if (!finalText) return null;

      this.getContextManager().updateLastAssistantMessage(conversationId, finalText);
      return {
        response: finalText,
        toolsUsed: original?.toolsUsed ?? [],
        toolCalls: original?.toolCalls ?? [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Execute an automation's action through the standard execution path.
   *
   * This is the ONLY entry point the scheduler uses (wired via
   * lib/automation/wiring.ts), so scheduled/conditional execution shares the
   * same ToolRegistry validation, PermissionManager, and safety checks
   * as normal conversation. There is deliberately no scheduler bypass.
   */
  async executeAutomationTool(
    action: AutomationAction,
    meta: AutomationExecutorMeta,
  ): Promise<AutomationExecutionOutcome> {
    const { toolId, arguments: args } = action;
    const registry = this.getRegistry();
    const tool = registry.getTool(toolId);

    if (!tool) {
      return { status: "failed", message: `Tool ${toolId} is not registered` };
    }

    // Execute immediately through the same validated path.
    this.setState(JarvisRuntimeState.EXECUTING);
    const result = await this.executeTool(toolId, args, Date.now(), true);
    this.setState(JarvisRuntimeState.RESPONDING);
    this.setState(JarvisRuntimeState.IDLE);

    if (result.success) {
      const message = this.automationResultMessage(result.result) ?? `Automation "${meta.name}" executed successfully`;
      getAutomationManager().recordRun(meta.automationId, "success");
      getNotificationBus().push({
        title: `Automation: ${toolId}`,
        body: message,
        automationId: meta.automationId,
      });
      return { status: "executed", message, result: result.result };
    }
    getAutomationManager().recordRun(meta.automationId, "failed");
    return {
      status: "failed",
      message: `Automation "${meta.name}" failed: ${result.error ?? "unknown error"}`,
      result: result.result,
    };
  }

  /**
   * Extract a short natural message from a report-tool result, when present.
   */
  private automationResultMessage(result: unknown): string | null {
    if (result && typeof result === "object") {
      const value = result as { message?: unknown };
      if (typeof value.message === "string" && value.message.trim()) {
        return value.message.trim();
      }
    }
    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }
    return null;
  }

  /**
   * Execute a tool with safety checks
   */
  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    startTime: number,
    confirmed: boolean,
  ): Promise<ToolExecutionResult> {
    const t0 = Date.now();
    const tool = this.getRegistry().getTool(toolName);

    if (!tool) {
      return {
        toolName,
        success: false,
        result: null,
        error: `Tool ${toolName} not found`,
        duration: Date.now() - t0,
      };
    }

    const result = await executeToolSafely(toolName, args, {
      confirmed,
      registry: this.registryOverride ?? undefined,
    });

    // Memory tools may carry personal information in VALUES (not just keys).
    // The audit logger redacts sensitive field names but not values, so redact
    // every string argument before it reaches the audit log.
    const auditArgs = MEMORY_TOOL_NAMES.has(toolName) ? redactMemoryToolArgs(args) : args;
    logToolExecution(
      toolName,
      tool.riskLevel,
      auditArgs,
      { allowed: result.success, reason: result.error },
      { attempted: true, success: result.success, duration: Date.now() - t0, error: result.error },
    );

    return {
      toolName,
      success: result.success,
      result: result.result,
      error: result.error,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Ensure AI is ready and return the assistant service
   */
  private getAssistant(): AssistantLike | null {
    if (this.assistantOverride) {
      return this.assistantOverride;
    }

    // Always reconcile with the current environment: initializeAIRouter
    // re-initializes only when provider/model/baseUrl actually changed, so a
    // stale configuration is never reused after .env.local changes.
    if (this.ensureAIReady()) {
      const service = getAssistantService();
      return (service as unknown as AssistantLike) ?? null;
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn("[AI] assistant unavailable: ensureAIReady failed");
    }
    return null;
  }

  /**
   * Ensure AI is initialized from environment configuration
   */
  private ensureAIReady(): boolean {
    const provider = process.env.AI_PROVIDER || "openai";
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
      return false;
    }

    try {
      initializeAIRouter(provider, {
        apiKey,
        baseUrl: process.env.AI_BASE_URL,
        model: process.env.AI_MODEL,
        maxRetries: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
        timeout: parseInt(process.env.AI_TIMEOUT || "30000", 10),
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a safe error response (no stack traces, no internals)
   */
  private createErrorResponse(
    conversationId: string,
    error: string,
    state: JarvisRuntimeState,
    startTime: number,
  ): JarvisResponse {
    this.setState(state);
    return {
      conversationId,
      userInput: "",
      state,
      message: error,
      error: sanitizeErrorMessage(error),
      timestamp: Date.now(),
    };
  }

  /**
   * Clear any paused action chains
   */
  clearPendingConfirmations(): void {
    this.activeChains.clear();
  }
}

/**
 * Sanitize error messages so internal details are never surfaced to clients.
 */
function sanitizeErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error.slice(0, 500);
  }
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unexpected error";
}

// Singleton instance
let instance: JarvisPipeline | null = null;

export function getJarvisPipeline(): JarvisPipeline {
  if (!instance) {
    instance = new JarvisPipeline();
  }
  return instance;
}

export function resetJarvisPipeline(): void {
  if (instance) {
    instance.clearPendingConfirmations();
    instance = null;
  }
}
