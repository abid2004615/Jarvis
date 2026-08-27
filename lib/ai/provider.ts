/**
 * AI Provider - Base interface for AI backends
 * Supports OpenAI, Anthropic, and other compatible models
 */

import type { AIProvider, AIProviderConfig, AIProviderResponse, AssistantContext, ToolCall } from "./types";

/**
 * Base class for AI providers
 * Concrete implementations must override the complete() method
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract name: string;
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig = {}) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  abstract complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse>;
}

/**
 * OpenAI-compatible provider (OpenAI, Azure, Local LM Studio, etc.)
 */
export class OpenAIProvider extends BaseAIProvider {
  name = "openai";

  constructor(config: AIProviderConfig = {}) {
    super({
      model: "gpt-4-turbo",
      maxRetries: 3,
      timeout: 30000,
      ...config,
    });
  }

  async complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key is not configured");
    }

    return completeChat({
      baseUrl: this.config.baseUrl || "https://api.openai.com/v1",
      apiKey: this.config.apiKey as string,
      model: this.config.model,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      errorLabel: "OpenAI API error",
      maxTokensField: "max_tokens",
      context,
      userMessage,
    });
  }
}

/**
 * Anthropic Claude provider
 */
export class AnthropicProvider extends BaseAIProvider {
  name = "anthropic";

  constructor(config: AIProviderConfig = {}) {
    super({
      model: "claude-3-opus-20240229",
      maxRetries: 3,
      timeout: 30000,
      ...config,
    });
  }

  async complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error("Anthropic API key is not configured");
    }

    const baseUrl = this.config.baseUrl || "https://api.anthropic.com";
    const url = `${baseUrl}/v1/messages`;

    const messages = [
      ...context.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    const body = JSON.stringify({
      model: this.config.model,
      messages,
      max_tokens: context.maxTokens || 1024,
      system: context.systemPrompt,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < (this.config.maxRetries || 3); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey || "",
            "anthropic-version": "2023-06-01",
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: { message: string } };
          throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = (await response.json()) as {
          content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
          usage: { input_tokens: number; output_tokens: number };
          model: string;
        };

        const textBlock = data.content.find((block) => block.type === "text");
        const toolCalls: ToolCall[] = data.content
          .filter((block) => block.type === "tool_use" && block.name)
          .map((block) => ({
            id: block.id || `toolcall-${Date.now()}`,
            name: block.name || "",
            arguments: typeof block.input === "object" && block.input !== null
              ? (block.input as Record<string, unknown>)
              : {},
          }));

        return {
          text: textBlock?.text || "",
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          model: data.model,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < (this.config.maxRetries || 3) - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Anthropic API request failed");
  }
}

/**
 * xAI Grok provider
 * Uses the official xAI Chat Completions API (OpenAI-compatible),
 * including function calling. Docs: https://docs.x.ai
 */
export class XAIProvider extends BaseAIProvider {
  name = "xai";

  constructor(config: AIProviderConfig = {}) {
    super({
      model: "grok-4.6",
      maxRetries: 3,
      timeout: 30000,
      ...config,
    });
  }

  async complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error("xAI API key is not configured");
    }

    return completeChat({
      baseUrl: this.config.baseUrl || "https://api.x.ai/v1",
      apiKey: this.config.apiKey as string,
      model: this.config.model,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      errorLabel: "xAI API error",
      maxTokensField: "max_completion_tokens",
      context,
      userMessage,
    });
  }
}

/**
 * Groq provider
 * Uses the official Groq Chat Completions API (OpenAI-compatible),
 * including function calling. Docs: https://console.groq.com/docs
 */
export class GroqProvider extends BaseAIProvider {
  name = "groq";

  constructor(config: AIProviderConfig = {}) {
    super({
      model: "llama-3.3-70b-versatile",
      maxRetries: 3,
      timeout: 30000,
      ...config,
    });
  }

  async complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error("Groq API key is not configured");
    }

    return completeChat({
      baseUrl: this.config.baseUrl || "https://api.groq.com/openai/v1",
      apiKey: this.config.apiKey as string,
      model: this.config.model,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      errorLabel: "Groq API error",
      maxTokensField: "max_completion_tokens",
      reasoningEffort: true,
      context,
      userMessage,
    });
  }
}

/**
 * Controlled error for malformed tool call arguments.
 * Indicates a deterministic failure that must not be retried.
 */
class ToolCallArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolCallArgumentsError";
  }
}

/**
 * Parse tool call arguments from a JSON string (safely)
 * Invalid JSON raises a controlled error; it never crashes the request.
 */
function parseToolArguments(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new ToolCallArgumentsError("Invalid JSON in tool call arguments");
  }
}

/**
 * Redact anything that could leak a credential from a provider-supplied message.
 */
function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(gsk_|sk-|xai-|sk-ant-)\S*/gi, "$1[REDACTED]");
}

/**
 * Build a safe, human-readable error for non-2xx provider responses.
 * Never exposes the API key, Authorization header, or raw credentials.
 */
function safeProviderErrorMessage(errorLabel: string, status: number, rawMessage: string): string {
  switch (status) {
    case 401:
    case 403:
      return `${errorLabel}: AI provider authentication failed.`;
    case 429:
      return `${errorLabel}: Rate limit exceeded. Please try again later.`;
    case 400:
      return `${errorLabel}: Bad request${rawMessage ? `: ${sanitizeProviderMessage(rawMessage)}` : ""}`;
    default:
      if (status >= 500) {
        return `${errorLabel}: AI provider server error.`;
      }
      return `${errorLabel}: ${sanitizeProviderMessage(rawMessage)}`;
  }
}

