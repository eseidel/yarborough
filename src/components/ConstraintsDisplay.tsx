import { Fragment, type ReactNode } from "react";
import { type StrainName, strainColor, strainSymbol } from "../bridge";

const REPLACEMENTS: [RegExp | string, string][] = [
  [/2o3/g, "at least two of the top three honors"],
  [/3o5/g, "at least three of the top five honors"],
  [/3rS/g, "at least a third-round stopper"],
  [/4rS/g, "at least a fourth-round stopper"],
  ["aces(1)", "1 ace"],
  ["aces(2)", "2 aces"],
  ["aces(3)", "3 aces"],
  ["aces(0 or 4)", "0 or 4 aces"],
  ["kings(1)", "1 king"],
  ["kings(2)", "2 kings"],
  ["kings(3)", "3 kings"],
  ["kings(0 or 4)", "0 or 4 kings"],
];

function formatConstraints(raw: string): string {
  let result = raw;
  for (const [pattern, replacement] of REPLACEMENTS) {
    if (typeof pattern === "string") {
      result = result.split(pattern).join(replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

const STRAIN_CHARS = new Set(["C", "D", "H", "S", "N"]);

function renderConstraints(constraints: string): ReactNode {
  const text = formatConstraints(constraints);
  const elements: ReactNode[] = [];
  let buffer = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : "";

    if (STRAIN_CHARS.has(char) && /[-+0-9]/.test(prevChar)) {
      if (buffer) {
        elements.push(<Fragment key={elements.length}>{buffer}</Fragment>);
        buffer = "";
      }
      const strain = char as StrainName;
      elements.push(
        <span
          key={elements.length}
          className={`${strainColor(strain)} font-semibold`}
        >
          {strainSymbol(strain)}
        </span>,
      );
    } else {
      buffer += char;
    }
  }

  if (buffer) {
    elements.push(<Fragment key={elements.length}>{buffer}</Fragment>);
  }

  return <>{elements}</>;
}

export function ConstraintsDisplay({ constraints }: { constraints?: string }) {
  if (!constraints) return null;
  return <span>{renderConstraints(constraints)}</span>;
}
