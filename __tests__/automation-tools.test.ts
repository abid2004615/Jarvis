/**
 * JARVIS Automation — Tool Tests
 * Validates the 9 automation management tools against the singleton manager,
 * including the explicit-approval rule and confirmation gating for delete.
 */

import {
  getAutomationTools,
  CREATE_AUTOMATION_TOOL,
  DELETE_AUTOMATION_TOOL,
} from "@/lib/automation/tools";
import { AutomationManager } from "@/lib/automation/manager";
import { setAutomationManager, resetAutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { resetNotificationBus } from "@/lib/automation/notifier";

describe("Automation management tools", () => {
  let manager: AutomationManager;

  beforeEach(() => {
    resetNotificationBus();
    resetAutomationManager();
    manager = new AutomationManager({
      store: new InMemoryAutomationStore(),
      now: () => 1_700_000_000_000,
    });
    manager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    setAutomationManager(manager);
  });

  afterEach(() => {
    resetAutomationManager();
  });

  test("exposes exactly the 9 automation tools", () => {
    expect(getAutomationTools().map((t) => t.name).sort()).toEqual(
      [
        "create_automation",
        "delete_automation",
        "disable_all_automations",
        "disable_automation",
        "enable_automation",
        "get_automation",
        "list_automations",
        "run_automation_now",
        "update_automation",
      ].sort(),
    );
  });

  describe("create_automation", () => {
    test("rejects creation without explicitApproval", async () => {
      const result = await CREATE_AUTOMATION_TOOL.execute({
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      expect(result.success).toBe(false);
      expect(manager.count()).toBe(0);
    });

    test("rejects creation when explicitApproval is not a literal true", async () => {
      const result = await CREATE_AUTOMATION_TOOL.execute({
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: "yes",
      });
      expect(result.success).toBe(false);
    });

    test("creates a valid automation with explicit approval", async () => {
      const result = await CREATE_AUTOMATION_TOOL.execute({
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      expect(result.success).toBe(true);
      expect(manager.count()).toBe(1);
    });

    test("rejects a command-style action", async () => {
      const result = await CREATE_AUTOMATION_TOOL.execute({
        name: "Hack",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "shell", arguments: { command: "rm -rf /" } },
        explicitApproval: true,
      });
      expect(result.success).toBe(false);
      expect(manager.count()).toBe(0);
    });
  });

  describe("list / get / update", () => {
    let id: string;

    beforeEach(async () => {
      const created = await CREATE_AUTOMATION_TOOL.execute({
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      id = created.automationId as string;
    });

    test("list_automations returns the automation", async () => {
      const tool = getAutomationTools().find((t) => t.name === "list_automations")!;
      const result = await tool.execute({});
      expect(result.count).toBe(1);
      expect(result.automations[0].name).toBe("Morning CPU");
    });

    test("get_automation returns a single automation", async () => {
      const tool = getAutomationTools().find((t) => t.name === "get_automation")!;
      const result = await tool.execute({ id });
      expect(result.success).toBe(true);
      expect(result.automation.id).toBe(id);
    });

    test("get_automation reports a missing automation", async () => {
      const tool = getAutomationTools().find((t) => t.name === "get_automation")!;
      const result = await tool.execute({ id: "nope" });
      expect(result.success).toBe(false);
    });

    test("update_automation changes the name", async () => {
      const tool = getAutomationTools().find((t) => t.name === "update_automation")!;
      const result = await tool.execute({ id, name: "Renamed" });
      expect(result.success).toBe(true);
      expect(manager.get(id)?.name).toBe("Renamed");
    });
  });

  describe("enable / disable / disable_all", () => {
    let id: string;

    beforeEach(async () => {
      const created = await CREATE_AUTOMATION_TOOL.execute({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      id = created.automationId as string;
    });

    test("disable_automation disables", async () => {
      const tool = getAutomationTools().find((t) => t.name === "disable_automation")!;
      const result = await tool.execute({ id });
      expect(result.success).toBe(true);
      expect(manager.get(id)?.enabled).toBe(false);
    });

    test("enable_automation enables", async () => {
      const tool = getAutomationTools().find((t) => t.name === "enable_automation")!;
      await tool.execute({ id });
      expect(manager.get(id)?.enabled).toBe(true);
    });

    test("disable_all_automations disables everything", async () => {
      const tool = getAutomationTools().find((t) => t.name === "disable_all_automations")!;
      const result = await tool.execute({});
      expect(result.disabled).toBe(1);
      expect(manager.get(id)?.enabled).toBe(false);
    });
  });

  describe("delete_automation", () => {
    test("delete_automation is confirmation-gated", () => {
      expect(DELETE_AUTOMATION_TOOL.requiresUserConfirmation).toBe(true);
      expect(DELETE_AUTOMATION_TOOL.riskLevel).toBe("confirmation");
    });

    test("delete_automation deletes when it reaches the executor", async () => {
      const created = await CREATE_AUTOMATION_TOOL.execute({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      const result = await DELETE_AUTOMATION_TOOL.execute({ id: created.automationId });
      expect(result.success).toBe(true);
      expect(manager.count()).toBe(0);
    });
  });

  describe("run_automation_now", () => {
    test("runs an existing automation immediately", async () => {
      const created = await CREATE_AUTOMATION_TOOL.execute({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      const tool = getAutomationTools().find((t) => t.name === "run_automation_now")!;
      const result = await tool.execute({ id: created.automationId });
      expect(result.status).toBe("executed");
      expect(manager.get(created.automationId as string)?.lastRunAt).toBe(1_700_000_000_000);
    });

    test("does not run a disabled automation", async () => {
      const created = await CREATE_AUTOMATION_TOOL.execute({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
        explicitApproval: true,
      });
      manager.disable(created.automationId as string);
      const tool = getAutomationTools().find((t) => t.name === "run_automation_now")!;
      const result = await tool.execute({ id: created.automationId });
      expect(result.status).toBe("disabled");
      expect(result.success).toBe(false);
    });
  });
});
