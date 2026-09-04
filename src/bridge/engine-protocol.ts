export const ENGINE_METHODS = [
  "get_next_call",
  "get_suggested_call",
  "get_call_interpretations",
  "generate_filtered_board",
  "get_full_autobid",
  "get_opening_lead",
  "generate_adaptive_board",
] as const;

export type EngineMethod = (typeof ENGINE_METHODS)[number];

/** One request to a worker: the bidding engine and the double-dummy solver share the shape. */
export interface RpcRequest<Method extends string> {
  id: number;
  method: Method;
  arguments: Record<string, unknown>;
}

export type EngineRequest = RpcRequest<EngineMethod>;

export interface EngineSuccessResponse {
  id: number;
  ok: true;
  result: unknown;
}

export interface EngineFailureResponse {
  id: number;
  ok: false;
  error: {
    message: string;
  };
}

export type EngineResponse = EngineSuccessResponse | EngineFailureResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRpcRequest<Method extends string>(
  value: unknown,
  methods: readonly Method[],
): value is RpcRequest<Method> {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.method === "string" &&
    (methods as readonly string[]).includes(value.method) &&
    isRecord(value.arguments)
  );
}

export function isEngineRequest(value: unknown): value is EngineRequest {
  return isRpcRequest(value, ENGINE_METHODS);
}

export function isEngineResponse(value: unknown): value is EngineResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.ok !== "boolean"
  ) {
    return false;
  }
  if (value.ok) {
    return "result" in value;
  }
  return isRecord(value.error) && typeof value.error.message === "string";
}
