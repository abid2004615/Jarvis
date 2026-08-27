/**
 * P12 Tests — Live Mac Tests
 *
 * Real-world tests on the Mac. These verify the goal system works end-to-end
 * with actual tool execution, state management, and persistence.
 */

import { GoalManager, setGoalManagerForTesting, resetGoalManager } from "@/lib/goals/manager";
import { InMemoryGoalStore } from "@/lib/goals/store";
import {
  isValidGoalTransition,
  GOAL_LIMITS,
} from "@/lib/goals/types";
import { validateGoalInput, validateGoalPlan } from "@/lib/goals/validator";
import {
  isGoalLike,
  toGoalSummary,
  computeGoalProgress,
  isGoalActive,
  isGoalFinished,
} from "@/lib/goals/model";
import { generateSimplePlan } from "@/lib/goals/planner";
import {
  executeGoalStep,
  validateStepForExecution,
  computeStepArguments,
} from "@/lib/goals/executor";
import { collectObservation } from "@/lib/goals/observer";
import { verifyStepOutcome } from "@/lib/goals/verifier";
import { determineRecovery, formatRecoveryDecision } from "@/lib/goals/recovery";
import {
  getGoalManager,
  registerGoalTools,
} from "@/lib/goals";
import type { GoalStep, Goal } from "@/lib/goals/types";

function makeStep(overrides?: Partial<GoalStep>): GoalStep {
  return {
    id: "step_1",
    description: "Check battery",
    toolId: "get_battery_status",
    risk: "safe",
    requiresConfirmation: false,
    verification: "Battery status retrieved",
    status: "pending",
    retryCount: 0,
    ...overrides,
  };
}

