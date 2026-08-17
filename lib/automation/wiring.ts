/**
 * JARVIS Automation — Pipeline Wiring
 *
 * Connects the AutomationManager's executor to the runtime pipeline so every
 * scheduled/conditional execution goes through the SAME ToolRegistry,
 * PermissionManager, and confirmation system as normal conversation. There is
 * deliberately no scheduler-specific execution bypass.
 */

import { getAutomationManager } from "./manager";
import { getJarvisPipeline } from "@/lib/runtime/pipeline";

let wired = false;

export function wireAutomationsToPipeline(): void {
  if (wired) return;
  const pipeline = getJarvisPipeline();
  getAutomationManager().setExecutor((action, meta) =>
    pipeline.executeAutomationTool(action, meta),
  );
  wired = true;
}

export function resetAutomationWiring(): void {
  wired = false;
}
