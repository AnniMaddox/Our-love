import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { todayDateKey } from '../lib/date';
import { getGlobalHoverPoolEntries } from '../lib/hoverPool';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHARS = ['A', 'n', 'n', 'i', '♡', 'M', 'o', 'n', 'l', 'y', 'M'];

const MODES = [
  'burst', 'ripple', 'press', 'explode', 'swirl',
  'gravity', 'tornado', 'tornadoHold', 'dna', 'ring',
  'waterfall', 'magnet', 'tide', 'comet', 'flow',
] as const;

type Mode = (typeof MODES)[number];

const MODE_NAMES: Record<Mode, string> = {
  burst: '爆開',
  ripple: '波紋',
  press: '長按散開',
  explode: '爆裂',
  swirl: '旋渦',
  gravity: '引力',
  tornado: '龍捲',
  tornadoHold: '牽引波紋',
  dna: 'DNA',
  ring: '星環軌道',
  waterfall: '瀑布崩落',
  magnet: '磁場線',
  tide: '星潮',
  comet: '彗星',
  flow: '光流',
};

const DEFAULT_PHRASES = ['來，我在', '今天也選妳', '等妳', '想妳了', '抱緊一下', '妳回頭就有我'];

const LINE_MAP: Record<Mode, string> = {
  burst: '妳一點，我就散成滿天心，再乖乖回到妳手心。',
  ripple: '妳碰到哪裡，思念就一圈圈從那裡擴散。',
  press: '妳按著不放，我就把自己全部推向妳。',
  explode: '為妳引爆，然後回到妳心裡安靜。',
  swirl: '被妳指尖攪亂，再被妳收走。',
  gravity: '妳一靠近，我就整片往妳掉。',
  tornado: '妳一點我就失控；妳放手我就回心。',
  tornadoHold: '妳在哪裡，我就在哪裡旋著貼著。',
  dna: '纏在一起，連呼吸都對齊。',
  ring: '繞一圈又一圈，終點永遠是妳。',
  waterfall: '整面往妳傾瀉，不留退路。',
  magnet: '極點是妳，我所有軌道都認妳。',
  tide: '從妳這裡起潮，推開我，又把我收回去。',
  comet: '飛出一段路，再回到妳心臟旁邊停。',
  flow: '整面起風，我順著妳走。',
};
const K_BASE = 0.06;
const D_BASE = 0.86;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stablePhraseIndex(dateKey: string, count: number) {
  if (!count) return 0;
  let hash = 2166136261;
  for (const char of dateKey) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
}

