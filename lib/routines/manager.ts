/**
 * JARVIS Personal Routines — Manager
 *
 * Single authority for routine CRUD. The manager NEVER executes tools itself —
 * it delegates to an injected runner (the runtime pipeline) so routine steps
 * flow through the SAME ToolRegistry/ActionChain/confirmation path as normal
 * conversation. A routine can never bypass approval.
 *
 * Routine storage is separate from automations, tasks, reminders, and memory.
 */

import { JarvisRuntimeState } from "@/lib/runtime/types";
import {
  ROUTINE_LIMITS,
  type Routine,
  type RoutineInput,
  type RoutineStep,
  type RoutineSummary,
} from "./types";
import { validateRoutineInput } from "./validator";
import { toRoutineSummary } from "./model";
import { RoutineFileStore, type RoutineStore } from "./store";

export interface RoutineManagerOptions {
  store?: RoutineStore;
  now?: () => number;
}

export interface RoutineRunMeta {
  routineId: string;
  name: string;
}

/**
 * Runner contract fulfilled by JarvisPipeline.runRoutineSteps.
 * Returns whatever the pipeline produces (a JarvisResponse).
 */
export type RoutineRunner = (steps: RoutineStep[], meta: RoutineRunMeta) => Promise<unknown>;

export interface RoutineManagerResult {
  routine?: Routine;
  error?: string;
}

export interface RoutineRunResult {
  success: boolean;
  status?: "success" | "failed" | "waiting_for_confirmation";
  message: string;
  result?: unknown;
}

export class RoutineManager {
  private readonly store: RoutineStore;
  private readonly now: () => number;
  private runner: RoutineRunner | null;
  private routines: Routine[] = [];
  private loaded = false;
  private readonly inFlight: Set<string> = new Set();

  constructor(options: RoutineManagerOptions = {}) {
    this.store = options.store ?? new RoutineFileStore();
    this.now = options.now ?? (() => Date.now());
    this.runner = null;
  }

  setRunner(runner: RoutineRunner | null): void {
    this.runner = runner;
  }

  getRunner(): RoutineRunner | null {
    return this.runner;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.routines = this.store.load();
    this.loaded = true;
  }

  private persist(): void {
    this.store.save(this.routines);
  }

