import { type RpcRequest, isRpcRequest } from "../bridge/engine-protocol";

export const DDS_METHODS = ["calc_dd_table", "solve_after_lead"] as const;

export type DdsMethod = (typeof DDS_METHODS)[number];

export type DdsRequest = RpcRequest<DdsMethod>;

export function isDdsRequest(value: unknown): value is DdsRequest {
  return isRpcRequest(value, DDS_METHODS);
}
