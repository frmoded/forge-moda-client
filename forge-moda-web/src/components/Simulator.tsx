import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./Simulator.module.css";

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

  useEffect(() => {
    if (!diffusing || mode !== "running") return;
    const ms = Math.max(60, 600 - speed * 5.5);
    const id = setInterval(() => setTicks((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [diffusing, mode, speed]);

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
          >
            <span className={styles.canvasTag}>
              [ particle visualization · {ticks} ticks ]
            </span>
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
