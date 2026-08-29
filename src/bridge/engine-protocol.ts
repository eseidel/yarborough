export type EngineMethod =
  | "get_next_call"
  | "get_suggested_call"
  | "get_call_interpretations"
  | "generate_filtered_board"
  | "get_full_autobid";

export interface EngineRequest {
  id: number;
  method: EngineMethod;
  arguments: Record<string, unknown>;
}

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

export function isEngineRequest(value: unknown): value is EngineRequest {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.method === "string" &&
    [
      "get_next_call",
      "get_suggested_call",
      "get_call_interpretations",
      "generate_filtered_board",
      "get_full_autobid",
    ].includes(value.method) &&
    isRecord(value.arguments)
  );
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
