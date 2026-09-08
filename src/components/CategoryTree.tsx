import { useState } from "react";
import {
  type NodeStats,
  describeAccuracy,
  describeSample,
  describeTrend,
  describeVerdict,
} from "../practice/insights";

function VerdictBadge({ node }: { node: NodeStats }) {
  const text = describeVerdict(node);
  if (!text) return null;
  const weak = node.verdict === "weak spot";
  return (
    <span
      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
        weak ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {text}
    </span>
  );
}

/** One line of a category: name, a thin bar, the figure, and any verdict. */
export function CategoryRow({
  node,
  onPractice,
}: {
  node: NodeStats;
  onPractice?: (node: NodeStats) => void;
}) {
  const share = node.calls === 0 ? 0 : node.matched / node.calls;
  const trend = describeTrend(node.trend);
  return (
    <div
      className={`py-1.5 ${node.calls === 0 ? "opacity-50" : ""}`}
      data-testid={`category-${node.path.join("/")}`}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-gray-800 truncate">{node.name}</span>
        <span className="flex items-center gap-2 shrink-0">
          <VerdictBadge node={node} />
          <span className="tabular-nums text-gray-800 font-semibold w-11 text-right">
            {node.calls === 0 ? "–" : describeAccuracy(node)}
          </span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded ${node.verdict === "weak spot" ? "bg-red-400" : "bg-emerald-500"}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
        <span>
          {describeSample(node.calls)}
          {node.calls > 0 && trend !== "Holding steady" && ` · ${trend}`}
        </span>
        {onPractice && node.verdict === "weak spot" && (
          <button
            type="button"
            onClick={() => onPractice(node)}
            className="text-emerald-700 font-semibold hover:underline"
          >
            Practice this
          </button>
        )}
      </div>
    </div>
  );
}

function Branch({
  node,
  depth,
  onPractice,
}: {
  node: NodeStats;
  depth: number;
  onPractice?: (node: NodeStats) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  return (
    <div className={depth > 0 ? "pl-3 border-l border-gray-100" : ""}>
      <div className="flex items-start gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
            className="mt-2 w-5 h-5 shrink-0 text-gray-400 hover:text-gray-700 text-xs"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <CategoryRow node={node} onPractice={onPractice} />
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <Branch
            key={child.name}
            node={child}
            depth={depth + 1}
            onPractice={onPractice}
          />
        ))}
    </div>
  );
}

/**
 * Every kind of call the user has met, as a tree: what they were doing, the
 * family of call, the call itself. Collapsed to the top level; each level
 * opens on tap.
 */
export function CategoryTree({
  tree,
  onPractice,
}: {
  tree: NodeStats[];
  onPractice?: (node: NodeStats) => void;
}) {
  if (tree.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nothing here yet. Kinds of call appear as you meet them.
      </p>
    );
  }
  return (
    <div data-testid="category-tree">
      {tree.map((node) => (
        <Branch key={node.name} node={node} depth={0} onPractice={onPractice} />
      ))}
    </div>
  );
}
