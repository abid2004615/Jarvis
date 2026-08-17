/**
 * JARVIS Daily Briefing — Registration
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getBriefingTools } from "./tools";

let registered = false;

export function registerBriefingTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getBriefingTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

export function resetBriefingToolRegistration(): void {
  registered = false;
}
