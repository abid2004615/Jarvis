"use client";

/**
 * Action Status Component
 * Renders the current action chain (multi-step tool execution) state for the
 * HUD: the chain state plus each step's status. Fully prop-driven — the parent
 * owns the chain data, so this works across client/server boundaries.
 * Only client-safe data is displayed (no arguments, no results).
 */

import type { ActionChainStatus } from "@/lib/runtime/types";
import "@/styles/action-status.css";

interface ActionStatusProps {
  chain: ActionChainStatus | null;
}

const STATE_LABELS: Record<ActionChainStatus["state"], string> = {
  planning: "PLANNING",
  executing: "EXECUTING",
  waiting_for_confirmation: "WAITING FOR CONFIRMATION",
  partial_success: "PARTIAL SUCCESS",
  completed: "COMPLETED",
  error: "ERROR",
};

export function ActionStatus({ chain }: ActionStatusProps) {
  if (!chain) {
    return null;
  }

  return (
    <div className="action-status" data-state={chain.state}>
      <div className="action-status-header">
        <div className="action-status-title">ACTION CHAIN</div>
        <div className="action-status-state">{STATE_LABELS[chain.state] ?? chain.state}</div>
      </div>
      <ol className="action-status-steps">
        {chain.steps.map((step, index) => (
          <li key={`${step.toolName}-${index}`} className="action-status-step" data-status={step.status}>
            <span className="action-status-dot" aria-hidden="true" />
            <span className="action-status-tool">{step.toolName}</span>
            <span className="action-status-description">
              {step.humanReadableAction ?? step.toolName}
            </span>
            <span className="action-status-status">{step.status}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default ActionStatus;
