import { useId, useState } from "react";
import type { PointRule } from "../bridge/types";
import {
  POINT_RULE_EXPLANATIONS,
  POINT_RULE_NAMES,
} from "../bridge/hand-analysis";

/**
 * A point rule the miss card named, with a way to read what it is: "What's
 * the Rule of 20?" opens a note for someone meeting the rule the first time.
 */
export function PointRuleNote({
  rule,
  className = "",
}: {
  rule: PointRule;
  /** The link's color, to sit in the box around it. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const name = POINT_RULE_NAMES[rule];
  return (
    <div data-testid="point-rule-note">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`text-xs font-medium hover:underline underline-offset-2 ${className}`}
      >
        What's the {name}?
      </button>
      {open && (
        <div
          id={panelId}
          className="animate-fade mt-1 space-y-1 rounded-lg bg-white/70 p-2 text-xs text-gray-700"
        >
          {POINT_RULE_EXPLANATIONS[rule].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  );
}
