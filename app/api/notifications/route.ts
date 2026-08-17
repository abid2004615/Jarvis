/**
 * JARVIS Notifications API
 *
 * Unified notification inbox (automations, reminders, system). Notifications
 * are ephemeral + bounded and never stored alongside persistent data.
 *
 *  - GET  ?since=   list notifications (optionally created after `since`)
 *  - POST           mark all notifications as read
 *  - DELETE {confirm:true}  clear the entire inbox
 */

import { NextRequest, NextResponse } from "next/server";
import { getNotificationBus } from "@/lib/automation/notifier";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sinceParam = request.nextUrl.searchParams.get("since");
    const since = sinceParam ? Number(sinceParam) : 0;
    const bus = getNotificationBus();
    const notifications = Number.isFinite(since) ? bus.getSince(since) : bus.getAll();
    return NextResponse.json({ count: notifications.length, unreadCount: bus.unreadCount(), notifications });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const { count } = getNotificationBus().markAllRead();
    return NextResponse.json({ success: true, markedRead: count });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as { confirm?: boolean } | null;
    if (body?.confirm !== true) {
      return NextResponse.json(
        { error: "Confirmation required", code: "CONFIRMATION_REQUIRED" },
        { status: 400 },
      );
    }
    const before = getNotificationBus().count();
    getNotificationBus().clear();
    return NextResponse.json({ success: true, cleared: before });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: { Allow: "GET, POST, DELETE, OPTIONS" },
  });
}
