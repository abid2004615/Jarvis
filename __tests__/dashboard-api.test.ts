/**
 * JARVIS Dashboard API — Route Tests
 *
 * GET /api/dashboard aggregates a read-only snapshot: telemetry, health,
 * briefing text, personal context, and entity counts. It never mutates state.
 * All sources are replaced with in-memory managers and mocked telemetry.
 */

jest.mock("@/lib/macos", () => ({
  getCPUUsage: jest.fn(() => ({ available: true, percentUsed: 30 })),
  getMemoryUsage: jest.fn(() => ({ available: true, percentUsed: 40 })),
  getDiskUsage: jest.fn(() => ({ available: true, percentUsed: 50 })),
  getBatteryStatus: jest.fn(() => ({ available: true, percentCharged: 80, charging: true })),
  getNetworkStatus: jest.fn(() => ({ available: true, received: 0, sent: 0 })),
  getSystemUptime: jest.fn(() => ({ available: true, uptimeMs: 1000 })),
  getSystemTelemetry: jest.fn(() => ({
    timestamp: 1,
    cpu: { available: true, percentUsed: 30 },
    memory: { available: true, percentUsed: 40 },
    disk: { available: true, percentUsed: 50 },
    battery: { available: true, percentCharged: 80, charging: true },
    network: { available: true, received: 0, sent: 0 },
    uptime: { available: true, uptimeMs: 1000 },
  })),
  getRunningApplications: jest.fn(() => ({ available: true, applications: ["Finder"] })),
  getFrontmostApplication: jest.fn(() => ({ available: true, name: "Finder" })),
}));

import { NextRequest } from "next/server";
import { GET as DashboardGET } from "@/app/api/dashboard/route";
import { TaskManager } from "@/lib/tasks/manager";
import { setTaskManager, getTaskManager } from "@/lib/tasks/manager";
import { InMemoryTaskStore } from "@/lib/tasks/store";
import { ReminderManager } from "@/lib/reminders/manager";
import { setReminderManager, getReminderManager } from "@/lib/reminders/manager";
import { InMemoryReminderStore } from "@/lib/reminders/store";
import { RoutineManager } from "@/lib/routines/manager";
import { setRoutineManager, getRoutineManager } from "@/lib/routines/manager";
import { InMemoryRoutineStore } from "@/lib/routines/store";
import { AutomationManager } from "@/lib/automation/manager";
import { setAutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { MemoryManager } from "@/lib/memory/manager";
import { setMemoryManager } from "@/lib/memory/manager";
import { InMemoryMemoryStore } from "@/lib/memory/store";
import { resetNotificationBus, getNotificationBus } from "@/lib/automation/notifier";
import { getFrontmostApplication } from "@/lib/macos";

describe("Dashboard API", () => {
  beforeEach(() => {
    resetNotificationBus();
    setTaskManager(new TaskManager({ store: new InMemoryTaskStore() }));
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore() }));
    setRoutineManager(new RoutineManager({ store: new InMemoryRoutineStore() }));
    const automationManager = new AutomationManager({ store: new InMemoryAutomationStore() });
    automationManager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    setAutomationManager(automationManager);
    setMemoryManager(new MemoryManager(new InMemoryMemoryStore()));
  });

  afterEach(() => {
    setTaskManager(null);
    setReminderManager(null);
    setRoutineManager(null);
    setAutomationManager(null);
    setMemoryManager(null);
    resetNotificationBus();
  });

  test("returns aggregated counts, health, briefing, and context", async () => {
    getTaskManager().create({ title: "Plan trip", priority: "high", dueAt: Math.min(Date.now() + 3_600_000, new Date().setHours(23, 59, 59, 999)) });
    getReminderManager().create({ title: "Standup", dueAt: Date.now() + 60_000 });
    getRoutineManager().create({ name: "Morning", steps: [{ toolId: "echo", arguments: { message: "hi" } }] });
    getNotificationBus().push({ title: "N", body: "hello" });

    const res = await DashboardGET(new NextRequest("http://localhost/api/dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.counts.tasks).toBe(1);
    expect(body.counts.reminders).toBe(1);
    expect(body.counts.routines).toBe(1);
    expect(body.counts.automations).toBe(0);
    expect(body.counts.memory).toBe(0);
    expect(body.counts.notifications).toBe(1);
    expect(body.counts.unreadNotifications).toBe(1);

    expect(body.health).toBeDefined();
    expect(body.healthText).toContain("Overall:");
    expect(body.briefing).toBeDefined();
    expect(body.briefingText).toContain("Plan trip");
    expect(body.personalContext).toBeDefined();
    expect(body.personalContextText).toContain("Plan trip");
    expect(body.frontmostApp).toBe("Finder");
    expect(body.system).toBeDefined();
  });

  test("never fabricates empty sources", async () => {
    (getFrontmostApplication as jest.Mock).mockReturnValue({ available: false, error: "n/a" });
    const res = await DashboardGET(new NextRequest("http://localhost/api/dashboard"));
    const body = await res.json();
    expect(body.counts.tasks).toBe(0);
    expect(body.counts.reminders).toBe(0);
    expect(body.counts.routines).toBe(0);
    expect(body.personalContextText).toBeNull();
  });
});
