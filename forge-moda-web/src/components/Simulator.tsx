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
import type {
  FeaturedSnippetMessage,
  ModaSimStateResult,
  SimState,
  Temperature,
} from "../types/wire";

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

  // Featured-snippet discovery (Phase 2). Stays null until the
  // plugin postMessages the {snippet_id, label, vault_path} on
  // session-open — at that point the "Run simulation" button
  // (labeled per the snippet's forge_action_label) renders in the
  // simulator header. Generic /compute needs the explicit vault
  // path: it doesn't infer FORGE_MODA_VAULT_PATH the way /moda/*
  // does, so the plugin (which knows the path) feeds it through.
  const [featured, setFeatured] =
    useState<FeaturedSnippetMessage | null>(null);
  const [featuredRunning, setFeaturedRunning] = useState(false);
  // v0.2.97 — `featured-run` arrives via postMessage from the plugin
  // on Forge-click. We can't run immediately if `featured` hasn't been
  // hydrated yet (featured-snippet may arrive in the same tick, but
  // setFeatured's state update hasn't flushed). Stash the intent here;
  // the effect below picks it up once `featured` is ready.
  const [autoRunRequested, setAutoRunRequested] = useState(false);

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
        const res = await adapter.init();
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

  // Redraw on every simState update. Palette is theme-aware: on light
  // theme water is pale blue + ink is near-black; on dark theme water
  // is a deeper desaturated blue + ink shifts to a warm light tone so
  // both populations still read as distinct against the inverted
  // canvas surface. Detection is the simple class-check on the
  // iframe's documentElement — if Obsidian propagates its `theme-dark`
  // class into the embedded iframe document, dark palette kicks in;
  // otherwise the light defaults stay (no regression). Mid-session
  // theme toggles take effect on the next redraw (no themechange
  // listener — keyed on simState updates only).
  // Two passes (one fillStyle per pass) stays for the same per-particle
  // setStyle cost reason.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simState || !canvasDims) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasDims.width, canvasDims.height);
    const water = simState.particles.filter((p) => p.type === "water");
    const ink = simState.particles.filter((p) => p.type === "ink");
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("theme-dark");
    const palette = isDark
      ? { water: "#4a6280", ink: "#e8e6df" }
      : { water: "#9cc3e5", ink: "#15171a" };
    ctx.fillStyle = palette.water;
    for (const p of water) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = palette.ink;
    for (const p of ink) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.0, 0, Math.PI * 2);
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

  // Obsidian's "Forge: Step MoDa simulation" command postMessages
  // {type:'step'} into this iframe. Drive the existing handleStep so a
  // keyboard/command step behaves exactly like the toolbar Step button
  // (one /moda/compute tick, paused). A ref keeps the listener bound
  // once while always calling the latest handleStep closure (which
  // closes over sessionId/temp), avoiding stale-closure bugs and
  // per-render re-subscription.
  const handleStepRef = useRef(handleStep);
  handleStepRef.current = handleStep;
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "step") {
        void handleStepRef.current();
        return;
      }
      // Featured-snippet discovery (Phase 2). The plugin scans the
      // active vault's frontmatter for `featured: true` and posts
      // the result here on iframe-ready (handshake below). Single
      // setFeatured call; featured state is consumed by
      // handleRunFeatured when the plugin posts featured-run.
      if (data.type === "featured-snippet"
          && typeof data.snippet_id === "string"
          && typeof data.vault_path === "string") {
        setFeatured({
          type: "featured-snippet",
          snippet_id: data.snippet_id,
          label: data.label || "Run",
          vault_path: data.vault_path,
        });
        return;
      }
      // forge-client-obsidian v0.2.97 — auto-trigger the featured
      // snippet when the plugin posts `featured-run` (sent on
      // Forge-click of the moda snippet). Replaces the explicit
      // header button. We can't fire handleRunFeatured directly here
      // because `featured` state may not be set yet (featured-snippet
      // and featured-run can arrive in the same tick). Flag the
      // intent; the watcher effect below runs once `featured` is
      // hydrated.
      if (data.type === "featured-run") {
        setAutoRunRequested(true);
        return;
      }
    };
    window.addEventListener("message", onMessage);
    // Handshake: announce "ready" so the plugin (which holds the
    // featured-snippet discovery + the vault path) knows it's safe
    // to post the discovery message. window.parent in the iframe
    // context; * targetOrigin because the iframe is loaded from
    // localhost:5173 while the plugin posts from Obsidian's host
    // origin — both ends control the conversation, no third-party
    // origin risk.
    window.parent?.postMessage({ type: "iframe-ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // "Run simulation" handler. POSTs the featured snippet via generic
  // /compute, expects a moda_sim_state result, and renders the
  // returned final-tick particles into the canvas as a static frame.
  // Pauses the live loop so the auto-tick doesn't race past the
  // rendered frame on the next interval. Matches handleStep's
  // pause-then-render shape; the difference is the source of the
  // state (generic /compute on a featured snippet vs /moda/compute
  // on the current session).
  const handleRunFeatured = async () => {
    if (featured === null || featuredRunning) return;
    setMode("paused");
    setFeaturedRunning(true);
    try {
      const res = await adapter.computeSnippet(
        featured.snippet_id, featured.vault_path);
      // moda_sim_state is the only result.type the canvas knows how
      // to render. Anything else (raw json fallthrough, unknown
      // future shape) gets rendered only via Forge Output through
      // the postMessage relay below — the iframe canvas just paints
      // the moda_sim_state case.
      const result = res.result as ModaSimStateResult | undefined;
      if (result && result.type === "moda_sim_state") {
        setSimState({
          tick: result.content.tick,
          particles: result.content.particles,
        });
        setTicks(result.content.tick);
      } else {
        console.warn("moda featured-run: unexpected result.type:",
          (res.result as { type?: unknown })?.type);
      }
      // Relay stdout + result to the plugin so Forge Output gets the
      // print() output and the structured value. The plugin's
      // moda-view.ts listens on the same channel as the
      // iframe-ready / step / featured-snippet handshakes and
      // dispatches `compute-result` to OutputView.append().
      window.parent?.postMessage({
        type: "compute-result",
        snippet_id: featured.snippet_id,
        stdout: res.stdout ?? "",
        result: res.result,
      }, "*");
    } catch (e) {
      console.error("moda featured-run failed:", e);
      // Forward the failure too so Forge Output can render an error
      // entry. The plugin's appendError surface handles {snippet_id,
      // error, stdout} just like the success path does {snippet_id,
      // stdout, result} — symmetric.
      window.parent?.postMessage({
        type: "compute-result",
        snippet_id: featured.snippet_id,
        stdout: "",
        result: null,
        error: e instanceof Error ? e.message : String(e),
      }, "*");
    } finally {
      setFeaturedRunning(false);
    }
  };

  // v0.2.97 — fire the auto-run once `featured` is hydrated. Handles
  // the postMessage race: featured-snippet and featured-run can land
  // in the same tick, but featured-run's setAutoRunRequested can't
  // see the freshly-set featured value until the next render. Effect
  // re-runs on featured / autoRunRequested / featuredRunning changes
  // — when all three align, fire once and clear the flag.
  useEffect(() => {
    if (autoRunRequested && featured !== null && !featuredRunning) {
      setAutoRunRequested(false);
      void handleRunFeatured();
    }
    // handleRunFeatured intentionally omitted: it closes over the
    // same state variables this effect already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunRequested, featured, featuredRunning]);

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
          {/* Featured-snippet button removed (forge-client-obsidian
              v0.2.97) — the plugin now auto-triggers `featured-run`
              via postMessage on Forge-click of the moda snippet, so
              the in-iframe button is redundant. The `featured` state
              is still kept (set by the featured-snippet handshake)
              because handleRunFeatured() consumes it when the plugin
              posts featured-run. */}
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
