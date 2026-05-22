import type { ForgeAdapter } from "./ForgeAdapter";
import type {
  ClickResponse,
  ComputeResponse,
  InitResponse,
  Temperature,
  GenericComputeResponse,
} from "../types/wire";

export class LocalHttpAdapter implements ForgeAdapter {
  readonly baseUrl: string;
  // Root of the forge server (one level above /moda). Used by
  // computeSnippet for the generic /compute endpoint that the
  // featured-button fires; /moda/* keeps using `baseUrl`.
  readonly rootUrl: string;

  constructor(baseUrl: string = "http://localhost:8000/moda") {
    this.baseUrl = baseUrl;
    // Strip the /moda suffix to get the server root. baseUrl might
    // not end in /moda (custom env), in which case fall back to
    // treating baseUrl itself as the root.
    this.rootUrl = baseUrl.endsWith("/moda")
      ? baseUrl.slice(0, -"/moda".length)
      : baseUrl;
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

  /** Invoke a snippet via the generic /compute endpoint (NOT the
   *  /moda/* fast-path). Used by the featured-button "Run simulation"
   *  affordance: the server runs the snippet end-to-end and returns a
   *  {type: "action", result, stdout} envelope where `result` is
   *  whatever the snippet's serializer emitted. For moda snippets
   *  returning ParticleState, that's `{type: "moda_sim_state",
   *  content: {tick, particles: [...]}}` — see forge engine commit
   *  a739390 for the serialization unification.
   *
   *  vaultPath is required (generic /compute doesn't infer it from
   *  env like /moda/* does); the plugin postMessages it to the
   *  iframe on session start. */
  async computeSnippet(
    snippetId: string,
    vaultPath: string,
  ): Promise<GenericComputeResponse> {
    // /connect is idempotent and cheap; ensure the server's session
    // manager has loaded this vault before /compute lookups by id.
    await this.postTo<unknown>(`${this.rootUrl}/connect`, {
      vault_path: vaultPath,
    });
    return this.postTo<GenericComputeResponse>(`${this.rootUrl}/compute`, {
      vault_path: vaultPath,
      snippet_id: snippetId,
      inputs: {},
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.postTo<T>(`${this.baseUrl}${path}`, body);
  }

  private async postTo<T>(url: string, body: unknown): Promise<T> {
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
