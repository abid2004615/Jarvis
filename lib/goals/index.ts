/**
 * JARVIS Goal-Oriented Workflows — Public API
 *
 * Goal-oriented execution allows JARVIS to manage larger user goals across
 * multiple validated steps. Every step goes through the existing
 * ActionChain → PermissionManager → Confirmation flow.
 *
 * Goals never bypass the existing safety architecture.
 */

export * from "./types";
export * from "./validator";
export * from "./store";
export * from "./model";
export { GoalManager, getGoalManager, setGoalManagerForTesting, resetGoalManager } from "./manager";
export type { GoalStepRunner, GoalStateListener } from "./manager";
export { generatePlan, generateSimplePlan } from "./planner";
export type { PlanResult, GoalPlannerConfig } from "./planner";
export { executeGoalStep, validateStepForExecution, computeStepArguments } from "./executor";
export type { StepExecutionResult, StepExecutor } from "./executor";
export { collectObservation } from "./observer";
export type { StepObservation, ObserverConfig } from "./observer";
export { verifyStepOutcome, verifyGoalSteps, allStepsVerified } from "./verifier";
export type { VerificationResult, VerificationStatus } from "./verifier";
export { determineRecovery, formatRecoveryDecision } from "./recovery";
export type { RecoveryAction, RecoveryDecision } from "./recovery";
