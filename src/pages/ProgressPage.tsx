import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { AboutFooter } from "../components/AboutFooter";
import { AccuracyChart } from "../components/AccuracyChart";
import { CategoryRow, CategoryTree } from "../components/CategoryTree";
import { RecentHands } from "../components/RecentHands";
import { useRecord } from "../practice/record/useRecord";
import {
  type Insights,
  type NodeStats,
  computeInsights,
  describeAccuracy,
  describeSample,
  describeTrend,
} from "../practice/insights";
import { initAnalytics, trackEvent, trackPageView } from "../analytics";
import { setCanonical, setTitle } from "../seo";

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="bg-white rounded-lg shadow p-3 space-y-2"
      data-testid={testId}
    >
      <h2 className="font-bold text-xs text-gray-500 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Overall({ insights }: { insights: Insights }) {
  const { overall } = insights;
  const trend = describeTrend(overall.trend);
  const improving = overall.trend?.label.includes("improving");
  const slipping = overall.trend?.label.includes("slipping");
  return (
    <Section title="Overall" testId="overall">
      <div className="flex items-baseline gap-3">
        <span
          className="text-4xl font-bold text-gray-900 tabular-nums"
          data-testid="overall-accuracy"
        >
          {describeAccuracy(overall)}
        </span>
        <span className="text-sm text-gray-600">
          of your calls were the SAYC bid,{" "}
          <span className="whitespace-nowrap">
            {describeSample(overall.calls)}
          </span>
        </span>
      </div>
      <p
        className={`text-sm font-semibold ${
          improving
            ? "text-emerald-700"
            : slipping
              ? "text-red-700"
              : "text-gray-700"
        }`}
        data-testid="overall-trend"
      >
        {overall.calls < 2 ? "Bid a few hands to see a trend." : trend}
      </p>
      <p className="text-sm text-gray-600" data-testid="overall-hands">
        {overall.hands} {overall.hands === 1 ? "hand" : "hands"} bid,{" "}
        {overall.handsOnSystem} entirely on system.
        {overall.streak > 0 && ` Current streak ${overall.streak}.`}
        {overall.bestStreak > 1 && ` Best streak ${overall.bestStreak}.`}
      </p>
      <AccuracyChart blocks={insights.blocks} />
    </Section>
  );
}

function Highlights({
  title,
  nodes,
  empty,
  testId,
  onPractice,
}: {
  title: string;
  nodes: NodeStats[];
  empty: string;
  testId: string;
  onPractice?: (node: NodeStats) => void;
}) {
  return (
    <Section title={title} testId={testId}>
      {nodes.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {nodes.map((node) => (
            <div key={node.path.join("/")}>
              <div className="text-[11px] text-gray-400 pt-1.5 -mb-1">
                {node.path[0]}
              </div>
              <CategoryRow node={node} onPractice={onPractice} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The Progress tab: how the user is doing at bidding, in their terms. What
 * is going well, what needs work, whether they are improving, and the
 * hands behind it. The statistics stay behind the words.
 */
export function ProgressPage({
  onPractice,
}: {
  /** Start adaptive practice on a weak spot; absent until that mode exists. */
  onPractice?: (node: NodeStats) => void;
}) {
  const record = useRecord();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const insights = useMemo(() => computeInsights(record.hands), [record.hands]);

  useEffect(() => {
    initAnalytics();
    setTitle("Your Progress - SAYC Bridge");
    setCanonical("/progress");
    trackPageView();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        {record.loading ? (
          <p className="text-center text-sm text-gray-400 animate-pulse">
            Loading your record…
          </p>
        ) : insights.overall.hands === 0 ? (
          <div
            className="bg-white rounded-lg shadow p-4 text-sm text-gray-700 space-y-2"
            data-testid="no-record"
          >
            <p className="font-semibold text-gray-900">No hands bid yet.</p>
            <p>
              Bid a few hands on the Practice tab and this page will show where
              you are strong, what needs work, and how you are getting on over
              time. Everything stays on this device.
            </p>
            <Link
              to="/"
              className="inline-block mt-1 px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold"
            >
              Practice
            </Link>
          </div>
        ) : (
          <>
            <Overall insights={insights} />
            <Highlights
              title="Worth working on"
              nodes={insights.opportunities}
              empty="Nothing stands out yet. Keep bidding and this will fill in."
              testId="opportunities"
              onPractice={onPractice}
            />
            <Highlights
              title="Going well"
              nodes={insights.strengths}
              empty="Nothing stands out yet."
              testId="strengths"
            />
            <Section title="Every kind of call" testId="all-categories">
              <CategoryTree tree={insights.tree} onPractice={onPractice} />
            </Section>
            <Section title="Recent hands" testId="recent">
              <RecentHands hands={record.hands} />
            </Section>
          </>
        )}
        {!record.loading && (
          <Section title="Your data" testId="your-data">
            <p className="text-sm text-gray-600">
              Your record lives only on this device
              {record.available
                ? ""
                : ", and this browser cannot keep it between visits"}
              .
            </p>
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  trackEvent("Progress", "Export");
                  downloadJson("sayc-bridge-hands.json", record.hands);
                }}
                disabled={record.hands.length === 0}
                className="text-emerald-700 font-semibold hover:underline disabled:opacity-40"
              >
                Export as JSON
              </button>
              {confirmingReset ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("Progress", "Reset");
                      void record.clearHands();
                      setConfirmingReset(false);
                    }}
                    className="text-red-700 font-semibold hover:underline"
                  >
                    Yes, delete everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="text-gray-500 hover:underline"
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  disabled={record.hands.length === 0}
                  className="text-gray-500 hover:text-red-700 hover:underline disabled:opacity-40"
                >
                  Reset
                </button>
              )}
            </div>
          </Section>
        )}
        <AboutFooter />
      </div>
    </div>
  );
}
