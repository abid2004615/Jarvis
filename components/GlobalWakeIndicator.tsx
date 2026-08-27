"use client";

import { useEffect, useRef, useState } from "react";

interface GlobalWakeIndicatorProps {
  enabled: boolean;
  onWakeDetected?: () => void;
}

export function GlobalWakeIndicator({
  enabled,
  onWakeDetected,
}: GlobalWakeIndicatorProps) {
  const [connected, setConnected] = useState(false);
  const [lastWake, setLastWake] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastWakeTimestampRef = useRef(0);
  const WAKE_DEBOUNCE_MS = 5000;

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const es = new EventSource("/api/wake");
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === "connected") {
          setConnected(true);
        } else if (data.event === "wake") {
          const now = Date.now();
          if (now - lastWakeTimestampRef.current < WAKE_DEBOUNCE_MS) {
            return;
          }
          lastWakeTimestampRef.current = now;
          setLastWake(data.timestamp);
          onWakeDetected?.();
        }
      } catch {
        // malformed event, ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [enabled, onWakeDetected]);

  if (!enabled) return null;

  return (
    <div className="global-wake-indicator">
      <span
        className={`global-wake-dot ${connected ? "connected" : "disconnected"}`}
      />
      <span className="global-wake-label">
        {connected ? "GLOBAL WAKE ACTIVE" : "WAKE CONNECTING..."}
      </span>
      {lastWake && (
        <span className="global-wake-time">
          Last: {new Date(lastWake).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
