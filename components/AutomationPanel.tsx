"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import "@/styles/automation-panel.css";

import type { AutomationSummaryView } from "@/lib/automation/client";
import {
  deleteAutomation,
  fetchAutomations,
  runAutomationNow,
  setAutomationEnabled,
} from "@/lib/automation/client";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTrigger(trigger: {
  type: string;
  at?: string;
  dayOfWeek?: number;
  minutes?: number;
  metric?: string;
  operator?: string;
  value?: number | string;
  date?: string;
}): string {
  switch (trigger.type) {
    case "once":
      return `once ${trigger.date ?? "today"}${trigger.at ? ` at ${trigger.at}` : ""}`;
    case "daily":
      return `daily at ${trigger.at}`;
    case "weekly":
      return `weekly ${DAY_NAMES[trigger.dayOfWeek ?? 0] ?? "?"} at ${trigger.at}`;
    case "interval":
      return `every ${trigger.minutes} min`;
    case "condition":
      return `when ${trigger.metric} ${trigger.operator} ${trigger.value}`;
    default:
      return trigger.type;
  }
}

function formatTime(value?: number): string {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface AutomationPanelProps {
  refreshKey?: number;
}

export function AutomationPanel({ refreshKey = 0 }: AutomationPanelProps) {
  const [automations, setAutomations] = useState<AutomationSummaryView[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const list = await fetchAutomations();
    setAutomations(list);
    setOffline(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAutomations()
      .then((list) => {
        if (!active) return;
        setAutomations(list);
        setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const flash = useCallback(
    (message: string) => {
      setStatus(message);
      if (timer) clearTimeout(timer);
      setTimer(setTimeout(() => setStatus(null), 4000));
    },
    [timer],
  );

  const toggle = useCallback(
    async (id: string, enabled: boolean) => {
      setBusy(true);
      try {
        await setAutomationEnabled(id, enabled);
        await load();
        flash(enabled ? "Automation enabled." : "Automation disabled.");
      } catch {
        setStatus("Action failed — server rejected it.");
      } finally {
        setBusy(false);
      }
    },
    [load, flash],
  );

  const runNow = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const result = await runAutomationNow(id);
        flash(result.message ?? "Automation run requested.");
        await load();
      } catch {
        setStatus("Run failed.");
      } finally {
        setBusy(false);
      }
    },
    [load, flash],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await deleteAutomation(id);
        setConfirmDelete(null);
        await load();
        flash("Automation deleted.");
      } catch {
        setStatus("Delete failed.");
      } finally {
        setBusy(false);
      }
    },
    [load, flash],
  );

  return (
    <div className="automation-panel">
      <button
        type="button"
        className="automation-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        AUTOMATIONS: {offline ? "OFFLINE" : automations.length}
      </button>
      {open && (
        <div className="automation-popover">
          <div className="automation-panel-title">SCHEDULED & CONDITIONAL TASKS</div>
          {status && <div className="automation-status">{status}</div>}
          {automations.length === 0 ? (
            <div className="automation-empty">
              No automations. Ask JARVIS, e.g. “remind me every morning at 9 to check my CPU”.
            </div>
          ) : (
            <ul className="automation-list">
              {automations.map((a) => (
                <li key={a.id} className={`automation-item${a.enabled ? "" : " disabled"}`}>
                  <div className="automation-head">
                    <span className="automation-name">{a.name}</span>
                    <span className={`automation-badge ${a.enabled ? "on" : "off"}`}>
                      {a.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <div className="automation-meta">
                    <div>
                      <span className="automation-label">TRIGGER</span> {formatTrigger(a.trigger)}
                    </div>
                    <div>
                      <span className="automation-label">ACTION</span> {a.action?.toolId ?? "—"}
                    </div>
                    <div>
                      <span className="automation-label">NEXT</span> {formatTime(a.nextRunAt)}
                    </div>
                    <div>
                      <span className="automation-label">LAST</span> {formatTime(a.lastRunAt)}
                    </div>
                    <div>
                      <span className="automation-label">STATUS</span> {a.lastResult ?? "ready"}
                      {a.requiresConfirmation ? " · confirm" : ""}
                    </div>
                  </div>
                  <div className="automation-actions">
                    {a.enabled ? (
                      <button type="button" className="automation-btn" disabled={busy} onClick={() => void toggle(a.id, false)}>
                        Disable
                      </button>
                    ) : (
                      <button type="button" className="automation-btn" disabled={busy} onClick={() => void toggle(a.id, true)}>
                        Enable
                      </button>
                    )}
                    <button type="button" className="automation-btn" disabled={busy} onClick={() => void runNow(a.id)}>
                      Run now
                    </button>
                    {confirmDelete === a.id ? (
                      <>
                        <span className="automation-confirm-text">Delete?</span>
                        <button type="button" className="automation-btn danger" disabled={busy} onClick={() => void remove(a.id)}>
                          Yes
                        </button>
                        <button type="button" className="automation-btn" disabled={busy} onClick={() => setConfirmDelete(null)}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" className="automation-btn danger" disabled={busy} onClick={() => setConfirmDelete(a.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AutomationPanel;
