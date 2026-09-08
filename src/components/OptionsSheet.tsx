import { useEffect, useState } from "react";
import type { CallHistory, CallInterpretation } from "../bridge/types";
import { callLabel, callToString } from "../bridge/types";
import { getCallInterpretations } from "../bridge/engine";
import { CallMenu } from "./CallMenu";
import { SuitText } from "./SuitText";

/** A point in an auction: the calls made before the one being looked at. */
export interface AuctionPoint {
  history: CallHistory;
  /** Index of the call whose alternatives are shown; `calls.length` for the pending call. */
  index: number;
}

/**
 * The explorer, in place: every legal call at a point in the auction with
 * what SAYC would mean by it. For the pending call, tapping an option makes
 * that call; for an earlier point the list is read-only.
 */
export function OptionsSheet({
  point,
  vulnerability,
  onSelect,
  onClose,
}: {
  point: AuctionPoint;
  vulnerability: string;
  /** Present only when the point is the pending call of the live auction. */
  onSelect?: (interpretation: CallInterpretation) => void;
  onClose: () => void;
}) {
  const { history, index } = point;
  const before = history.calls.slice(0, index);
  const prefix = before.map(callToString).join(",");
  const requestKey = `${history.dealer}:${vulnerability}:${prefix}`;

  // Keyed by the point it answers, so a stale result is never shown for a
  // new point and the loading state needs no reset of its own.
  const [loaded, setLoaded] = useState<{
    key: string;
    interpretations: CallInterpretation[] | null;
    error: string | null;
  } | null>(null);
  const current = loaded?.key === requestKey ? loaded : null;

  useEffect(() => {
    let cancelled = false;
    getCallInterpretations(prefix, history.dealer, vulnerability)
      .then((result) => {
        if (!cancelled) {
          setLoaded({ key: requestKey, interpretations: result, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            interpretations: null,
            error: String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [prefix, history.dealer, vulnerability, requestKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    before.length === 0
      ? "Options as opener"
      : `Options after ${before.slice(-4).map(callLabel).join(" · ")}`;

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40"
      onClick={onClose}
      data-testid="options-sheet"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md max-h-[80vh] flex flex-col bg-white rounded-t-2xl shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="font-semibold text-gray-900">
              <SuitText text={title} />
            </div>
            <div className="text-xs text-gray-500">
              {onSelect
                ? "What each call would say. Tap one to bid it."
                : "What each call would have said here."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full text-gray-500 hover:bg-gray-100 text-xl"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto">
          {current?.error ? (
            <div className="p-4 text-sm text-red-700">
              The options could not be loaded: {current.error}
            </div>
          ) : !current?.interpretations ? (
            <div className="p-4 text-center text-gray-400 animate-pulse">
              Loading…
            </div>
          ) : (
            <CallMenu
              interpretations={current.interpretations}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
