import { SuitText } from "./SuitText";

/**
 * What the user's own hand says about a call, a sentence a line. Nothing
 * while there is nothing to say, so a box that waits on the engine does not
 * hold an empty line open.
 */
export function HandReasons({
  lines,
  className = "",
}: {
  lines: string[];
  className?: string;
}) {
  if (!lines.length) return null;
  return (
    // The engine often weighs the hand after the box around it has opened.
    <div
      className={`animate-fade space-y-0.5 ${className}`}
      data-testid="hand-reasons"
    >
      {lines.map((line) => (
        <div key={line}>
          <SuitText text={line} />
        </div>
      ))}
    </div>
  );
}
