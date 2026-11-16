/**
 * The six-stage job pipeline (PRD §10) as an explicit state machine.
 * Every status change in the app goes through canTransition(), so the rules
 * live in one place and are unit-tested:
 *
 *   quote -> order        only once paid
 *   order -> artwork      staff start prepress
 *   artwork -> proof      only when a proof version exists to review
 *   proof -> artwork      customer requested changes (next proof = v+1)
 *   proof -> production   ONLY after the latest proof is approved
 *   production -> completed
 */
export const STAGES = ["quote", "order", "artwork", "proof", "production", "completed"] as const;
export type Stage = (typeof STAGES)[number];
export type ProofStatus = "pending" | "approved" | "changes_requested" | "superseded";

export const STAGE_LABEL: Record<Stage, string> = {
  quote: "Quote",
  order: "Order placed",
  artwork: "Artwork",
  proof: "Proof sent",
  production: "In production",
  completed: "Completed",
};

const ALLOWED: Record<Stage, Stage[]> = {
  quote: ["order"],
  order: ["artwork"],
  artwork: ["proof"],
  proof: ["production", "artwork"],
  production: ["completed"],
  completed: [],
};

export interface GateContext {
  paid: boolean;
  latestProof: ProofStatus | null;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

export function canTransition(from: Stage, to: Stage, ctx: GateContext): Verdict {
  if (!ALLOWED[from].includes(to)) return { ok: false, reason: `An order cannot move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}.` };
  if (to === "order" && !ctx.paid) return { ok: false, reason: "The order has not been paid." };
  if (to === "proof" && ctx.latestProof !== "pending") return { ok: false, reason: "Create a proof version before sending it for approval." };
  if (to === "production" && ctx.latestProof !== "approved") return { ok: false, reason: "Production needs an approved proof." };
  return { ok: true };
}

/** The forward step staff can take next (the "advance" button). */
export function nextStage(from: Stage): Stage | null {
  const i = STAGES.indexOf(from);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** Print files are locked until the customer approves the latest proof (PRD §08). */
export function printFilesUnlocked(latestProof: ProofStatus | null): boolean {
  return latestProof === "approved";
}
