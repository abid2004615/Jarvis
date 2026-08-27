/**
 * Tests for AI Router
 * Validates fallback and pattern matching behavior
 */

import { routeAssistantCommand, callAIAssistant } from "@/lib/aiRouter";
import type { AssistantResult } from "@/lib/aiRouter";
import { JarvisRuntimeState } from "@/lib/runtime/types";

describe("AI Router - Pattern Matching", () => {
  test("should return IDLE response for empty input", () => {
    const result = routeAssistantCommand("");
    expect(result.mode).toBe("IDLE");
    expect(result.response).toContain("Awaiting");
  });

  test("should return SYSTEM response for CPU query", () => {
    const result = routeAssistantCommand("what is my CPU?");
    expect(result.mode).toBe("SYSTEM");
    expect(result.response).toContain("CPU");
    expect(result.tool).toBe("getSystemStats");
  });

  test("should return SYSTEM response for memory query", () => {
    const result = routeAssistantCommand("check my memory");
    expect(result.mode).toBe("SYSTEM");
  });

  test("should return LISTENING response for microphone control", () => {
    const result = routeAssistantCommand("toggle microphone");
    expect(result.mode).toBe("LISTENING");
    expect(result.tool).toBe("toggleMic");
  });

  test("should return SYSTEM response for camera control", () => {
    const result = routeAssistantCommand("enable camera");
    expect(result.mode).toBe("SYSTEM");
    expect(result.tool).toBe("toggleCamera");
  });

  test("should return PROCESSING response for URL opening", () => {
    const result = routeAssistantCommand("open google site");
    expect(result.mode).toBe("PROCESSING");
    expect(result.tool).toBe("openUrl");
  });

  test("should return PROCESSING response for app launching", () => {
    const result = routeAssistantCommand("launch an app");
    expect(result.mode).toBe("PROCESSING");
    expect(result.tool).toBe("launchApp");
  });

  test("should return SUCCESS response for greeting", () => {
    const result = routeAssistantCommand("hello jarvis");
    expect(result.mode).toBe("SUCCESS");
    expect(result.response).toContain("online");
  });

  test("should return SYSTEM response for status request", () => {
    const result = routeAssistantCommand("status report");
    expect(result.mode).toBe("SYSTEM");
    expect(result.response).toContain("online");
  });

  test("should return ERROR response for error keywords", () => {
    const result = routeAssistantCommand("there is an error");
    expect(result.mode).toBe("ERROR");
  });

  test("should return SUCCESS response for thanks", () => {
    const result = routeAssistantCommand("thank you");
    expect(result.mode).toBe("SUCCESS");
  });

  test("should return THINKING response for unknown command", () => {
    const result = routeAssistantCommand("xyz abc 123 random");
    expect(result.mode).toBe("THINKING");
    expect(result.response).toContain("offline");
  });

  test("should not imply tool execution for unknown command", () => {
    const result = routeAssistantCommand("xyz abc 123 random");
    expect(result.response).not.toContain("tool execution");
    expect(result.response).not.toContain("routed");
  });

  test("should report AI offline for allowlisted app launch without AI", () => {
    const result = routeAssistantCommand("open safari");
    expect(result.mode).toBe("PROCESSING");
    expect(result.tool).toBe("launchApp");
    expect(result.response).toContain("AI is offline");
    expect(result.response).not.toContain("execution");
  });

  test("should be case-insensitive", () => {
    const result1 = routeAssistantCommand("HELLO");
    const result2 = routeAssistantCommand("hello");
    const result3 = routeAssistantCommand("HeLLo");

    expect(result1.mode).toBe(result2.mode);
    expect(result2.mode).toBe(result3.mode);
  });

  test("should handle whitespace correctly", () => {
    const result = routeAssistantCommand("   hello   ");
    expect(result.mode).toBe("SUCCESS");
  });

  test("should return valid AssistantResult structure", () => {
    const result = routeAssistantCommand("hello");

    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("response");
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);

    const validModes = [
      "IDLE",
      "LISTENING",
      "THINKING",
      "SPEAKING",
      "PROCESSING",
      "SYSTEM",
      "ALERT",
      "ERROR",
      "SUCCESS",
    ];
    expect(validModes).toContain(result.mode);
  });

  test("should respond to multiple keywords in single command", () => {
    const result = routeAssistantCommand("open github site");
    expect(result.mode).toBe("PROCESSING");
    expect(result.tool).toBe("openUrl");
  });
});

describe("AI Router - API Flow", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchResponse(body: unknown, ok = true) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok,
      json: async () => body,
    } as unknown as Response);
  }

  test("should return a structured result on success", async () => {
    mockFetchResponse({
      conversationId: "conv-abc",
      message: "All systems nominal.",
      state: "responding",
    });

    const result = await callAIAssistant("status", "conv-abc");

    expect(result.mode).toBe("SPEAKING");
    expect(result.response).toBe("All systems nominal.");
    expect(result.conversationId).toBe("conv-abc");
    expect(result.state).toBe(JarvisRuntimeState.RESPONDING);
  });

  test("should propagate conversationId through the request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversationId: "conv-xyz",
        message: "Ok.",
        state: "idle",
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await callAIAssistant("hello", "conv-xyz");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant");
    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody).toMatchObject({ message: "hello", conversationId: "conv-xyz" });
  });

  test("should carry tool execution results in the result", async () => {
    mockFetchResponse({
      conversationId: "conv-abc",
      message: "Launched Safari",
      state: "idle",
      toolsExecuted: [{ toolName: "launch_application", success: true }],
    });

    const result = await callAIAssistant("launch Safari", "conv-abc");

    expect(result.mode).toBe("IDLE");
    expect(result.actionChain).toBeUndefined();
    expect(result.conversationId).toBe("conv-abc");
  });

  test("should fall back to pattern matching when the API is unreachable", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await callAIAssistant("what is my cpu");

    expect(result.mode).toBe("SYSTEM");
    expect(result.response).toContain("CPU");
  });

  test("should fall back to pattern matching on non-OK response", async () => {
    mockFetchResponse({ error: "boom" }, false);

    const result = await callAIAssistant("what is my cpu");

    expect(result.mode).toBe("SYSTEM");
    expect(result.tool).toBe("getSystemStats");
  });

  test("should report error state from the server", async () => {
    mockFetchResponse({
      conversationId: "conv-abc",
      message: "Unexpected error",
      state: "error",
      error: "Unexpected error",
    });

    const result = await callAIAssistant("hello", "conv-abc");

    expect(result.mode).toBe("ERROR");
    expect(result.response).toBe("Unexpected error");
  });
});