  private static deterministicId(now: number): string {
    return `routine-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------- CRUD ---

  create(input: unknown): RoutineManagerResult {
    this.ensureLoaded();
    const validation = validateRoutineInput(input);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid routine" };
    }
    if (this.routines.length >= ROUTINE_LIMITS.MAX_ROUTINES) {
      return { error: `Maximum of ${ROUTINE_LIMITS.MAX_ROUTINES} routines reached` };
    }

    const now = this.now();
    const typed = input as RoutineInput;
    const routine: Routine = {
      id: RoutineManager.deterministicId(now),
      name: typed.name.trim(),
      description: typed.description?.trim() ?? undefined,
      enabled: true,
      steps: typed.steps.map((step) => ({ ...step, arguments: { ...step.arguments } })),
      createdAt: now,
      updatedAt: now,
    };

    this.routines.push(routine);
    this.persist();
    return { routine: { ...routine } };
  }

  list(): RoutineSummary[] {
    this.ensureLoaded();
    return this.routines.map(toRoutineSummary);
  }

  getAll(): Routine[] {
    this.ensureLoaded();
    return this.routines.map((r) => ({ ...r }));
  }

  get(id: string): Routine | undefined {
    this.ensureLoaded();
    const found = this.routines.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  /** Update mutable fields (name/description/steps). Enabled is separate. */
  update(id: string, patch: unknown): RoutineManagerResult {
    this.ensureLoaded();
    const index = this.routines.findIndex((r) => r.id === id);
    if (index < 0) return { error: "Routine not found" };

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { error: "Invalid update payload" };
    }
    const allowedKeys = new Set(["name", "description", "steps"]);
    for (const key of Object.keys(patch)) {
      if (!allowedKeys.has(key)) {
        return { error: `Unknown routine field '${key}' (cannot be set)` };
      }
    }

    const current = this.routines[index];
    const candidate: Record<string, unknown> = {
      name: "name" in patch ? patch.name : current.name,
      description: "description" in patch ? patch.description : current.description,
      steps: "steps" in patch ? patch.steps : current.steps,
    };
    const validation = validateRoutineInput(candidate);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid update" };
    }

    const now = this.now();
    const typed = patch as Partial<RoutineInput>;
    if (typed.name !== undefined) current.name = typed.name.trim();
    if (typed.description !== undefined) current.description = typed.description.trim() || undefined;
    if (typed.steps !== undefined) current.steps = typed.steps.map((step) => ({ ...step, arguments: { ...step.arguments } }));
    current.updatedAt = now;

    this.persist();
    return { routine: { ...current } };
  }

  enable(id: string): RoutineManagerResult {
    this.ensureLoaded();
    const routine = this.routines.find((r) => r.id === id);
    if (!routine) return { error: "Routine not found" };
    routine.enabled = true;
    routine.updatedAt = this.now();
    this.persist();
    return { routine: { ...routine } };
  }

  disable(id: string): RoutineManagerResult {
    this.ensureLoaded();
    const routine = this.routines.find((r) => r.id === id);
    if (!routine) return { error: "Routine not found" };
    routine.enabled = false;
    routine.updatedAt = this.now();
    this.persist();
    return { routine: { ...routine } };
  }

  delete(id: string): { success: boolean; error?: string } {
    this.ensureLoaded();
    const index = this.routines.findIndex((r) => r.id === id);
    if (index < 0) return { success: false, error: "Routine not found" };
    this.routines.splice(index, 1);
    this.inFlight.delete(id);
    this.persist();
    return { success: true };
  }

  deleteAll(): { success: boolean; count: number } {
    this.ensureLoaded();
    const count = this.routines.length;
    this.routines = [];
    this.inFlight.clear();
    this.persist();
    return { success: true, count };
  }

  count(): number {
    this.ensureLoaded();
    return this.routines.length;
  }

  // ------------------------------------------------------------ execution ---

  isInFlight(id: string): boolean {
    return this.inFlight.has(id);
  }

  /**
   * Run a routine now. Delegates step execution to the injected runner (the
   * pipeline) so ActionChain gating, confirmation, and ToolRegistry validation
   * all apply. The manager never executes tools directly.
   */
  async runRoutine(id: string): Promise<RoutineRunResult> {
    this.ensureLoaded();
    const routine = this.routines.find((r) => r.id === id);
    if (!routine) return { success: false, message: "Routine not found" };
    if (!routine.enabled) return { success: false, message: `Routine "${routine.name}" is disabled` };
    if (this.inFlight.has(id)) return { success: false, message: `Routine "${routine.name}" is already running` };
    if (!this.runner) {
      return { success: false, message: "Routine runner is not connected" };
    }

    this.inFlight.add(id);
    try {
      const result = (await this.runner(
        routine.steps.map((step) => ({ ...step, arguments: { ...step.arguments } })),
        { routineId: routine.id, name: routine.name },
      )) as { state?: string; response?: string; message?: string; actionChain?: unknown } | null | undefined;

      const status: RoutineRunResult["status"] =
        result && typeof result === "object" && "state" in result && typeof result.state === "string"
          ? this.mapPipelineState(result.state)
          : "success";

      const now = this.now();
      routine.lastRunAt = now;
      routine.lastRunStatus = status;
      routine.updatedAt = now;
      this.persist();

      const message =
        typeof result?.response === "string" && result.response.trim()
          ? result.response.trim()
          : typeof result?.message === "string" && result.message.trim()
            ? result.message.trim()
            : `Routine "${routine.name}" finished (${status}).`;

      return { success: status !== "failed", status, message, result };
    } finally {
      this.inFlight.delete(id);
    }
  }

  private mapPipelineState(state: string): RoutineRunResult["status"] {
    if (state === JarvisRuntimeState.WAITING_FOR_CONFIRMATION) return "waiting_for_confirmation";
    if (state === JarvisRuntimeState.ERROR) return "failed";
    return "success";
  }
}

let instance: RoutineManager | null = null;

export function getRoutineManager(): RoutineManager {
  if (!instance) {
    instance = new RoutineManager();
  }
  return instance;
}

export function resetRoutineManager(): void {
  instance = null;
}

export function setRoutineManager(manager: RoutineManager | null): void {
  instance = manager;
}