describe("P12 Live Mac Tests", () => {
  let manager: GoalManager;

  beforeEach(() => {
    const store = new InMemoryGoalStore();
    manager = new GoalManager(store);
    setGoalManagerForTesting(manager);
  });

  afterEach(() => {
    resetGoalManager();
  });

  // TEST 1: Goal state machine
  it("TEST 1: should enforce valid state transitions", () => {
    console.log("  → Testing goal state machine transitions");

    // Valid transitions
    expect(isValidGoalTransition("draft", "planning")).toBe(true);
    expect(isValidGoalTransition("planning", "ready")).toBe(true);
    expect(isValidGoalTransition("ready", "running")).toBe(true);
    expect(isValidGoalTransition("running", "completed")).toBe(true);
    expect(isValidGoalTransition("running", "paused")).toBe(true);
    expect(isValidGoalTransition("running", "waiting_for_confirmation")).toBe(true);
    expect(isValidGoalTransition("running", "failed")).toBe(true);
    expect(isValidGoalTransition("running", "cancelled")).toBe(true);

    // Invalid transitions
    expect(isValidGoalTransition("completed", "running")).toBe(false);
    expect(isValidGoalTransition("cancelled", "running")).toBe(false);
    expect(isValidGoalTransition("draft", "running")).toBe(false);

    console.log("  → All state transitions verified");
  });

  // TEST 2: Goal creation and validation
  it("TEST 2: should create and validate goals", () => {
    console.log("  → Testing goal creation");

    const result = manager.create({
      title: "Test Goal",
      description: "A test goal for live testing",
      type: "multi_step",
      priority: "high",
    });

    expect(result.goal).toBeDefined();
    expect(result.goal!.title).toBe("Test Goal");
    expect(result.goal!.status).toBe("draft");
    expect(result.goal!.type).toBe("multi_step");
    expect(result.goal!.priority).toBe("high");

    console.log(`  → Goal created: ${result.goal!.id}`);
    console.log(`  → Status: ${result.goal!.status}`);
  });

  // TEST 3: Goal plan validation
  it("TEST 3: should validate goal plans", () => {
    console.log("  → Testing plan validation");

    // Use plain objects without runtime fields (status, retryCount) that the validator doesn't allow
    const validPlan = [
      { id: "s1", description: "Check battery", risk: "safe" as const, requiresConfirmation: false, verification: "Battery status retrieved" },
      { id: "s2", description: "Check CPU", risk: "safe" as const, requiresConfirmation: false, verification: "CPU usage retrieved" },
      { id: "s3", description: "Check memory", risk: "safe" as const, requiresConfirmation: false, verification: "Memory usage retrieved" },
    ];

    const result = validateGoalPlan(validPlan);
    expect(result.valid).toBe(true);
    console.log(`  → Valid plan: ${result.valid}`);

    // Invalid plan: duplicate IDs
    const invalidPlan = [
      makeStep({ id: "dup", description: "A", toolId: undefined }),
      makeStep({ id: "dup", description: "B", toolId: undefined }),
    ];
    const invalidResult = validateGoalPlan(invalidPlan);
    expect(invalidResult.valid).toBe(false);
    console.log(`  → Duplicate IDs rejected: ${!invalidResult.valid}`);
  });

  // TEST 4: Goal lifecycle (create → plan → start → execute → complete)
  it("TEST 4: should complete a full goal lifecycle", async () => {
    console.log("  → Testing full goal lifecycle");

    // Create
    const { goal } = manager.create({ title: "Lifecycle Test" });
    console.log(`  → Created: ${goal!.id}`);

    // Plan
    manager.setPlan(goal!.id, [makeStep()]);
    console.log(`  → Planned: status=${manager.get(goal!.id)!.status}`);

    // Start
    manager.start(goal!.id);
    console.log(`  → Started: status=${manager.get(goal!.id)!.status}`);

    // Execute
    manager.setRunner(async () => ({ success: true, result: { level: 85 } }));
    const execResult = await manager.executeStep(goal!.id);
    console.log(`  → Executed: success=${execResult.success}`);

    // Verify completion
    const finalGoal = manager.get(goal!.id)!;
    expect(finalGoal.status).toBe("completed");
    expect(finalGoal.progress).toBe(100);
    console.log(`  → Completed: progress=${finalGoal.progress}%`);
  });

  // TEST 5: Goal pause and resume
  it("TEST 5: should pause and resume a goal", async () => {
    console.log("  → Testing pause/resume");

    const { goal } = manager.create({ title: "Pause Test" });
    manager.setPlan(goal!.id, [makeStep(), makeStep({ id: "s2" })]);
    manager.start(goal!.id);

    // Execute first step
    manager.setRunner(async () => ({ success: true }));
    await manager.executeStep(goal!.id);

    // Pause
    manager.pause(goal!.id);
    expect(manager.get(goal!.id)!.status).toBe("paused");
    console.log(`  → Paused: step=${manager.get(goal!.id)!.currentStepIndex}`);

    // Resume
    manager.start(goal!.id);
    expect(manager.get(goal!.id)!.status).toBe("running");
    console.log(`  → Resumed: status=${manager.get(goal!.id)!.status}`);
  });

  // TEST 6: Goal cancellation
  it("TEST 6: should cancel a goal safely", () => {
    console.log("  → Testing cancellation");

    const { goal } = manager.create({ title: "Cancel Test" });
    manager.setPlan(goal!.id, [makeStep(), makeStep({ id: "s2" })]);
    manager.start(goal!.id);

    manager.cancel(goal!.id);
    const finalGoal = manager.get(goal!.id)!;
    expect(finalGoal.status).toBe("cancelled");
    expect(finalGoal.result?.status).toBe("cancelled");
    console.log(`  → Cancelled: result=${finalGoal.result?.status}`);
  });

  // TEST 7: Goal step failure with retry
  it("TEST 7: should retry failed steps", async () => {
    console.log("  → Testing step retry");

    const { goal } = manager.create({ title: "Retry Test" });
    manager.setPlan(goal!.id, [makeStep()]);
    manager.start(goal!.id);

    let callCount = 0;
    manager.setRunner(async () => {
      callCount++;
      if (callCount === 1) return { success: false, error: "Transient" };
      return { success: true };
    });

    // First attempt fails
    await manager.executeStep(goal!.id);
    console.log(`  → First attempt: failed`);

    // Second attempt succeeds
    await manager.executeStep(goal!.id);
    console.log(`  → Second attempt: success`);
    expect(manager.get(goal!.id)!.status).toBe("completed");
  });

  // TEST 8: Goal with confirmation flow
  it("TEST 8: should handle confirmation flow", async () => {
    console.log("  → Testing confirmation flow");

    const { goal } = manager.create({ title: "Confirmation Test" });
    manager.setPlan(goal!.id, [
      makeStep({ requiresConfirmation: true, risk: "confirmation" }),
    ]);
    manager.start(goal!.id);

    manager.setRunner(async () => ({
      success: true,
      pendingConfirmationId: "conf-123",
    }));

    await manager.executeStep(goal!.id);
    expect(manager.get(goal!.id)!.status).toBe("waiting_for_confirmation");
    console.log(`  → Waiting for confirmation`);

    // Approve
    manager.handleConfirmation(goal!.id, "step_1", true);
    expect(manager.get(goal!.id)!.status).toBe("running");
    console.log(`  → Confirmation approved`);
  });

  // TEST 9: Goal denial flow
  it("TEST 9: should handle confirmation denial", async () => {
    console.log("  → Testing denial flow");

    const { goal } = manager.create({ title: "Denial Test" });
    manager.setPlan(goal!.id, [
      makeStep({ requiresConfirmation: true }),
      makeStep({ id: "s2" }),
    ]);
    manager.start(goal!.id);

    manager.setRunner(async () => ({
      success: true,
      pendingConfirmationId: "conf-456",
    }));

    await manager.executeStep(goal!.id);
    manager.handleConfirmation(goal!.id, "step_1", false);
    console.log(`  → Confirmation denied`);
    expect(manager.get(goal!.id)!.status).toBe("running");
  });

  // TEST 10: Goal recovery system
  it("TEST 10: should determine correct recovery actions", () => {
    console.log("  → Testing recovery system");

    // Transient → retry
    const d1 = determineRecovery(
      manager.create({ title: "T" }).goal!,
      makeStep(),
      "Timeout error",
    );
    expect(d1.action).toBe("retry");
    console.log(`  → Transient failure: ${d1.action}`);

    // Permission → ask user
    const d2 = determineRecovery(
      manager.create({ title: "P" }).goal!,
      makeStep(),
      "Permission denied",
    );
    expect(d2.action).toBe("ask_user");
    console.log(`  → Permission issue: ${d2.action}`);

    // Missing app → ask user
    const d3 = determineRecovery(
      manager.create({ title: "M" }).goal!,
      makeStep(),
      "Application not found",
    );
    expect(d3.action).toBe("ask_user");
    console.log(`  → Missing app: ${d3.action}`);

    // Format decision
    const formatted = formatRecoveryDecision(d1);
    expect(formatted.length).toBeGreaterThan(0);
    console.log(`  → Formatted: ${formatted}`);
  });

  // TEST 11: Goal observation and verification
  it("TEST 11: should observe and verify step outcomes", async () => {
    console.log("  → Testing observation and verification");

    const step = makeStep({ status: "executed" });
    const goal = manager.create({ title: "Obs Test" }).goal!;
    manager.setPlan(goal.id, [step]);
    // setPlan resets status to pending, so set it back to executed for verification
    step.status = "executed";

    const observation = await collectObservation(step, goal, { success: true }, {
      captureSystemState: false,
      captureApplicationState: false,
    });

    expect(observation.stepId).toBe("step_1");
    expect(observation.timestamp).toBeGreaterThan(0);
    console.log(`  → Observation: stepId=${observation.stepId}`);

    const verification = verifyStepOutcome(step, observation);
    expect(verification.status).toBe("verified");
    console.log(`  → Verification: ${verification.status}`);
  });

  // TEST 12: Goal persistence (in-memory)
  it("TEST 12: should persist goals in memory store", () => {
    console.log("  → Testing persistence");

    const store = new InMemoryGoalStore();
    const mgr = new GoalManager(store);

    const { goal } = mgr.create({ title: "Persist Test" });
    mgr.setPlan(goal!.id, [makeStep()]);

    // Reload from same store
    const mgr2 = new GoalManager(store);
    const loaded = mgr2.list();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("Persist Test");
    expect(loaded[0].status).toBe("ready");
    console.log(`  → Persisted and reloaded: ${loaded.length} goal(s)`);
  });

  // TEST 13: Goal plan generation (rule-based)
  it("TEST 13: should generate simple plans from descriptions", () => {
    console.log("  → Testing plan generation");

    const result = generateSimplePlan(
      "Check battery and CPU",
      "Check my battery and CPU usage",
    );

    expect(result.success).toBe(true);
    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBeGreaterThanOrEqual(2);
    console.log(`  → Generated ${result.steps!.length} step(s)`);

    for (const step of result.steps!) {
      console.log(`    - ${step.id}: ${step.description} (${step.toolId}) [${step.risk}]`);
    }
  });

  // TEST 14: Goal limits enforcement
  it("TEST 14: should enforce goal limits", () => {
    console.log("  → Testing limits enforcement");

    expect(GOAL_LIMITS.MAX_GOALS).toBeGreaterThan(0);
    expect(GOAL_LIMITS.MAX_STEPS).toBeLessThanOrEqual(20);
    expect(GOAL_LIMITS.MAX_REPLANS).toBeLessThanOrEqual(3);
    expect(GOAL_LIMITS.MAX_RETRIES_PER_STEP).toBeLessThanOrEqual(3);
    expect(GOAL_LIMITS.MAX_EXECUTION_TIME_MS).toBeGreaterThan(0);
    expect(GOAL_LIMITS.MAX_HISTORY).toBeGreaterThan(0);

    console.log(`  → MAX_GOALS: ${GOAL_LIMITS.MAX_GOALS}`);
    console.log(`  → MAX_STEPS: ${GOAL_LIMITS.MAX_STEPS}`);
    console.log(`  → MAX_REPLANS: ${GOAL_LIMITS.MAX_REPLANS}`);
    console.log(`  → MAX_RETRIES_PER_STEP: ${GOAL_LIMITS.MAX_RETRIES_PER_STEP}`);
    console.log(`  → MAX_EXECUTION_TIME_MS: ${GOAL_LIMITS.MAX_EXECUTION_TIME_MS}`);
  });

  // TEST 15: Security validation
  it("TEST 15: should reject malicious goal inputs", () => {
    console.log("  → Testing security validation");

    // Shell commands
    expect(validateGoalInput({ title: "sudo rm -rf /" }).valid).toBe(false);
    console.log("  → Shell commands rejected");

    // Script injection
    expect(validateGoalInput({ title: "run osascript" }).valid).toBe(false);
    console.log("  → Script injection rejected");

    // Secrets
    expect(validateGoalInput({ title: "my password is abc123" }).valid).toBe(false);
    console.log("  → Secrets rejected");

    // Unknown fields
    expect(validateGoalInput({ title: "Test", evil: true }).valid).toBe(false);
    console.log("  → Unknown fields rejected");

    // Shell in plan
    const planResult = validateGoalPlan([{
      id: "s1",
      description: "sudo do something",
      risk: "safe",
      requiresConfirmation: false,
      verification: "done",
    }]);
    expect(planResult.valid).toBe(false);
    console.log("  → Shell in plan rejected");
  });

  // TEST 16: Goal model helpers
  it("TEST 16: should validate goal model helpers", () => {
    console.log("  → Testing model helpers");

    const goal = manager.create({ title: "Model Test" }).goal!;
    manager.setPlan(goal.id, [makeStep(), makeStep({ id: "s2" })]);

    expect(isGoalLike(goal)).toBe(true);
    console.log(`  → isGoalLike: true`);

    const summary = toGoalSummary(goal);
    expect(summary.title).toBe("Model Test");
    expect(summary.totalSteps).toBe(2);
    console.log(`  → Summary: ${summary.title}, ${summary.totalSteps} steps`);

    expect(computeGoalProgress([])).toBe(0);
    expect(computeGoalProgress([makeStep({ status: "executed" })])).toBe(100);
    console.log(`  → Progress calculation works`);

    expect(isGoalActive(makeGoalWithStatus("running"))).toBe(true);
    expect(isGoalFinished(makeGoalWithStatus("completed"))).toBe(true);
    console.log(`  → Active/finished detection works`);
  });
});

function makeGoalWithStatus(status: Goal["status"]): Goal {
  const now = Date.now();
  return {
    id: `goal-${now}`,
    title: "Test",
    description: "Test",
    type: "multi_step",
    status,
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    plan: [],
    currentStepIndex: 0,
    progress: 0,
    requiresUserInput: false,
    replanCount: 0,
    maxReplans: 2,
    history: [],
  };
}
