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
}

export interface ComputeRequest {
  sessionId: string;
  dt: number;
  temperature: Temperature;
}

export interface ComputeResponse {
  state: SimState;
}

export interface ClickRequest {
  sessionId: string;
  x: number;
  y: number;
}

export interface ClickResponse {
  ack: true;
}
