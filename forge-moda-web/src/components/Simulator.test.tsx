import { describe, it, expect } from "vitest";
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
});
