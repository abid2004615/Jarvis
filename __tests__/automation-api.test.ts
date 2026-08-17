/**
 * JARVIS Automation — API Route Tests
 * GET/POST /api/automations, GET/PATCH/DELETE/POST /api/automations/[id],
 * and GET /api/automations/notifications. The client can never supply
 * authorization flags, and delete requires an explicit confirm flag.
 */

import { NextRequest } from "next/server";
import { GET as ListGET, POST as CreatePOST } from "@/app/api/automations/route";
import {
  GET as ItemGET,
  PATCH as ItemPATCH,
  DELETE as ItemDELETE,
  POST as ItemPOST,
} from "@/app/api/automations/[id]/route";
import { GET as NotificationsGET } from "@/app/api/automations/notifications/route";
import { AutomationManager } from "@/lib/automation/manager";
import { setAutomationManager, resetAutomationManager, getAutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { resetAutomationScheduler } from "@/lib/automation/scheduler";
import { resetAutomationWiring } from "@/lib/automation/wiring";
import { resetNotificationBus, getNotificationBus } from "@/lib/automation/notifier";
import { resetJarvisPipeline } from "@/lib/runtime/pipeline";
import { resetConversationContextManager } from "@/lib/runtime/context";

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body) });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Automation API", () => {
  beforeEach(() => {
    resetAutomationManager();
    resetAutomationScheduler();
    resetAutomationWiring();
    resetJarvisPipeline();
    resetConversationContextManager();
    resetNotificationBus();
    const manager = new AutomationManager({
      store: new InMemoryAutomationStore(),
      now: () => 1_700_000_000_000,
    });
    manager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    setAutomationManager(manager);
  });

  afterEach(() => {
    resetAutomationManager();
    resetAutomationScheduler();
  });

  test("GET /api/automations returns an empty list initially", async () => {
    const res = await ListGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
    expect(body.automations).toEqual([]);
  });

  test("POST /api/automations creates a valid automation", async () => {
    const res = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.automation.name).toBe("Morning CPU");
    expect(body.automation.requiresConfirmation).toBe(false);
  });

  test("POST /api/automations rejects invalid input", async () => {
    const res = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Bad",
        trigger: { type: "cron", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("POST /api/automations rejects command-style actions", async () => {
    const res = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Bad",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "shell", arguments: { command: "rm -rf /" } },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("client cannot set enabled or requiresConfirmation on create", async () => {
    const res = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Sneaky",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        enabled: true,
        requiresConfirmation: false,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("GET /api/automations/[id] returns one automation", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();
    const res = await ItemGET(new NextRequest("http://localhost/api/automations/x"), params(automation.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.automation.id).toBe(automation.id);
  });

  test("GET /api/automations/[id] returns 404 for unknown id", async () => {
    const res = await ItemGET(new NextRequest("http://localhost/api/automations/x"), params("nope"));
    expect(res.status).toBe(404);
  });

  test("PATCH /api/automations/[id] updates the name", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();
    const res = await ItemPATCH(
      jsonRequest("http://localhost/api/automations/x", { name: "Renamed" }),
      params(automation.id),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.automation.name).toBe("Renamed");
  });

  test("PATCH rejects authorization fields", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();
    const res = await ItemPATCH(
      jsonRequest("http://localhost/api/automations/x", { requiresConfirmation: false }),
      params(automation.id),
    );
    expect(res.status).toBe(400);
  });

  test("DELETE requires confirm:true", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();

    const noConfirm = await ItemDELETE(
      jsonRequest("http://localhost/api/automations/x", {}),
      params(automation.id),
    );
    expect(noConfirm.status).toBe(400);

    const confirmed = await ItemDELETE(
      jsonRequest("http://localhost/api/automations/x", { confirm: true }),
      params(automation.id),
    );
    expect(confirmed.status).toBe(200);
  });

  test("DELETE with confirm deletes the automation", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();
    const res = await ItemDELETE(
      jsonRequest("http://localhost/api/automations/x", { confirm: true }),
      params(automation.id),
    );
    expect(res.status).toBe(200);
    const list = await ListGET();
    expect((await list.json()).count).toBe(0);
  });

  test("POST /api/automations/[id] runs the automation now", async () => {
    const created = await CreatePOST(
      jsonRequest("http://localhost/api/automations", {
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      }),
    );
    const { automation } = await created.json();
    const res = await ItemPOST(new NextRequest("http://localhost/api/automations/x"), params(automation.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("executed");
  });

  test("POST /api/automations/[id] returns 404 for unknown id", async () => {
    const res = await ItemPOST(new NextRequest("http://localhost/api/automations/x"), params("nope"));
    expect(res.status).toBe(404);
  });

  test("GET /api/automations/notifications returns new notifications", async () => {
    const manager = getAutomationManager();
    manager.create({
      name: "Battery",
      trigger: { type: "daily", at: "09:00" },
      action: { toolId: "get_battery_status", arguments: {} },
    });
    await manager.executeAutomation(manager.list()[0].id);

    const res = await NotificationsGET(new NextRequest("http://localhost/api/automations/notifications?since=0"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(body.notifications.length).toBeGreaterThan(0);
  });

  test("GET /api/automations/notifications filters by since", async () => {
    const bus = getNotificationBus();
    bus.push({ title: "old", body: "old" });
    const res = await NotificationsGET(
      new NextRequest("http://localhost/api/automations/notifications?since=9999999999999"),
    );
    const body = await res.json();
    expect(body.notifications).toEqual([]);
  });
});
