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
  type ConfirmationDecision,
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
import { classifyConfirmationIntent } from "@/lib/runtime/confirmation-intent";
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
  enableConfirmation?: boolean;
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
  private enableConfirmation: boolean;
  private assistantOverride: AssistantLike | null = null;
  private registryOverride: ToolRegistry | null = null;
  private contextManagerOverride: import("@/lib/runtime/context").ConversationContextManager | null = null;
  private pendingConfirmation: Map<string, PendingToolCall> = new Map();
  private pendingMeta: Map<
    string,
    { conversationId: string; userInput: string; chainId?: string; automationId?: string }
  > = new Map();
  private activeChains: Map<string, ActionChain> = new Map();
  private listeners: Set<(state: JarvisRuntimeState) => void> = new Set();

  constructor(options: PipelineConstructorOptions = {}) {
    this.assistantOverride = options.assistant ?? null;
    this.registryOverride = options.registry ?? null;
    this.contextManagerOverride = options.contextManager ?? null;
    this.enableConfirmation = options.enableConfirmation ?? true;
    // Automation management tools live in the shared registry. Registered on
    // construction (idempotent) so conversation-driven automation works.
    registerAutomationTools();
    // Personal layer tools (tasks, reminders, routines, briefing) share the
    // same registry. Registered idempotently on construction.
    registerTaskTools();
    registerReminderTools();
    registerRoutineTools();
    registerBriefingTools();
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

      // Natural-language confirmation: if this conversation has a pending tool
      // confirmation and the user answered it with a short approve/deny phrase,
      // resolve it server-side instead of treating it as new input.
      const intentDecision = this.resolvePendingConfirmationIntent(conversationId, trimmedInput);
      if (intentDecision) {
        return this.handleConfirmation(intentDecision);
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
        const aiMessages = memoryText
          ? insertMemorySystemMessage(messages, memoryText)
          : messages;

        aiResult = await assistant.processMessage(trimmedInput, {
          conversationId,
          messages: aiMessages,
          systemPrompt: options.systemPrompt,
        });
      } catch (error) {
        // Log a sanitized provider error so failures are not silently swallowed
        // into the fallback; safeProviderErrorMessage never exposes credentials.
        const rawError = error instanceof Error ? error.message : String(error);
        console.error(`[AI] request failed: ${rawError}`);
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
   * Build a pending confirmation for a tool call
   */
  private createPendingToolCall(call: ToolCall): PendingToolCall {
    const tool = this.getRegistry().getTool(call.name);
    const safeArgs = sanitizeArguments(call.arguments ?? {});
    return {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: call.name,
      description: tool?.description ?? call.name,
      humanReadableAction: describeToolAction(call.name, tool?.description ?? call.name, safeArgs),
      arguments: safeArgs,
      riskLevel: tool?.riskLevel ?? "confirmation",
      requiresUserConfirmation: tool?.requiresUserConfirmation ?? true,
    };
  }

  /**
   * Handle a confirmation decision for a pending tool.
   *
   * When the pending tool belongs to a paused action chain, the decision
   * resumes that chain (approve runs the step, deny marks it denied and both
   * continue with the remaining steps). Otherwise this is a standalone
   * single-tool confirmation, executed as before.
   */
  async handleConfirmation(decision: ConfirmationDecision): Promise<JarvisResponse> {
    const pending = this.pendingConfirmation.get(decision.toolId);
    if (!pending) {
      return this.createErrorResponse(
        `jarvis-${Date.now()}`,
        "Confirmation not found",
        JarvisRuntimeState.ERROR,
        Date.now(),
      );
    }

    const meta = this.pendingMeta.get(decision.toolId);
    if (meta?.chainId) {
      const chain = this.activeChains.get(meta.chainId);
      if (chain) {
        return this.handleChainConfirmation(chain, meta, decision);
      }
    }

    this.pendingConfirmation.delete(decision.toolId);
    this.pendingMeta.delete(decision.toolId);
    const conversationId = meta?.conversationId ?? `jarvis-${Date.now()}`;
    const contextManager = this.getContextManager();

    if (!decision.approved) {
      const message = `Cancelled execution of ${pending.name}.`;
      contextManager.addMessage(conversationId, "assistant", message);
      logToolExecution(
        pending.name,
        pending.riskLevel,
        pending.arguments,
        { allowed: false, reason: decision.reason ?? "User denied" },
        { attempted: false, success: false, duration: 0 },
      );
      if (meta?.automationId) {
        getNotificationBus().push({
          title: `Automation cancelled: ${pending.name}`,
          body: message,
          automationId: meta.automationId,
        });
      }
      this.setState(JarvisRuntimeState.IDLE);
      return {
        conversationId,
        userInput: meta?.userInput ?? `Confirmation denied for ${pending.name}`,
        state: JarvisRuntimeState.IDLE,
        message,
        timestamp: Date.now(),
      };
    }

    // State: WAITING_FOR_CONFIRMATION → EXECUTING
    this.setState(JarvisRuntimeState.EXECUTING);
    const result = await this.executeTool(pending.name, pending.arguments, Date.now(), true);

    // State: EXECUTING → RESPONDING
    this.setState(JarvisRuntimeState.RESPONDING);
    const message = result.success
      ? `${pending.name} executed successfully`
      : `${pending.name} failed`;

    // A confirmed tool that came from a scheduled/conditional automation
    // records its run with the automation manager (advances nextRunAt, applies
    // failure backoff) and notifies. Do NOT create a scheduler bypass — this is
    // the exact same confirmation path used by normal conversation.
    if (meta?.automationId) {
      if (result.success) {
        getAutomationManager().recordRun(meta.automationId, "success");
      } else {
        getAutomationManager().recordRun(meta.automationId, "failed");
      }
      getNotificationBus().push({
        title: `Automation: ${pending.name}`,
        body: message,
        automationId: meta.automationId,
      });
    }

    contextManager.addMessage(conversationId, "assistant", message);

    const response: JarvisResponse = {
      conversationId,
      userInput: meta?.userInput ?? pending.name,
      state: JarvisRuntimeState.IDLE,
      message,
      toolsExecuted: [result],
      timestamp: Date.now(),
    };

    // State: RESPONDING → IDLE
    this.setState(JarvisRuntimeState.IDLE);
    return response;
  }

  /**
   * Run an action chain step by step.
   *
   * Safe steps run immediately (in order). Confirmation-gated steps pause the
   * chain, register a pending confirmation, and hand control back with a
   * response carrying both the pendingConfirmation and the chain status.
   * Invalid steps are recorded as failures without executing. Returns the
   * final JarvisResponse — either a WAITING_FOR_CONFIRMATION pause or a
   * completed turn with executed results and a synthesized/derived message.
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

      if (this.enableConfirmation && step.requiresConfirmation) {
        // State: EXECUTING → WAITING_FOR_CONFIRMATION
        chain.state = "waiting_for_confirmation";
        const pending = this.createPendingToolCall(step.toolCall);
        step.pendingToolId = pending.id;
        this.pendingConfirmation.set(pending.id, pending);
        this.pendingMeta.set(pending.id, {
          conversationId,
          userInput,
          chainId: chain.id,
        });
        this.setState(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
        return {
          conversationId,
          userInput,
          state: JarvisRuntimeState.WAITING_FOR_CONFIRMATION,
          message: `Requesting confirmation for ${step.toolName}`,
          pendingConfirmation: pending,
          actionChain: chain.toStatus(),
          timestamp: Date.now(),
        };
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

      // Safe step: execute now.
      const result = await this.executeTool(step.toolName, step.toolCall.arguments, startTime, false);
      step.result = result;
      step.status = result.success ? "executed" : "failed";

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
   * Resolve one confirmation decision for a paused action chain step, then
   * continue executing the remaining steps.
   */
  private async handleChainConfirmation(
    chain: ActionChain,
    meta: { conversationId: string; userInput: string; chainId?: string },
    decision: ConfirmationDecision,
  ): Promise<JarvisResponse> {
    const { conversationId, userInput } = meta;
    const contextManager = this.getContextManager();
    this.pendingConfirmation.delete(decision.toolId);
    this.pendingMeta.delete(decision.toolId);

    const stepIndex = chain.getStepIndexByPendingToolId(decision.toolId);
    const step = stepIndex >= 0 ? chain.steps[stepIndex] : null;
    if (!step) {
      this.setState(JarvisRuntimeState.IDLE);
      return this.createErrorResponse(
        conversationId,
        "Confirmation not found",
        JarvisRuntimeState.ERROR,
        Date.now(),
      );
    }

    if (!decision.approved) {
      // User denied this step: record it, log it, and continue the chain.
      step.status = "denied";
      const deniedMessage = `Cancelled execution of ${step.toolName}.`;
      contextManager.addMessage(conversationId, "assistant", deniedMessage);
      logToolExecution(
        step.toolName,
        step.riskLevel,
        sanitizeArguments(step.toolCall.arguments ?? {}),
        { allowed: false, reason: decision.reason ?? "User denied" },
        { attempted: false, success: false, duration: 0 },
      );
      chain.advance();
    } else {
      // User approved this step: execute it now.
      this.setState(JarvisRuntimeState.EXECUTING);
      const result = await this.executeTool(step.toolName, step.toolCall.arguments, Date.now(), true);
      step.result = result;
      step.status = result.success ? "executed" : "failed";
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

    if (chain.hasRemaining()) {
      // Continue with the remaining steps.
      const synthetic: AssistantProcessResult = {
        response: "",
        toolsUsed: [],
        toolCalls: [],
      };
      return this.runActionChain(
        chain,
        { conversationId, userInput },
        undefined,
        synthetic,
        Date.now(),
      );
    }

    return this.finalizeActionChain(
      chain,
      { conversationId, userInput },
      undefined,
      { response: "", toolsUsed: [], toolCalls: [] },
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
      const synthesized = await this.synthesizeToolResponse(conversationId, systemPrompt, aiResult);
      if (synthesized) {
        finalAi = synthesized;
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

    // A safe step may have triggered a nested gated wait (e.g. an automation's
    // run_automation_now action that requires confirmation). Surface that
    // pending confirmation instead of dropping it — approval still goes
    // through the standard confirmation path, so there is no bypass.
    const nestedPending = this.latestPendingConfirmation();
    if (nestedPending) {
      this.setState(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
      return {
        conversationId,
        userInput,
        state: JarvisRuntimeState.WAITING_FOR_CONFIRMATION,
        message,
        pendingConfirmation: nestedPending,
        toolsExecuted: executed,
        actionChain: chain.toStatus(),
        timestamp: Date.now(),
      };
    }

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
   * If this conversation has a pending tool confirmation and the user replied
   * with a short approve/deny phrase, return a decision to resolve it.
   * Returns null for anything ambiguous so normal conversation proceeds.
   */
  private resolvePendingConfirmationIntent(
    conversationId: string,
    input: string,
  ): ConfirmationDecision | null {
    if (this.pendingConfirmation.size === 0) return null;

    let matchingToolId: string | null = null;
    for (const [toolId, meta] of this.pendingMeta.entries()) {
      if (meta.conversationId === conversationId) {
        matchingToolId = toolId;
      }
    }
    if (!matchingToolId) return null;

    const intent = classifyConfirmationIntent(input);
    if (intent === "approve") {
      return { toolId: matchingToolId, approved: true };
    }
    if (intent === "deny") {
      return { toolId: matchingToolId, approved: false, reason: `User said: ${input.trim()}` };
    }
    return null;
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
   * Request confirmation for a tool (used directly without a pending AI flow)
   */
  async requestToolConfirmation(toolName: string): Promise<PendingToolCall | null> {
    const tool = this.getRegistry().getTool(toolName);
    if (!tool) {
      return null;
    }

    const pending: PendingToolCall = {
      id: `tool-${Date.now()}`,
      name: toolName,
      description: tool.description,
      humanReadableAction: describeToolAction(toolName, tool.description, {}),
      arguments: {},
      riskLevel: tool.riskLevel,
      requiresUserConfirmation: tool.requiresUserConfirmation || false,
    };

    this.pendingConfirmation.set(pending.id, pending);
    this.pendingMeta.set(pending.id, { conversationId: `jarvis-${Date.now()}`, userInput: toolName });
    this.setState(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    return pending;
  }

  /**
   * Execute an automation's action through the standard execution path.
   *
   * This is the ONLY entry point the scheduler uses (wired via
   * lib/automation/wiring.ts), so scheduled/conditional execution shares the
   * same ToolRegistry validation, PermissionManager, and confirmation gating
   * as normal conversation. There is deliberately no scheduler bypass:
   *  - safe tools run immediately;
   *  - confirmation-gated tools pause into WAITING_FOR_CONFIRMATION and only
   *    execute after the user approves the exact pending request.
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

    const gated = tool.requiresUserConfirmation || tool.riskLevel !== "safe";
    if (this.enableConfirmation && gated) {
      // Pause into the standard confirmation flow.
      const safeArgs = sanitizeArguments(args);
      const pending: PendingToolCall = {
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: toolId,
        description: tool.description,
        humanReadableAction: describeToolAction(toolId, tool.description, safeArgs),
        arguments: safeArgs,
        riskLevel: tool.riskLevel,
        requiresUserConfirmation: true,
      };
      this.pendingConfirmation.set(pending.id, pending);
      this.pendingMeta.set(pending.id, {
        conversationId: `auto-${meta.automationId}`,
        userInput: `Automation: ${meta.name}`,
        automationId: meta.automationId,
      });
      this.setState(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
      return {
        status: "waiting_for_confirmation",
        pendingConfirmationId: pending.id,
        message: `${pending.humanReadableAction} (scheduled automation "${meta.name}")`,
      };
    }

    // Safe tool: execute immediately through the same validated path.
    this.setState(JarvisRuntimeState.EXECUTING);
    const result = await this.executeTool(toolId, args, Date.now(), false);
    this.setState(JarvisRuntimeState.RESPONDING);
    this.setState(JarvisRuntimeState.IDLE);

    if (result.success) {
      const message = this.automationResultMessage(result.result) ?? `Automation "${meta.name}" executed successfully`;
      return { status: "executed", message, result: result.result };
    }
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

    console.warn("[AI] assistant unavailable: ensureAIReady failed");
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
   * Get pending confirmations
   */
  getPendingConfirmations(): PendingToolCall[] {
    return Array.from(this.pendingConfirmation.values());
  }

  /**
   * Most recently registered pending confirmation, if any. Nested gated waits
   * (scheduled automations triggered by a safe tool) register a pending here
   * during a step's execution; finalize surfaces it to the caller.
   */
  private latestPendingConfirmation(): PendingToolCall | null {
    let latest: PendingToolCall | null = null;
    for (const pending of this.pendingConfirmation.values()) {
      latest = pending;
    }
    return latest;
  }

  /**
   * Clear pending confirmations and any paused action chains
   */
  clearPendingConfirmations(): void {
    this.pendingConfirmation.clear();
    this.pendingMeta.clear();
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
