/**
 * JARVIS Personal Tasks — Registration
 *
 * Registers the task tools into the shared ToolRegistry (idempotent, guarded).
 * This module is imported by the runtime wiring so tasks are available to the
 * model exactly like automation tools.
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getTaskTools } from "./tools";

let registered = false;

export function registerTaskTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getTaskTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

/** Test helper: allow re-registration after a registry reset. */
export function resetTaskToolRegistration(): void {
  registered = false;
}
