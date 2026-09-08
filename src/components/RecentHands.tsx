import { Link } from "react-router-dom";
import type { HandRecord } from "../practice/record/types";
import { handOnSystem } from "../practice/stats";
import { describeContract } from "../practice/insights";
import { SuitText } from "./SuitText";

/** The families of call the user missed in a hand, without repeats. */
function missedFamilies(hand: HandRecord): string[] {
  const families = new Set<string>();
  for (const verdict of hand.verdicts) {
    if (verdict.matched || verdict.assisted) continue;
    families.add(verdict.category[1] ?? verdict.saycCall);
  }
  return [...families];
}

function formatDate(completedAt: number): string {
  return new Date(completedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** The latest hands, newest first, each opening its review. */
export function RecentHands({
  hands,
  limit = 20,
}: {
  hands: HandRecord[];
  limit?: number;
}) {
  const recent = hands.slice(-limit).reverse();
  if (recent.length === 0) {
    return <p className="text-sm text-gray-500">No hands bid yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100" data-testid="recent-hands">
      {recent.map((hand) => {
        const onSystem = handOnSystem(hand);
        const missed = missedFamilies(hand);
        return (
          <li key={hand.id ?? hand.completedAt}>
            <Link
              to={`/bid/${hand.boardId}:${hand.calls.join(",")}`}
              className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="font-semibold text-gray-800">
                  <SuitText text={describeContract(hand)} />
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {onSystem
                    ? "On system"
                    : missed.length > 0
                      ? `Missed: ${missed.join(", ")}`
                      : "SAYC bid shown"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                {formatDate(hand.completedAt)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
