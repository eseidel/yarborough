import type {
  CallInterpretation,
  Hand,
  HandAnalysis,
  HandCallAnalysis,
} from "../bridge";
import { callToString } from "../bridge";
import {
  chosenText,
  missesText,
  preferenceText,
} from "../bridge/hand-analysis";
import { CallDisplay } from "./CallDisplay";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { SuitText } from "./SuitText";

const ROW = "flex w-full gap-3.5 px-3.5 text-left";
const BUBBLE =
  "flex shrink-0 items-center justify-center rounded-full font-semibold";
const BIG_BUBBLE = `${BUBBLE} mt-px h-10 w-10 text-sm`;
const TAG =
  "mr-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[11px] font-semibold uppercase tracking-wide";

/** What SAYC means by a call: its rule, its constraints, its description. */
function Meaning({ interp }: { interp: CallInterpretation }) {
  return (
    <>
      {interp.ruleName && (
        <div className="text-sm font-semibold text-gray-900">
          {interp.ruleName}
        </div>
      )}
      {interp.constraints && (
        <div className="text-sm text-gray-700">
          <ConstraintsDisplay constraints={interp.constraints} />
        </div>
      )}
      {interp.description && (
        <div className="text-sm text-gray-500">{interp.description}</div>
      )}
    </>
  );
}

function hasMeaning(interp: CallInterpretation): boolean {
  return Boolean(interp.ruleName || interp.constraints || interp.description);
}

/**
 * One call weighed against the hand: the call SAYC makes and the numbers
 * that qualify it, a call the hand could also make and why SAYC made the
 * other, or a call it doesn't fit and what that call needs.
 */
function WeighedRow({
  weighed,
  hand,
}: {
  weighed: HandCallAnalysis;
  hand: Hand;
}) {
  const { fit } = weighed;
  if (fit === "no_rule" || !hasMeaning(weighed)) {
    return (
      <>
        <span
          className={`${BUBBLE} mx-1 h-8 w-8 bg-gray-100 text-xs text-gray-400`}
        >
          <CallDisplay call={weighed.call} />
        </span>
        <span className="self-center text-[13px] text-gray-400">
          Not a SAYC call here
        </span>
      </>
    );
  }
  const unfit = fit === "unfit" || fit === "planned";
  let why = null;
  if (fit === "chosen") {
    why = (
      <div className="mt-1 text-[13px] leading-snug text-emerald-800">
        <span className={`${TAG} bg-emerald-700 text-white`}>SAYC</span>
        <SuitText text={chosenText(hand, weighed.call)} />
      </div>
    );
  } else if (fit === "possible") {
    why = (
      <div className="mt-1 text-[13px] leading-snug text-gray-600">
        <span
          className={`${TAG} bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200`}
        >
          Fits
        </span>
        <SuitText
          text={
            weighed.preference
              ? preferenceText(weighed.call, weighed.preference)
              : "Fits this hand too."
          }
        />
      </div>
    );
  } else if (fit === "planned") {
    why = (
      <div className="mt-0.5 text-[13px] leading-snug text-gray-500">
        Only bid as part of a plan, such as a slam try.
      </div>
    );
  } else {
    why = (
      <div className="mt-0.5 text-[13px] leading-snug text-gray-500">
        <SuitText text={missesText(weighed.misses)} />
      </div>
    );
  }
  return (
    <>
      <span
        className={`${BIG_BUBBLE} ${unfit ? "bg-gray-100 text-gray-500 [&_span]:opacity-70" : "bg-gray-200"}`}
      >
        <CallDisplay call={weighed.call} />
      </span>
      <span className="min-w-0 pt-px">
        {unfit ? (
          weighed.ruleName && (
            <div className="text-sm font-medium text-gray-500">
              {weighed.ruleName}
            </div>
          )
        ) : (
          <Meaning interp={weighed} />
        )}
        {why}
      </span>
    </>
  );
}

/**
 * Every legal call at a point in an auction with what SAYC would mean by it.
 * With `onSelect` each row is a button that makes the call; without it the
 * list is read-only.
 *
 * Given the hand of the seat to call and the engine's analysis of it, the
 * menu weighs every call against that hand instead. The calls keep their
 * bidding order, so SAYC's call is marked where it stands among the others;
 * each call the hand could also make says why SAYC preferred another, and
 * each call it doesn't fit says what it lacks.
 */
export function CallMenu({
  interpretations,
  onSelect,
  analysis,
  hand,
}: {
  interpretations: CallInterpretation[];
  onSelect?: (interp: CallInterpretation) => void;
  analysis?: HandAnalysis | null;
  hand?: Hand | null;
}) {
  const weighed = analysis && hand ? analysis.calls : null;
  const rows: CallInterpretation[] = weighed ?? interpretations;
  return (
    <div className="divide-y divide-gray-100">
      {rows.map((interp) => {
        const key = callToString(interp.call);
        const fit = weighed ? (interp as HandCallAnalysis).fit : undefined;
        const content =
          weighed && hand ? (
            <WeighedRow weighed={interp as HandCallAnalysis} hand={hand} />
          ) : (
            <>
              <span className={`${BIG_BUBBLE} bg-gray-200`}>
                <CallDisplay call={interp.call} />
              </span>
              <span className="min-w-0 self-center">
                {hasMeaning(interp) ? (
                  <Meaning interp={interp} />
                ) : (
                  <div className="text-sm text-gray-400">
                    Not a SAYC call here
                  </div>
                )}
              </span>
            </>
          );
        const compact = fit === "no_rule" || (fit && !hasMeaning(interp));
        const layout = !fit
          ? "items-center py-3"
          : compact
            ? "items-center py-1.5"
            : "items-start py-3";
        const className = `${ROW} ${layout} ${fit === "chosen" ? "bg-emerald-50" : ""}`;
        return onSelect ? (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(interp)}
            data-testid={`call-row-${key}`}
            data-fit={fit}
            className={`${className} transition-colors ${fit === "chosen" ? "hover:bg-emerald-100/70" : "hover:bg-gray-50 active:bg-gray-100"}`}
          >
            {content}
          </button>
        ) : (
          <div
            key={key}
            className={className}
            data-testid={`call-row-${key}`}
            data-fit={fit}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
