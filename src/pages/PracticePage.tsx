import { useEffect, useMemo } from "react";
import { useParams, Navigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CardFan } from "../components/CardFan";
import { CallTable } from "../components/CallTable";
import { BiddingBox } from "../components/BiddingBox";
import { handForPosition } from "../bridge";
import { AboutFooter } from "../components/AboutFooter";
import { PracticeHeader } from "../components/PracticeHeader";
import { ProgressStrip } from "../components/ProgressStrip";
import { CallFeedback } from "../components/CallFeedback";
import { SaycHint } from "../components/SaycHint";
import { OptionsSheet } from "../components/OptionsSheet";
import { ReviewSummary } from "../components/ReviewSummary";
import { PlayAnalysis } from "../components/PlayAnalysis";
import { HandDiagram } from "../components/HandDiagram";
import { ShareButton } from "../components/ShareButton";
import { parseBoardId } from "../bridge/identifier";
import {
  type ParsedBoard,
  usePracticeSession,
} from "../practice/usePracticeSession";
import { initAnalytics, trackPageView } from "../analytics";
import { setCanonical, setTitle, CANONICAL_ORIGIN } from "../seo";

const USER_POSITION = "S";

const PRIMARY_BUTTON =
  "w-full py-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-base transition-colors disabled:opacity-50";
const SECONDARY_BUTTON =
  "flex-1 py-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const TEXT_BUTTON = "text-sm text-gray-500 hover:text-gray-800 hover:underline";

export function PracticePage({ boardId: boardIdProp }: { boardId?: string }) {
  const { boardId: boardIdParam } = useParams<{ boardId: string }>();
  // The root route has no :boardId in the URL and supplies one instead.
  const boardId = boardIdParam ?? boardIdProp;

  const parsed = useMemo(
    () => (boardId ? parseBoardId(boardId) : null),
    [boardId],
  );

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView();
  }, [boardId]);

  if (!parsed || !boardId) {
    // Only reachable from a hand-edited /bid/<board> URL; the id the root
    // route generates always parses.
    return boardIdParam ? <Navigate to="/" replace /> : null;
  }

  return (
    <PracticeBoard
      boardId={boardId}
      parsed={parsed}
      canonicalPath={boardIdParam ? `/bid/${boardIdParam}` : "/"}
    />
  );
}

