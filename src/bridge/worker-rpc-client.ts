import {
  type EngineMethod,
  type RpcRequest,
  isEngineResponse,
} from "./engine-protocol";

export class EngineWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineWorkerError";
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class WorkerRpcClient<Method extends string = EngineMethod> {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly createWorker: () => Worker;

  constructor(createWorker: () => Worker) {
    this.createWorker = createWorker;
  }

  request(
    method: Method,
    arguments_: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextRequestId++;
    const request: RpcRequest<Method> = { id, method, arguments: arguments_ };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        const worker = this.worker ?? this.startWorker();
        worker.postMessage(request);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(this.errorFromUnknown(error, "Could not send engine request"));
      }
    });
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }
    this.rejectPending(new EngineWorkerError("The bidding engine was stopped"));
  }

  private startWorker(): Worker {
    const worker = this.createWorker();
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.handleMessage(event);
    });
    worker.addEventListener("error", (event) => {
      this.failWorker(
        this.errorFromUnknown(event, "The bidding engine worker failed"),
      );
    });
    worker.addEventListener("messageerror", (event) => {
      this.failWorker(
        this.errorFromUnknown(
          event,
          "The bidding engine returned invalid data",
        ),
      );
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(event: MessageEvent<unknown>): void {
    if (!isEngineResponse(event.data)) {
      this.failWorker(
        new EngineWorkerError(
          "The bidding engine returned an invalid response",
        ),
      );
      return;
    }

    const pending = this.pendingRequests.get(event.data.id);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(event.data.id);
    if (event.data.ok) {
      pending.resolve(event.data.result);
      return;
    }
    pending.reject(new EngineWorkerError(event.data.error.message));
  }

  private failWorker(error: Error): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private errorFromUnknown(
    error: unknown,
    fallback: string,
  ): EngineWorkerError {
    if (error instanceof Error && error.message) {
      return new EngineWorkerError(error.message);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message
    ) {
      return new EngineWorkerError(error.message);
    }
    return new EngineWorkerError(fallback);
  }
}
