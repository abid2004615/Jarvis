/**
 * JARVIS Dashboard API
 *
 * Aggregated, read-only snapshot for the dashboard HUD: live telemetry, health
 * classification, briefing, personal context, and entity counts. Never mutates
 * state and never fabricates data — unavailable telemetry is reported honestly.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSystemTelemetry, getFrontmostApplication, getRunningApplications } from "@/lib/macos";
import { evaluateHealth, formatHealthReport } from "@/lib/health";
import { buildBriefing, formatBriefing } from "@/lib/briefing";
import { buildPersonalContext, formatPersonalContext } from "@/lib/context/personal-context";
import { getTaskManager } from "@/lib/tasks/manager";
import { getReminderManager } from "@/lib/reminders/manager";
import { getRoutineManager } from "@/lib/routines/manager";
import { getAutomationManager } from "@/lib/automation/manager";
import { getNotificationBus } from "@/lib/automation/notifier";
import { getMemoryManager } from "@/lib/memory/manager";
import { startPersonalServices } from "@/lib/personal/wiring";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    startPersonalServices();
    const frontmost = getFrontmostApplication();
    const running = getRunningApplications();

    const briefing = buildBriefing();
    const context = buildPersonalContext();

    return NextResponse.json({
      generatedAt: Date.now(),
      system: getSystemTelemetry(),
      frontmostApp: frontmost.available && frontmost.name ? frontmost.name : undefined,
      runningApplications: running.available ? running.applications : [],
      health: evaluateHealth(),
      healthText: formatHealthReport(briefing.health),
      briefing,
      briefingText: formatBriefing(briefing),
      personalContext: context,
      personalContextText: formatPersonalContext(context),
      counts: {
        tasks: getTaskManager().count(),
        reminders: getReminderManager().count(),
        routines: getRoutineManager().count(),
        automations: getAutomationManager().count(),
        memory: getMemoryManager().count(),
        notifications: getNotificationBus().count(),
        unreadNotifications: getNotificationBus().unreadCount(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: { Allow: "GET, OPTIONS" },
  });
}
