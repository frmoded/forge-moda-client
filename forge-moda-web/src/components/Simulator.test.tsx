import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
