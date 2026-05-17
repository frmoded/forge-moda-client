import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import styles from "./Simulator.module.css";
import { LocalHttpAdapter } from "../adapters/LocalHttpAdapter";
import type { SimState, Temperature } from "../types/wire";

// The backend understands two scenarios (default_diffusion + hot_chamber_start)
// but the client only initializes against the default — the scenario-picker UI
// was pulled in Phase 6 so the demo stays single-scenario. The backend's
// KNOWN_SCENARIOS gate still permits "hot_chamber_start" if a future client
// wants to opt in.
const DEFAULT_SCENARIO_ID = "default_diffusion";

function mapTempToLevel(temp: number): Temperature {
  if (temp < 10) return "zero";
  if (temp < 40) return "low";
  if (temp < 70) return "medium";
  return "high";
}

interface IconProps {
  size?: number;
  children: ReactNode;
}

function Icon({ size = 16, children }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const IconPlay = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polygon points="6 4 20 12 6 20 6 4" />
  </Icon>
);
const IconPause = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Icon>
);
const IconStep = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </Icon>
);
const IconPlus = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);
const IconMinus = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);
const IconCheck = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <polyline points="4 12 10 18 20 6" />
  </Icon>
);

function tempWord(t: number): string {
  if (t < 15) return "cold";
  if (t < 30) return "cool";
  if (t < 50) return "moderate";
  if (t < 70) return "warm";
  if (t < 85) return "high";
  return "extreme";
}

type Mode = "running" | "paused";

