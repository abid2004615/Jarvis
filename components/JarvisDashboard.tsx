"use client";

import { useCallback, useEffect, useState } from "react";

import "@/styles/dashboard.css";

interface DashboardData {
  generatedAt: number;
  frontmostApp?: string;
  health: {
    overall: string;
    metrics: Array<{ metric: string; level: string; percent?: number }>;
  };
  healthText: string;
  briefingText: string;
  personalContextText: string | null;
  counts: {
    tasks: number;
    reminders: number;
    routines: number;
    automations: number;
    memory: number;
    notifications: number;
    unreadNotifications: number;
  };
}

interface DashboardProps {
  refreshKey?: number;
}

async function fetchDashboard(): Promise<DashboardData | null> {
  try {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  } catch {
    return null;
  }
}

function formatTime(value?: number): string {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JarvisDashboard({ refreshKey = 0 }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const snapshot = await fetchDashboard();
    setData(snapshot);
    setOffline(snapshot === null);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then((snapshot) => {
        if (!active) return;
        setData(snapshot);
        setOffline(snapshot === null);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const metrics = data?.health?.metrics ?? [];

  return (
    <div className="jarvis-dashboard">
      <button
        type="button"
        className="dashboard-toggle"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void load();
        }}
        aria-expanded={open}
      >
        DASHBOARD{data ? ` · ${data.counts.tasks} tasks` : ""}
      </button>
      {open && (
        <div className="dashboard-popover">
          <div className="dashboard-head">
            <span className="dashboard-title">OVERVIEW</span>
            <span className="dashboard-updated">{data ? formatTime(data.generatedAt) : ""}</span>
          </div>
          {offline ? (
            <div className="dashboard-empty">Offline — could not load the dashboard.</div>
          ) : (
            <>
              <div className="dashboard-counts">
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.tasks ?? 0}</span>
                  <span className="dashboard-count-label">tasks</span>
                </div>
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.reminders ?? 0}</span>
                  <span className="dashboard-count-label">reminders</span>
                </div>
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.routines ?? 0}</span>
                  <span className="dashboard-count-label">routines</span>
                </div>
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.automations ?? 0}</span>
                  <span className="dashboard-count-label">automations</span>
                </div>
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.memory ?? 0}</span>
                  <span className="dashboard-count-label">memories</span>
                </div>
                <div className="dashboard-count">
                  <span className="dashboard-count-value">{data?.counts.unreadNotifications ?? 0}</span>
                  <span className="dashboard-count-label">unread</span>
                </div>
              </div>

              <div className="dashboard-section">
                <div className="dashboard-section-title">
                  HEALTH <span className={`dashboard-health-level ${data?.health?.overall ?? ""}`}>{data?.health?.overall ?? "unknown"}</span>
                </div>
                <div className="dashboard-health-metrics">
                  {metrics.length === 0
                    ? "No data."
                    : metrics.map((m) => (
                        <span key={m.metric} className={`dashboard-metric ${m.level}`}>
                          {m.metric} {typeof m.percent === "number" ? `${m.percent}%` : "n/a"}
                        </span>
                      ))}
                </div>
              </div>

              <div className="dashboard-section">
                <div className="dashboard-section-title">BRIEFING</div>
                <pre className="dashboard-text">{data?.briefingText ?? "No briefing data."}</pre>
              </div>

              <div className="dashboard-section">
                <div className="dashboard-section-title">CONTEXT</div>
                {data?.personalContextText ? (
                  <pre className="dashboard-text">{data.personalContextText}</pre>
                ) : (
                  <div className="dashboard-empty">Nothing to show.</div>
                )}
              </div>

              {data?.frontmostApp && <div className="dashboard-frontmost">Frontmost: {data.frontmostApp}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default JarvisDashboard;
