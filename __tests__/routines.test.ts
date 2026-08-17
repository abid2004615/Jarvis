/**
 * JARVIS Personal Routines — Tests
 *
 * Routine validation (steps must reference REGISTERED tools, forbidden keys
 * and secrets rejected), manager CRUD + runner delegation (the manager NEVER
 * executes tools itself), and the routine tool surface. Execution safety is
 * exercised through the pipeline in pipeline-personal.test.ts.
 */

import { RoutineManager } from "@/lib/routines/manager";
import { setRoutineManager } from "@/lib/routines/manager";
import { InMemoryRoutineStore } from "@/lib/routines/store";
import { validateRoutineInput, validateRoutineStep, containsSecret } from "@/lib/routines/validator";
import { isRoutineLike, toRoutineSummary } from "@/lib/routines/model";
import { ROUTINE_LIMITS, type Routine } from "@/lib/routines/types";
import {
  CREATE_ROUTINE_TOOL,
  LIST_ROUTINES_TOOL,
  GET_ROUTINE_TOOL,
  UPDATE_ROUTINE_TOOL,
  ENABLE_ROUTINE_TOOL,
  DISABLE_ROUTINE_TOOL,
  RUN_ROUTINE_TOOL,
  DELETE_ROUTINE_TOOL,
} from "@/lib/routines/tools";
import { getToolRegistry, resetToolRegistry } from "@/lib/tools/registry";

const NOW = 1_700_000_000_000;

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    name: "Morning",
    enabled: true,
    steps: [{ toolId: "echo", arguments: { message: "hi" } }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("routines validator", () => {
  beforeEach(() => {
    resetToolRegistry();
  });

  test("accepts a routine whose steps reference registered tools with valid args", () => {
    const result = validateRoutineInput({ name: "Morning", steps: [{ toolId: "echo", arguments: { message: "hi" } }] });
    expect(result.valid).toBe(true);
  });

  test("rejects steps referencing unregistered tools", () => {
    const result = validateRoutineInput({ name: "x", steps: [{ toolId: "run_evil_script", arguments: {} }] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not registered");
  });

  test("rejects step arguments that do not match the tool schema", () => {
    const result = validateRoutineInput({ name: "x", steps: [{ toolId: "echo", arguments: { noMessage: 1 } }] });
    expect(result.valid).toBe(false);
  });

  test("rejects forbidden argument keys (no commands/paths/urls ever)", () => {
    for (const key of ["command", "shell", "script", "path", "url", "bash", "appleScript", "python"]) {
      const result = validateRoutineStep({ toolId: "echo", arguments: { message: "x", [key]: "rm -rf /" } });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed in routines");
    }
  });

  test("rejects secrets anywhere in the routine", () => {
    expect(validateRoutineInput({ name: "x", steps: [{ toolId: "echo", arguments: { message: "reset password" } }] }).valid).toBe(false);
    expect(validateRoutineInput({ name: "x", steps: [{ toolId: "echo", arguments: { message: "key gsk_abcdefghijklmnopqrstuvwxyz123456" } }] }).valid).toBe(false);
    expect(validateRoutineInput({ name: "my secret", steps: [{ toolId: "echo", arguments: { message: "x" } }] }).valid).toBe(false);
  });

  test("rejects unknown root fields and unknown step fields", () => {
    expect(validateRoutineInput({ name: "x", steps: [], enabled: false }).valid).toBe(false);
    expect(validateRoutineStep({ toolId: "echo", arguments: {}, payload: 1 }).valid).toBe(false);
  });

  test("enforces step count bounds and step limits", () => {
    expect(validateRoutineInput({ name: "x", steps: [] }).valid).toBe(false);
    const tooMany = Array.from({ length: ROUTINE_LIMITS.MAX_STEPS + 1 }, () => ({ toolId: "echo", arguments: { message: "x" } }));
    expect(validateRoutineInput({ name: "x", steps: tooMany }).valid).toBe(false);
  });

  test("containsSecret detects routine-style secrets", () => {
    expect(containsSecret("username: admin, token: abc").found).toBe(true);
    expect(containsSecret("just a label").found).toBe(false);
  });
});

describe("routines model", () => {
  test("isRoutineLike validates stored records", () => {
    expect(isRoutineLike(makeRoutine())).toBe(true);
    expect(isRoutineLike({ ...makeRoutine(), enabled: "yes" })).toBe(false);
    expect(isRoutineLike({ ...makeRoutine(), steps: "not-array" })).toBe(false);
  });

  test("toRoutineSummary projects steps to toolId + label only", () => {
    const summary = toRoutineSummary(makeRoutine());
    expect(summary.steps).toEqual([{ toolId: "echo" }]);
    expect(summary.steps[0]).not.toHaveProperty("arguments");
    expect(summary.lastRunStatus).toBeUndefined();
  });
});

describe("routines manager", () => {
  let store: InMemoryRoutineStore;
  let manager: RoutineManager;

  beforeEach(() => {
    resetToolRegistry();
    store = new InMemoryRoutineStore();
    manager = new RoutineManager({ store, now: () => NOW });
    setRoutineManager(manager);
  });

  afterEach(() => {
    setRoutineManager(null);
    resetToolRegistry();
  });

  test("create stores a validated routine", () => {
    const created = manager.create({ name: "  Standup  ", steps: [{ toolId: "echo", arguments: { message: "hi" } }] });
    expect(created.error).toBeUndefined();
    expect(created.routine?.name).toBe("Standup");
    expect(created.routine?.enabled).toBe(true);
    expect(created.routine?.id).toMatch(/^routine-/);
  });

  test("create rejects invalid routines and unregistered tools", () => {
    expect(manager.create({ name: "x", steps: [{ toolId: "ghost", arguments: {} }] }).error).toBeDefined();
    expect(manager.count()).toBe(0);
  });

  test("update/enable/disable/delete round-trip", () => {
    const { routine } = manager.create({ name: "a", steps: [{ toolId: "echo", arguments: { message: "1" } }] });
    const id = routine!.id;
    expect(manager.update(id, { name: "b" }).routine?.name).toBe("b");
    expect(manager.disable(id).routine?.enabled).toBe(false);
    expect(manager.enable(id).routine?.enabled).toBe(true);
    expect(manager.delete(id).success).toBe(true);
    expect(manager.count()).toBe(0);
  });

  test("runRoutine requires a connected runner and refuses disabled/unknown/in-flight", async () => {
    const { routine } = manager.create({ name: "a", steps: [{ toolId: "echo", arguments: { message: "1" } }] });
    expect((await manager.runRoutine(routine!.id)).message).toContain("not connected");
    manager.disable(routine!.id);
    expect((await manager.runRoutine(routine!.id)).success).toBe(false);
    manager.enable(routine!.id);
    expect((await manager.runRoutine("missing")).success).toBe(false);

    const runner = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { response: "done" };
    });
    manager.setRunner(runner as never);
    const first = manager.runRoutine(routine!.id);
    expect((await manager.runRoutine(routine!.id)).message).toContain("already running");
    await first;
  });

  test("runRoutine delegates to the runner and records lastRunStatus", async () => {
    const { routine } = manager.create({ name: "a", steps: [{ toolId: "echo", arguments: { message: "1" } }] });
    const runner = jest.fn(async () => ({ response: "all good" }));
    manager.setRunner(runner as never);

    const result = await manager.runRoutine(routine!.id);
    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(runner).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ toolId: "echo" })]),
      { routineId: routine!.id, name: "a" },
    );
    expect(manager.get(routine!.id)?.lastRunAt).toBe(NOW);
    expect(manager.get(routine!.id)?.lastRunStatus).toBe("success");
  });

  test("runRoutine maps WAITING_FOR_CONFIRMATION and ERROR states", async () => {
    const { routine } = manager.create({ name: "a", steps: [{ toolId: "echo", arguments: { message: "1" } }] });
    manager.setRunner((async () => ({ state: "waiting_for_confirmation" })) as never);
    expect((await manager.runRoutine(routine!.id)).status).toBe("waiting_for_confirmation");

    manager.setRunner((async () => ({ state: "error", response: "boom" })) as never);
    expect((await manager.runRoutine(routine!.id)).status).toBe("failed");
  });

  test("the manager has no execution method of its own (cannot run tools directly)", () => {
    expect("executeTool" in manager).toBe(false);
    expect("execute" in manager).toBe(false);
  });
});

