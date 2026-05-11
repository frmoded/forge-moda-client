import type { ForgeAdapter } from "./ForgeAdapter";
import type { ClickEvent, Scenario, SimulationState } from "../types/wire";

export class LocalHttpAdapter implements ForgeAdapter {
  readonly baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8000") {
    this.baseUrl = baseUrl;
  }

  init(_scenario: Scenario): Promise<unknown> {
    throw new Error(`LocalHttpAdapter.init not implemented (${this.baseUrl})`);
  }

  click(_state: SimulationState, _event: ClickEvent): Promise<unknown> {
    throw new Error(`LocalHttpAdapter.click not implemented (${this.baseUrl})`);
  }

  compute(_state: SimulationState, _dt: number): Promise<unknown> {
    throw new Error(
      `LocalHttpAdapter.compute not implemented (${this.baseUrl})`,
    );
  }
}
