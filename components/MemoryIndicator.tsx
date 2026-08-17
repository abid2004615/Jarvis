"use client";

import { useEffect, useState } from "react";

import "@/styles/memory-indicator.css";

export interface MemoryIndicatorItem {
  id: string;
  category: string;
  key: string;
  value: string;
  updatedAt: number;
}

export interface MemoryIndicatorPayload {
  count: number;
  memories: MemoryIndicatorItem[];
}

interface MemoryIndicatorProps {
  refreshKey?: number;
}

/**
 * Read-only HUD indicator showing how many memories JARVIS has saved.
 * Clicking expands a list of saved memories. Never writes memory from the
 * browser — mutation only happens server-side through the AI tool pipeline.
 */
export function MemoryIndicator({ refreshKey = 0 }: MemoryIndicatorProps) {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryIndicatorItem[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/memory")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("offline"))))
      .then((data: MemoryIndicatorPayload) => {
        if (!active) return;
        setCount(data.count);
        setMemories(data.memories);
        setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <div className="memory-indicator">
      <button
        type="button"
        className="memory-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        MEMORY: {offline ? "OFFLINE" : count ?? "…"}
      </button>
      {open && (
        <div className="memory-panel">
          <div className="memory-panel-title">SAVED MEMORIES</div>
          {memories.length === 0 ? (
            <div className="memory-empty">No saved memories.</div>
          ) : (
            <ul className="memory-list">
              {memories.map((item) => (
                <li key={item.id} className="memory-item">
                  <span className="memory-cat">{item.category}</span>
                  <span className="memory-text">
                    {item.key}: {item.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default MemoryIndicator;
