/**
 * JARVIS Automation — Notifications API
 *
 * Client polls this endpoint for scheduled/conditional notifications.
 * Notification delivery is separate from action execution, and the inbox is
 * ephemeral + bounded (never stored with automations).
 */

import { NextRequest, NextResponse } from "next/server";
import { getNotificationBus } from "@/lib/automation/notifier";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sinceParam = request.nextUrl.searchParams.get("since");
    const since = sinceParam ? Number(sinceParam) : 0;
    const notifications = Number.isFinite(since) ? getNotificationBus().getSince(since) : getNotificationBus().getAll();
    return NextResponse.json({ count: notifications.length, notifications });
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
