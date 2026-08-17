/**
 * JARVIS Notifications API — single notification
 *
 *  - GET     get one notification
 *  - POST    mark one notification as read
 *  - DELETE  dismiss (remove) one notification
 */

import { NextRequest, NextResponse } from "next/server";
import { getNotificationBus } from "@/lib/automation/notifier";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const notification = getNotificationBus().get(id);
    if (!notification) {
      return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ notification });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const result = getNotificationBus().markRead(id);
    if (!result.success) {
      return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const result = getNotificationBus().dismiss(id);
    if (!result.success) {
      return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
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
