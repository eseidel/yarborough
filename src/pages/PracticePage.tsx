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
import { PracticeReview } from "../components/PracticeReview";
import { ShareButton } from "../components/ShareButton";
import { parseBoardId } from "../bridge/identifier";
import { useHandAnalysis } from "../practice/useHandAnalysis";
import {
  type ParsedBoard,
  usePracticeSession,
} from "../practice/usePracticeSession";
import { initAnalytics, trackPageView } from "../analytics";
import { setCanonical, setTitle, CANONICAL_ORIGIN } from "../seo";
import { SECONDARY_BUTTON, TEXT_BUTTON } from "../components/ui";
import { foundOnRetry } from "../practice/verdicts";

const USER_POSITION = "S";

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
  const hand = handForPosition(deal, USER_POSITION);

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
  const { heldVerdict } = session;
  const verdictMarks = showVerdicts
    ? Object.fromEntries(
        [...verdicts, ...(heldVerdict ? [heldVerdict] : [])].map(
          (v): [number, boolean | "retried"] => [
            v.index,
            foundOnRetry(v) ? "retried" : v.matched,
          ],
        ),
      )
    : undefined;
  // Only a miss held out of the auction gets a box: once the user keeps it,
  // the box goes and the call table's mark is all that remains of it.
  const latestVerdict = heldVerdict;

  // The user's hand weighed where it explains a miss, and where they asked
  // for SAYC's call. Never on the options sheet: that lists what each call
  // means and leaves the choice to the learner.
  const feedbackAnalysis = useHandAnalysis(
    latestVerdict && !latestVerdict.matched
      ? { hand, history, index: latestVerdict.index, vulnerability }
      : null,
  );
  const hintAnalysis = useHandAnalysis(
    session.hintShown && userToCall
      ? { hand, history, index: history.calls.length, vulnerability }
      : null,
  );

  // The bare board, without the auction so far: the recipient bids it themselves.
  const shareUrl = `${CANONICAL_ORIGIN}/bid/${session.baseId}`;
  const optionsAreLive =
    session.options !== null &&
    session.canBid &&
    session.options.history === history &&
    session.options.index === history.calls.length;

  // A hand is bid from the top of the page, where the board line, the
  // auction and the bidding box are. Starting one from the review leaves
  // the window at the foot of a page that has just been replaced.
  const fromTheTop = (start: () => void) => () => {
    start();
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {session.error && (
        <ErrorBar
          message={session.error}
          onDismiss={() => session.setError(null)}
        />
      )}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-3">
        <PracticeHeader
          boardNumber={parsed.boardNumber}
          dealer={parsed.dealer}
          vulnerability={vulnerability}
          focus={session.dealType}
          pendingFocus={session.pendingFocus}
          onFocusChange={session.changeFocus}
          adaptive={session.adaptive}
          onShowAllWeakSpots={session.showAllWeakSpots}
        />
        {!auctionDone && (
          <ProgressStrip
            summary={session.summary}
            onReset={session.resetProgress}
          />
        )}

        <CallTable
          callHistory={session.heldHistory ?? history}
          held={session.held !== null}
          vulnerability={vulnerability}
          userPosition={USER_POSITION}
          verdicts={verdictMarks}
          thinking={thinking}
          onCallClick={explanation.handleCallClick}
          selectedCallIndex={explanation.selectedCallIndex}
          callExplanation={explanation.callExplanation}
          explanationLoading={explanation.explanationLoading}
          handReasons={explanation.handReasons}
          onShowOptions={(index) => session.showOptions({ history, index })}
          onPendingClick={
            userToCall
              ? () =>
                  session.showOptions({ history, index: history.calls.length })
              : undefined
          }
        />

        {!auctionDone && (
          <>
            {latestVerdict && (
              <CallFeedback
                // Each miss is a new box, and arrives as one.
                key={latestVerdict.index}
                verdict={latestVerdict}
                hand={hand}
                analysis={feedbackAnalysis}
                onShowOptions={() =>
                  session.showOptions({ history, index: latestVerdict.index })
                }
                onDefer={() => session.setFeedbackTiming("end")}
                onTryAgain={session.tryAgain}
                onKeep={session.keep}
              />
            )}
            {session.hintShown && !session.held && (
              <SaycHint
                suggestion={session.suggestion}
                hand={hand}
                analysis={hintAnalysis}
                onBid={session.bid}
              />
            )}
            <CardFan hand={hand} position={USER_POSITION} />
            <BiddingBox
              onBid={session.bid}
              callHistory={history}
              disabled={!session.canBid}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  session.showOptions({ history, index: history.calls.length })
                }
                disabled={!userToCall}
                className={`${SECONDARY_BUTTON} flex-1`}
              >
                Options
              </button>
              <button
                type="button"
                onClick={
                  session.hintShown ? session.hideSaycBid : session.showSaycBid
                }
                disabled={!session.canBid}
                className={`${SECONDARY_BUTTON} flex-1`}
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
                Undo bid
              </button>
              <button
                type="button"
                onClick={fromTheTop(session.restart)}
                className={TEXT_BUTTON}
              >
                Restart hand
              </button>
              <button
                type="button"
                onClick={fromTheTop(() => session.dealNext("skip hand"))}
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

        {auctionDone ? (
          <PracticeReview
            deal={deal}
            boardNumber={parsed.boardNumber}
            dealer={parsed.dealer}
            history={history}
            verdicts={verdicts}
            userPosition={USER_POSITION}
            saycAuction={session.saycAuction}
            vulnerability={vulnerability}
            doubleDummy={session.doubleDummy}
            summary={session.summary}
            feedbackTiming={feedbackTiming}
            thinking={thinking}
            shareUrl={shareUrl}
            onShowOptions={(pointHistory, index) =>
              session.showOptions({ history: pointHistory, index })
            }
            onError={session.reportError}
            onShowFeedbackEachCall={() =>
              session.setFeedbackTiming("immediate")
            }
            onNextHand={fromTheTop(() => session.dealNext("next hand"))}
            onRestart={fromTheTop(session.restart)}
          />
        ) : (
          <AboutFooter />
        )}
      </div>

      {session.options && (
        <OptionsSheet
          point={session.options}
          vulnerability={vulnerability}
          onExplore={() => session.exploreFrom(session.options!)}
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
