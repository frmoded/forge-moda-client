import type { ForgeAdapter } from "./ForgeAdapter";
import type {
  ClickResponse,
  ComputeResponse,
  InitResponse,
  Temperature,
} from "../types/wire";

export class LocalHttpAdapter implements ForgeAdapter {
  readonly baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8000/moda") {
    this.baseUrl = baseUrl;
  }

  init(): Promise<InitResponse> {
    return this.post<InitResponse>("/init", {});
  }

  compute(
    sessionId: string,
    dt: number,
    temperature: Temperature,
  ): Promise<ComputeResponse> {
    return this.post<ComputeResponse>("/compute", {
      sessionId,
      dt,
      temperature,
    });
  }

  click(sessionId: string, x: number, y: number): Promise<ClickResponse> {
    return this.post<ClickResponse>("/click", { sessionId, x, y });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`POST ${url} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}
