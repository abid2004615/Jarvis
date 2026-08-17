/**
 * JARVIS Personal Routines — Pipeline Wiring
 *
 * Connects the RoutineManager's runner to the runtime pipeline so every
 * routine execution goes through the SAME ActionChain/ToolRegistry/
 * confirmation system as normal conversation. There is deliberately no
 * routine-specific execution bypass.
 */

import { getRoutineManager } from "./manager";
import { getJarvisPipeline } from "@/lib/runtime/pipeline";

let wired = false;

export function wireRoutinesToPipeline(): void {
  if (wired) return;
  const pipeline = getJarvisPipeline();
  getRoutineManager().setRunner((steps, meta) => pipeline.runRoutineSteps(steps, meta));
  wired = true;
}

export function resetRoutineWiring(): void {
  wired = false;
}
