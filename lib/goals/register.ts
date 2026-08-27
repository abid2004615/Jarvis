/**
 * JARVIS Goal-Oriented Workflows — Tool Registration
 *
 * Registers the goal management tools with the shared ToolRegistry.
 * Kept in a separate module so lib/tools/registry.ts never imports goal
 * code (avoids module cycles): this module imports the registry, never the
 * other way around. Call once at runtime (pipeline/API bootstrap).
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getGoalTools } from "./tools";

let registered = false;

export function registerGoalTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getGoalTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

/** Test helper: allow re-registration after resetToolRegistry(). */
export function resetGoalToolRegistration(): void {
  registered = false;
}
