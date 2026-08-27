/**
 * P15 — Lifecycle Manager
 *
 * Clean startup/shutdown lifecycle for JARVIS.
 * Ensures proper initialization order and resource cleanup.
 */

export type LifecyclePhase =
  | "idle"
  | "starting"
  | "configuring"
  | "storage"
  | "scheduler"
  | "automation"
  | "goals"
  | "observability"
  | "ready"
  | "shutting_down"
  | "stopped";

export type LifecycleListener = (phase: LifecyclePhase) => void;

let currentPhase: LifecyclePhase = "idle";
let startupTime: number = 0;
const listeners: Set<LifecycleListener> = new Set();
const cleanupFns: Array<() => void> = [];

/**
 * Get the current lifecycle phase.
 */
export function getLifecyclePhase(): LifecyclePhase {
  return currentPhase;
}

/**
 * Check if the system is in ready state.
 */
export function isReady(): boolean {
  return currentPhase === "ready";
}

/**
 * Get uptime in milliseconds.
 */
export function getUptime(): number {
  if (startupTime === 0) return 0;
  return Date.now() - startupTime;
}

/**
 * Subscribe to lifecycle phase changes.
 * Returns unsubscribe function.
 */
export function onLifecycleChange(listener: LifecycleListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Register a cleanup function to run on shutdown.
 */
export function registerCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

/**
 * Transition to a new phase (internal use).
 */
function setPhase(phase: LifecyclePhase): void {
  currentPhase = phase;
  for (const listener of listeners) {
    try {
      listener(phase);
    } catch {
      // Listener errors must not propagate
    }
  }
}

/**
 * Run the startup lifecycle.
 *
 * Order:
 * configuring → storage → scheduler → automation → goals → observability → ready
 */
export async function startup(): Promise<void> {
  if (currentPhase === "ready" || currentPhase === "starting") {
    return;
  }

  setPhase("starting");
  startupTime = Date.now();

  try {
    // Phase 1: Configuration
    setPhase("configuring");
    // Configuration is validated via validateEnvironment() but doesn't block startup

    // Phase 2: Storage (no-op for now — stores self-initialize on first use)
    setPhase("storage");

    // Phase 3: Scheduler (not started here — started by automation wiring)
    setPhase("scheduler");

    // Phase 4: Automation (not started here — started by API route)
    setPhase("automation");

    // Phase 5: Goals (loaded on demand by GoalManager)
    setPhase("goals");

    // Phase 6: Observability (already initialized by import)
    setPhase("observability");

    // Ready
    setPhase("ready");
  } catch {
    setPhase("idle");
  }
}

/**
 * Run the shutdown lifecycle.
 * Calls all registered cleanup functions in reverse order.
 */
export async function shutdown(): Promise<void> {
  if (currentPhase === "shutting_down" || currentPhase === "stopped") {
    return;
  }

  setPhase("shutting_down");

  // Run cleanup functions in reverse registration order
  for (let i = cleanupFns.length - 1; i >= 0; i--) {
    try {
      cleanupFns[i]();
    } catch {
      // Best effort cleanup
    }
  }

  cleanupFns.length = 0;
  setPhase("stopped");
}

/**
 * Reset lifecycle state (for testing).
 */
export function resetLifecycle(): void {
  currentPhase = "idle";
  startupTime = 0;
  cleanupFns.length = 0;
}
