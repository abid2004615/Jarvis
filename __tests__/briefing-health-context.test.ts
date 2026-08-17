/**
 * JARVIS Personal Layer — Briefing, Health, Personal Context Tests
 *
 * Health thresholds are documented and fixed; briefing and personal context
 * are bounded, read-only projections over real managers. Telemetry is mocked
 * so tests are deterministic; "no data" is always reported honestly.
 */

jest.mock("@/lib/macos", () => ({
  getCPUUsage: jest.fn(),
  getMemoryUsage: jest.fn(),
  getDiskUsage: jest.fn(),
  getBatteryStatus: jest.fn(),
  getRunningApplications: jest.fn(() => ({ available: true, applications: [] })),
  getFrontmostApplication: jest.fn(() => ({ available: true, name: "Finder" })),
}));

import { getCPUUsage, getMemoryUsage, getDiskUsage, getBatteryStatus, getFrontmostApplication } from "@/lib/macos";
import { classifyHealth, overallHealth, evaluateHealth, formatHealthReport, HEALTH_THRESHOLDS } from "@/lib/health";
import { buildBriefing, formatBriefing } from "@/lib/briefing";
import { buildPersonalContext, formatPersonalContext } from "@/lib/context/personal-context";
import { TaskManager } from "@/lib/tasks/manager";
import { setTaskManager, getTaskManager } from "@/lib/tasks/manager";
import { InMemoryTaskStore } from "@/lib/tasks/store";
import { ReminderManager } from "@/lib/reminders/manager";
import { setReminderManager, getReminderManager } from "@/lib/reminders/manager";
import { InMemoryReminderStore } from "@/lib/reminders/store";
import { AutomationManager } from "@/lib/automation/manager";
import { setAutomationManager, getAutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import type { Automation } from "@/lib/automation/types";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const cpuMock = getCPUUsage as jest.Mock;
const memMock = getMemoryUsage as jest.Mock;
const diskMock = getDiskUsage as jest.Mock;
const battMock = getBatteryStatus as jest.Mock;
const frontMock = getFrontmostApplication as jest.Mock;

function makeAutomationInput(overrides: Partial<Automation> = {}): Partial<Automation> {
  return {
    name: "Morning report",
    description: "",
    trigger: { type: "daily", at: "09:00" },
    action: { toolId: "get_cpu_usage", arguments: {} },
    ...overrides,
  };
}

describe("health classification", () => {
  beforeEach(() => {
    cpuMock.mockReturnValue({ available: true, percentUsed: 30 });
    memMock.mockReturnValue({ available: true, percentUsed: 40 });
    diskMock.mockReturnValue({ available: true, percentUsed: 50 });
    battMock.mockReturnValue({ available: true, percentCharged: 80, charging: true });
    frontMock.mockReturnValue({ available: true, name: "Finder" });
  });

  test("thresholds are exactly as documented", () => {
    expect(HEALTH_THRESHOLDS).toEqual({
      cpu: { attention: 80, critical: 95 },
      memory: { attention: 80, critical: 95 },
      disk: { attention: 85, critical: 95 },
      battery: { attention: 20, critical: 10 },
    });
  });

  test("classifies cpu/memory/disk with attention and critical bands", () => {
    expect(classifyHealth("cpu", 79).level).toBe("ok");
    expect(classifyHealth("cpu", 80).level).toBe("attention");
    expect(classifyHealth("cpu", 95).level).toBe("critical");
    expect(classifyHealth("memory", 85).level).toBe("attention");
    expect(classifyHealth("disk", 85).level).toBe("attention");
    expect(classifyHealth("disk", 96).level).toBe("critical");
  });

  test("classifies battery inverted (lower is worse)", () => {
    expect(classifyHealth("battery", 25).level).toBe("ok");
    expect(classifyHealth("battery", 20).level).toBe("attention");
    expect(classifyHealth("battery", 10).level).toBe("critical");
  });

  test("missing or non-finite data is unknown, never fabricated", () => {
    expect(classifyHealth("cpu", undefined).level).toBe("unknown");
    expect(classifyHealth("cpu", Number.NaN).level).toBe("unknown");
  });

  test("clamps out-of-range percentages", () => {
    expect(classifyHealth("cpu", 999).level).toBe("critical");
    expect(classifyHealth("battery", -5).level).toBe("critical");
  });

  test("overallHealth returns the worst reported level", () => {
    expect(overallHealth([{ metric: "cpu", level: "ok", threshold: HEALTH_THRESHOLDS.cpu }])).toBe("ok");
    expect(
      overallHealth([
        { metric: "cpu", level: "ok", threshold: HEALTH_THRESHOLDS.cpu },
        { metric: "battery", level: "attention", threshold: HEALTH_THRESHOLDS.battery },
      ]),
    ).toBe("attention");
    expect(
      overallHealth([
        { metric: "cpu", level: "critical", threshold: HEALTH_THRESHOLDS.cpu },
        { metric: "battery", level: "attention", threshold: HEALTH_THRESHOLDS.battery },
      ]),
    ).toBe("critical");
  });

  test("evaluateHealth reads live telemetry and formats honestly", () => {
    cpuMock.mockReturnValue({ available: true, percentUsed: 96 });
    battMock.mockReturnValue({ available: true, percentCharged: 15, charging: false });
    const report = evaluateHealth();
    expect(report.overall).toBe("critical");
    expect(report.metrics.find((m) => m.metric === "cpu")?.level).toBe("critical");
    expect(report.metrics.find((m) => m.metric === "battery")?.level).toBe("attention");
    expect(formatHealthReport(report)).toContain("Overall: critical");

    // Unknown telemetry is never invented.
    cpuMock.mockReturnValue({ available: false, error: "n/a" });
    const unknown = evaluateHealth();
    expect(unknown.metrics.find((m) => m.metric === "cpu")?.level).toBe("unknown");
  });
});

describe("briefing", () => {
  beforeEach(() => {
    setTaskManager(new TaskManager({ store: new InMemoryTaskStore(), now: () => NOW }));
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore(), now: () => NOW }));
    const manager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
    manager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    setAutomationManager(manager);
    cpuMock.mockReturnValue({ available: true, percentUsed: 30 });
    memMock.mockReturnValue({ available: true, percentUsed: 40 });
    diskMock.mockReturnValue({ available: true, percentUsed: 50 });
    battMock.mockReturnValue({ available: true, percentCharged: 80, charging: true });
    frontMock.mockReturnValue({ available: true, name: "Finder" });
  });

  afterEach(() => {
    setTaskManager(null);
    setReminderManager(null);
    setAutomationManager(null);
  });

  test("builds honest sections from real managers", () => {
    getTaskManager().create({ title: "Overdue task", priority: "high", dueAt: NOW - 1000 });
    getTaskManager().create({ title: "Due today", priority: "normal", dueAt: NOW + 1000 });
    getReminderManager().create({ title: "Standup", dueAt: NOW + 60_000, repeat: "daily" });
    getReminderManager().create({ title: "Missed", dueAt: NOW - 1000 });
    getAutomationManager().create(makeAutomationInput());

    const briefing = buildBriefing(NOW);

    expect(briefing.tasks.open).toBe(2);
    expect(briefing.tasks.overdue).toBe(1);
    expect(briefing.tasks.dueToday.map((t) => t.title)).toEqual(["Due today"]);
    expect(briefing.reminders.upcoming[0].title).toBe("Standup");
    expect(briefing.reminders.overdue).toBe(1);
    expect(briefing.automations.active).toBe(1);
    expect(briefing.automations.nextRuns[0].name).toBe("Morning report");
    expect(briefing.frontmostApp).toBe("Finder");
    expect(briefing.health.overall).toBe("ok");

    const text = formatBriefing(briefing);
    expect(text).toContain("Tasks: 2 open (1 overdue)");
    expect(text).toContain("Reminders: 1 upcoming (1 missed)");
    expect(text).toContain("Automations: 1 active");
    expect(text).toContain("Frontmost application: Finder");
  });

  test("reports empty sources honestly (never fabricates)", () => {
    const briefing = buildBriefing(NOW);
    expect(briefing.tasks.open).toBe(0);
    expect(briefing.reminders.upcoming).toEqual([]);
    expect(briefing.automations.active).toBe(0);
    expect(formatBriefing(briefing)).toContain("Tasks: 0 open (0 overdue)");
  });
});

