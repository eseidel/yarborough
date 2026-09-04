import { useState } from "react";
import { Link } from "react-router-dom";
import { type Summary, formatAccuracy } from "../practice/stats";
import type { HandSource } from "../practice/record/types";
import { FOCUS_OPTIONS } from "../practice/focus";

const SOURCE_OPTIONS: { value: HandSource; label: string }[] = [
  ...FOCUS_OPTIONS,
  { value: "Adaptive", label: "Weak spots" },
];

/**
 * The learner's record: accuracy across checked calls, hands bid, and the
 * streak of hands bid entirely on system. Expands to a breakdown by focus.
 */
export function ProgressStrip({
  summary,
  onReset,
}: {
  summary: Summary;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const total = summary;
  if (total.hands === 0) return null;

  const sources = SOURCE_OPTIONS.filter(
    (option) => (summary.bySource[option.value]?.hands ?? 0) > 0,
  );

  return (
    <div
      className="bg-white rounded-lg shadow text-sm"
      data-testid="progress-strip"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-3">
          <span>
            <span className="font-bold text-emerald-700 tabular-nums">
              {formatAccuracy(total)}
            </span>{" "}
            <span className="text-gray-500">on system</span>
          </span>
          <span className="text-gray-700 tabular-nums">
            {total.hands} {total.hands === 1 ? "hand" : "hands"}
          </span>
          {summary.streak > 0 && (
            <span className="text-amber-700 tabular-nums" title="Streak">
              🔥 {summary.streak}
            </span>
          )}
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2"
          data-testid="progress-details"
        >
          <p className="text-xs text-gray-500">
            {total.matched} of {total.calls} checked calls matched SAYC.{" "}
            {total.handsOnSystem} of {total.hands} hands bid entirely on system;
            best streak {summary.bestStreak}. Calls made after seeing the SAYC
            bid are not counted. Kept on this device only.
          </p>
          {sources.length > 1 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-semibold py-0.5">Focus</th>
                  <th className="text-right font-semibold py-0.5">Hands</th>
                  <th className="text-right font-semibold py-0.5">On system</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((option) => {
                  const stats = summary.bySource[option.value]!;
                  return (
                    <tr
                      key={option.value}
                      data-testid={`focus-${option.value}`}
                    >
                      <td className="py-0.5">{option.label}</td>
                      <td className="text-right tabular-nums">{stats.hands}</td>
                      <td className="text-right tabular-nums">
                        {formatAccuracy(stats)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex gap-4 text-xs">
            <Link
              to="/progress"
              className="text-emerald-700 font-semibold hover:underline"
            >
              See your progress
            </Link>
            <button
              type="button"
              onClick={onReset}
              className="text-gray-500 hover:text-red-700 hover:underline"
            >
              Reset progress
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
