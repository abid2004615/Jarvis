/**
 * JARVIS Automation — Tool Registration
 *
 * Registers the automation management tools with the shared ToolRegistry.
 * Kept in a separate module so lib/tools/registry.ts never imports automation
 * code (avoids module cycles): this module imports the registry, never the
 * other way around. Call once at runtime (pipeline/API bootstrap).
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getAutomationTools } from "./tools";

let registered = false;

export function registerAutomationTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getAutomationTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

/** Test helper: allow re-registration after resetToolRegistry(). */
export function resetAutomationToolRegistration(): void {
  registered = false;
}
