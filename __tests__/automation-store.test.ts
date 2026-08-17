/**
 * JARVIS Automation — Store Tests
 * Bounded atomic file persistence, corruption recovery, and separation from
 * memory/conversation stores.
 */

import fs from "fs";
import os from "os";
import path from "path";

import { AutomationFileStore, InMemoryAutomationStore, getDefaultAutomationFilePath } from "@/lib/automation/store";
import { AUTOMATION_LIMITS } from "@/lib/automation/types";
import type { Automation } from "@/lib/automation/types";

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "auto-1",
    name: "Morning CPU check",
    description: "",
    enabled: true,
    trigger: { type: "daily", at: "09:00" },
    action: { toolId: "get_cpu_usage", arguments: {} },
    createdAt: 1000,
    updatedAt: 1000,
    requiresConfirmation: false,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("AutomationFileStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-auto-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("saves and reloads automations atomically", () => {
    const filePath = path.join(dir, "automations.json");
    const store = new AutomationFileStore(filePath);
    const a = makeAutomation();

    store.save([a]);

    const reloaded = new AutomationFileStore(filePath).load();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe("auto-1");
    expect(reloaded[0].name).toBe("Morning CPU check");
    expect(reloaded[0].action.toolId).toBe("get_cpu_usage");
  });

  test("returns empty list when file does not exist", () => {
    const store = new AutomationFileStore(path.join(dir, "missing.json"));
    expect(store.load()).toEqual([]);
  });

  test("quarantines a corrupt file and recovers to empty", () => {
    const filePath = path.join(dir, "automations.json");
    fs.writeFileSync(filePath, "{ this is not json !!", "utf8");

    const store = new AutomationFileStore(filePath);
    expect(store.load()).toEqual([]);

    const corruptFiles = fs.readdirSync(dir).filter((f) => f.includes(".corrupt-"));
    expect(corruptFiles).toHaveLength(1);
  });

  test("drops invalid records but keeps valid ones", () => {
    const filePath = path.join(dir, "automations.json");
    const store = new AutomationFileStore(filePath);
    const valid = makeAutomation({ id: "auto-valid" });
    store.save([valid]);
    // Corrupt the file with an invalid record appended.
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    data.automations.push({ id: "bad", name: 123 });
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");

    const reloaded = new AutomationFileStore(filePath).load();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe("auto-valid");
  });

  test("bounds the number of stored automations", () => {
    const filePath = path.join(dir, "automations.json");
    const store = new AutomationFileStore(filePath);
    const many = Array.from({ length: AUTOMATION_LIMITS.MAX_AUTOMATIONS + 20 }, (_, i) =>
      makeAutomation({ id: `auto-${i}`, createdAt: i }),
    );
    store.save(many);
    expect(store.load()).toHaveLength(AUTOMATION_LIMITS.MAX_AUTOMATIONS);
  });

  test("sorts loaded automations by createdAt", () => {
    const filePath = path.join(dir, "automations.json");
    const store = new AutomationFileStore(filePath);
    store.save([makeAutomation({ id: "newer", createdAt: 2000 }), makeAutomation({ id: "older", createdAt: 100 })]);
    const loaded = store.load();
    expect(loaded.map((a) => a.id)).toEqual(["older", "newer"]);
  });
});

describe("InMemoryAutomationStore", () => {
  test("round-trips automations without sharing references", () => {
    const store = new InMemoryAutomationStore();
    const a = makeAutomation();
    store.save([a]);
    a.name = "mutated";
    const loaded = store.load();
    expect(loaded[0].name).toBe("Morning CPU check");
  });

  test("seed primes the store", () => {
    const store = new InMemoryAutomationStore();
    store.seed([makeAutomation()]);
    expect(store.raw).toHaveLength(1);
  });
});

describe("storage separation", () => {
  test("automation store path differs from memory store path", () => {
    const automationPath = getDefaultAutomationFilePath();
    expect(automationPath).toContain(".jarvis");
    expect(automationPath.endsWith("automations.json")).toBe(true);
    // Separate file names guarantee separation from conversation/memory stores.
    expect(automationPath).not.toMatch(/memory\.json$/);
    expect(automationPath).not.toMatch(/context/);
  });
});
