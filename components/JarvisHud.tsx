"use client";

/**
 * JARVIS Quick Command HUD
 *
 * Spotlight-style overlay rendered in its own frameless Electron window.
 * Type a command, press Enter, read the answer inline. Escape dismisses.
 *
 * The window is created once and reused, so this component resets itself on
 * every reveal rather than relying on remount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { callAIAssistant } from "@/lib/aiRouter";
import {
  getHudInfo,
  hideHud,
  isHudBridgeAvailable,
  onHudHidden,
  onHudShown,
  openMainWindow,
  resizeHud,
} from "@/lib/hud/bridge";
import "@/styles/hud-overlay.css";

/** Height of the input row alone; must match HUD_MIN_HEIGHT in electron/main.ts. */
const COLLAPSED_HEIGHT = 88;
/** Upper bound mirroring HUD_MAX_HEIGHT; the main process clamps too. */
const MAX_HEIGHT = 460;

type HudStatus = "idle" | "thinking" | "answered" | "error";

export default function JarvisHud() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<HudStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [shortcut, setShortcut] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  /** Guards against a slow reply landing after the overlay was dismissed. */
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setInput("");
    setAnswer("");
    setStatus("idle");
  }, []);

  // Keep the window height matched to the rendered content.
  useEffect(() => {
    if (status === "idle") {
      resizeHud(COLLAPSED_HEIGHT);
      return;
    }
    const content = panelRef.current?.scrollHeight;
    resizeHud(Math.min(MAX_HEIGHT, (content ?? COLLAPSED_HEIGHT) + 8));
  }, [status, answer]);

  // The window is reused, so refocus and clear each time it is revealed.
  useEffect(() => {
    const offShown = onHudShown(() => {
      reset();
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    const offHidden = onHudHidden(() => reset());
    return () => {
      offShown();
      offHidden();
    };
  }, [reset]);

  useEffect(() => {
    inputRef.current?.focus();
    void getHudInfo().then((info) => {
      if (info?.shortcutRegistered) setShortcut(info.shortcut);
    });
  }, []);

  const submit = useCallback(async () => {
    const message = input.trim();
    if (!message || status === "thinking") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setStatus("thinking");
    setAnswer("");

    const result = await callAIAssistant(message, conversationIdRef.current);

    // Discarded if the overlay was dismissed or resubmitted meanwhile.
    if (requestIdRef.current !== requestId) return;

    conversationIdRef.current = result.conversationId ?? conversationIdRef.current;
    setAnswer(result.response);
    setStatus(result.mode === "ERROR" ? "error" : "answered");
  }, [input, status]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // Clear a typed query first; a second Escape closes the overlay.
      if (input || status !== "idle") {
        reset();
      } else {
        hideHud();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  const busy = status === "thinking";
  const showResult = status !== "idle";

  return (
    <div className="jarvis-hud" ref={panelRef}>
      <div className="jarvis-hud-bar">
        <span className="jarvis-hud-prompt" aria-hidden="true">
          &gt;
        </span>

        <label className="jarvis-hud-label" htmlFor="jarvis-hud-input">
          Ask JARVIS
        </label>
        <input
          id="jarvis-hud-input"
          ref={inputRef}
          className="jarvis-hud-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask JARVIS…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />

        {busy && (
          <span className="jarvis-hud-spinner" role="status" aria-label="Thinking">
            <span className="jarvis-hud-dot" />
            <span className="jarvis-hud-dot" />
            <span className="jarvis-hud-dot" />
          </span>
        )}
      </div>

      {showResult && (
        <div className="jarvis-hud-result">
          <p
            className={`jarvis-hud-answer${status === "error" ? " is-error" : ""}`}
            aria-live="polite"
          >
            {busy ? "Thinking…" : answer}
          </p>

          {!busy && (
            <div className="jarvis-hud-actions">
              <button type="button" className="jarvis-hud-action" onClick={() => openMainWindow()}>
                Open full JARVIS
              </button>
              <button type="button" className="jarvis-hud-action" onClick={reset}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div className="jarvis-hud-footer">
        <span>
          <kbd>Enter</kbd> send
        </span>
        <span>
          <kbd>Esc</kbd> {input || showResult ? "clear" : "close"}
        </span>
        {shortcut && <span className="jarvis-hud-shortcut">{shortcut}</span>}
        {!isHudBridgeAvailable() && (
          <span className="jarvis-hud-shortcut">preview — open in the JARVIS app</span>
        )}
      </div>
    </div>
  );
}
