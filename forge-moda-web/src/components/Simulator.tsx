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

type Mode = "running" | "paused" | "stopped";

export function Simulator() {
  const [mode, setMode] = useState<Mode>("running");
  const [diffusing, setDiffusing] = useState(true);
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
  const computeCounterRef = useRef(0);

  // Phase 0 protocol round-trip: open a backend session on mount. The
  // returned sessionId is the cookie that /compute and /click require.
  // Failures are logged but don't break the local mock visualization.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adapter.init("default_diffusion");
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
    if (!diffusing || mode !== "running") return;
    const ms = Math.max(60, 600 - speed * 5.5);
    const id = setInterval(() => {
      setTicks((t) => t + 1);
      if (sessionId === null) return;
      adapter
        .compute(sessionId, 1 / 30, mapTempToLevel(temp))
        .then((res) => {
          const n = ++computeCounterRef.current;
          if (n % 30 === 0) {
            console.log("moda compute (every 30th):", res);
          }
        })
        .catch((e) => {
          console.error("moda compute failed:", e);
        });
    }, ms);
    return () => clearInterval(id);
  }, [diffusing, mode, speed, sessionId, adapter, temp]);

  // Phase 1: redraw on every simState change. Phase 2 will animate from
  // /compute responses; for now this just paints the initial layout once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simState || !canvasDims) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasDims.width, canvasDims.height);
    ctx.fillStyle = "#3a6fb3";
    for (const p of simState.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [simState, canvasDims]);

  const speedPct = `${speed}%`;
  const tempPct = `${temp}%`;

  const handleRun = () => {
    setMode("running");
    setDiffusing(true);
  };
  const handlePause = () =>
    setMode(mode === "paused" ? "running" : "paused");
  const handleStep = () => {
    setMode("paused");
    setTicks((t) => t + 1);
  };
  const handlePrimary = () => {
    if (diffusing) {
      setDiffusing(false);
      setMode("stopped");
    } else {
      setDiffusing(true);
      setMode("running");
    }
  };

  const handleCanvasClick = async (e: ReactMouseEvent<HTMLDivElement>) => {
    if (sessionId === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    try {
      const res = await adapter.click(sessionId, x, y);
      console.log("moda click:", { x, y, res });
    } catch (err) {
      console.error("moda click failed:", err);
    }
  };

  const canvasClass = grid ? `${styles.canvas} ${styles.grid}` : styles.canvas;
  const primaryClass = !diffusing
    ? `${styles.primaryBtn} ${styles.isPaused}`
    : styles.primaryBtn;
  const dotClass =
    diffusing && mode === "running" ? `${styles.dot} ${styles.live}` : styles.dot;

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
              aria-pressed={mode === "running" && diffusing}
              onClick={handleRun}
            >
              <IconPlay size={15} />
            </button>
            <button
              className={styles.tBtn}
              aria-label={mode === "paused" ? "Resume" : "Pause"}
              aria-pressed={mode === "paused"}
              onClick={handlePause}
              disabled={!diffusing}
            >
              <IconPause size={15} />
            </button>
            <button
              className={styles.tBtn}
              aria-label="Step one tick"
              onClick={handleStep}
              disabled={!diffusing}
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
            onClick={handleCanvasClick}
          >
            {canvasDims ? (
              <canvas
                ref={canvasRef}
                width={canvasDims.width}
                height={canvasDims.height}
                className={styles.particleCanvas}
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
          <button
            className={primaryClass}
            onClick={handlePrimary}
            aria-pressed={!diffusing}
          >
            {diffusing ? "Stop Diffusion" : "Start Diffusion"}
          </button>
          <span className={styles.ticks} aria-live="polite">
            <span className={dotClass}></span>
            {ticks.toLocaleString()} ticks
          </span>
        </div>
      </div>
    </div>
  );
}
