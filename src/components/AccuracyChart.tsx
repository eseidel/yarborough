import { useState } from "react";
import type { Block } from "../practice/insights";

const WIDTH = 320;
const HEIGHT = 140;
const PAD = { top: 10, right: 12, bottom: 22, left: 34 };

/**
 * Accuracy over time, one point per block of hands. The soft band behind
 * the points is how far each figure could reasonably be off (wider for
 * fewer calls); the reader sees whether the points are separating or
 * merely wandering without being told a number for it.
 */
export function AccuracyChart({ blocks }: { blocks: Block[] }) {
  const [active, setActive] = useState<number | null>(null);
  const plotted = blocks.filter((b) => b.calls > 0 && b.interval);
  if (plotted.length < 2) return null;

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left +
    (plotted.length === 1
      ? innerWidth / 2
      : (i * innerWidth) / (plotted.length - 1));
  const y = (value: number) => PAD.top + innerHeight * (1 - value);

  const band = [
    ...plotted.map((b, i) => `${x(i)},${y(b.interval!.high)}`),
    ...plotted.map((b, i) => `${x(i)},${y(b.interval!.low)}`).reverse(),
  ].join(" ");
  const line = plotted
    .map((b, i) => `${x(i)},${y(b.matched / b.calls)}`)
    .join(" ");
  const current = active === null ? null : plotted[active];

  return (
    <figure className="m-0" data-testid="accuracy-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Accuracy over time, by block of hands"
        onMouseLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(tick) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="#6b7280"
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        <polygon points={band} fill="#d1fae5" opacity={0.7} />
        <polyline
          points={line}
          fill="none"
          stroke="#047857"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {plotted.map((b, i) => (
          <g key={b.firstHand}>
            <circle
              cx={x(i)}
              cy={y(b.matched / b.calls)}
              r={4}
              fill="#047857"
              stroke="#ffffff"
              strokeWidth={2}
            />
            {/* A hit target wider than the mark. */}
            <rect
              x={x(i) - 12}
              y={PAD.top}
              width={24}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              data-testid={`block-${b.firstHand}`}
            />
          </g>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} fontSize={10} fill="#6b7280">
          Hands {plotted[0].firstHand}–{plotted[0].lastHand}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          fontSize={10}
          fill="#6b7280"
          textAnchor="end"
        >
          Hands {plotted[plotted.length - 1].firstHand}–
          {plotted[plotted.length - 1].lastHand}
        </text>
      </svg>
      <figcaption
        className="text-xs text-gray-500 text-center min-h-[1.25rem]"
        data-testid="chart-caption"
      >
        {current
          ? `Hands ${current.firstHand}–${current.lastHand}: ${current.matched} of ${current.calls} calls on system`
          : "Each point is a block of hands. Tap one for its figures."}
      </figcaption>
    </figure>
  );
}