function PracticeBoard({
  boardId,
  parsed,
  canonicalPath,
}: {
  boardId: string;
  parsed: ParsedBoard;
  canonicalPath: string;
}) {
  const session = usePracticeSession(boardId, parsed, USER_POSITION);
  const {
    history,
    thinking,
    auctionDone,
    userToCall,
    explanation,
    verdicts,
    feedbackTiming,
  } = session;
  const { deal, vulnerability } = parsed;

  useEffect(() => {
    setTitle(
      auctionDone
        ? "Bidding Results - SAYC Bridge"
        : "Bidding Practice - SAYC Bridge",
    );
    // Board permalinks canonicalize to themselves; eleven of them are indexed
    // and earn traffic. See src/seo.ts.
    setCanonical(canonicalPath);
  }, [auctionDone, canonicalPath]);

  const showVerdicts = auctionDone || feedbackTiming === "immediate";
  const verdictMarks = showVerdicts
    ? Object.fromEntries(verdicts.map((v) => [v.index, v.matched]))
    : undefined;
  // The verdict on the user's latest call, once the engine has it.
  const latestVerdict =
    !auctionDone && feedbackTiming === "immediate" && session.verdictsComplete
      ? (verdicts[verdicts.length - 1] ?? null)
      : null;

  // The bare board, without the auction so far: the recipient bids it themselves.
  const shareUrl = `${CANONICAL_ORIGIN}/bid/${session.baseId}`;
  const optionsAreLive =
    session.options !== null &&
    userToCall &&
    session.options.history === history &&
    session.options.index === history.calls.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {session.error && (
        <ErrorBar
          message={session.error}
          onDismiss={() => session.setError(null)}
        />
      )}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        <PracticeHeader
          boardNumber={parsed.boardNumber}
          dealer={parsed.dealer}
          vulnerability={vulnerability}
          focus={session.dealType}
          pendingFocus={session.pendingFocus}
          onFocusChange={session.changeFocus}
        />
        <ProgressStrip
          summary={session.summary}
          onReset={session.resetProgress}
        />

        <CallTable
          callHistory={history}
          vulnerability={vulnerability}
          userPosition={USER_POSITION}
          verdicts={verdictMarks}
          thinking={thinking}
          onCallClick={explanation.handleCallClick}
          selectedCallIndex={explanation.selectedCallIndex}
          callExplanation={explanation.callExplanation}
          explanationLoading={explanation.explanationLoading}
          onShowOptions={(index) => session.showOptions({ history, index })}
        />

        {!auctionDone && (
          <>
            {latestVerdict && (
              <CallFeedback
                verdict={latestVerdict}
                onShowOptions={() =>
                  session.showOptions({ history, index: latestVerdict.index })
                }
                onDefer={() => session.setFeedbackTiming("end")}
              />
            )}
            {session.hintShown && (
              <SaycHint suggestion={session.suggestion} onBid={session.bid} />
            )}
            <CardFan
              hand={handForPosition(deal, USER_POSITION)}
              position={USER_POSITION}
            />
            <BiddingBox
              onBid={session.bid}
              callHistory={history}
              disabled={!userToCall}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  session.showOptions({ history, index: history.calls.length })
                }
                disabled={!userToCall}
                className={SECONDARY_BUTTON}
              >
                Options
              </button>
              <button
                type="button"
                onClick={
                  session.hintShown ? session.hideSaycBid : session.showSaycBid
                }
                disabled={!userToCall}
                className={SECONDARY_BUTTON}
              >
                {session.hintShown ? "Hide SAYC bid" : "Show SAYC bid"}
              </button>
            </div>
            <div className="flex justify-center gap-5">
              <button
                type="button"
                onClick={session.takeBack}
                disabled={!session.canTakeBack}
                className={`${TEXT_BUTTON} disabled:opacity-40 disabled:no-underline`}
              >
                Take back
              </button>
              <button
                type="button"
                onClick={session.restart}
                className={TEXT_BUTTON}
              >
                Restart hand
              </button>
              <button
                type="button"
                onClick={() => session.dealNext("skip hand")}
                className={TEXT_BUTTON}
              >
                Skip hand
              </button>
              <ShareButton
                url={shareUrl}
                title="SAYC Bridge Practice Hand"
                text="Try bidding this bridge hand"
                className={TEXT_BUTTON}
              />
            </div>
          </>
        )}

        {auctionDone && (
          <>
            <ReviewSummary
              history={history}
              verdicts={verdicts}
              userPosition={USER_POSITION}
              saycAuction={session.saycAuction}
              vulnerability={vulnerability}
              onShowOptions={(pointHistory, index) =>
                session.showOptions({ history: pointHistory, index })
              }
              onError={session.reportError}
            />
            <PlayAnalysis
              history={history}
              analysis={session.doubleDummy?.analysis ?? null}
              loading={session.doubleDummy === null}
              error={session.doubleDummy?.error ?? null}
              userSide="NS"
            />
            <HandDiagram deal={deal} userPosition={USER_POSITION} />
            {feedbackTiming === "end" && (
              <button
                type="button"
                onClick={() => session.setFeedbackTiming("immediate")}
                className={`${TEXT_BUTTON} text-center`}
              >
                Show feedback after each call instead
              </button>
            )}
            <button
              type="button"
              onClick={() => session.dealNext("next hand")}
              disabled={thinking}
              className={PRIMARY_BUTTON}
            >
              Next hand
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={session.restart}
                className={SECONDARY_BUTTON}
              >
                Bid again
              </button>
              <ShareButton
                url={shareUrl}
                title="SAYC Bridge Practice Hand"
                text="Try bidding this bridge hand"
                className={SECONDARY_BUTTON}
              />
            </div>
          </>
        )}

        <AboutFooter />
      </div>

      {session.options && (
        <OptionsSheet
          point={session.options}
          vulnerability={vulnerability}
          onSelect={
            optionsAreLive
              ? (interpretation) => session.bid(interpretation.call)
              : undefined
          }
          onClose={session.closeOptions}
        />
      )}
    </div>
  );
}
