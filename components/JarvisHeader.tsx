"use client";

import { useEffect, useState } from "react";

type WakeStatus = "disconnected" | "listening" | "detected";

interface JarvisHeaderProps {
  wakeStatus: WakeStatus;
  systemOnline: boolean;
}

export function JarvisHeader({ wakeStatus, systemOnline }: JarvisHeaderProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="jarvis-header">
      <div className="jarvis-header-brand">
        <span className="jarvis-header-logo">J</span>
        <span className="jarvis-header-name">JARVIS</span>
      </div>
      <div className="jarvis-header-status">
        <span
          className={`jarvis-header-dot ${systemOnline ? "online" : "offline"}`}
        />
        <span className="jarvis-header-label">
          {systemOnline ? "ONLINE" : "OFFLINE"}
        </span>
        {wakeStatus !== "disconnected" && (
          <>
            <span className="jarvis-header-separator" />
            <span
              className={`jarvis-header-wake ${wakeStatus === "detected" ? "active" : ""}`}
            >
              {wakeStatus === "detected" ? "WAKE DETECTED" : "WAKE LISTENING"}
            </span>
          </>
        )}
        {time && (
          <>
            <span className="jarvis-header-separator" />
            <span className="jarvis-header-time">{time}</span>
          </>
        )}
      </div>
    </div>
  );
}
