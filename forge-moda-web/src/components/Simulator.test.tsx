import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Simulator } from "./Simulator";

describe("Simulator", () => {
  it("mounts and renders the chrome's key landmarks", () => {
    render(<Simulator />);
    expect(screen.getByRole("heading", { name: "Model" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /stop diffusion/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/particle visualization/)).toBeInTheDocument();
  });
});
