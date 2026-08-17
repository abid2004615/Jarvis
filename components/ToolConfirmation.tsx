"use client";

/**
 * Tool Confirmation Component
 * Minimal HUD confirmation UI for tool execution approval.
 * Fully prop-driven — the parent owns pending state so the component
 * works across client/server boundaries.
 */

import type { PendingToolCall } from "@/lib/runtime/types";
import "@/styles/tool-confirmation.css";

interface ToolConfirmationProps {
  request: PendingToolCall | null;
  busy?: boolean;
  onApprove?: (requestId: string) => void;
  onDeny?: (requestId: string) => void;
}

export function ToolConfirmation({ request, busy, onApprove, onDeny }: ToolConfirmationProps) {
  if (!request) {
    return null;
  }

  const handleApprove = () => {
    if (busy) return;
    onApprove?.(request.id);
  };

  const handleDeny = () => {
    if (busy) return;
    onDeny?.(request.id);
  };

  const riskLevel = request.riskLevel ?? "confirmation";
  const humanReadableAction = request.humanReadableAction ?? request.description;
  const args = request.arguments ?? {};

  return (
    <div className="tool-confirmation-overlay">
      <div className="tool-confirmation-panel">
        <div className="tool-confirmation-header">
          <div className="tool-confirmation-title">TOOL CONFIRMATION</div>
          <div className="tool-confirmation-risk" data-risk={riskLevel}>
            {riskLevel.toUpperCase()}
          </div>
        </div>

        <div className="tool-confirmation-content">
          <div className="tool-confirmation-action">
            <span className="label">ACTION:</span>
            <span className="action">{humanReadableAction}</span>
          </div>

          <div className="tool-confirmation-description">
            <span className="label">TOOL:</span>
            <span className="name">{request.name}</span>
          </div>

          {Object.keys(args).length > 0 && (
            <div className="tool-confirmation-args">
              <span className="label">PARAMETERS:</span>
              <div className="args-list">
                {Object.entries(args).map(([key, value]) => (
                  <div key={key} className="arg-item">
                    <span className="arg-key">{key}:</span>
                    <span className="arg-value">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="tool-confirmation-controls">
          <button
            type="button"
            className="tool-confirmation-btn tool-confirmation-allow"
            onClick={handleApprove}
            disabled={busy}
            aria-label="Approve tool execution"
          >
            ALLOW
          </button>
          <button
            type="button"
            className="tool-confirmation-btn tool-confirmation-deny"
            onClick={handleDeny}
            disabled={busy}
            aria-label="Deny tool execution"
          >
            DENY
          </button>
        </div>
      </div>
    </div>
  );
}

export default ToolConfirmation;
