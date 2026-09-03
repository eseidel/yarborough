import type { Call, CallInterpretation, OpeningLead } from "./types";
import type { EngineMethod } from "./engine-protocol";
import {
  parseCallInterpretation,
  parseCallInterpretations,
  parseCallName,
  parseOpeningLead,
  parseStringResult,
} from "./engine-results";
import { WorkerRpcClient } from "./worker-rpc-client";

let client: WorkerRpcClient | undefined;

export interface EngineRequester {
  request(
    method: EngineMethod,
    arguments_: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface BiddingEngine {
  getCallInterpretations(
    callsString: string,
    dealer: string,
    vulnerability?: string,
  ): Promise<CallInterpretation[]>;
  getNextCall(identifier: string): Promise<Call>;
  getSuggestedCall(identifier: string): Promise<CallInterpretation>;
  generateFilteredBoard(type: string): Promise<string>;
  getFullAutobid(identifier: string): Promise<Call[]>;
  getOpeningLead(identifier: string): Promise<OpeningLead>;
}

function engineClient(): WorkerRpcClient {
  client ??= new WorkerRpcClient(
    () =>
      new Worker(new URL("./z3b.worker.ts", import.meta.url), {
        type: "module",
      }),
  );
  return client;
}

export function createBiddingEngine(requester: EngineRequester): BiddingEngine {
  return {
    /** Return z3b interpretations for every legal next call. */
    async getCallInterpretations(
      callsString: string,
      dealer: string,
      vulnerability: string = "None",
    ): Promise<CallInterpretation[]> {
      const result = await requester.request("get_call_interpretations", {
        calls: callsString,
        dealer,
        vulnerability,
      });
      return parseCallInterpretations(result);
    },

    /** Return z3b's next call for the current player. */
    async getNextCall(identifier: string): Promise<Call> {
      const result = await requester.request("get_next_call", { identifier });
      return parseCallName(parseStringResult(result, "next call"));
    },

    /** Return z3b's suggested call together with its rule explanation. */
    async getSuggestedCall(identifier: string): Promise<CallInterpretation> {
      const result = await requester.request("get_suggested_call", {
        identifier,
      });
      return parseCallInterpretation(result);
    },

    /** Generate a board selected by z3b for the requested practice focus. */
    async generateFilteredBoard(type: string): Promise<string> {
      const result = await requester.request("generate_filtered_board", {
        focus: type,
      });
      return parseStringResult(result, "board identifier");
    },

    /** Simulate a complete autobidder auction for the entire board. */
    async getFullAutobid(identifier: string): Promise<Call[]> {
      const result = await requester.request("get_full_autobid", {
        identifier,
      });
      if (!Array.isArray(result)) {
        throw new Error("Invalid autobid calls returned by engine");
      }
      return result.map((c) => parseCallName(String(c)));
    },

    /** The textbook opening lead against the contract a completed auction reached. */
    async getOpeningLead(identifier: string): Promise<OpeningLead> {
      const result = await requester.request("get_opening_lead", {
        identifier,
      });
      return parseOpeningLead(result);
    },
  };
}

const biddingEngine = createBiddingEngine({
  request(method, arguments_) {
    return engineClient().request(method, arguments_);
  },
});

export const getCallInterpretations = biddingEngine.getCallInterpretations;
export const getNextCall = biddingEngine.getNextCall;
export const getSuggestedCall = biddingEngine.getSuggestedCall;
export const generateFilteredBoard = biddingEngine.generateFilteredBoard;
export const getFullAutobid = biddingEngine.getFullAutobid;
export const getOpeningLead = biddingEngine.getOpeningLead;