describe("personal context", () => {
  beforeEach(() => {
    setTaskManager(new TaskManager({ store: new InMemoryTaskStore(), now: () => NOW }));
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore(), now: () => NOW }));
    const manager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
    manager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    setAutomationManager(manager);
    cpuMock.mockReturnValue({ available: true, percentUsed: 30 });
    memMock.mockReturnValue({ available: true, percentUsed: 40 });
    diskMock.mockReturnValue({ available: true, percentUsed: 50 });
    battMock.mockReturnValue({ available: true, percentCharged: 80, charging: true });
    frontMock.mockReturnValue({ available: true, name: "Finder" });
  });

  afterEach(() => {
    setTaskManager(null);
    setReminderManager(null);
    setAutomationManager(null);
  });

  test("is a bounded, read-only projection sorted by dueAt", () => {
    for (let i = 0; i < 12; i += 1) {
      getTaskManager().create({ title: `task-${i}`, dueAt: NOW + i });
    }
    getReminderManager().create({ title: "rem", dueAt: NOW + 1 });

    const snapshot = buildPersonalContext({ now: NOW, maxTasks: 5 });

    expect(snapshot.openTasks).toHaveLength(5);
    expect(snapshot.openTasks[0].title).toBe("task-0");
    expect(snapshot.upcomingReminders[0].title).toBe("rem");
    expect(snapshot.health.overall).toBe("ok");
    expect(snapshot.frontmostApp).toBe("Finder");

    const text = formatPersonalContext(snapshot);
    expect(text).toContain("task-0");
    expect(text).toContain("rem at");
  });

  test("returns null text when everything is empty", () => {
    frontMock.mockReturnValue({ available: false, error: "n/a" });
    const snapshot = buildPersonalContext({ now: NOW });
    expect(snapshot.openTasks).toEqual([]);
    expect(snapshot.frontmostApp).toBeUndefined();
    expect(formatPersonalContext(snapshot)).toBeNull();
  });

  test("excludes completed tasks and disabled/expired reminders", () => {
    const tasks = getTaskManager();
    const a = tasks.create({ title: "done", dueAt: NOW - 1 });
    tasks.complete(a.task!.id);
    tasks.create({ title: "open", dueAt: NOW + 1 });
    const reminders = getReminderManager();
    const r = reminders.create({ title: "disabled", dueAt: NOW + 1 });
    reminders.disable(r.reminder!.id);
    reminders.create({ title: "expired", dueAt: NOW - 1 });

    const snapshot = buildPersonalContext({ now: NOW });
    expect(snapshot.openTasks.map((t) => t.title)).toEqual(["open"]);
    expect(snapshot.upcomingReminders).toEqual([]);
  });
});
