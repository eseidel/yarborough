// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/callexplorer.py.

import { assert } from "./assert";
import { Call } from "./call";
import { CallHistory } from "./callhistory";
import { compareStrains, STRAINS } from "./suit";

export class CallExplorer {
  /** Every call that could legally be made over `history`, in call order. */
  possibleCallsOver(history: CallHistory): Call[] {
    const calls: Call[] = [];
    if (history.isComplete()) {
      return calls;
    }

    calls.push(Call.fromString("P"));

    const lastNonPass = history.lastNonPass();
    const caller = history.positionToCall();
    if (lastNonPass && history.lastToNotPass() !== caller.partner) {
      if (lastNonPass.isContract()) {
        calls.push(Call.fromString("X"));
      } else if (lastNonPass.isDouble()) {
        calls.push(Call.fromString("XX"));
      }
    }

    const lastContract = history.lastContract();
    for (let level = 1; level < 8; level++) {
      if (lastContract && level < lastContract.level!) {
        continue;
      }
      for (const strain of STRAINS) {
        if (
          lastContract &&
          level === lastContract.level &&
          compareStrains(strain, lastContract.strain!) <= 0
        ) {
          continue;
        }
        calls.push(Call.fromLevelAndStrain(level, strain));
      }
    }
    return calls;
  }

  possibleFutures(history: CallHistory): CallHistory[] {
    return this.possibleCallsOver(history).map(
      (call) =>
        new CallHistory(
          [...history.calls, call],
          history.dealer,
          history.vulnerability,
        ),
    );
  }

  private _splitBeforeLastToken(
    string: string,
    delimiter = " ",
  ): [string, string] {
    const lastDelimiterIndex = string.lastIndexOf(delimiter);
    if (lastDelimiterIndex === -1) {
      return ["", string];
    }
    return [
      string.substring(0, lastDelimiterIndex),
      string.substring(lastDelimiterIndex + 1),
    ];
  }

  private _hasWildcards(string: string): boolean {
    return string.includes("*");
  }

  private _matchPatternOver(history: CallHistory, pattern: string): Call[] {
    // FIXME: We could support fancier pattern matching.
    assert(pattern === "*");
    return this.possibleCallsOver(history);
  }

  private _globHelper(history: CallHistory, callName: string): Call[] {
    // callName can be empty if the original string is empty or there is trailing whitespace.
    if (callName) {
      const call = Call.fromString(callName);
      if (call && history.isLegalCall(call)) {
        return [call];
      }
    }
    return [];
  }

  // FIXME: Unclear if historyIglob should be so tolerant.
  private _normalizeGlobString(globString: string): string {
    // Leading/trailing whitespace will confuse our algorithm.
    return globString.replaceAll(",", " ").replaceAll("  ", " ").trim();
  }

  historyIglob(globString: string): CallHistory[] {
    globString = this._normalizeGlobString(globString);
    const [prefix, lastToken] = this._splitBeforeLastToken(globString);
    const histories = this._hasWildcards(prefix)
      ? this.historyIglob(prefix)
      : [CallHistory.fromString(prefix)];
    const callGenerator = this._hasWildcards(lastToken)
      ? (history: CallHistory) => this._matchPatternOver(history, lastToken)
      : (history: CallHistory) => this._globHelper(history, lastToken);

    const results: CallHistory[] = [];
    for (const history of histories) {
      // If we already have 3 passes in a row, there is nothing more we can add to this history.
      if (history.isComplete()) {
        continue;
      }
      for (const call of callGenerator(history)) {
        results.push(history.copyAppendingCall(call));
      }
    }
    return results;
  }

  historyGlob(globString: string): CallHistory[] {
    return this.historyIglob(globString);
  }
}
