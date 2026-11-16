/**
 * The six-stage pipeline as a compact track. Used by the customer order page
 * and the admin job board, so both sides describe a job in the same words.
 */
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/orders/pipeline";

const TONE: Record<Stage, string> = {
  quote: "bg-mist text-steel",
  order: "bg-ink/8 text-ink",
  artwork: "bg-warning/12 text-warning",
  proof: "bg-accent/10 text-accent-ink",
  production: "bg-ink text-white",
  completed: "bg-success/12 text-success",
};

/** Status pill. "proof" reads as an action for the customer, a state for staff. */
export function StageChip({ stage, label }: { stage: Stage; label?: string }) {
  return <span className={`chip ${TONE[stage]}`}>{label ?? STAGE_LABEL[stage]}</span>;
}

export function StageTrack({ stage }: { stage: Stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label={`Progress: ${STAGE_LABEL[stage]}`}>
      {STAGES.map((s, i) => (
        <li key={s} className="min-w-0" aria-current={i === at ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i < at ? "bg-ink" : i === at ? "bg-accent" : "bg-hairline"}`} />
          <span className={`mt-1.5 block truncate text-[11px] sm:text-xs ${i === at ? "font-semibold text-ink" : "text-steel"}`}>{STAGE_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}
