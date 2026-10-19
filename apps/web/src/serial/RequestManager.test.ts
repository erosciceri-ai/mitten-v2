// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RequestManager } from "./RequestManager";
import { PROTOCOL_VERSION } from "@mitten/contracts";

describe("RequestManager", () => {
  let rm: RequestManager;
  let sendFn: any;
  beforeEach(() => {
    vi.useFakeTimers();
    sendFn = vi.fn().mockResolvedValue(undefined);
    rm = new RequestManager(sendFn, { defaultTimeout: 100 });
  });
  afterEach(() => { vi.useRealTimers(); rm.cancelAllRequests("x"); });
  it("should init with 0 pending", () => { expect(rm.getPendingCount()).toBe(0); });
  it("should send and resolve", async () => {
    const { requestId, promise } = rm.sendRequest("test", {});
    rm.handleResponse({ v: PROTOCOL_VERSION, type: "response", id: requestId, ok: true, result: { a: 1 } });
    await expect(promise).resolves.toEqual({ a: 1 });
    expect(rm.getPendingCount()).toBe(0);
  });
  it("should timeout", async () => {
    const { promise } = rm.sendRequest("test", {});
    const rejection = expect(promise).rejects.toThrow("Request timeout: test (100ms)");
    await vi.advanceTimersByTimeAsync(99);
    expect(rm.getPendingCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(rm.getPendingCount()).toBe(0);
  });
  it("should cancel all", async () => {
    const { promise: p1 } = rm.sendRequest("a", {});
    const { promise: p2 } = rm.sendRequest("b", {});
    const rejections = Promise.all([
      expect(p1).rejects.toThrow("bye"),
      expect(p2).rejects.toThrow("bye"),
    ]);
    expect(rm.getPendingCount()).toBe(2);
    rm.cancelAllRequests("bye");
    await rejections;
    expect(rm.getPendingCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("should use custom requestId when provided", async () => {
    const { requestId, promise } = rm.sendRequest("test", {}, { requestId: "custom-123" });
    expect(requestId).toBe("custom-123");
    rm.handleResponse({ v: PROTOCOL_VERSION, type: "response", id: "custom-123", ok: true, result: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });
  });
});
