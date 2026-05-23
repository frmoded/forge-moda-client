export type Temperature = "zero" | "low" | "medium" | "high";

export type ParticleType = "water" | "ink";
export type ParticleMass = "light" | "medium" | "heavy";

export interface Particle {
  id: number;
  type: ParticleType;
  x: number;
  y: number;
  mass: ParticleMass;
}

export interface SimState {
  tick: number;
  particles: Particle[];
}

// Empty body: the backend's /moda/init takes no arguments now that the
// scenario abstraction has been removed (v0.2.0 of forge-moda). Kept as
// an interface so the wire surface still has a named type that future
// fields can land in without an adapter signature change.
export type InitRequest = Record<string, never>;

export interface InitResponse {
  sessionId: string;
  state: SimState;
  config: {
    width: number;
    height: number;
    temperatureLevels: ["zero", "low", "medium", "high"];
  };
  // Captured stdout from the snippet(s) executed for this call (e.g.
  // `print()` output inside setup). Optional for back-compat with
  // older servers that don't include the field — the consumer treats
  // undefined as empty.
  stdout?: string;
}

export interface ComputeRequest {
  sessionId: string;
  dt: number;
  temperature: Temperature;
}

export interface ComputeResponse {
  state: SimState;
  stdout?: string;
}

export interface ClickRequest {
  sessionId: string;
  x: number;
  y: number;
}

export interface ClickResponse {
  ack: true;
  stdout?: string;
}

// Generic /compute (NOT /moda/compute) response envelope. The
// featured-button fires this when the user wants a one-shot
// bounded run of a snippet (e.g. simulation). The `result.type`
// dispatches to a renderer — moda_sim_state is the row-oriented
// ParticleState shape the canvas already knows how to draw.
export interface ModaSimStateResult {
  type: "moda_sim_state";
  content: {
    tick: number;
    particles: Particle[];
  };
}

export interface GenericComputeResponse {
  type: "action" | "data" | "snapshot";
  result: ModaSimStateResult | unknown;  // narrows by result.type
  stdout?: string;
}

// Discovery message the plugin postMessages into the iframe at
// session-open. Identifies which snippet the featured button
// should fire, what label to use, and the vault_path /compute
// needs (generic /compute can't infer FORGE_MODA_VAULT_PATH like
// /moda/* does). The iframe doesn't render the button until it
// receives this message.
export interface FeaturedSnippetMessage {
  type: "featured-snippet";
  snippet_id: string;
  label: string;
  vault_path: string;
}

// V1 Phase 2: postMessage engine protocol. Replaces the iframe's
// previous HTTP calls to localhost:8000 with postMessage round-trips
// to the plugin (which hosts Pyodide per V1 Phase 1).
//
// Per-op args shape:
//   moda-init:    []                       (no positional args)
//   moda-compute: [dt: number, temperature: Temperature]
//   moda-click:   [x: number, y: number]
//   compute:      [snippet_id: string]     (uses vault_name field too)
//
// Each engine-request carries a UUID `request_id` so the iframe can
// correlate responses when multiple calls are in flight (e.g., the
// live compute loop's 30Hz pace overlapping a click). The plugin
// replies with engine-response carrying the matching request_id;
// the iframe's adapter looks up the pending promise and resolves it.
export interface EngineRequest {
  type: "engine-request";
  request_id: string;
  op: "moda-init" | "moda-compute" | "moda-click" | "compute";
  args: unknown[];
  vault_name?: string;  // only used when op === "compute"
}

export interface EngineResponse {
  type: "engine-response";
  request_id: string;
  ok: boolean;
  result?: unknown;     // shape matches the existing /moda/* HTTP responses or GenericComputeResponse
  error?: string;
}
