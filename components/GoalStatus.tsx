"use client";

/**
 * Goal Status Component
 * Renders the current goal state for the HUD: goal title, progress, current
 * step, and high-level status. Fully prop-driven — the parent owns the goal
 * data. Never displays internal reasoning, step arguments, or full history.
 */

import type { GoalSummary } from "@/lib/goals/types";
import "@/styles/goal-status.css";

interface GoalStatusProps {
  goal: GoalSummary | null;
}

const STATE_LABELS: Record<GoalSummary["status"], string> = {
  draft: "DRAFT",
  planning: "PLANNING",
  ready: "READY",
  running: "RUNNING",
  paused: "PAUSED",
  waiting_for_confirmation: "WAITING FOR CONFIRMATION",
  waiting_for_user: "WAITING FOR USER",
  verifying: "VERIFYING",
  replanning: "REPLANNING",
  completed: "COMPLETED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function ProgressBar({ progress }: { progress: number }) {
  const filled = Math.round(progress / 10);
  const empty = 10 - filled;
  return (
    <div className="goal-progress">
      <span className="goal-progress-bar">
        {"█".repeat(filled)}{"░".repeat(empty)}
      </span>
      <span className="goal-progress-pct">{progress}%</span>
    </div>
  );
}

export function GoalStatus({ goal }: GoalStatusProps) {
  if (!goal) {
    return null;
  }

  return (
    <div className="goal-status" data-state={goal.status}>
      <div className="goal-status-header">
        <div className="goal-status-title">GOAL</div>
        <div className="goal-status-name">{goal.title}</div>
      </div>
      <div className="goal-status-state">{STATE_LABELS[goal.status] ?? goal.status}</div>
      <ProgressBar progress={goal.progress} />
      {goal.currentStepDescription && (
        <div className="goal-status-step">
          <span className="goal-status-step-label">Current:</span>
          <span className="goal-status-step-text">{goal.currentStepDescription}</span>
        </div>
      )}
      <div className="goal-status-meta">
        <span>{goal.completedSteps} of {goal.totalSteps} steps</span>
        {goal.error && <span className="goal-status-error">{goal.error}</span>}
      </div>
    </div>
  );
}

export default GoalStatus;
