/**
 * JARVIS Personal Layer — runtime bootstrap
 *
 * Single entry point that activates the personal layer on the server:
 *  - registers task/reminder/routine/briefing tools in the shared registry
 *  - wires reminder firing onto the EXISTING single scheduler (no second loop)
 *  - wires the routine runner to the runtime pipeline
 *
 * Idempotent and safe to call from API route bootstrap or startup code.
 */

import { registerTaskTools } from "@/lib/tasks/register";
import { registerReminderTools } from "@/lib/reminders/register";
import { registerRoutineTools } from "@/lib/routines/register";
import { registerBriefingTools } from "@/lib/briefing/register";
import { wireRemindersToScheduler } from "@/lib/reminders/wiring";
import { wireRoutinesToPipeline } from "@/lib/routines/wiring";

let started = false;

/** Idempotent activation of the personal layer. */
export function startPersonalServices(): void {
  if (started) return;
  registerTaskTools();
  registerReminderTools();
  registerRoutineTools();
  registerBriefingTools();
  wireRemindersToScheduler();
  wireRoutinesToPipeline();
  started = true;
}

export function resetPersonalServices(): void {
  started = false;
}
