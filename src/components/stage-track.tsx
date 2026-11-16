/**
 * The six-stage pipeline as a compact track. Used by the customer order page
 * and the admin job board, so both sides describe a job in the same words.
 */
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/orders/pipeline";

const TONE: Record<Stage, string> = {
  quote: "bg-mist text-steel",
  order: "bg-ink/8 text-ink",
  artwork: "bg-warning/12 text-warning",
  proof: "bg-blade text-ink",
  production: "bg-ink text-paper",
  completed: "bg-success/12 text-success",
};

/** Status pill. "proof" reads as an action for the customer, a state for staff. */
export function StageChip({ stage, label }: { stage: Stage; label?: string }) {
  return <span className={`chip ${TONE[stage]}`}>{label ?? STAGE_LABEL[stage]}</span>;
}

export function StageTrack({ stage }: { stage: Stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <div>
      <ol className="grid grid-cols-6 gap-1" aria-label={`Progress: stage ${at + 1} of ${STAGES.length}, ${STAGE_LABEL[stage]}`}>
        {STAGES.map((s, i) => (
          <li key={s} className="min-w-0" aria-current={i === at ? "step" : undefined}>
            <span className={`block h-2 rounded-[1px] ${i < at ? "bg-mat" : i === at ? "bg-blade shadow-[inset_0_0_0_1px_var(--color-blade-deep)]" : "bg-hairline"}`} />
            {/* Six labels do not fit a phone; there the current stage is written out below instead. */}
            <span className={`mt-1.5 hidden truncate text-xs sm:block ${i === at ? "font-semibold text-ink" : "text-steel"}`}>{STAGE_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-xs text-steel sm:hidden" aria-hidden>Stage {at + 1} of {STAGES.length}: <span className="font-semibold text-ink">{STAGE_LABEL[stage]}</span></p>
    </div>
  );
}
