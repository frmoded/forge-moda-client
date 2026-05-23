import { describe, it, expect } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Simulator } from "./Simulator";
import { LocalHttpAdapter } from "../adapters/LocalHttpAdapter";

// Helper: stand in for the plugin's engine-request handler. Listens
// on window for engine-request messages, dispatches by op via the
// supplied dispatcher, posts back an engine-response with the
// matching request_id. Returns an unregister function.
//
// In jsdom, window.parent === window, so the iframe's
// window.parent.postMessage lands back on window — same channel
// the listener receives. In a real browser the plugin's renderer
// hosts the listener; here the test stub does.
function withFakeEnginePlugin(
  dispatcher: (op: string, args: unknown[], vault_name?: string) => unknown | Promise<unknown>,
): () => void {
  const listener = async (e: MessageEvent) => {
    const data = e.data;
    if (!data || data.type !== "engine-request") return;
    try {
      const result = await dispatcher(data.op, data.args ?? [], data.vault_name);
      window.postMessage(
        { type: "engine-response", request_id: data.request_id, ok: true, result },
        "*",
      );
    } catch (err) {
      window.postMessage(
        {
          type: "engine-response",
          request_id: data.request_id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        "*",
      );
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

const benignInitResponse = {
  sessionId: "test-session",
  state: { tick: 0, particles: [] },
  config: { width: 800, height: 600, temperatureLevels: ["zero", "low", "medium", "high"] },
  stdout: "",
};

describe("Simulator", () => {
  it("mounts and renders the chrome's key landmarks", () => {
    // Ensure init promise resolves so the Simulator doesn't hang on
    // an unresponsive engine-request.
    const unregister = withFakeEnginePlugin((op) => {
      if (op === "moda-init") return benignInitResponse;
      return null;
    });
    try {
      render(<Simulator />);
      expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^pause$/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /step one tick/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/loading scenario/i)).toBeInTheDocument();
    } finally {
      unregister();
    }
  });

  it("hides the featured button before the plugin postMessages discovery", () => {
    const unregister = withFakeEnginePlugin((op) => {
      if (op === "moda-init") return benignInitResponse;
      return null;
    });
    try {
      render(<Simulator />);
      expect(
        screen.queryByRole("button", { name: /run simulation/i }),
      ).not.toBeInTheDocument();
    } finally {
      unregister();
    }
  });

  it("renders the featured button after a featured-snippet postMessage", async () => {
    const unregister = withFakeEnginePlugin((op) => {
      if (op === "moda-init") return benignInitResponse;
      return null;
    });
    try {
      render(<Simulator />);
      act(() => {
        window.postMessage(
          {
            type: "featured-snippet",
            snippet_id: "simulation",
            label: "Run simulation",
            vault_path: "/tmp/test-vault",
          },
          "*",
        );
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /run simulation/i }),
        ).toBeInTheDocument(),
      );
    } finally {
      unregister();
    }
  });

  it("forwards compute-result to window.parent after a featured-button click", async () => {
    // The fake plugin services both moda-init (so Simulator boots
    // happily) and compute (so the featured-button gets a result).
    const unregister = withFakeEnginePlugin((op, args) => {
      if (op === "moda-init") return benignInitResponse;
      if (op === "compute") {
        // mimic the unify-compute-serialization GenericComputeResponse
        // shape that the simulator already knows how to consume.
        return {
          type: "action",
          result: { type: "moda_sim_state", content: { tick: 300, particles: [] } },
          stdout: "hello from snippet\n",
          _echoed_snippet_id: args[0],
        };
      }
      return null;
    });
    const received: Array<{ snippet_id: string; stdout: string; result: unknown }> = [];
    const onComputeResult = (e: MessageEvent) => {
      if (e.data?.type === "compute-result") received.push(e.data);
    };
    window.addEventListener("message", onComputeResult);

    try {
      render(<Simulator />);
      act(() => {
        window.postMessage(
          {
            type: "featured-snippet",
            snippet_id: "simulation",
            label: "Run simulation",
            vault_path: "/tmp/test-vault",
          },
          "*",
        );
      });
      const btn = await screen.findByRole("button", { name: /run simulation/i });
      act(() => {
        btn.click();
      });
      await waitFor(() => {
        expect(received.length).toBeGreaterThan(0);
      });
      const msg = received[0];
      expect(msg.snippet_id).toBe("simulation");
      expect(msg.stdout).toBe("hello from snippet\n");
      expect(msg.result).toMatchObject({
        type: "moda_sim_state",
        content: { tick: 300, particles: [] },
      });
    } finally {
      window.removeEventListener("message", onComputeResult);
      unregister();
    }
  });
});

describe("LocalHttpAdapter (engine-request postMessage protocol)", () => {
  it("init() posts an engine-request and resolves on matching engine-response", async () => {
    const unregister = withFakeEnginePlugin((op) => {
      if (op === "moda-init") return benignInitResponse;
      throw new Error(`unexpected op: ${op}`);
    });
    const adapter = new LocalHttpAdapter();
    try {
      const res = await adapter.init();
      expect(res).toEqual(benignInitResponse);
    } finally {
      adapter.dispose();
      unregister();
    }
  });

  it("rejects when the plugin responds with ok:false", async () => {
    const unregister = withFakeEnginePlugin(() => {
      throw new Error("simulated engine failure");
    });
    const adapter = new LocalHttpAdapter();
    try {
      await expect(adapter.init()).rejects.toThrow(/simulated engine failure/);
    } finally {
      adapter.dispose();
      unregister();
    }
  });

  it("correlates concurrent calls by request_id with arbitrary response order", async () => {
    // Hold each engine-request until we manually release it. Two
    // init() calls in flight; we respond to the SECOND first.
    const pending: Map<string, (result: unknown) => void> = new Map();
    const listener = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== "engine-request") return;
      pending.set(data.request_id, (result) => {
        window.postMessage(
          { type: "engine-response", request_id: data.request_id, ok: true, result },
          "*",
        );
      });
    };
    window.addEventListener("message", listener);
    const adapter = new LocalHttpAdapter();
    try {
      const r1 = adapter.init();
      const r2 = adapter.init();
      await waitFor(() => expect(pending.size).toBe(2));

      // Release in reverse order to verify correlation.
      const keys = Array.from(pending.keys());
      pending.get(keys[1])!({ sessionId: "second", state: benignInitResponse.state, config: benignInitResponse.config });
      pending.get(keys[0])!({ sessionId: "first", state: benignInitResponse.state, config: benignInitResponse.config });

      const [v1, v2] = await Promise.all([r1, r2]);
      // The promises must resolve with the result that matched THEIR
      // request_id, not the order responses arrived.
      expect((v1 as { sessionId: string }).sessionId).toBe("first");
      expect((v2 as { sessionId: string }).sessionId).toBe("second");
    } finally {
      adapter.dispose();
      window.removeEventListener("message", listener);
    }
  });
});