describe("routines tools", () => {
  beforeEach(() => {
    resetToolRegistry();
    setRoutineManager(new RoutineManager({ store: new InMemoryRoutineStore(), now: () => NOW }));
  });

  afterEach(() => {
    setRoutineManager(null);
    resetToolRegistry();
  });

  test("create_routine validates through the live registry", async () => {
    const ok = await CREATE_ROUTINE_TOOL.execute({
      name: "Morning",
      steps: [{ toolId: "echo", arguments: { message: "hi" } }],
    });
    expect(ok.success).toBe(true);
    expect(ok.routine?.name).toBe("Morning");

    const bad = await CREATE_ROUTINE_TOOL.execute({ name: "Bad", steps: [{ toolId: "ghost", arguments: {} }] });
    expect(bad.success).toBe(false);
  });

  test("list/get/update/enable/disable round-trip", async () => {
    const created = await CREATE_ROUTINE_TOOL.execute({ name: "a", steps: [{ toolId: "echo", arguments: { message: "1" } }] });
    const id = created.routineId as string;
    expect((await LIST_ROUTINES_TOOL.execute({})).count).toBe(1);
    expect((await GET_ROUTINE_TOOL.execute({ id })).success).toBe(true);
    expect((await UPDATE_ROUTINE_TOOL.execute({ id, name: "b" })).success).toBe(true);
    expect((await DISABLE_ROUTINE_TOOL.execute({ id })).success).toBe(true);
    expect((await ENABLE_ROUTINE_TOOL.execute({ id })).success).toBe(true);
  });

  test("run_routine reports missing/unconnected without executing", async () => {
    const result = await RUN_ROUTINE_TOOL.execute({ id: "missing" });
    expect(result.success).toBe(false);
  });

  test("delete_routine is confirmation-gated", async () => {
    expect(DELETE_ROUTINE_TOOL.requiresUserConfirmation).toBe(true);
    expect(DELETE_ROUTINE_TOOL.riskLevel).toBe("confirmation");
  });

  test("routine tools are read-safe or gated (never raw commands)", () => {
    for (const tool of [LIST_ROUTINES_TOOL, GET_ROUTINE_TOOL, CREATE_ROUTINE_TOOL, UPDATE_ROUTINE_TOOL, ENABLE_ROUTINE_TOOL, DISABLE_ROUTINE_TOOL, RUN_ROUTINE_TOOL]) {
      expect(tool.riskLevel).toBe("safe");
    }
    expect(getToolRegistry().getTool("create_routine")).toBeUndefined();
  });
});
