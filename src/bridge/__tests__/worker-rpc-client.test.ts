import { describe, expect, it } from "vitest";
import type { EngineResponse } from "../engine-protocol";
import { WorkerRpcClient } from "../worker-rpc-client";

class FakeWorker {
  readonly messages: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, EventListener[]>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: EngineResponse): void {
    this.emit("message", new MessageEvent("message", { data: response }));
  }

  fail(message: string): void {
    this.emit("error", new ErrorEvent("error", { message }));
  }

  failToDeserialize(): void {
    this.emit("messageerror", new Event("messageerror"));
  }

  private emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("WorkerRpcClient", () => {
  it("rejects when creating a worker fails", async () => {
    const client = new WorkerRpcClient(() => {
      throw new Error("Workers are unavailable");
    });

    await expect(
      client.request("get_next_call", { identifier: "board" }),
    ).rejects.toThrow("Workers are unavailable");
  });

  it("correlates concurrent responses by request identifier", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const first = client.request("get_next_call", { identifier: "first" });
    const second = client.request("generate_filtered_board", {
      focus: "Random",
    });

    expect(worker.messages).toHaveLength(2);
    worker.respond({
      id: 2,
      ok: true,
      result: "generated-board",
    });
    worker.respond({
      id: 1,
      ok: true,
      result: "P",
    });

    await expect(first).resolves.toBe("P");
    await expect(second).resolves.toBe("generated-board");
  });

  it("propagates a structured worker failure", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    worker.respond({
      id: 1,
      ok: false,
      error: { message: "Invalid board identifier" },
    });

    await expect(result).rejects.toThrow("Invalid board identifier");
  });

  it("fails pending calls and terminates a worker that reports an error", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    worker.fail("unable to initialize");

    await expect(result).rejects.toThrow("unable to initialize");
    expect(worker.terminated).toBe(true);
  });

  it("creates a replacement worker after a fatal failure", async () => {
    const workers: FakeWorker[] = [];
    const client = new WorkerRpcClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const failed = client.request("get_next_call", { identifier: "first" });
    workers[0].fail("worker stopped");
    await expect(failed).rejects.toThrow("worker stopped");

    const recovered = client.request("get_next_call", {
      identifier: "second",
    });
    expect(workers).toHaveLength(2);
    workers[1].respond({ id: 2, ok: true, result: "P" });

    await expect(recovered).resolves.toBe("P");
  });

  it("rejects pending calls when worker data cannot be deserialized", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    worker.failToDeserialize();

    await expect(result).rejects.toThrow(
      "The bidding engine returned invalid data",
    );
    expect(worker.terminated).toBe(true);
  });

  it("ignores a response for an unknown request identifier", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    worker.respond({ id: 99, ok: true, result: "P" });
    worker.respond({ id: 1, ok: true, result: "P" });

    await expect(result).resolves.toBe("P");
    expect(worker.terminated).toBe(false);
  });

  it("rejects pending calls when disposed", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    client.dispose();

    await expect(result).rejects.toThrow("The bidding engine was stopped");
    expect(worker.terminated).toBe(true);
  });

  it("rejects malformed worker responses", async () => {
    const worker = new FakeWorker();
    const client = new WorkerRpcClient(() => worker as unknown as Worker);

    const result = client.request("get_next_call", { identifier: "board" });
    worker.respond({
      id: 1,
      ok: true,
    } as unknown as EngineResponse);

    await expect(result).rejects.toThrow(
      "The bidding engine returned an invalid response",
    );
    expect(worker.terminated).toBe(true);
  });
});
