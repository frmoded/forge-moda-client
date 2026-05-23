import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Simulator } from "./Simulator";

describe("Simulator", () => {
  it("mounts and renders the chrome's key landmarks", () => {
    render(<Simulator />);
    // Header
    expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
    // Transport: Run / Pause / Step. The Pause button's label flips
    // between "Pause" and "Resume" depending on state; on mount the
    // simulator starts in mode="running" so "Pause" is the active label.
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pause$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /step one tick/i }),
    ).toBeInTheDocument();
    // Footer status line — the only piece of canvas-area text we render
    // before the first init response arrives.
    expect(screen.getByText(/loading scenario/i)).toBeInTheDocument();
  });

  it("hides the featured button before the plugin postMessages discovery", () => {
    render(<Simulator />);
    // No featured-snippet message → no button. Default mount state.
    expect(
      screen.queryByRole("button", { name: /run simulation/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the featured button after a featured-snippet postMessage", async () => {
    render(<Simulator />);
    // Plugin's discovery message. The iframe (here: the test's
    // window) listens via the same message event in
    // Simulator.tsx's useEffect; act() wraps the dispatch so React
    // flushes the setState before assertions.
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
  });

  it("forwards compute-result to window.parent after a featured-button click", async () => {
    // Stub fetch so the adapter's /connect + /compute round-trips
    // return a moda_sim_state envelope without hitting the network.
    // init() still runs on mount (rejects gracefully — Simulator
    // logs and continues), so we tolerate that case in the fetch
    // mock by returning a benign error for /init.
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/init")) {
        // Don't break init; respond with a minimal valid InitResponse.
        return Promise.resolve(new Response(
          JSON.stringify({
            sessionId: "s1",
            state: { tick: 0, particles: [] },
            config: { width: 800, height: 600,
                      temperatureLevels: ["zero","low","medium","high"] },
            stdout: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ));
      }
      if (url.endsWith("/connect")) {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      if (url.endsWith("/compute")) {
        return Promise.resolve(new Response(
          JSON.stringify({
            type: "action",
            result: {
              type: "moda_sim_state",
              content: { tick: 300, particles: [] },
            },
            stdout: "hello from snippet\n",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ));
      }
      return Promise.reject(new Error("unexpected URL: " + url));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Capture postMessages that the iframe sends to its parent. In a
    // browser this is window.parent.postMessage; in jsdom window ===
    // window.parent, so dispatched messages land back on window
    // itself. We listen on window and filter for compute-result.
    const received: any[] = [];
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "compute-result") received.push(e.data);
    };
    window.addEventListener("message", onMessage);

    try {
      render(<Simulator />);

      // Plugin's discovery message — required to reveal the button.
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
      act(() => { btn.click(); });

      await waitFor(() => {
        expect(received.length).toBeGreaterThan(0);
      });

      const msg = received[0];
      expect(msg.snippet_id).toBe("simulation");
      expect(msg.stdout).toBe("hello from snippet\n");
      expect(msg.result).toEqual({
        type: "moda_sim_state",
        content: { tick: 300, particles: [] },
      });
    } finally {
      window.removeEventListener("message", onMessage);
      vi.unstubAllGlobals();
    }
  });
});