/**
 * Shared OpenAI-compatible Chat Completions request (OpenAI, xAI Grok, Groq, ...).
 * Builds the system message, conversation messages, and OpenAI-format tools,
 * then parses text + tool_calls from the response.
 * Never logs the API key or Authorization header.
 */
async function completeChat(
  options: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    maxRetries?: number;
    timeout?: number;
    errorLabel: string;
    maxTokensField?: "max_tokens" | "max_completion_tokens";
    reasoningEffort?: boolean;
    context: AssistantContext;
    userMessage: string;
  },
): Promise<AIProviderResponse> {
  const url = `${options.baseUrl}/chat/completions`;
  const hasTools = Boolean(options.context.tools && options.context.tools.length > 0);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[AI] provider request: model=${options.model} tools=${options.context.tools?.length ?? 0} maxTokens=${options.context.maxTokens ?? 1024} reasoning_effort=${options.reasoningEffort ? "low" : "off"}`);
  }

  const messages: Array<Record<string, unknown>> = [];
  if (options.context.systemPrompt) {
    messages.push({ role: "system", content: options.context.systemPrompt });
  }
  for (const msg of options.context.messages) {
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
      });
      for (const tr of msg.toolResults ?? []) {
        messages.push({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output),
        });
      }
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  // The pipeline appends the current user message to history before calling us;
  // avoid sending it twice.
  const lastMessage = messages[messages.length - 1];
  if (!(lastMessage && lastMessage.role === "user" && lastMessage.content === options.userMessage)) {
    messages.push({ role: "user", content: options.userMessage });
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    [options.maxTokensField || "max_tokens"]: options.context.maxTokens || 4096,
  };

  // Reasoning models: use reasoning_effort to control token budget and
  // omit temperature (not supported by all reasoning providers).
  if (options.reasoningEffort) {
    body.reasoning_effort = "low";
  } else {
    body.temperature = 0.7;
  }

  const tools = options.context.tools;
  if (tools && tools.length > 0) {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
    body.tool_choice = "auto";
  }

  let lastError: Error | null = null;
  const maxRetries = options.maxRetries ?? 3;
  const timeout = options.timeout ?? 30000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      if (process.env.NODE_ENV !== "production") {
        console.log(`[AI] request started (attempt ${attempt + 1}/${maxRetries})`);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: { message: string } } | null;
        const errorClassification = response.status === 401 || response.status === 403
          ? "auth_failed"
          : response.status === 429
            ? "rate_limited"
            : response.status === 400
              ? "bad_request"
              : response.status >= 500
                ? "server_error"
                : `http_${response.status}`;
        if (process.env.NODE_ENV !== "production") {
          console.error(`[AI] response error: status=${response.status} classification=${errorClassification}`);
        }
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        const err = new Error(
          safeProviderErrorMessage(
            options.errorLabel,
            response.status,
            errorData?.error?.message || response.statusText,
          ),
        );
        (err as Error & { retryAfter?: number }).retryAfter = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined;
        throw err;
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments?: string };
            }>;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number };
        model: string;
      };

      const toolCalls: ToolCall[] = (data.choices[0]?.message?.tool_calls ?? [])
        .filter((tc) => tc.function?.name)
        .map((tc) => ({
          id: tc.id || `toolcall-${Date.now()}`,
          name: tc.function.name,
          arguments: parseToolArguments(tc.function.arguments),
        }));

      const contentLength = data.choices[0]?.message.content?.length ?? 0;
      const finishReason = data.choices[0]?.finish_reason ?? "unknown";
      if (process.env.NODE_ENV !== "production") {
        console.log(`[AI] response received: finish_reason=${finishReason} content=${contentLength > 0 ? "present" : "empty"} tool_calls=${toolCalls.length} tokens=${data.usage?.completion_tokens ?? "?"}/${data.usage?.prompt_tokens ?? "?"}`);
      }

      // Reasoning models may return empty content when reasoning budget is
      // exhausted. If content is empty and no tool calls, this is likely a
      // budget issue rather than a provider failure — return empty so the
      // pipeline can derive a response instead of falling back.
      if (!toolCalls.length && contentLength === 0 && finishReason === "length") {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[AI] empty response due to reasoning budget exhaustion`);
        }
      }

      return {
        text: data.choices[0]?.message.content || "",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: data.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = error instanceof ToolCallArgumentsError
        ? "tool_args_parse_error"
        : error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : "request_error";
      if (process.env.NODE_ENV !== "production") {
        console.error(`[AI] error: type=${errorType} attempt=${attempt + 1}`);
      }
      if (error instanceof ToolCallArgumentsError) {
        break;
      }
      // For rate limits with long retry-after, don't hammer the provider
      const retryAfter = (error as Error & { retryAfter?: number }).retryAfter;
      if (retryAfter && retryAfter > 30) {
        break;
      }
      if (attempt < maxRetries - 1) {
        const delay = retryAfter && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : 1000 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(`[AI] request failed after ${maxRetries} attempts`);
  }
  throw lastError || new Error(`${options.errorLabel}: request failed`);
}

/**
 * Factory function to create an AI provider instance
 */
export function createAIProvider(providerName: string, config?: AIProviderConfig): AIProvider {
  switch (providerName) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "xai":
      return new XAIProvider(config);
    case "groq":
      return new GroqProvider(config);
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}
