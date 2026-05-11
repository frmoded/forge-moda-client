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

export interface InitRequest {
  scenarioId: string;
}

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
