import type { ForgeAdapter } from "./ForgeAdapter";
import type {
  ClickResponse,
  ComputeResponse,
  InitResponse,
  Temperature,
  GenericComputeResponse,
} from "../types/wire";

// V1 Phase 2: this adapter no longer makes HTTP calls. It posts
// `engine-request` messages to `window.parent` (the Obsidian plugin's
// renderer) and awaits matching `engine-response` messages. The
// plugin dispatches via its Pyodide host — no uvicorn round-trip,
// no Vite dev server.
//
// The class name kept its `LocalHttpAdapter` label so existing
// Simulator.tsx imports don't have to change. A future cleanup
// could rename to `LocalEngineAdapter` to drop the now-misleading
// "Http" reference; the prompt suggests it as an optional polish.
//
// Concurrency model: each call generates a `request_id` (UUID),
// posts the engine-request, and stashes resolve/reject handlers in
// a per-instance `pendingRequests` map. The message listener picks
// up engine-response messages, looks up the right handler, and
// resolves/rejects. Out-of-order responses correlate correctly via
// request_id — important for the live 30Hz compute loop racing
// against canvas clicks.
export class LocalHttpAdapter implements ForgeAdapter {
  private pendingRequests = new Map<string, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }>();
  private listener: ((e: MessageEvent) => void) | null = null;

  constructor() {
    this.listener = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== "engine-response") return;
      const handler = this.pendingRequests.get(data.request_id);
      if (!handler) return;
      this.pendingRequests.delete(data.request_id);
      if (data.ok) {
        handler.resolve(data.result);
      } else {
        handler.reject(new Error(data.error ?? "engine-response: unknown error"));
      }
    };
    // Iframes can use addEventListener("message"); in jsdom tests
    // this is the same global window.
    window.addEventListener("message", this.listener);
  }

  /** Tear-down for tests / hot-reload. Production iframes keep this
   *  adapter for the lifetime of the React tree; the listener leak
   *  is bounded by page lifetime. */
  dispose(): void {
    if (this.listener) {
      window.removeEventListener("message", this.listener);
      this.listener = null;
    }
    // Reject any in-flight requests so callers don't hang.
    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error("adapter disposed"));
    }
    this.pendingRequests.clear();
  }

  /** Post an engine-request and return a promise that resolves on the
   *  matching engine-response. UUID via crypto.randomUUID() — modern
   *  browsers + Obsidian's Electron renderer support it. */
  private postEngineRequest(
    op: string,
    args: unknown[],
    vault_name?: string,
  ): Promise<unknown> {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request_id, { resolve, reject });
      window.parent?.postMessage(
        {
          type: "engine-request",
          request_id,
          op,
          args,
          ...(vault_name !== undefined ? { vault_name } : {}),
        },
        "*",
      );
    });
  }

  async init(): Promise<InitResponse> {
    return (await this.postEngineRequest("moda-init", [])) as InitResponse;
  }

  async compute(
    sessionId: string,
    dt: number,
    temperature: Temperature,
  ): Promise<ComputeResponse> {
    // sessionId is part of the wire shape but the plugin holds state
    // in-process (one iframe per plugin session), so the plugin
    // ignores it and we just pass dt + temperature.
    void sessionId;
    return (await this.postEngineRequest("moda-compute", [dt, temperature])) as ComputeResponse;
  }

  async click(
    sessionId: string,
    x: number,
    y: number,
  ): Promise<ClickResponse> {
    void sessionId;
    return (await this.postEngineRequest("moda-click", [x, y])) as ClickResponse;
  }

  /** Generic /compute path for the featured-button (Phase 2 routes
   *  it through the plugin's pyodide-host alongside the moda-fast-path
   *  operations). vault_name selects which bundled library the plugin
   *  resolves against. */
  async computeSnippet(
    snippetId: string,
    vaultPath: string,
  ): Promise<GenericComputeResponse> {
    // vault_path was used by the old HTTP path to call /connect first;
    // V1 Phase 2 reduces this to a single engine-request with the
    // vault_name field. The legacy vaultPath argument is still
    // accepted for API stability but ignored — the plugin's bundled
    // library is the source of truth.
    void vaultPath;
    return (await this.postEngineRequest(
      "compute",
      [snippetId],
      "forge-moda",
    )) as GenericComputeResponse;
  }
}