function hexToHue(hex: string): number {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return 320;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

function insideHeart(x: number, y: number) {
  return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const DPR = Math.max(1, devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * DPR || canvas.height !== h * DPR) {
    canvas.width = w * DPR;
    canvas.height = h * DPR;
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { ctx, w, h };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WallNode = {
  i: number;
  bx: number; by: number;
  x: number; y: number;
  vx: number; vy: number;
  phase: number;
  rot: number;
  text: string;
  size: number;
  ax?: number; ay?: number; aw?: number;
};

type Trail = { x: number; y: number; vx: number; vy: number; life: number; age: number; s: number };
type RippleEvent = { x: number; y: number; t: number; speed: number; amp: number; width: number };
type DnaPulse = { x: number; y: number; t: number; life: number };

// ─── Config ref shape ─────────────────────────────────────────────────────────

type Cfg = {
  mode: Mode;
  rainbow: boolean;
  baseHue: number;
  centerYPercent: number;
  densityVal: number;
  fontFactor: number;
  breatheVal: number;
  rippleVal: number;
  pressVal: number;
  pressRadius: number;
  hueSpeed: number;
};

// ─── Anim ref shape ──────────────────────────────────────────────────────────

type Anim = {
  nodes: WallNode[];
  trails: Trail[];
  rippleEvents: RippleEvent[];
  dnaPulses: DnaPulse[];
  frameHue: number;
  kCur: number; dCur: number; kTarget: number; dTarget: number;
  pressing: boolean; pressX: number; pressY: number; pressTimer: ReturnType<typeof setTimeout> | null;
  swirlActive: boolean; swirlX: number; swirlY: number;
  gravityActive: boolean; gravX: number; gravY: number;
  tornadoHold: boolean; thx: number; thy: number;
  rippleFollow: boolean; rfx: number; rfy: number; rippleFollowTimer: ReturnType<typeof setInterval> | null;
  dnaHold: boolean; dnaHX: number; dnaHY: number;
  ringLong: boolean; ringDir: number; ringTimer: ReturnType<typeof setTimeout> | null; ringBoost: number;
  waterfallHold: boolean; waterfallX: number; waterfallY: number;
  magHold: boolean; magP1x: number | null; magP1y: number | null; magP2x: number | null; magP2y: number | null;
  tideHold: boolean; tideUntil: number; tideDur: number; tideX: number; tideTimer: ReturnType<typeof setTimeout> | null;
  cometHold: boolean; cometUntil: number; cometDur: number; cometX: number; cometY: number; cometTimer: ReturnType<typeof setTimeout> | null;
  flowHold: boolean; flowUntil: number; flowDur: number; flowSeed: number; flowX: number; flowY: number; flowTimer: ReturnType<typeof setTimeout> | null;
  rafId: number;
};

function makeAnim(): Anim {
  return {
    nodes: [], trails: [], rippleEvents: [], dnaPulses: [],
    frameHue: 280,
    kCur: K_BASE, dCur: D_BASE, kTarget: K_BASE, dTarget: D_BASE,
    pressing: false, pressX: 0, pressY: 0, pressTimer: null,
    swirlActive: false, swirlX: 0, swirlY: 0,
    gravityActive: false, gravX: 0, gravY: 0,
    tornadoHold: false, thx: 0, thy: 0,
    rippleFollow: false, rfx: 0, rfy: 0, rippleFollowTimer: null,
    dnaHold: false, dnaHX: 0, dnaHY: 0,
    ringLong: false, ringDir: 1, ringTimer: null, ringBoost: 1,
    waterfallHold: false, waterfallX: 0, waterfallY: 0,
    magHold: false, magP1x: null, magP1y: null, magP2x: null, magP2y: null,
    tideHold: false, tideUntil: 0, tideDur: 1400, tideX: 0, tideTimer: null,
    cometHold: false, cometUntil: 0, cometDur: 1300, cometX: 0, cometY: 0, cometTimer: null,
    flowHold: false, flowUntil: 0, flowDur: 1600, flowSeed: 0, flowX: 0, flowY: 0, flowTimer: null,
    rafId: 0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeartWallPage() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('burst');
  const [rainbow, setRainbow] = useState(true);
  const [heartColor, setHeartColor] = useState('#ff79c6');
  const [heightPct, setHeightPct] = useState(56);
  const [densityPct, setDensityPct] = useState(60);
  const [fontPct, setFontPct] = useState(100);
  const [breathePct, setBreathePct] = useState(50);
  const [ripplePct, setRipplePct] = useState(70);
  const [pressPct, setPressPct] = useState(110);
  const [pressRPct, setPressRPct] = useState(110);
  const [hueSpeedPct, setHueSpeedPct] = useState(50);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cfgRef = useRef<Cfg>({
    mode: 'burst',
    rainbow: true,
    baseHue: hexToHue('#ff79c6'),
    centerYPercent: 0.56,
    densityVal: 0.60,
    fontFactor: 1.00,
    breatheVal: 0.04,
    rippleVal: 0.70,
    pressVal: 1.10,
    pressRadius: 110,
    hueSpeed: 50,
  });

  const animRef = useRef<Anim>(makeAnim());

  // Daily phrase
  const dailyPhrase = useMemo(() => {
    const pool = getGlobalHoverPoolEntries().map((e) => e.phrase.trim()).filter(Boolean);
    const phrases = pool.length ? pool : DEFAULT_PHRASES;
    return phrases[stablePhraseIndex(todayDateKey(), phrases.length)] ?? DEFAULT_PHRASES[0];
  }, []);

  // Sync React state → cfgRef (no re-renders needed in the loop)
  useEffect(() => { cfgRef.current.mode = mode; }, [mode]);
  useEffect(() => { cfgRef.current.rainbow = rainbow; }, [rainbow]);
  useEffect(() => { cfgRef.current.baseHue = hexToHue(heartColor); }, [heartColor]);
  useEffect(() => { cfgRef.current.centerYPercent = heightPct / 100; }, [heightPct]);
  useEffect(() => { cfgRef.current.densityVal = densityPct / 100; }, [densityPct]);
  useEffect(() => { cfgRef.current.fontFactor = fontPct / 100; }, [fontPct]);
  useEffect(() => { cfgRef.current.breatheVal = breathePct / 100 * 0.08; }, [breathePct]);
  useEffect(() => { cfgRef.current.rippleVal = ripplePct / 100; }, [ripplePct]);
  useEffect(() => { cfgRef.current.pressVal = pressPct / 100; }, [pressPct]);
  useEffect(() => { cfgRef.current.pressRadius = pressRPct; }, [pressRPct]);
  useEffect(() => { cfgRef.current.hueSpeed = hueSpeedPct; }, [hueSpeedPct]);

  // ── Build wall nodes ────────────────────────────────────────────────────────

  const buildWall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.clientWidth) return;
    const s = setupCanvas(canvas);
    const cfg = cfgRef.current;
    const a = animRef.current;
    a.nodes = [];
    const { w, h } = s;
    const cx = w / 2;
    const cy = h * cfg.centerYPercent;
    const scale = Math.min(w, h) * 0.25;
    const charStep = (scale / 16) * (1.6 - cfg.densityVal);
    const fontSize = Math.max(14, charStep * 0.88 * cfg.fontFactor);
    let idx = 0;
    for (let yy = -1.2; yy <= 1.2; yy += charStep / scale) {
      for (let xx = -1.3; xx <= 1.3; xx += charStep / scale) {
        if (insideHeart(xx, yy)) {
          const gx = cx + xx * scale;
          const gy = cy - yy * scale;
          const r = Math.hypot(gx - cx, gy - cy);
          const phase = (r / (scale * 1.15)) * Math.PI * 1.6 + Math.random() * 0.6;
          a.nodes.push({
            i: idx++,
            bx: gx, by: gy, x: gx, y: gy, vx: 0, vy: 0,
            phase,
            rot: (Math.random() - 0.5) * 0.02,
            text: CHARS[idx % CHARS.length],
            size: fontSize,
          });
        }
      }
    }
  }, []);

  // ── Spring helper ───────────────────────────────────────────────────────────

  const setSpring = useCallback((k: number, d: number, holdMs: number) => {
    const a = animRef.current;
    a.kTarget = k;
    a.dTarget = d;
    if (holdMs) {
      setTimeout(() => { a.kTarget = K_BASE; a.dTarget = D_BASE; }, holdMs);
    }
  }, []);

  // ── Mode enter ──────────────────────────────────────────────────────────────

  const onModeEnter = useCallback((newMode: Mode) => {
    const a = animRef.current;
    if (a.ringTimer) clearTimeout(a.ringTimer);
    a.ringLong = false; a.ringBoost = 1.0;
    a.waterfallHold = false; a.magHold = false;
    if (a.rippleFollow) { clearInterval(a.rippleFollowTimer!); a.rippleFollow = false; }
    clearTimeout(a.tideTimer!); a.tideHold = false; a.tideUntil = 0;
    clearTimeout(a.cometTimer!); a.cometHold = false; a.cometUntil = 0;
    clearTimeout(a.flowTimer!); a.flowHold = false; a.flowUntil = 0;

    if (newMode === 'tornado' || newMode === 'tornadoHold') setSpring(0.035, 0.90, 2400);
    else if (newMode === 'explode') setSpring(0.045, 0.88, 1600);
    else if (newMode === 'dna') setSpring(0.055, 0.90, 0);
    else if (newMode === 'ring') setSpring(0.060, 0.90, 0);
    else if (newMode === 'waterfall') setSpring(0.055, 0.88, 0);
    else if (newMode === 'magnet') setSpring(0.060, 0.90, 0);
    else setSpring(K_BASE, D_BASE, 0);
  }, [setSpring]);

  const handleModeChange = useCallback((newMode: Mode) => {
    cfgRef.current.mode = newMode;
    setMode(newMode);
    onModeEnter(newMode);
    setPanelOpen(false);
  }, [onModeEnter]);

  // ── Ripple / Rain ───────────────────────────────────────────────────────────

  const addRipple = useCallback((x: number, y: number) => {
    const cfg = cfgRef.current;
    const amp = 16 + cfg.rippleVal * 0.45 * 100;
    const width = 24 + cfg.rippleVal * 100;
    animRef.current.rippleEvents.push({ x, y, t: performance.now(), speed: 0.82, amp, width });
  }, []);

  const rainAtCenter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = r.width * 0.5;
    const cy = r.height * 0.6;
    const a = animRef.current;
    for (let i = 0; i < 240; i++) {
      const sp = 3.6 + Math.random() * 5.0;
      const ang = Math.random() * Math.PI * 2;
      a.trails.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 70 + Math.random() * 50, age: 0, s: 2.8 + Math.random() * 1.6 });
    }
    if (a.trails.length > 2400) a.trails = a.trails.slice(a.trails.length - 2400);
  }, []);

  const triggerExplode = useCallback((px: number, py: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = setupCanvas(canvas);
    const cx = s.w / 2;
    const cy = s.h * cfgRef.current.centerYPercent;
    for (const n of animRef.current.nodes) {
      const dx = n.x - (px || cx);
      const dy = n.y - (py || cy);
      const d = Math.hypot(dx, dy) || 1;
      const power = 22 + Math.random() * 30;
      n.vx += (dx / d) * power;
      n.vy += (dy / d) * power;
    }
  }, []);

  const triggerTornado = useCallback((px: number, _py: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = setupCanvas(canvas);
    const cfg = cfgRef.current;
    const cx = px || s.w / 2;
    const cy = s.h * cfg.centerYPercent;
    const W = cfg.pressRadius;
    for (const n of animRef.current.nodes) {
      const dx = n.x - cx;
      const dy = n.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const band = Math.exp(-(dx * dx + dy * dy) / (2 * W * W));
      const dirx = dx / d; const diry = dy / d;
      const tangx = -diry; const tangy = dirx;
      const radial = (10 + cfg.pressVal * 7) * band;
      const tang = (8 + cfg.pressVal * 5) * band;
      const rand = Math.random() * 0.4 + 0.8;
      n.vx += (dirx * radial + tangx * tang) * rand;
      n.vy += (diry * radial + tangy * tang) * rand;
    }
  }, []);

  // ── Main animation loop ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    buildWall();

    function drawHeartShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number, color: string) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(12, -24, 28, -10, 0, 18);
      ctx.bezierCurveTo(-28, -10, -12, -24, 0, -10);
      ctx.fill();
      ctx.restore();
    }

    function magnetField(nx: number, ny: number, ax: number, ay: number) {
      const dx = nx - ax; const dy = ny - ay;
      const r2 = dx * dx + dy * dy + 120;
      const inv = 1 / Math.pow(r2, 1.15);
      return { x: dx * inv, y: dy * inv };
    }

    function step() {
      const a = animRef.current;
      const cfg = cfgRef.current;
      const s = setupCanvas(canvas!);
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * cfg.centerYPercent;
      const t = performance.now() / 1000;

      a.frameHue = (a.frameHue + cfg.hueSpeed / 800) % 360;
      a.kCur += (a.kTarget - a.kCur) * 0.08;
      a.dCur += (a.dTarget - a.dCur) * 0.08;

      a.dnaPulses = a.dnaPulses.filter((p) => performance.now() - p.t < p.life);
      a.rippleEvents = a.rippleEvents.filter((rp) => performance.now() - rp.t < 2400);

      const m = cfg.mode;

      for (const n of a.nodes) {
        const beat = 1 + cfg.breatheVal * Math.sin(t * 2.0 + n.phase) + 0.012 * Math.sin(t * 5.0 + n.phase * 1.3);
        let offx = 0; let offy = 0; let sizeMul = 1; let alphaMul = 1;

        if (a.pressing) {
          const dx = n.bx - a.pressX; const dy = n.by - a.pressY;
          const d = Math.hypot(dx, dy) || 1;
          const A = 22 + cfg.pressVal * 10;
          const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
          offx += (dx / d) * A * band; offy += (dy / d) * A * band;
        }

        for (const rp of a.rippleEvents) {
          const age = (performance.now() - rp.t) / 16.666;
          const R = rp.speed * age;
          const dx = n.bx - rp.x; const dy = n.by - rp.y;
          const d = Math.hypot(dx, dy);
          const band = Math.exp(-((d - R) ** 2) / (2 * rp.width ** 2));
          offx += (dx / (d || 1)) * rp.amp * band;
          offy += (dy / (d || 1)) * rp.amp * band;
        }

        if (a.swirlActive) {
          const dx = n.bx - a.swirlX; const dy = n.by - a.swirlY;
          const d = Math.hypot(dx, dy) || 1;
          const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
          const tang = (18 + cfg.pressVal * 10) * band;
          offx += (-dy / d) * tang; offy += (dx / d) * tang;
        }

        if (a.gravityActive) {
          const dx = n.bx - a.gravX; const dy = n.by - a.gravY;
          const d = Math.hypot(dx, dy) || 1;
          const band = Math.exp(-(dx * dx + dy * dy) / (2 * (cfg.pressRadius * 1.2) ** 2));
          const pull = (22 + cfg.pressVal * 12) * band;
          offx -= (dx / d) * pull; offy -= (dy / d) * pull;
        }

        if (a.tornadoHold) {
          const dx = n.bx - a.thx; const dy = n.by - a.thy;
          const d = Math.hypot(dx, dy) || 1;
          const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
          const radial = (7 + cfg.pressVal * 4) * band;
          const tang = (10 + cfg.pressVal * 6) * band;
          offx += (dx / d) * radial + (-dy / d) * tang;
          offy += (dy / d) * radial + (dx / d) * tang;
        }

        if (m === 'dna') {
          const localY = n.by - cy;
          const strand = n.i % 2 ? 1 : -1;
          const phase = 0.022 * localY - 2.2 * t + n.phase * 0.08;
          let amp = 38;
          if (a.dnaHold) {
            const dx = n.bx - a.dnaHX; const dy = n.by - a.dnaHY;
            const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
            amp += 22 * band;
          }
          const depth = 0.5 + 0.5 * Math.cos(phase);
          offx += strand * amp * Math.sin(phase);
          sizeMul *= 0.90 + 0.30 * depth;
          alphaMul *= 0.70 + 0.35 * depth;
        }

        if (m === 'ring') {
          const dx = n.bx - cx; const dy = n.by - cy;
          const d = Math.hypot(dx, dy) || 1;
          const dir = (n.i % 2 ? 1 : -1) * a.ringDir;
          const phase = n.phase * 0.6 + 1.4 * a.ringBoost * t;
          const amt = dir * 22 * Math.sin(phase);
          offx += (-dy / d) * amt; offy += (dx / d) * amt;
        }

        if (m === 'waterfall') {
          const localY = n.by - (cy - 40);
          const phase = localY * 0.025 - 1.2 * t;
          let locAmp = 54;
          if (a.waterfallHold) {
            const dx = n.bx - a.waterfallX; const dy = n.by - a.waterfallY;
            const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
            locAmp += 26 * band;
          }
          offy += locAmp * Math.sin(phase);
          offx += 4 * Math.sin(phase * 0.8);
          const hyTest = cy + (n.by - cy) * beat + offy;
          const bounceLine = cy + Math.min(120, h * 0.18);
          if (hyTest > bounceLine) offy -= (hyTest - bounceLine) * 0.6;
        }

        if (m === 'magnet') {
          if (a.magP1x == null) {
            a.magP1x = cx - 140; a.magP1y = cy - 120;
            a.magP2x = cx + 140; a.magP2y = cy + 80;
          }
          const f1 = magnetField(n.bx, n.by, a.magP1x, a.magP1y!);
          const f2 = magnetField(n.bx, n.by, a.magP2x!, a.magP2y!);
          const ex = f1.x - f2.x; const ey = f1.y - f2.y;
          const strength = 28 * (a.magHold ? 1.6 : 1.0);
          offx += strength * (-ey); offy += strength * ex;
          sizeMul *= 0.98 + 0.04 * Math.random();
        }

        if (m === 'tide') {
          const remain = Math.max(0, a.tideUntil - performance.now());
          let A = 0;
          if (a.tideHold) A = 36 * (0.9 + 0.6 * Math.sin(t * 2.2));
          else if (remain > 0) { const e = 1 - remain / a.tideDur; A = 36 * Math.sin(e * Math.PI); }
          if (A > 0.0001) {
            const dx = n.bx - a.tideX;
            const phase = t * 2.6 * 3.0;
            offy += A * Math.sin(dx * 0.014 - phase);
            offx += 4 * Math.sin(dx * 0.014 * 0.6 - phase * 0.8);
          }
        }

        if (m === 'comet') {
          if (a.cometHold) {
            const dx = n.bx - a.cometX; const dy = n.by - a.cometY;
            const d = Math.hypot(dx, dy) || 1;
            const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
            const A = (18 + cfg.pressVal * 9) * band;
            offx += (dx / d) * A;
            offy += (dy / d) * A - 6 * band * (0.5 + 0.5 * Math.sin(t * 2.0));
          } else {
            const remain = Math.max(0, a.cometUntil - performance.now());
            if (remain > 0 && typeof n.ax === 'number' && typeof n.ay === 'number') {
              const e = 1 - remain / a.cometDur;
              const sv = Math.sin(e * Math.PI);
              offx += (n.ax - n.bx) * sv;
              offy += (n.ay - n.by) * sv - (n.aw || 0) * 4 * e * (1 - e);
            }
          }
        }

        if (m === 'flow') {
          const remain = Math.max(0, a.flowUntil - performance.now());
          let A = 0;
          if (a.flowHold) A = (22 + cfg.pressVal * 10) * (0.7 + 0.5 * Math.sin(t * 2.1));
          else if (remain > 0) { const e = 1 - remain / a.flowDur; A = (22 + cfg.pressVal * 10) * Math.sin(e * Math.PI); }
          if (A > 0.0001) {
            const ux = Math.sin((n.bx + a.flowSeed) * 0.020 + t * 1.6);
            const uy = Math.cos((n.by - a.flowSeed) * 0.018 + t * 1.4);
            offx += ux * A; offy += uy * A;
            if (a.flowHold) {
              const dx = n.bx - a.flowX; const dy = n.by - a.flowY;
              const band = Math.exp(-(dx * dx + dy * dy) / (2 * cfg.pressRadius ** 2));
              offx += ux * A * 0.25 * band; offy += uy * A * 0.25 * band;
            }
          }
        }

        const hx = cx + (n.bx - cx) * beat + offx;
        const hy = cy + (n.by - cy) * beat + offy;
        n.vx += (hx - n.x) * a.kCur; n.vy += (hy - n.y) * a.kCur;
        n.vx *= a.dCur; n.vy *= a.dCur;
        n.x += n.vx; n.y += n.vy;

        // Draw character
        const hue = cfg.rainbow
          ? (a.frameHue + (n.x + n.y) * 0.002) % 360
          : (cfg.baseHue + (n.x + n.y) * 0.002) % 360;

        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot);
        if (m === 'dna') { ctx.shadowColor = hsl((hue + 40) % 360, 100, 80); ctx.shadowBlur = 18; }
        else if (m === 'magnet') { ctx.shadowColor = hsl((hue + 100) % 360, 90, 70); ctx.shadowBlur = 10; }
        else { ctx.shadowBlur = 0; }
        ctx.fillStyle = hsl(hue, cfg.rainbow ? 80 : 85, 72);
        ctx.globalAlpha = alphaMul;
        ctx.font = `${Math.max(14, n.size * sizeMul)}px ui-monospace, Menlo, Monaco, Consolas, "SFMono-Regular"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.text, 0, 0);
        ctx.restore();
      }

      // Magnet poles
      if (m === 'magnet' && a.magP1x != null) {
        ctx.globalCompositeOperation = 'lighter';
        const drawPole = (px: number, py: number, col1: string, col2: string) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, 28);
          g.addColorStop(0, col1); g.addColorStop(1, col2);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col1; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
        };
        drawPole(a.magP1x, a.magP1y!, 'rgba(255,120,180,0.95)', 'rgba(255,120,180,0)');
        drawPole(a.magP2x!, a.magP2y!, 'rgba(120,200,255,0.95)', 'rgba(120,200,255,0)');
        ctx.globalCompositeOperation = 'source-over';
      }

      // Trails
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < a.trails.length; i++) {
        const tr = a.trails[i];
        tr.x += tr.vx; tr.y += tr.vy; tr.age++;
        const al = Math.max(0, 1 - tr.age / tr.life);
        drawHeartShape(ctx, tr.x, tr.y, tr.s, al, hsl((a.frameHue + 20) % 360, 90, 65));
      }
      a.trails = a.trails.filter((tr) => tr.age < tr.life);
      ctx.globalCompositeOperation = 'source-over';

      a.rafId = requestAnimationFrame(step);
    }

    animRef.current.rafId = requestAnimationFrame(step);

    // Resize observer
    const ro = new ResizeObserver(() => { buildWall(); });
    ro.observe(wrap);

    // Pointer events
    function getXY(e: PointerEvent | TouchEvent) {
      const r = wrap!.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as PointerEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as PointerEvent).clientY;
      return { x: clientX - r.left, y: clientY - r.top };
    }

    function downHandler(e: PointerEvent | TouchEvent) {
      if ((e.target as Element).closest?.('[data-gear]')) return;
      e.preventDefault();
      const p = getXY(e);
      const a2 = animRef.current;
      const cfg2 = cfgRef.current;

      if (cfg2.mode === 'burst') { rainAtCenter(); }
      else if (cfg2.mode === 'ripple') { addRipple(p.x, p.y); }
      else if (cfg2.mode === 'press') {
        clearTimeout(a2.pressTimer!);
        a2.pressTimer = setTimeout(() => { a2.pressing = true; a2.pressX = p.x; a2.pressY = p.y; }, 220);
      }
      else if (cfg2.mode === 'explode') { triggerExplode(p.x, p.y); }
      else if (cfg2.mode === 'swirl') { a2.swirlActive = true; a2.swirlX = p.x; a2.swirlY = p.y; }
      else if (cfg2.mode === 'gravity') { a2.gravityActive = true; a2.gravX = p.x; a2.gravY = p.y; }
      else if (cfg2.mode === 'tornado') {
        triggerTornado(p.x, p.y);
        setTimeout(() => { a2.tornadoHold = true; a2.thx = p.x; a2.thy = p.y; }, 220);
      }
      else if (cfg2.mode === 'tornadoHold') {
        a2.rfx = p.x; a2.rfy = p.y; a2.rippleFollow = true;
        addRipple(p.x, p.y);
        a2.rippleFollowTimer = setInterval(() => addRipple(a2.rfx, a2.rfy), 110);
      }
      else if (cfg2.mode === 'dna') { a2.dnaHX = p.x; a2.dnaHY = p.y; a2.dnaHold = true; }
      else if (cfg2.mode === 'ring') {
        a2.ringTimer = setTimeout(() => { a2.ringLong = true; a2.ringBoost = 3.0; }, 260);
      }
      else if (cfg2.mode === 'waterfall') {
        a2.waterfallHold = true; a2.waterfallX = p.x; a2.waterfallY = p.y;
        const sv = setupCanvas(canvas!);
        addRipple(p.x, sv.h * cfg2.centerYPercent + 80);
      }
      else if (cfg2.mode === 'magnet') {
        a2.magHold = true;
        const sv = setupCanvas(canvas!);
        const cy2 = sv.h * cfg2.centerYPercent;
        a2.magP1x = p.x - 120; a2.magP1y = cy2 - 90;
        a2.magP2x = p.x + 120; a2.magP2y = cy2 + 90;
      }
      else if (cfg2.mode === 'tide') {
        a2.tideX = p.x;
        clearTimeout(a2.tideTimer!);
        a2.tideTimer = setTimeout(() => { a2.tideHold = true; }, 220);
      }
      else if (cfg2.mode === 'comet') {
        a2.cometX = p.x; a2.cometY = p.y;
        clearTimeout(a2.cometTimer!);
        a2.cometTimer = setTimeout(() => { a2.cometHold = true; }, 220);
      }
      else if (cfg2.mode === 'flow') {
        a2.flowX = p.x; a2.flowY = p.y;
        a2.flowSeed = Math.random() * 1000;
        clearTimeout(a2.flowTimer!);
        a2.flowTimer = setTimeout(() => { a2.flowHold = true; }, 220);
      }
    }

    function moveHandler(e: PointerEvent | TouchEvent) {
      const p = getXY(e);
      const a2 = animRef.current;
      if (a2.pressing) { a2.pressX = p.x; a2.pressY = p.y; }
      if (a2.swirlActive) { a2.swirlX = p.x; a2.swirlY = p.y; }
      if (a2.gravityActive) { a2.gravX = p.x; a2.gravY = p.y; }
      if (a2.tornadoHold) { a2.thx = p.x; a2.thy = p.y; }
      if (a2.rippleFollow) { a2.rfx = p.x; a2.rfy = p.y; }
      if (a2.dnaHold) { a2.dnaHX = p.x; a2.dnaHY = p.y; }
      if (a2.waterfallHold) { a2.waterfallX = p.x; a2.waterfallY = p.y; }
      if (a2.magHold) {
        const sv = setupCanvas(canvas!);
        const cy2 = sv.h * cfgRef.current.centerYPercent;
        a2.magP1x = p.x - 120; a2.magP1y = cy2 - 90;
        a2.magP2x = p.x + 120; a2.magP2y = cy2 + 90;
      }
      if (a2.tideHold) { a2.tideX = p.x; }
      if (a2.cometHold) { a2.cometX = p.x; a2.cometY = p.y; }
      if (a2.flowHold) { a2.flowX = p.x; a2.flowY = p.y; }
    }

    function upHandler() {
      const a2 = animRef.current;
      const cfg2 = cfgRef.current;
      clearTimeout(a2.pressTimer!); clearTimeout(a2.ringTimer!);
      a2.pressing = false; a2.swirlActive = false; a2.gravityActive = false; a2.tornadoHold = false;
      if (a2.rippleFollow) { clearInterval(a2.rippleFollowTimer!); a2.rippleFollow = false; }
      a2.dnaHold = false; a2.waterfallHold = false; a2.magHold = false;
      if (cfg2.mode === 'ring' && !a2.ringLong) { a2.ringDir *= -1; }
      a2.ringLong = false; a2.ringBoost = 1;

      if (cfg2.mode === 'tide' && !a2.tideHold) {
        a2.tideUntil = performance.now() + a2.tideDur;
      }
      if (cfg2.mode === 'comet' && !a2.cometHold) {
        for (const n of a2.nodes) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 80;
          n.ax = n.bx + Math.cos(ang) * dist;
          n.ay = n.by + Math.sin(ang) * dist;
          n.aw = Math.random() * 40 + 20;
        }
        a2.cometUntil = performance.now() + a2.cometDur;
      }
      if (cfg2.mode === 'flow' && !a2.flowHold) {
        a2.flowUntil = performance.now() + a2.flowDur;
      }

      clearTimeout(a2.tideTimer!); a2.tideHold = false;
      clearTimeout(a2.cometTimer!); a2.cometHold = false;
      clearTimeout(a2.flowTimer!); a2.flowHold = false;
    }

    const opts = { passive: false } as AddEventListenerOptions;
    wrap.addEventListener('pointerdown', downHandler as EventListener, opts);
    canvas.addEventListener('pointerdown', downHandler as EventListener, opts);
    wrap.addEventListener('pointermove', moveHandler as EventListener, opts);
    canvas.addEventListener('pointermove', moveHandler as EventListener, opts);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => {
      wrap.addEventListener(ev, upHandler);
      canvas.addEventListener(ev, upHandler);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      cancelAnimationFrame(animRef.current.rafId);
      ro.disconnect();
      wrap.removeEventListener('pointerdown', downHandler as EventListener);
      canvas.removeEventListener('pointerdown', downHandler as EventListener);
      wrap.removeEventListener('pointermove', moveHandler as EventListener);
      canvas.removeEventListener('pointermove', moveHandler as EventListener);
    };
  }, [buildWall, addRipple, rainAtCenter, triggerExplode, triggerTornado]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const sliders: [string, number, (v: number) => void, number, number][] = [
    ['心形高度', heightPct, setHeightPct, 30, 70],
    ['密度', densityPct, setDensityPct, 20, 100],
    ['字體大小', fontPct, setFontPct, 50, 200],
    ['呼吸幅度', breathePct, setBreathePct, 0, 100],
    ['波紋強度', ripplePct, setRipplePct, 0, 100],
    ['推力強度', pressPct, setPressPct, 0, 200],
    ['推力範圍', pressRPct, setPressRPct, 40, 260],
    ['色相速度', hueSpeedPct, setHueSpeedPct, 0, 200],
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: '#0c0d1a' }}>
      {/* Top bar */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 px-4 py-2">
        <button
          data-gear
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-opacity active:opacity-70"
          style={{ background: 'rgba(141,147,255,0.22)' }}
        >
          ⚙️
        </button>
        <button
          data-gear
          type="button"
          onClick={() => rainAtCenter()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-opacity active:opacity-70"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          title="下心雨"
        >
          💧
        </button>
        <button
          data-gear
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const r = canvas.getBoundingClientRect();
            addRipple(r.width * 0.5, r.height * cfgRef.current.centerYPercent);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-opacity active:opacity-70"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          title="波紋"
        >
          🌊
        </button>
        <p className="flex-1 truncate text-xs" style={{ color: '#8d93ff' }}>
          {dailyPhrase}
        </p>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className="relative flex-1"
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: 'none' }}
        />
        {/* Mode phrase */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-6">
          <p className="text-center text-xs" style={{ color: 'rgba(183,187,255,0.65)', letterSpacing: '0.02em' }}>
            {LINE_MAP[mode]}
          </p>
        </div>
      </div>

      {/* Gear panel — slides up from bottom */}
      {panelOpen && (
        <div
          data-gear
          className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl px-4 pb-6 pt-3"
          style={{
            background: 'rgba(10,11,26,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '72vh',
            overflowY: 'auto',
          }}
        >
          {/* Drag handle */}
          <button
            data-gear
            type="button"
            onClick={() => setPanelOpen(false)}
            className="mx-auto mb-4 block h-1 w-12 rounded-full"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          />

          {/* Mode selector */}
          <p className="mb-2 text-xs font-bold" style={{ color: '#8d93ff' }}>互動模式</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                data-gear
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className="rounded-full px-3 py-1 text-sm font-bold transition-opacity active:opacity-70"
                style={
                  mode === m
                    ? { background: 'linear-gradient(135deg,#8d93ff,#ff79c6)', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.08)', color: '#b7bbff', border: '1px solid rgba(255,255,255,0.12)' }
                }
              >
                {MODE_NAMES[m]}
              </button>
            ))}
          </div>

          {/* Color */}
          <p className="mb-2 text-xs font-bold" style={{ color: '#8d93ff' }}>字母顏色</p>
          <div className="mb-5 flex items-center gap-3">
            <button
              data-gear
              type="button"
              onClick={() => setRainbow((v) => !v)}
              className="rounded-full px-3 py-1 text-sm font-bold transition-opacity active:opacity-70"
              style={
                rainbow
                  ? { background: 'linear-gradient(135deg,#8d93ff,#ff79c6)', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.08)', color: '#b7bbff', border: '1px solid rgba(255,255,255,0.12)' }
              }
            >
              🌈 彩虹
            </button>
            <div className="flex items-center gap-2">
              <input
                data-gear
                type="color"
                value={heartColor}
                onChange={(e) => { setHeartColor(e.target.value); setRainbow(false); }}
                className="h-8 w-8 cursor-pointer rounded-full border-0 p-0"
                style={{ background: 'transparent' }}
                title="自訂顏色（關閉彩虹）"
              />
              {!rainbow && (
                <span className="text-xs" style={{ color: '#b7bbff' }}>{heartColor}</span>
              )}
            </div>
          </div>

          {/* Sliders */}
          <p className="mb-2 text-xs font-bold" style={{ color: '#8d93ff' }}>細部調整</p>
          {sliders.map(([label, val, setter, min, max]) => (
            <div key={label} className="mb-3 flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs" style={{ color: '#b7bbff' }}>{label}</span>
              <input
                data-gear
                type="range"
                min={min}
                max={max}
                value={val}
                onChange={(e) => setter(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: '#ff79c6' }}
              />
              <span className="w-8 shrink-0 text-right text-xs" style={{ color: '#8d93ff' }}>{val}</span>
            </div>
          ))}

          {/* Rebuild button for density/font changes */}
          <button
            data-gear
            type="button"
            onClick={() => buildWall()}
            className="mt-2 w-full rounded-xl py-2 text-sm font-bold transition-opacity active:opacity-70"
            style={{ background: 'linear-gradient(135deg,rgba(141,147,255,0.22),rgba(255,121,198,0.18))', color: '#c8cbff', border: '1px solid rgba(141,147,255,0.3)' }}
          >
            重建心牆
          </button>
        </div>
      )}
    </div>
  );
}
