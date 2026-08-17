/**
 * JARVIS Personal Reminders — Registration
 *
 * Registers the reminder tools into the shared ToolRegistry (idempotent,
 * guarded). Imported by the runtime wiring so reminders are available to the
 * model exactly like automation/task tools.
 */

import { getToolRegistry } from "@/lib/tools/registry";
import { getReminderTools } from "./tools";

let registered = false;

export function registerReminderTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const tool of getReminderTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.register(tool);
    }
  }
  registered = true;
}

/** Test helper: allow re-registration after a registry reset. */
export function resetReminderToolRegistration(): void {
  registered = false;
}
