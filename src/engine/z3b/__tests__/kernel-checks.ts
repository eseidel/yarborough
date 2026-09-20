// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The phase 6 gate's instruments around the record builders of
// src/engine/fixtures/records.ts (`snapshotOf`, `decisionOf`): how much of
// the corpus a run checks, and which recorded auctions the registered rules
// reproduce.
//
// While phase 5 has not registered every rule, an auction is comparable only
// where the rules that shaped it are all registered (`coverage`): the meaning
// of a call negates every other call's meaning, so one unregistered rule on
// the way changes every number after it.

import {
  type AuctionSnapshot,
  auctionKey,
  type DroppedCall,
} from "../../fixtures/types";

// --- how much of the corpus a run checks -------------------------------------

/**
 * Every record with YARBOROUGH_FULL_BASELINE=1 in the environment (the whole
 * gate takes minutes); otherwise every `stride`th record, a deterministic
 * sample that keeps `pnpm test` short.  Returns the records to check and how
 * the choice is described.
 */
export function corpusSample<T>(
  records: readonly T[],
  stride: number,
): { checked: T[]; description: string } {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  if (env?.YARBOROUGH_FULL_BASELINE === "1") {
    return { checked: [...records], description: `all ${records.length}` };
  }
  const checked = records.filter((_record, index) => index % stride === 0);
  return {
    checked,
    description: `${checked.length} of ${records.length} (every ${stride}th; YARBOROUGH_FULL_BASELINE=1 checks all)`,
  };
}

// --- coverage ------------------------------------------------------------------

/**
 * Which recorded auctions the registered rules reproduce: with every manifest
 * rule registered, all of them; before that, those whose every proper prefix is
 * recorded with only registered rules (call_to_rule and dropped_calls).
 */
export class Coverage {
  private readonly byKey = new Map<string, AuctionSnapshot>();
  private readonly fullyRegistered = new Map<string, boolean>();
  readonly registered: ReadonlySet<string>;
  readonly complete: boolean;

  constructor(
    snapshots: Iterable<AuctionSnapshot>,
    registered: ReadonlySet<string>,
    complete: boolean,
  ) {
    this.registered = registered;
    this.complete = complete;
    for (const snapshot of snapshots) {
      this.byKey.set(
        auctionKey(snapshot.dealer, snapshot.vulnerability, snapshot.calls),
        snapshot,
      );
    }
  }

  snapshot(dealer: string, vulnerability: string, calls: string) {
    return this.byKey.get(auctionKey(dealer, vulnerability, calls)) ?? null;
  }

  /** Every rule the snapshot's next call could come from is registered. */
  isFullyRegistered(snapshot: AuctionSnapshot): boolean {
    const key = auctionKey(
      snapshot.dealer,
      snapshot.vulnerability,
      snapshot.calls,
    );
    let known = this.fullyRegistered.get(key);
    if (known === undefined) {
      known =
        Object.values(snapshot.call_to_rule).every((rule) =>
          this.registered.has(rule),
        ) &&
        snapshot.dropped_calls.every((dropped: DroppedCall) =>
          dropped.rules.every((rule) => this.registered.has(rule)),
        );
      this.fullyRegistered.set(key, known);
    }
    return known;
  }

  /** The proper prefixes of an auction, shortest first, or null when one is unrecorded. */
  prefixes(
    dealer: string,
    vulnerability: string,
    calls: string,
  ): AuctionSnapshot[] | null {
    const names = calls === "" ? [] : calls.split(" ");
    const prefixes: AuctionSnapshot[] = [];
    for (let length = 0; length < names.length; length++) {
      const prefix = this.snapshot(
        dealer,
        vulnerability,
        names.slice(0, length).join(" "),
      );
      if (!prefix) {
        return null;
      }
      prefixes.push(prefix);
    }
    return prefixes;
  }

  /** The registered rules reproduce the interpretation of this auction. */
  coversAuction(dealer: string, vulnerability: string, calls: string): boolean {
    if (this.complete) {
      return true;
    }
    const prefixes = this.prefixes(dealer, vulnerability, calls);
    return (
      prefixes !== null &&
      prefixes.every((prefix) => this.isFullyRegistered(prefix))
    );
  }

  /** The registered rules reproduce a decision over this auction. */
  coversDecision(
    dealer: string,
    vulnerability: string,
    calls: string,
  ): boolean {
    if (this.complete) {
      return true;
    }
    const snapshot = this.snapshot(dealer, vulnerability, calls);
    return (
      snapshot !== null &&
      this.isFullyRegistered(snapshot) &&
      this.coversAuction(dealer, vulnerability, calls)
    );
  }

  /**
   * The expected snapshot as the registered rules can reproduce it: its
   * call_to_rule and dropped_calls restricted to registered rules (the whole
   * record once the registry is complete).
   */
  expectedSnapshot(snapshot: AuctionSnapshot): AuctionSnapshot {
    if (this.complete) {
      return snapshot;
    }
    const { selector_call_to_rule: _ignored, ...rest } = snapshot;
    return {
      ...rest,
      call_to_rule: Object.fromEntries(
        Object.entries(snapshot.call_to_rule).filter(([, rule]) =>
          this.registered.has(rule),
        ),
      ),
      dropped_calls: snapshot.dropped_calls.filter((dropped) =>
        dropped.rules.every((rule) => this.registered.has(rule)),
      ),
    };
  }

  /** The kernel's snapshot restricted the same way, so the two compare. */
  actualSnapshot(
    actual: AuctionSnapshot,
    expected: AuctionSnapshot,
  ): AuctionSnapshot {
    if (this.complete) {
      return actual;
    }
    return {
      ...actual,
      call_to_rule: Object.fromEntries(
        Object.entries(actual.call_to_rule).filter(
          ([call]) => call in expected.call_to_rule,
        ),
      ),
      dropped_calls: actual.dropped_calls.filter((dropped) =>
        expected.dropped_calls.some((known) => known.call === dropped.call),
      ),
    };
  }
}
