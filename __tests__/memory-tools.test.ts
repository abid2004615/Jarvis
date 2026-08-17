/**
 * JARVIS Persistent Memory — Tools & API Tests
 * Verifies the memory tool definitions (schemas, confirmation gating, action
 * descriptions), the list_available_tools surface, the manager-level safety
 * (no secrets, no arbitrary content), and the read-only / confirmed-only
 * HTTP surface.
 */

import { NextRequest } from "next/server";

import { ToolRegistry, ToolInputValidator } from "@/lib/tools/types";
import {
  REMEMBER_USER_PREFERENCE_TOOL,
  RECALL_USER_MEMORY_TOOL,
  LIST_USER_MEMORIES_TOOL,
  FORGET_USER_MEMORY_TOOL,
  CLEAR_USER_MEMORY_TOOL,
  getBuiltinTools,
  describeToolAction,
  executeToolSafely,
} from "@/lib/tools/registry";
import { getMemoryManager, setMemoryManager, MemoryManager } from "@/lib/memory";
import { InMemoryMemoryStore } from "@/lib/memory";
import { GET, DELETE } from "@/app/api/memory/route";
import { DELETE as deleteMemoryById } from "@/app/api/memory/[id]/route";

describe("Memory tool definitions", () => {
  test("all memory tools forbid additional properties", () => {
    const tools = [
      REMEMBER_USER_PREFERENCE_TOOL,
      RECALL_USER_MEMORY_TOOL,
      LIST_USER_MEMORIES_TOOL,
      FORGET_USER_MEMORY_TOOL,
      CLEAR_USER_MEMORY_TOOL,
    ];
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  test("remember/recall/list are safe; forget/clear require confirmation", () => {
    expect(REMEMBER_USER_PREFERENCE_TOOL.riskLevel).toBe("safe");
    expect(REMEMBER_USER_PREFERENCE_TOOL.requiresUserConfirmation).toBe(false);
    expect(RECALL_USER_MEMORY_TOOL.requiresUserConfirmation).toBe(false);
    expect(LIST_USER_MEMORIES_TOOL.requiresUserConfirmation).toBe(false);
    expect(FORGET_USER_MEMORY_TOOL.riskLevel).toBe("confirmation");
    expect(FORGET_USER_MEMORY_TOOL.requiresUserConfirmation).toBe(true);
    expect(CLEAR_USER_MEMORY_TOOL.riskLevel).toBe("confirmation");
    expect(CLEAR_USER_MEMORY_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("forget/clear execute only with confirmation (gate)", async () => {
    const registry = new ToolRegistry();
    registry.register(FORGET_USER_MEMORY_TOOL);
    registry.register(CLEAR_USER_MEMORY_TOOL);

    const deniedForget = await executeToolSafely("forget_user_memory", { memory_key: "theme" }, { registry });
    expect(deniedForget.success).toBe(false);
    expect(deniedForget.error).toContain("requires user confirmation");

    const deniedClear = await executeToolSafely("clear_user_memory", {}, { registry });
    expect(deniedClear.success).toBe(false);
    expect(deniedClear.error).toContain("requires user confirmation");
  });

  test("human-readable action descriptions", () => {
    expect(describeToolAction("forget_user_memory", "d", { memory_key: "theme" })).toBe(
      'Forget "theme" from memory?',
    );
    expect(describeToolAction("clear_user_memory", "d", {})).toBe("Clear all saved memories?");
    expect(describeToolAction("recall_user_memory", "d", { query: "style" })).toBe(
      'Recall memories about "style"',
    );
  });

  test("list_available_tools advertises the memory tools", async () => {
    setMemoryManager(new MemoryManager(new InMemoryMemoryStore()));
    try {
      const result = (await LIST_USER_MEMORIES_TOOL.execute({})) as { count: number };
      expect(result.count).toBe(0);

      const listTool = getBuiltinTools().find((t) => t.name === "list_available_tools");
      expect(listTool).toBeDefined();
      const listed = (await listTool!.execute({})) as { tools: string[]; count: number };
      expect(listed.tools).toContain("remember_user_preference");
      expect(listed.tools).toContain("recall_user_memory");
      expect(listed.tools).toContain("list_user_memories");
      expect(listed.tools).toContain("forget_user_memory");
      expect(listed.tools).toContain("clear_user_memory");
      expect(listed.count).toBe(29);
    } finally {
      setMemoryManager(null);
    }
  });
});

describe("Memory manager safety", () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager(new InMemoryMemoryStore());
    setMemoryManager(manager);
  });

  afterEach(() => {
    setMemoryManager(null);
  });

  test("remember tool rejects secrets and never stores them", async () => {
    const result = await REMEMBER_USER_PREFERENCE_TOOL.execute({
      key: "api credentials",
      value: "my API key is gsk_test_AbCdEfGh123456",
    });
    expect(result).toMatchObject({ success: false, code: "secret_rejected" });
    expect(manager.count()).toBe(0);
  });

  test("remember tool rejects arbitrary executable content", async () => {
    const result = await REMEMBER_USER_PREFERENCE_TOOL.execute({
      key: "script",
      value: "rm -rf /",
    });
    expect(result).toMatchObject({ success: false, code: "executable_content" });
    expect(manager.count()).toBe(0);
  });

  test("remember tool stores a normal preference (no secrets in the value)", async () => {
    const result = await REMEMBER_USER_PREFERENCE_TOOL.execute({
      category: "communication_style",
      key: "answer style",
      value: "concise bullet points",
    });
    expect(result).toMatchObject({ success: true, key: "answer style" });
    expect(manager.count()).toBe(1);
    expect(JSON.stringify(manager.list())).not.toContain("gsk");
  });

  test("recall and list tools are read-only", async () => {
    await REMEMBER_USER_PREFERENCE_TOOL.execute({ key: "theme", value: "dark mode" });
    const recall = (await RECALL_USER_MEMORY_TOOL.execute({ query: "theme" })) as {
      count: number;
      memories: { key: string; value: string }[];
    };
    expect(recall.count).toBe(1);
    expect(recall.memories[0]).toEqual({ key: "theme", value: "dark mode", category: "preference" });

    const list = (await LIST_USER_MEMORIES_TOOL.execute({})) as { count: number };
    expect(list.count).toBe(1);
    expect(manager.count()).toBe(1);
  });

  test("recall without a query returns no matches", async () => {
    await REMEMBER_USER_PREFERENCE_TOOL.execute({ key: "theme", value: "dark mode" });
    const recall = (await RECALL_USER_MEMORY_TOOL.execute({ query: "" })) as { count: number };
    expect(recall.count).toBe(0);
  });
});

describe("Memory HTTP API", () => {
  beforeEach(() => {
    setMemoryManager(new MemoryManager(new InMemoryMemoryStore()));
  });

  afterEach(() => {
    setMemoryManager(null);
  });

  test("GET /api/memory lists saved memories", async () => {
    getMemoryManager().remember({ key: "theme", value: "dark mode" });
    const res = await GET();
    const body = (await res.json()) as { count: number; memories: { key: string }[] };
    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.memories[0].key).toBe("theme");
  });

  test("DELETE /api/memory without confirm is rejected", async () => {
    getMemoryManager().remember({ key: "theme", value: "dark mode" });
    const req = new NextRequest("http://localhost/api/memory", {
      method: "DELETE",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    expect(getMemoryManager().count()).toBe(1);
  });

  test("DELETE /api/memory with confirm clears everything", async () => {
    getMemoryManager().remember({ key: "theme", value: "dark mode" });
    getMemoryManager().remember({ key: "voice", value: "natural" });
    const req = new NextRequest("http://localhost/api/memory", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
      headers: { "content-type": "application/json" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(getMemoryManager().count()).toBe(0);
  });

  test("DELETE /api/memory/:id removes a single entry", async () => {
    const entry = getMemoryManager().remember({ key: "theme", value: "dark mode" }).data!;
    getMemoryManager().remember({ key: "voice", value: "natural" });
    const res = await deleteMemoryById(new Request("http://localhost/api/memory/theme"), {
      params: Promise.resolve({ id: entry.id }),
    });
    expect(res.status).toBe(200);
    expect(getMemoryManager().count()).toBe(1);
    expect(getMemoryManager().recall("voice")).toHaveLength(1);
  });

  test("DELETE /api/memory/:id with unknown id returns 404", async () => {
    const res = await deleteMemoryById(new Request("http://localhost/api/memory/x"), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  test("the browser can never create memory via the API (no POST)", async () => {
    const route = await import("@/app/api/memory/route");
    const post = (route as unknown as { POST?: unknown }).POST;
    expect(post).toBeUndefined();
  });
});
