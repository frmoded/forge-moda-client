import type {
  ClickResponse,
  ComputeResponse,
  InitResponse,
  Temperature,
} from "../types/wire";

export interface ForgeAdapter {
  init(scenarioId: string): Promise<InitResponse>;
  compute(
    sessionId: string,
    dt: number,
    temperature: Temperature,
  ): Promise<ComputeResponse>;
  click(sessionId: string, x: number, y: number): Promise<ClickResponse>;
}
