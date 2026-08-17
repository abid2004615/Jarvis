/**
 * JARVIS Notifications API — Route Tests
 *
 * GET/POST /api/notifications and GET/POST/DELETE /api/notifications/[id].
 * Inbox is ephemeral + bounded; clearing the inbox requires an explicit
 * confirm flag; read state is server-authoritative.
 */

import { NextRequest } from "next/server";
import { GET as ListGET, POST as MarkAllRead, DELETE as ClearDELETE } from "@/app/api/notifications/route";
import {
  GET as ItemGET,
  POST as ItemRead,
  DELETE as ItemDismiss,
} from "@/app/api/notifications/[id]/route";
import { getNotificationBus, resetNotificationBus } from "@/lib/automation/notifier";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function pushNotification(body: string, overrides: Record<string, unknown> = {}): string {
  return getNotificationBus()
    .push({ title: "Test", body, ...(overrides as { title?: string }) })
    .id;
}

describe("Notifications API", () => {
  beforeEach(() => {
    resetNotificationBus();
  });

  afterEach(() => {
    resetNotificationBus();
  });

  test("GET lists notifications and unread count", async () => {
    const idA = pushNotification("first");
    const idB = pushNotification("second");
    const res = await ListGET(new NextRequest("http://localhost/api/notifications"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.unreadCount).toBe(2);
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual([idA, idB]);
  });

  test("GET ?since= returns only newer notifications", async () => {
    const idOld = pushNotification("old");
    await new Promise((r) => setTimeout(r, 2));
    const since = getNotificationBus().get(idOld)!.createdAt;
    const idNew = getNotificationBus()
      .push({ title: "new", body: "fresh" })
      .id;
    const res = await ListGET(new NextRequest(`http://localhost/api/notifications?since=${since}`));
    const body = await res.json();
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual([idNew]);
  });

  test("POST marks all notifications as read", async () => {
    pushNotification("a");
    pushNotification("b");
    const res = await MarkAllRead();
    const body = await res.json();
    expect(body.markedRead).toBe(2);
    expect(getNotificationBus().unreadCount()).toBe(0);
  });

  test("DELETE requires an explicit confirm flag", async () => {
    const denied = await ClearDELETE(new NextRequest("http://localhost/api/notifications", { method: "DELETE", body: "{}" }));
    expect(denied.status).toBe(400);
    expect(getNotificationBus().count()).toBe(0);

    pushNotification("a");
    const ok = await ClearDELETE(
      new NextRequest("http://localhost/api/notifications", { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).cleared).toBe(1);
    expect(getNotificationBus().count()).toBe(0);
  });

  test("GET /api/notifications/[id] returns one notification or 404", async () => {
    const id = pushNotification("solo");
    const found = await ItemGET(new NextRequest("http://localhost/api/notifications/solo"), params(id));
    expect(found.status).toBe(200);
    expect((await found.json()).notification.body).toBe("solo");

    const missing = await ItemGET(new NextRequest("http://localhost/api/notifications/solo"), params("nope"));
    expect(missing.status).toBe(404);
  });

  test("POST /api/notifications/[id] marks one read", async () => {
    const id = pushNotification("read me");
    const res = await ItemRead(new NextRequest("http://localhost/api/notifications/solo"), params(id));
    expect(res.status).toBe(200);
    expect(getNotificationBus().get(id)?.read).toBe(true);
    expect(getNotificationBus().unreadCount()).toBe(0);
  });

  test("DELETE /api/notifications/[id] dismisses one", async () => {
    const id = pushNotification("bye");
    const res = await ItemDismiss(new NextRequest("http://localhost/api/notifications/solo"), params(id));
    expect(res.status).toBe(200);
    expect(getNotificationBus().count()).toBe(0);
  });

  test("notification categories default sensibly (automation vs system)", () => {
    const automation = getNotificationBus().push({ title: "A", body: "auto", automationId: "a1" });
    const system = getNotificationBus().push({ title: "S", body: "sys" });
    expect(automation.category).toBe("automation");
    expect(system.category).toBe("system");
  });

  test("dedupeKey suppresses duplicate pushes within the bus lifetime", () => {
    const first = getNotificationBus().push({ title: "R", body: "remind", dedupeKey: "reminder-r1-123" });
    const second = getNotificationBus().push({ title: "R", body: "remind", dedupeKey: "reminder-r1-123" });
    expect(second.id).toBe(first.id);
    expect(getNotificationBus().count()).toBe(1);
  });
});
