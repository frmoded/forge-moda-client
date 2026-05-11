import type { ClickEvent, Scenario, SimulationState } from "../types/wire";

export interface ForgeAdapter {
  init(scenario: Scenario): Promise<unknown>;
  click(state: SimulationState, event: ClickEvent): Promise<unknown>;
  compute(state: SimulationState, dt: number): Promise<unknown>;
}
