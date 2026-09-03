// Double-dummy results for a deal, computed in the browser by DDS (native/dds).

import type { Card, Deal, Position, StrainName } from "../bridge/types";
import { WorkerRpcClient } from "../bridge/worker-rpc-client";
import type { DdsMethod } from "./dds-protocol";
import {
  type DoubleDummyTable,
  ddsHandIndex,
  ddsRankValue,
  ddsStrainIndex,
  dealToPbn,
  parseDoubleDummyTable,
  pbnWithoutCard,
} from "./dds-core";

let client: WorkerRpcClient<DdsMethod> | undefined;

export interface DdsRequester {
  request(
    method: DdsMethod,
    arguments_: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface DoubleDummySolver {
  /** Tricks for every strain and declarer with all four hands in view. */
  getTable(deal: Deal): Promise<DoubleDummyTable>;
  /**
   * Declarer's tricks when the opening leader leads `lead` and both sides play
   * double-dummy from the second card on. The leader is declarer's left-hand
   * opponent; `lead` must be one of the leader's cards.
   */
  getTricksAfterLead(
    deal: Deal,
    strain: StrainName,
    declarer: Position,
    lead: Card,
  ): Promise<number>;
}

const POSITION_ORDER: readonly Position[] = ["N", "E", "S", "W"];

export function leaderAgainst(declarer: Position): Position {
  return POSITION_ORDER[(POSITION_ORDER.indexOf(declarer) + 1) % 4];
}

function ddsClient(): WorkerRpcClient<DdsMethod> {
  client ??= new WorkerRpcClient<DdsMethod>(
    () =>
      new Worker(new URL("./dds.worker.ts", import.meta.url), {
        type: "module",
      }),
  );
  return client;
}

export function createDoubleDummySolver(
  requester: DdsRequester,
): DoubleDummySolver {
  return {
    async getTable(deal: Deal): Promise<DoubleDummyTable> {
      const result = await requester.request("calc_dd_table", {
        pbn: dealToPbn(deal),
      });
      if (typeof result !== "string") {
        throw new Error("The double-dummy solver returned an invalid table");
      }
      return parseDoubleDummyTable(result);
    },

    async getTricksAfterLead(
      deal: Deal,
      strain: StrainName,
      declarer: Position,
      lead: Card,
    ): Promise<number> {
      const leader = leaderAgainst(declarer);
      const result = await requester.request("solve_after_lead", {
        pbn: pbnWithoutCard(dealToPbn(deal), leader, lead),
        trump: ddsStrainIndex(strain),
        leader: ddsHandIndex(leader),
        suit: ddsStrainIndex(lead.suit),
        rank: ddsRankValue(lead.rank),
      });
      if (typeof result !== "number" || !Number.isInteger(result)) {
        throw new Error(
          "The double-dummy solver returned an invalid trick count",
        );
      }
      return result;
    },
  };
}

const solver = createDoubleDummySolver({
  request(method, arguments_) {
    return ddsClient().request(method, arguments_);
  },
});

export const getDoubleDummyTable = solver.getTable;
export const getTricksAfterLead = solver.getTricksAfterLead;
