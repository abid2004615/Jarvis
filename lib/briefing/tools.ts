/**
 * JARVIS Daily Briefing — ToolRegistry Tool
 *
 * The model calls this to fetch a real, bounded snapshot of the user's tasks,
 * reminders, automations, health, and frontmost app. Read-only, safe.
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { buildBriefing } from "./index";

export const GET_DAILY_BRIEFING_TOOL: ToolDefinition = {
  name: "get_daily_briefing",
  description:
    "Fetch the user's current briefing: open/overdue tasks, upcoming reminders, active automations, " +
    "system health, and the frontmost application. Use it for 'what's on my plate', 'daily briefing', " +
    "or 'how are things looking' requests. Read-only.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    return buildBriefing();
  },
};

/** All briefing tools. */
export function getBriefingTools(): ToolDefinition[] {
  return [GET_DAILY_BRIEFING_TOOL];
}
