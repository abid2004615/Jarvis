/**
 * JARVIS Personal Routines — Registration
 *
 * Registers the routine tools into the shared ToolRegistry (idempotent,
 * guarded). Imported by the runtime wiring so routines are available to the
 * model exactly like automation/task/reminder tools.
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getRoutineTools } from "./tools";

let registered = false;

export function registerRoutineTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getRoutineTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

/** Test helper: allow re-registration after a registry reset. */
export function resetRoutineToolRegistration(): void {
  registered = false;
}