export function Simulator() {
  const [mode, setMode] = useState<Mode>("running");
  const [speed, setSpeed] = useState(50);
  const [temp, setTemp] = useState(41);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [ticks, setTicks] = useState(2);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [simState, setSimState] = useState<SimState | null>(null);
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const adapter = useMemo(() => new LocalHttpAdapter(), []);
  // Rolling window of the last 30 /compute wall-clock measurements. Used
  // only for the once-per-second perf log; doesn't drive UI state.
  const computeTimingsRef = useRef<number[]>([]);
  const lastPerfLogRef = useRef(0);

  // Open the backend session on mount. The returned sessionId is the cookie
  // that /compute and /click require. Failures are logged but don't break
  // the local mock visualization.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adapter.init(DEFAULT_SCENARIO_ID);
        if (cancelled) return;
        setSessionId(res.sessionId);
        setSimState(res.state);
        setCanvasDims({ width: res.config.width, height: res.config.height });
        console.log("moda sessionId:", res.sessionId, "particles:", res.state.particles.length);
      } catch (e) {
        console.error("moda init failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  useEffect(() => {
    if (mode !== "running") return;
    if (sessionId === null) return;
    // Floor at 33 ms (≈30 Hz) so the speed slider's top end matches the
    // spec target. Slope 6 makes the floor bind around speed=95 and
    // tightens up the high-end response; below that the slider continues
    // to dilate the tick (speed=0 → 600 ms, speed=50 → 300 ms).
    const ms = Math.max(33, 600 - speed * 6);
    const id = setInterval(() => {
      const t0 = performance.now();
      adapter
        .compute(sessionId, 1 / 30, mapTempToLevel(temp))
        .then((res) => {
          const elapsed = performance.now() - t0;
          const window = computeTimingsRef.current;
          window.push(elapsed);
          if (window.length > 30) window.shift();

          setSimState(res.state);
          setTicks(res.state.tick);

          const now = performance.now();
          if (window.length >= 30 && now - lastPerfLogRef.current >= 1000) {
            const avg = window.reduce((a, b) => a + b, 0) / window.length;
            const max = Math.max(...window);
            console.log(
              `moda compute: avg ${avg.toFixed(1)}ms, max ${max.toFixed(1)}ms over last 30`,
            );
            lastPerfLogRef.current = now;
          }
        })
        .catch((e) => {
          console.error("moda compute failed:", e);
        });
    }, ms);
    return () => clearInterval(id);
  }, [mode, speed, sessionId, adapter, temp]);

  // Redraw on every simState update. Water is rendered blue, ink is
  // rendered near-black so the two types are immediately distinguishable
  // on the cream canvas background. Two passes (one fillStyle per pass)
  // are slightly cheaper than setting fillStyle per particle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simState || !canvasDims) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasDims.width, canvasDims.height);
    const water = simState.particles.filter((p) => p.type === "water");
    const ink = simState.particles.filter((p) => p.type === "ink");
    ctx.fillStyle = "#3a6fb3";
    for (const p of water) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#15171a";
    for (const p of ink) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [simState, canvasDims]);

  const speedPct = `${speed}%`;
  const tempPct = `${temp}%`;

  const handleRun = () => setMode("running");
  const handlePause = () =>
    setMode(mode === "paused" ? "running" : "paused");

  // Step advances the simulation exactly one /compute tick and parks the
  // mode at "paused" so the auto-loop doesn't immediately race past the
  // new state. Wires the Step button to the backend — previously it just
  // incremented a local counter and produced no visible motion.
  const handleStep = async () => {
    setMode("paused");
    if (sessionId === null) return;
    try {
      const t0 = performance.now();
      const res = await adapter.compute(sessionId, 1 / 30, mapTempToLevel(temp));
      const elapsed = performance.now() - t0;
      const window = computeTimingsRef.current;
      window.push(elapsed);
      if (window.length > 30) window.shift();
      setSimState(res.state);
      setTicks(res.state.tick);
    } catch (e) {
      console.error("moda step failed:", e);
    }
  };

  const handleCanvasClick = async (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (sessionId === null) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // Translate the click from display coords to canvas-internal coords
    // (0..config.width, 0..config.height). Accounts for CSS sizing AND
    // the wrapper's zoom transform — rect.width already reflects them.
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    try {
      const res = await adapter.click(sessionId, x, y);
      console.log("moda click:", { x, y, res });
    } catch (err) {
      console.error("moda click failed:", err);
    }
  };

  const canvasClass = grid ? `${styles.canvas} ${styles.grid}` : styles.canvas;
  const dotClass =
    mode === "running" ? `${styles.dot} ${styles.live}` : styles.dot;

  return (
    <div className={styles.host}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <h1 className={styles.title}>Model</h1>
          <div className={styles.zoomGroup} role="group" aria-label="Zoom">
            <button
              className={styles.iconBtn}
              aria-label="Zoom in"
              onClick={() =>
                setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))
              }
            >
              <IconPlus />
            </button>
            <button
              className={styles.iconBtn}
              aria-label="Zoom out"
              onClick={() =>
                setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))
              }
            >
              <IconMinus />
            </button>
          </div>
        </header>

        <div className={styles.toolbar}>
          <div className={styles.transport} role="group" aria-label="Playback">
            <button
              className={styles.tBtn}
              aria-label="Run"
              aria-pressed={mode === "running"}
              onClick={handleRun}
            >
              <IconPlay size={15} />
            </button>
            <button
              className={styles.tBtn}
              aria-label={mode === "paused" ? "Resume" : "Pause"}
              aria-pressed={mode === "paused"}
              onClick={handlePause}
            >
              <IconPause size={15} />
            </button>
            <button
              className={styles.tBtn}
              aria-label="Step one tick"
              onClick={() => void handleStep()}
            >
              <IconStep size={15} />
            </button>
          </div>

          <div className={styles.speedBlock}>
            <span className={styles.speedLabel}>Model speed</span>
            <input
              className={`${styles.range} ${styles.sliderSpeed}`}
              type="range"
              min={0}
              max={100}
              value={speed}
              style={{ "--pct": speedPct } as CSSProperties}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Model speed"
            />
          </div>
        </div>

        <div className={styles.canvasWrap}>
          <div
            className={canvasClass}
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          >
            {canvasDims ? (
              <canvas
                ref={canvasRef}
                width={canvasDims.width}
                height={canvasDims.height}
                className={styles.particleCanvas}
                onClick={handleCanvasClick}
              />
            ) : (
              <span className={styles.canvasTag}>
                [ loading scenario · {ticks} ticks ]
              </span>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.tempSliderBlock}>
            <label className={styles.fieldLabel} htmlFor="temp">
              temperature
            </label>
            <input
              id="temp"
              className={`${styles.range} ${styles.sliderTemp}`}
              type="range"
              min={0}
              max={100}
              value={temp}
              style={{ "--pct": tempPct } as CSSProperties}
              onChange={(e) => setTemp(Number(e.target.value))}
              aria-label="Temperature"
            />
          </div>

          <div className={styles.tempReadoutWrap}>
            <span className={styles.fieldLabel}>{tempWord(temp)}</span>
            <div className={styles.tempReadout}>
              <span className={styles.num}>{temp}</span>
              <span className={styles.unit}>°C</span>
            </div>
          </div>

          <label className={styles.checkbox}>
            <span className={`${styles.fieldLabel} ${styles.inlineLabel}`}>
              grid
            </span>
            <input
              type="checkbox"
              checked={grid}
              onChange={(e) => setGrid(e.target.checked)}
            />
            <span className={styles.box}>
              <IconCheck size={12} />
            </span>
          </label>
        </div>

        <div className={styles.actionbar}>
          <span className={styles.ticks} aria-live="polite">
            <span className={dotClass}></span>
            {ticks.toLocaleString()} ticks
          </span>
        </div>
      </div>
    </div>
  );
}
