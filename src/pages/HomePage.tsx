import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  DEFAULT_HOME_POLAROID_MESSAGES,
  type AppLabels,
  type BackgroundMode,
  type HomeDynamicWallpaperPreset,
  type HomeFinalWidgetPreset,
  type HomeWallpaperEffectPreset,
  type TabIconUrls,
} from '../types/settings';

type LauncherAppId =
  | 'tarot'
  | 'letters'
  | 'lettersAB'
  | 'heart'
  | 'chat'
  | 'settingsShortcut'
  | 'list'
  | 'wishlist'
  | 'fitness'
  | 'pomodoro'
  | 'period'
  | 'diary'
  | 'diaryB'
  | 'album'
  | 'notes'
  | 'memo'
  | 'murmur'
  | 'lightPath'
  | 'healingCampfire'
  | 'questionnaire'
  | 'selfIntro'
  | 'soulmate'
  | 'bookshelf'
  | 'moodLetters'
  | 'archive';

type HomePageProps = {
  tabIconUrls: TabIconUrls;
  tabIconDisplayMode: 'framed' | 'full';
  launcherLabels: AppLabels;
  homeSwipeEnabled: boolean;
  widgetTitle: string;
  widgetSubtitle: string;
  widgetBadgeText: string;
  widgetIconDataUrl: string;
  backgroundMode: BackgroundMode;
  homeDynamicWallpaperPreset: HomeDynamicWallpaperPreset;
  homeWallpaperEffectPreset: HomeWallpaperEffectPreset;
  homeDynamicEffectsEnabled: boolean;
  homeDynamicIntensity: number;
  homeDynamicSpeed: number;
  homeDynamicParticleAmount: number;
  memorialStartDate: string;
  homeFinalWidgetPreset: HomeFinalWidgetPreset;
  homePolaroidMessages: string[];
  onLaunchApp: (appId: LauncherAppId) => void;
  onOpenCheckin: () => void;
  onOpenSettings: () => void;
  onWidgetIconChange: (dataUrl: string) => void;
};

type HomeAppSlot = {
  id: string;
  label: string;
  icon: string;
  iconUrl?: string;
  launch?: LauncherAppId;
  disabled?: boolean;
};

type HomeScreen =
  | {
      id: string;
      kind: 'main';
      showDashboard: boolean;
      slots: HomeAppSlot[];
    }
  | {
      id: string;
      kind: 'blank';
    }
  | {
      id: string;
      kind: 'widget';
      widgetPreset: HomeFinalWidgetPreset;
    };

type AnchorPosition = {
  x: number;
  y: number;
};

const CHIBI_POSITION_STORAGE_KEY = 'memorial-home-corner-chibi-anchor';
const COUNTER_VINYL_PREFS_STORAGE_KEY = 'memorial-home-counter-vinyl-prefs-v1';
const COUNTER_VINYL_COVER_STORAGE_KEY = 'memorial-home-counter-vinyl-cover-v1';
const COUNTER_VINYL_SPEED_OPTIONS = [
  { label: '16 RPM', value: 0.5 },
  { label: '24 RPM', value: 0.72 },
  { label: '28 RPM', value: 0.84 },
  { label: '33 RPM', value: 1 },
  { label: '45 RPM', value: 1.35 },
  { label: '60 RPM', value: 1.8 },
  { label: '78 RPM', value: 2.2 },
] as const;
const COUNTER_VINYL_COVER_OFFSET_MIN = -14;
const COUNTER_VINYL_COVER_OFFSET_MAX = 14;
const COUNTER_VINYL_COVER_OFFSET_STEP = 1;
const HOME_POLAROID_FLASH_MS = 100;
const HOME_POLAROID_REVEAL_DELAY_MS = 300;
const HOME_POLAROID_GRADIENTS = [
  'linear-gradient(135deg, #a8d0e6, #b8e0d2)',
  'linear-gradient(135deg, #ff9a9e, #fecfef)',
  'linear-gradient(135deg, #f6d365, #fda085)',
  'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
  'linear-gradient(135deg, #ffcdb2, #b5838d)',
];
const HOME_POLAROID_CAMERA_THEMES = [
  { start: '#ffdce7', end: '#ffcadb', border: 'rgb(255 255 255 / 0.78)' },
  { start: '#ffe7c8', end: '#ffd8ad', border: 'rgb(255 248 235 / 0.8)' },
  { start: '#fff3b8', end: '#ffe79a', border: 'rgb(255 255 237 / 0.8)' },
  { start: '#d8f6d8', end: '#c3edca', border: 'rgb(241 255 241 / 0.8)' },
  { start: '#d8eefc', end: '#c6e2f8', border: 'rgb(239 250 255 / 0.8)' },
  { start: '#e6dcff', end: '#d7ccff', border: 'rgb(246 241 255 / 0.8)' },
];

type HomePolaroidCard = {
  text: string;
  color: string;
};

type WallpaperParticle = {
  x: number;
  y: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
  opacity: number;
};

type WallpaperBokehOrb = {
  x: number;
  y: number;
  size: number;
  blur: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
  hue: number;
  alpha: number;
};

type WallpaperLantern = {
  left: number;
  bottom: number;
  duration: number;
  delay: number;
  scale: number;
};

type WallpaperHeart = {
  left: number;
  bottom: number;
  duration: number;
  delay: number;
  scale: number;
};

type WallpaperRibbon = {
  cls: 'a' | 'b' | 'c';
  top: string;
  left: string;
  duration: number;
  delay: number;
};

type WallpaperUpBubble = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
  blur: number;
};

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function buildSnowParticles(count: number, seedOffset = 0, sizeBoost = 1): WallpaperParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + seedOffset;
    const r1 = pseudoRandom(seed + 0.17);
    const r2 = pseudoRandom(seed + 0.41);
    const r3 = pseudoRandom(seed + 0.83);
    const r4 = pseudoRandom(seed + 1.13);
    const r5 = pseudoRandom(seed + 1.57);
    const r6 = pseudoRandom(seed + 2.03);
    const r7 = pseudoRandom(seed + 2.37);

    return {
      x: 2 + r1 * 96,
      y: -8 - r2 * 38,
      delay: -(r3 * 14.5),
      duration: 7.4 + r4 * 8.8,
      size: (1.8 + r5 * 5.4) * sizeBoost,
      drift: -22 + r6 * 44,
      opacity: 0.42 + r7 * 0.52,
    };
  });
}

function buildStardust(count: number): WallpaperParticle[] {
  return Array.from({ length: count }, (_, index) => ({
    x: (index * 13 + 4) % 100,
    y: 8 + ((index * 17 + 8) % 80),
    delay: -((index % 9) * 0.9),
    duration: 2.1 + (index % 6) * 0.7,
    size: 1 + (index % 4) * 0.96,
    drift: (index % 2 === 0 ? 1 : -1) * (2 + (index % 3) * 2),
    opacity: 0.5 + (index % 4) * 0.12,
  }));
}

function buildBokehOrbs(count: number): WallpaperBokehOrb[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 6 + ((index * 19 + 3) % 88),
    y: 6 + ((index * 31 + 5) % 82),
    size: 90 + (index % 4) * 42,
    blur: 2 + (index % 3) * 2.5,
    delay: -((index % 6) * 1.3),
    duration: 9 + (index % 5) * 2.25,
    driftX: (index % 2 === 0 ? 1 : -1) * (12 + (index % 4) * 8),
    driftY: (index % 3 === 0 ? -1 : 1) * (10 + (index % 3) * 6),
    hue: (index * 38 + 12) % 360,
    alpha: 0.26 + (index % 4) * 0.08,
  }));
}

function buildLanterns(): WallpaperLantern[] {
  const particles: WallpaperLantern[] = [];
  for (let i = 0; i < 18; i += 1) {
    particles.push({
      left: Math.random() * 100,
      bottom: -12 - Math.random() * 80,
      duration: 16 + Math.random() * 16,
      delay: -Math.random() * 22,
      scale: 0.78 + Math.random() * 0.65,
    });
  }
  return particles;
}

function buildHearts(count: number): WallpaperHeart[] {
  const particles: WallpaperHeart[] = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      left: Math.random() * 100,
      bottom: -12 - Math.random() * 84,
      duration: 14 + Math.random() * 15,
      delay: -Math.random() * 18,
      scale: 0.78 + Math.random() * 0.72,
    });
  }
  return particles;
}

function buildRibbons(): WallpaperRibbon[] {
  return [
    { cls: 'a', top: '24%', left: '-8%', duration: 14, delay: -3 },
    { cls: 'b', top: '46%', left: '6%', duration: 16, delay: -9 },
    { cls: 'c', top: '68%', left: '-4%', duration: 18, delay: -6 },
  ];
}

function buildUpBubbles(count: number, seedOffset = 0, sizeBoost = 1): WallpaperUpBubble[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + seedOffset;
    const r1 = pseudoRandom(seed + 0.13);
    const r2 = pseudoRandom(seed + 0.47);
    const r3 = pseudoRandom(seed + 0.83);
    const r4 = pseudoRandom(seed + 1.19);
    const r5 = pseudoRandom(seed + 1.53);
    const r6 = pseudoRandom(seed + 1.91);
    const r7 = pseudoRandom(seed + 2.27);
    const r8 = pseudoRandom(seed + 2.63);

    return {
      left: 1 + r1 * 98,
      top: 102 + r2 * 36,
      size: (2.3 + r3 * 4.8) * sizeBoost,
      opacity: 0.46 + r4 * 0.46,
      duration: 6.2 + r5 * 4.8,
      delay: -(r6 * 10.8),
      drift: (r7 > 0.5 ? 1 : -1) * (10 + r8 * 30),
      blur: r3 * 1.1,
    };
  });
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatTimeHHMM(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatWeekday(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

function formatMonthDay(date: Date) {
  const month = date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${month}. ${pad2(date.getDate())}`;
}

function parseIsoDate(value: string) {
  const matched = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function calcMemorialDayCount(startDate: Date, now: Date) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

function normalizeHomePolaroidMessages(messages: readonly string[]) {
  const normalized = messages.map((message) => message.trim()).filter((message) => message.length > 0);
  return normalized.length ? normalized : DEFAULT_HOME_POLAROID_MESSAGES;
}

function normalizeCircularIndex(index: number, size: number) {
  if (!Number.isFinite(index) || size <= 0) {
    return 0;
  }
  return ((Math.trunc(index) % size) + size) % size;
}

function buildHomePolaroidCard(messages: readonly string[], messageIndex: number): HomePolaroidCard {
  const safeIndex = normalizeCircularIndex(messageIndex, messages.length);
  return {
    text: messages[safeIndex] ?? DEFAULT_HOME_POLAROID_MESSAGES[0],
    color: HOME_POLAROID_GRADIENTS[safeIndex % HOME_POLAROID_GRADIENTS.length] ?? HOME_POLAROID_GRADIENTS[0],
  };
}

function HomeAppButton({
  slot,
  iconDisplayMode,
  onLaunch,
}: {
  slot: HomeAppSlot;
  iconDisplayMode: 'framed' | 'full';
  onLaunch: (appId: LauncherAppId) => void;
}) {
  const clickable = !!slot.launch && !slot.disabled;
  const useFullMode = iconDisplayMode === 'full' && !!slot.iconUrl;

  return (
    <button
      type="button"
      onClick={clickable ? () => onLaunch(slot.launch!) : undefined}
      disabled={!clickable}
      className={`flex flex-col items-center gap-2 ${clickable ? 'active:scale-95' : 'opacity-35'}`}
      aria-label={slot.label}
      title={slot.label}
    >
      <div
        className={`grid h-16 w-16 place-items-center overflow-hidden rounded-2xl ${
          useFullMode
            ? 'border border-transparent bg-transparent shadow-[0_18px_42px_rgba(0,0,0,0.22)]'
            : 'border border-white/45 bg-white/25 shadow-[0_18px_42px_rgba(0,0,0,0.14)] backdrop-blur'
        }`}
        style={useFullMode ? undefined : { boxShadow: '0 18px 42px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.65)' }}
      >
        {slot.iconUrl ? (
          <img
            src={slot.iconUrl}
            alt=""
            className={`${
              useFullMode ? 'h-16 w-16 rounded-2xl object-cover' : 'h-10 w-10 rounded-xl object-cover'
            }`}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="text-2xl leading-none" aria-hidden="true">
            {slot.icon}
          </span>
        )}
      </div>
      <span className="text-center text-xs tracking-wide text-stone-700">{slot.label}</span>
    </button>
  );
}

function HomePlaceholderTile() {
  return (
    <div className="flex flex-col items-center gap-2 opacity-35" aria-hidden="true">
      <div
        className="grid h-16 w-16 place-items-center rounded-2xl border border-white/35 bg-white/15 shadow-[0_18px_42px_rgba(0,0,0,0.10)] backdrop-blur"
        style={{ boxShadow: '0 18px 42px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.55)' }}
      >
        <span className="text-xl leading-none text-stone-700/60">+</span>
      </div>
      <span className="text-xs text-transparent">.</span>
    </div>
  );
}

export function HomePage({
  tabIconUrls,
  tabIconDisplayMode,
  launcherLabels,
  homeSwipeEnabled,
  widgetTitle,
  widgetSubtitle,
  widgetBadgeText,
  widgetIconDataUrl,
  backgroundMode,
  homeDynamicWallpaperPreset,
  homeWallpaperEffectPreset,
  homeDynamicEffectsEnabled,
  homeDynamicIntensity,
  homeDynamicSpeed,
  homeDynamicParticleAmount,
  memorialStartDate,
  homeFinalWidgetPreset,
  homePolaroidMessages,
  onLaunchApp,
  onOpenCheckin,
  onOpenSettings,
  onWidgetIconChange,
}: HomePageProps) {
  const [now, setNow] = useState(() => new Date());
  const [screenIndex, setScreenIndex] = useState(0);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const widgetIconInputRef = useRef<HTMLInputElement | null>(null);
  const counterWidgetIconInputRef = useRef<HTMLInputElement | null>(null);
  const homeRootRef = useRef<HTMLDivElement | null>(null);
  const cornerChibiRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    deltaX: number;
    deltaY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [isDraggingChibi, setIsDraggingChibi] = useState(false);
  const [chibiAnchor, setChibiAnchor] = useState<AnchorPosition>({ x: 0.9, y: 0.86 });
  const chibiAnchorRef = useRef(chibiAnchor);
  const [isCounterVinylPlaying, setIsCounterVinylPlaying] = useState(true);
  const [counterVinylSpeed, setCounterVinylSpeed] = useState(1);
  const [counterVinylCoverDataUrl, setCounterVinylCoverDataUrl] = useState('');
  const [counterVinylCoverOffsetY, setCounterVinylCoverOffsetY] = useState(0);
  const [isCounterSpeedMenuOpen, setIsCounterSpeedMenuOpen] = useState(false);
  const counterSpeedMenuRef = useRef<HTMLDivElement | null>(null);
  const counterSpeedToggleRef = useRef<HTMLButtonElement | null>(null);
  const [isPolaroidPrinting, setIsPolaroidPrinting] = useState(false);
  const [isPolaroidFlashActive, setIsPolaroidFlashActive] = useState(false);
  const [isPolaroidPhotoVisible, setIsPolaroidPhotoVisible] = useState(false);
  const polaroidFlashTimerRef = useRef<number | null>(null);
  const polaroidRevealTimerRef = useRef<number | null>(null);
  const polaroidNextMessageIndexRef = useRef(0);
  const [polaroidCameraThemeIndex, setPolaroidCameraThemeIndex] = useState(() =>
    Math.floor(Math.random() * HOME_POLAROID_CAMERA_THEMES.length),
  );
  const normalizedPolaroidMessages = useMemo(
    () => normalizeHomePolaroidMessages(homePolaroidMessages),
    [homePolaroidMessages],
  );
  const currentPolaroidCameraTheme =
    HOME_POLAROID_CAMERA_THEMES[
      normalizeCircularIndex(polaroidCameraThemeIndex, HOME_POLAROID_CAMERA_THEMES.length)
    ] ?? HOME_POLAROID_CAMERA_THEMES[0];
  const [polaroidCard, setPolaroidCard] = useState<HomePolaroidCard>(() =>
    buildHomePolaroidCard(normalizeHomePolaroidMessages(homePolaroidMessages), 0),
  );
  const cornerChibiUrl = `${import.meta.env.BASE_URL}chibi/chibi-00.webp`;
  const normalizedDynamicIntensity = Math.min(100, Math.max(0, homeDynamicIntensity));
  const normalizedDynamicSpeed = Math.min(100, Math.max(0, homeDynamicSpeed));
  const normalizedDynamicParticleAmount = Math.min(100, Math.max(0, homeDynamicParticleAmount));
  const dynamicSpeedFactor = 0.62 + (normalizedDynamicSpeed / 100) * 1.88;
  const dynamicIntensityFactor = 0.34 + (normalizedDynamicIntensity / 100) * 0.96;
  const dynamicParticleOpacity = 0.32 + (normalizedDynamicIntensity / 100) * 0.64;
  const dynamicGrainOpacity = 0.07 + (normalizedDynamicIntensity / 100) * 0.22;
  const dynamicParticleScale = normalizedDynamicParticleAmount / 100;
  const dynamicEffectPreset: HomeWallpaperEffectPreset = homeDynamicEffectsEnabled
    ? homeWallpaperEffectPreset
    : 'none';
  const dynamicSnowFarParticles = useMemo(
    () => buildSnowParticles(Math.round(12 + dynamicParticleScale * 24), 0.35, 0.92),
    [dynamicParticleScale],
  );
  const dynamicSnowNearParticles = useMemo(
    () => buildSnowParticles(Math.round(8 + dynamicParticleScale * 16), 37.7, 1.42),
    [dynamicParticleScale],
  );
  const dynamicStardust = useMemo(
    () => buildStardust(Math.round(16 + dynamicParticleScale * 36)),
    [dynamicParticleScale],
  );
  const dynamicBokehOrbs = useMemo(
    () => buildBokehOrbs(Math.round(7 + dynamicParticleScale * 10)),
    [dynamicParticleScale],
  );
  const dynamicLanterns = useMemo(() => buildLanterns(), []);
  const dynamicHearts = useMemo(
    () => buildHearts(Math.round(20 + dynamicParticleScale * 26)),
    [dynamicParticleScale],
  );
  const dynamicRibbons = useMemo(() => buildRibbons(), []);
  const dynamicBubbleFarParticles = useMemo(
    () => buildUpBubbles(Math.round(34 + dynamicParticleScale * 44), 11.6, 0.94),
    [dynamicParticleScale],
  );
  const dynamicBubbleNearParticles = useMemo(
    () => buildUpBubbles(Math.round(24 + dynamicParticleScale * 34), 57.3, 1.58),
    [dynamicParticleScale],
  );
  const dynamicBubbleMidParticles = useMemo(
    () => buildUpBubbles(Math.round(14 + dynamicParticleScale * 24), 93.1, 2.05),
    [dynamicParticleScale],
  );
  const dynamicBubbleHeroParticles = useMemo(
    () => buildUpBubbles(Math.round(9 + dynamicParticleScale * 16), 141.7, 2.6),
    [dynamicParticleScale],
  );

  useEffect(() => {
    chibiAnchorRef.current = chibiAnchor;
  }, [chibiAnchor]);

  const clampChibiAnchor = useCallback((anchor: AnchorPosition): AnchorPosition => {
    const host = homeRootRef.current;
    const ball = cornerChibiRef.current;
    if (!host || !ball) return anchor;

    const hostWidth = host.clientWidth;
    const hostHeight = host.clientHeight;
    if (!hostWidth || !hostHeight) return anchor;

    const halfWidth = ball.offsetWidth / 2;
    const halfHeight = ball.offsetHeight / 2;
    const minX = Math.min(0.95, Math.max(0.05, halfWidth / hostWidth));
    const maxX = Math.max(minX, 1 - minX);
    const minY = Math.min(0.95, Math.max(0.05, halfHeight / hostHeight));
    const maxY = Math.max(minY, 1 - minY);

    return {
      x: Math.min(maxX, Math.max(minX, anchor.x)),
      y: Math.min(maxY, Math.max(minY, anchor.y)),
    };
  }, []);

  const persistChibiAnchor = useCallback((anchor: AnchorPosition) => {
    try {
      window.localStorage.setItem(CHIBI_POSITION_STORAGE_KEY, JSON.stringify(anchor));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COUNTER_VINYL_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { isPlaying?: unknown; speed?: unknown };
      if (typeof parsed.isPlaying === 'boolean') {
        setIsCounterVinylPlaying(parsed.isPlaying);
      }
      if (
        typeof parsed.speed === 'number' &&
        Number.isFinite(parsed.speed) &&
        COUNTER_VINYL_SPEED_OPTIONS.some((option) => option.value === parsed.speed)
      ) {
        setCounterVinylSpeed(parsed.speed);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COUNTER_VINYL_PREFS_STORAGE_KEY,
        JSON.stringify({
          isPlaying: isCounterVinylPlaying,
          speed: counterVinylSpeed,
        }),
      );
    } catch {
      // ignore storage failures
    }
  }, [counterVinylSpeed, isCounterVinylPlaying]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COUNTER_VINYL_COVER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { cover?: unknown; offsetY?: unknown };
      if (typeof parsed.cover === 'string' && parsed.cover.startsWith('data:image/')) {
        setCounterVinylCoverDataUrl(parsed.cover);
      }
      if (typeof parsed.offsetY === 'number' && Number.isFinite(parsed.offsetY)) {
        setCounterVinylCoverOffsetY(
          Math.min(COUNTER_VINYL_COVER_OFFSET_MAX, Math.max(COUNTER_VINYL_COVER_OFFSET_MIN, parsed.offsetY)),
        );
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COUNTER_VINYL_COVER_STORAGE_KEY,
        JSON.stringify({ cover: counterVinylCoverDataUrl.trim(), offsetY: counterVinylCoverOffsetY }),
      );
    } catch {
      // ignore storage failures
    }
  }, [counterVinylCoverDataUrl, counterVinylCoverOffsetY]);

  useEffect(() => {
    if (!isCounterSpeedMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (counterSpeedToggleRef.current?.contains(target)) return;
      if (counterSpeedMenuRef.current?.contains(target)) return;
      setIsCounterSpeedMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isCounterSpeedMenuOpen]);

  useEffect(() => {
    if (!normalizedPolaroidMessages.length) {
      polaroidNextMessageIndexRef.current = 0;
      return;
    }

    polaroidNextMessageIndexRef.current = normalizeCircularIndex(
      polaroidNextMessageIndexRef.current,
      normalizedPolaroidMessages.length,
    );

    setPolaroidCard((current) => {
      if (normalizedPolaroidMessages.includes(current.text)) {
        return current;
      }
      return buildHomePolaroidCard(normalizedPolaroidMessages, 0);
    });
  }, [normalizedPolaroidMessages]);

  useEffect(
    () => () => {
      if (polaroidFlashTimerRef.current !== null) {
        window.clearTimeout(polaroidFlashTimerRef.current);
      }
      if (polaroidRevealTimerRef.current !== null) {
        window.clearTimeout(polaroidRevealTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHIBI_POSITION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AnchorPosition>;
      if (
        typeof parsed.x === 'number' &&
        Number.isFinite(parsed.x) &&
        typeof parsed.y === 'number' &&
        Number.isFinite(parsed.y)
      ) {
        setChibiAnchor({
          x: Math.min(0.98, Math.max(0.02, parsed.x)),
          y: Math.min(0.98, Math.max(0.02, parsed.y)),
        });
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      setChibiAnchor((current) => clampChibiAnchor(current));
    };

    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [clampChibiAnchor]);

  const screens = useMemo<HomeScreen[]>(() => {
    const tarotSlot: HomeAppSlot = {
      id: 'tarot',
      label: launcherLabels.tarot,
      icon: '🔮',
      iconUrl: tabIconUrls.tarot.trim() || undefined,
      launch: 'tarot',
    };
    const lettersSlot: HomeAppSlot = {
      id: 'letters',
      label: launcherLabels.letters,
      icon: '💌',
      iconUrl: tabIconUrls.letters.trim() || undefined,
      launch: 'letters',
    };
    const heartSlot: HomeAppSlot = {
      id: 'heart',
      label: launcherLabels.heart,
      icon: '💗',
      iconUrl: tabIconUrls.heart.trim() || undefined,
      launch: 'heart',
    };
    const chatSlot: HomeAppSlot = {
      id: 'chat',
      label: launcherLabels.chat,
      icon: '💬',
      launch: 'chat',
    };
    const listSlot: HomeAppSlot = {
      id: 'list',
      label: launcherLabels.list,
      icon: '🎴',
      iconUrl: tabIconUrls.list.trim() || undefined,
      launch: 'list',
    };
    const fitnessSlot: HomeAppSlot = {
      id: 'fitness',
      label: launcherLabels.fitness,
      icon: '🏋️',
      iconUrl: tabIconUrls.fitness.trim() || undefined,
      launch: 'fitness',
    };
    const pomodoroSlot: HomeAppSlot = {
      id: 'pomodoro',
      label: launcherLabels.pomodoro,
      icon: '🍅',
      iconUrl: tabIconUrls.pomodoro.trim() || undefined,
      launch: 'pomodoro',
    };
    const periodSlot: HomeAppSlot = {
      id: 'period',
      label: launcherLabels.period,
      icon: '🩸',
      iconUrl: tabIconUrls.period.trim() || undefined,
      launch: 'period',
    };
    const diarySlot: HomeAppSlot = {
      id: 'diary',
      label: launcherLabels.diary,
      icon: '📓',
      iconUrl: tabIconUrls.diary.trim() || undefined,
      launch: 'diary',
    };
    const diaryBSlot: HomeAppSlot = {
      id: 'diary-b',
      label: '我的日記',
      icon: '📔',
      launch: 'diaryB',
    };
    const albumSlot: HomeAppSlot = {
      id: 'album',
      label: launcherLabels.album,
      icon: '📷',
      iconUrl: tabIconUrls.album.trim() || undefined,
      launch: 'album',
    };
    const notesSlot: HomeAppSlot = {
      id: 'notes',
      label: launcherLabels.notes,
      icon: '📝',
      iconUrl: tabIconUrls.notes.trim() || undefined,
      launch: 'notes',
    };
    const memoSlot: HomeAppSlot = {
      id: 'memo',
      label: "M's memo",
      icon: '🧷',
      launch: 'memo',
    };
    const murmurSlot: HomeAppSlot = {
      id: 'murmur',
      label: '碎碎念',
      icon: '💭',
      launch: 'murmur',
    };
    const questionnaireSlot: HomeAppSlot = {
      id: 'questionnaire',
      label: '問卷',
      icon: '📋',
      launch: 'questionnaire',
    };
    const selfIntroSlot: HomeAppSlot = {
      id: 'self-intro',
      label: '自我介紹',
      icon: '🪪',
      launch: 'selfIntro',
    };
    const dailyTaskPlaceholder: HomeAppSlot = {
      id: 'wishlist',
      label: '願望',
      icon: '🌠',
      launch: 'wishlist',
    };
    const soulmateSlot: HomeAppSlot = {
      id: 'soulmate',
      label: '家',
      icon: '🏠',
      launch: 'soulmate',
    };
    const bookshelfSlot: HomeAppSlot = {
      id: 'bookshelf',
      label: '書架',
      icon: '📚',
      launch: 'bookshelf',
    };
    const moodLettersSlot: HomeAppSlot = {
      id: 'mood-letters',
      label: '心情星球',
      icon: '🫧',
      launch: 'moodLetters',
    };
    const annualLettersSlot: HomeAppSlot = {
      id: 'letters-ab',
      label: '年度信件',
      icon: '📜',
      launch: 'lettersAB',
    };
    const archiveSlot: HomeAppSlot = {
      id: 'archive',
      label: '總攬',
      icon: '🗂',
      launch: 'archive',
    };
    const lightPathSlot: HomeAppSlot = {
      id: 'light-path',
      label: '留光給妳的路',
      icon: '✨',
      launch: 'lightPath',
    };
    const healingCampfireSlot: HomeAppSlot = {
      id: 'healing-campfire',
      label: '治癒篝火',
      icon: '🔥',
      launch: 'healingCampfire',
    };
    const settingsShortcutSlot: HomeAppSlot = {
      id: 'settings-shortcut',
      label: launcherLabels.settings,
      icon: '⚙️',
      iconUrl: tabIconUrls.settings.trim() || undefined,
      launch: 'settingsShortcut',
    };
    // Screen 1 order
    const screen1: HomeAppSlot[] = homeSwipeEnabled
      ? [
          soulmateSlot,
          lettersSlot,
          diarySlot,
          dailyTaskPlaceholder,
          listSlot,
          notesSlot,
          diaryBSlot,
          periodSlot,
        ]
      : [
          chatSlot,
          lettersSlot,
          diarySlot,
          listSlot,
          albumSlot,
          fitnessSlot,
          tarotSlot,
          heartSlot,
          pomodoroSlot,
        ];

    const builtScreens: HomeScreen[] = [
      {
        id: 'main',
        kind: 'main',
        showDashboard: true,
        slots: screen1,
      },
    ];

    if (homeSwipeEnabled) {
      builtScreens.push(
        {
          id: 'apps-2',
          kind: 'main',
          showDashboard: false,
          slots: [
            fitnessSlot,
            tarotSlot,
            pomodoroSlot,
            heartSlot,
            bookshelfSlot,
            albumSlot,
            annualLettersSlot,
            archiveSlot,
            lightPathSlot,
            healingCampfireSlot,
            memoSlot,
            murmurSlot,
            questionnaireSlot,
            selfIntroSlot,
            moodLettersSlot,
            settingsShortcutSlot,
          ],
        },
        {
          id: 'blank-1',
          kind: 'blank',
        },
        {
          id: 'home-widget',
          kind: 'widget',
          widgetPreset: homeFinalWidgetPreset,
        },
      );
    }

    return builtScreens;
  }, [
    homeFinalWidgetPreset,
    homeSwipeEnabled,
    launcherLabels.chat,
    launcherLabels.diary,
    launcherLabels.heart,
    launcherLabels.letters,
    launcherLabels.list,
    launcherLabels.fitness,
    launcherLabels.pomodoro,
    launcherLabels.period,
    launcherLabels.settings,
    launcherLabels.tarot,
    launcherLabels.album,
    launcherLabels.notes,
    tabIconUrls.fitness,
    tabIconUrls.pomodoro,
    tabIconUrls.period,
    tabIconUrls.diary,
    tabIconUrls.settings,
    tabIconUrls.heart,
    tabIconUrls.letters,
    tabIconUrls.list,
    tabIconUrls.tarot,
    tabIconUrls.album,
    tabIconUrls.notes,
  ]);

  useEffect(() => {
    if (screenIndex < screens.length) {
      return;
    }

    setScreenIndex(Math.max(0, screens.length - 1));
  }, [screenIndex, screens.length]);

  useEffect(() => {
    const node = pagerRef.current;
    if (!node) return;

    const onScroll = () => {
      const width = node.clientWidth;
      if (!width) return;
      const next = Math.round(node.scrollLeft / width);
      setScreenIndex((current) => (current === next ? current : next));
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = pagerRef.current;
    if (!node) {
      return;
    }

    const width = node.clientWidth;
    if (!width) {
      return;
    }

    const safeIndex = Math.min(screenIndex, screens.length - 1);
    node.scrollTo({
      left: safeIndex * width,
      behavior: 'auto',
    });
  }, [screenIndex, screens.length]);

  const timeText = formatTimeHHMM(now);
  const weekdayText = formatWeekday(now);
  const monthDayText = formatMonthDay(now);
  const parsedMemorialStartDate = useMemo(() => parseIsoDate(memorialStartDate), [memorialStartDate]);
  const memorialStartDisplay = parsedMemorialStartDate ? memorialStartDate : '';
  const memorialDayCount = useMemo(
    () => (parsedMemorialStartDate ? calcMemorialDayCount(parsedMemorialStartDate, now) : 1),
    [now, parsedMemorialStartDate],
  );
  const currentCounterSpeedOption = useMemo(
    () =>
      COUNTER_VINYL_SPEED_OPTIONS.find((option) => option.value === counterVinylSpeed) ??
      COUNTER_VINYL_SPEED_OPTIONS[0],
    [counterVinylSpeed],
  );

  const handleWidgetIconFilePick = useCallback(
    (file: File | null) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (result) onWidgetIconChange(result);
      };
      reader.readAsDataURL(file);
    },
    [onWidgetIconChange],
  );

  const handleCounterVinylCoverFilePick = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setCounterVinylCoverDataUrl(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePolaroidShoot = useCallback(() => {
    if (isPolaroidPrinting) {
      return;
    }

    if (polaroidFlashTimerRef.current !== null) {
      window.clearTimeout(polaroidFlashTimerRef.current);
      polaroidFlashTimerRef.current = null;
    }
    if (polaroidRevealTimerRef.current !== null) {
      window.clearTimeout(polaroidRevealTimerRef.current);
      polaroidRevealTimerRef.current = null;
    }

    setIsPolaroidPrinting(true);
    setIsPolaroidFlashActive(true);
    setIsPolaroidPhotoVisible(false);
    const messageIndex = polaroidNextMessageIndexRef.current;
    setPolaroidCard(buildHomePolaroidCard(normalizedPolaroidMessages, messageIndex));
    polaroidNextMessageIndexRef.current = normalizeCircularIndex(
      messageIndex + 1,
      normalizedPolaroidMessages.length,
    );

    polaroidFlashTimerRef.current = window.setTimeout(() => {
      setIsPolaroidFlashActive(false);
      polaroidFlashTimerRef.current = null;
      polaroidRevealTimerRef.current = window.setTimeout(() => {
        setIsPolaroidPhotoVisible(true);
        setIsPolaroidPrinting(false);
        polaroidRevealTimerRef.current = null;
      }, HOME_POLAROID_REVEAL_DELAY_MS);
    }, HOME_POLAROID_FLASH_MS);
  }, [isPolaroidPrinting, normalizedPolaroidMessages]);

  const handlePolaroidPhotoClose = useCallback(() => {
    setIsPolaroidPhotoVisible(false);
  }, []);

  const handlePolaroidThemeRotate = useCallback(() => {
    setPolaroidCameraThemeIndex((current) => normalizeCircularIndex(current + 1, HOME_POLAROID_CAMERA_THEMES.length));
  }, []);

  const headerTitle = widgetTitle.trim() || 'Memorial';
  const headerSubtitle = widgetSubtitle.trim();
  const badgeText = widgetBadgeText.trim();

  const handleChibiPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const host = homeRootRef.current;
    const ball = cornerChibiRef.current;
    if (!host || !ball) return;

    const hostRect = host.getBoundingClientRect();
    const ballRect = ball.getBoundingClientRect();
    const centerX = ballRect.left - hostRect.left + ballRect.width / 2;
    const centerY = ballRect.top - hostRect.top + ballRect.height / 2;

    dragStateRef.current = {
      pointerId: event.pointerId,
      deltaX: event.clientX - (hostRect.left + centerX),
      deltaY: event.clientY - (hostRect.top + centerY),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    setIsDraggingChibi(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const handleChibiPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      const host = homeRootRef.current;
      const ball = cornerChibiRef.current;
      if (!dragState || !host || !ball) return;
      if (dragState.pointerId !== event.pointerId) return;

      if (
        !dragState.moved &&
        (Math.abs(event.clientX - dragState.startX) > 6 || Math.abs(event.clientY - dragState.startY) > 6)
      ) {
        dragState.moved = true;
      }

      const hostRect = host.getBoundingClientRect();
      const hostWidth = host.clientWidth;
      const hostHeight = host.clientHeight;
      if (!hostWidth || !hostHeight) return;

      const centerX = event.clientX - hostRect.left - dragState.deltaX;
      const centerY = event.clientY - hostRect.top - dragState.deltaY;
      const halfWidth = ball.offsetWidth / 2;
      const halfHeight = ball.offsetHeight / 2;

      const next = clampChibiAnchor({
        x: Math.min(hostWidth - halfWidth, Math.max(halfWidth, centerX)) / hostWidth,
        y: Math.min(hostHeight - halfHeight, Math.max(halfHeight, centerY)) / hostHeight,
      });

      setChibiAnchor(next);
      event.preventDefault();
    },
    [clampChibiAnchor],
  );

  const handleChibiPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;
      const host = homeRootRef.current;
      const ball = cornerChibiRef.current;
      if (!dragState || !host || !ball) return;
      if (dragState.pointerId !== event.pointerId) return;

      dragStateRef.current = null;
      setIsDraggingChibi(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const wasMoved = dragState.moved;
      if (!wasMoved) {
        event.preventDefault();
        onOpenSettings();
        return;
      }

      const hostWidth = host.clientWidth;
      const halfWidth = ball.offsetWidth / 2;
      const minX = hostWidth ? halfWidth / hostWidth : 0;
      const maxX = hostWidth ? 1 - minX : 1;
      const current = chibiAnchorRef.current;
      const snapped = clampChibiAnchor({
        x: current.x < 0.5 ? minX : maxX,
        y: current.y,
      });

      setChibiAnchor(snapped);
      persistChibiAnchor(snapped);
      event.preventDefault();
    },
    [clampChibiAnchor, onOpenSettings, persistChibiAnchor],
  );

  return (
    <div ref={homeRootRef} className="home-page-root relative mx-auto h-full w-full max-w-xl">
      <div
        className={`home-polaroid-flash ${isPolaroidFlashActive ? 'is-active' : ''}`}
        aria-hidden="true"
      />
      {backgroundMode === 'dynamic' && (
        <div
          className={`home-wallpaper home-wallpaper-preset-${homeDynamicWallpaperPreset}`}
          data-dynamic-preset={homeDynamicWallpaperPreset}
          style={
            {
              '--home-dyn-intensity': dynamicIntensityFactor.toFixed(3),
              '--home-dyn-speed-factor': dynamicSpeedFactor.toFixed(3),
              '--home-dyn-particle-opacity': dynamicParticleOpacity.toFixed(3),
              '--home-dyn-grain-opacity': dynamicGrainOpacity.toFixed(3),
            } as CSSProperties
          }
          aria-hidden="true"
        >
          {homeDynamicWallpaperPreset === 'gradientFlow' && <span className="home-wallpaper-ref-blend-layer" />}
          {homeDynamicWallpaperPreset === 'prismDepth' && <span className="home-wallpaper-ref-sweep-layer" />}
          {dynamicEffectPreset === 'snow' && (
            <>
              <div className="home-wallpaper-snow-layer home-wallpaper-snow-layer-far">
                {dynamicSnowFarParticles.map((particle, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`snow-far-${index}`}
                    className="home-wallpaper-snow-particle home-wallpaper-snow-particle-far"
                    style={
                      {
                        '--x': `${particle.x}%`,
                        '--y': `${particle.y}%`,
                        '--delay': `${particle.delay}s`,
                        '--duration': `${(particle.duration * 1.08).toFixed(2)}s`,
                        '--size': `${particle.size}px`,
                        '--drift': `${Math.round(particle.drift * 0.8)}px`,
                        '--alpha': (particle.opacity * 0.78).toFixed(2),
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="home-wallpaper-snow-layer home-wallpaper-snow-layer-near">
                {dynamicSnowNearParticles.map((particle, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`snow-near-${index}`}
                    className="home-wallpaper-snow-particle home-wallpaper-snow-particle-near"
                    style={
                      {
                        '--x': `${particle.x}%`,
                        '--y': `${particle.y}%`,
                        '--delay': `${(particle.delay * 0.9).toFixed(2)}s`,
                        '--duration': `${(particle.duration * 0.88).toFixed(2)}s`,
                        '--size': `${(particle.size * 1.18).toFixed(2)}px`,
                        '--drift': `${Math.round(particle.drift * 1.28)}px`,
                        '--alpha': Math.min(1, particle.opacity * 1.08).toFixed(2),
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </>
          )}
          {dynamicEffectPreset === 'orbs' && (
            <div className="home-wallpaper-bokeh-layer">
              {dynamicBokehOrbs.map((orb, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`effect-orb-${index}`}
                  className={`home-wallpaper-bokeh${
                    homeDynamicWallpaperPreset === 'coolTwilight' ? ' home-wallpaper-bokeh-warm' : ''
                  }`}
                  style={
                    {
                      '--x': `${orb.x}%`,
                      '--y': `${orb.y}%`,
                      '--size': `${orb.size + (homeDynamicWallpaperPreset === 'bokehDream' ? 18 : 0)}px`,
                      '--blur': `${orb.blur + (homeDynamicWallpaperPreset === 'bokehDream' ? 2 : 0)}px`,
                      '--delay': `${orb.delay}s`,
                      '--duration': `${
                        orb.duration +
                        (homeDynamicWallpaperPreset === 'bokehDream'
                          ? 1.6
                          : homeDynamicWallpaperPreset === 'coolTwilight'
                            ? 0.7
                            : 0)
                      }s`,
                      '--drift-x': `${
                        homeDynamicWallpaperPreset === 'bokehDream'
                          ? orb.driftX * 1.15
                          : homeDynamicWallpaperPreset === 'coolTwilight'
                            ? Math.round(orb.driftX * 1.05)
                            : orb.driftX
                      }px`,
                      '--drift-y': `${
                        homeDynamicWallpaperPreset === 'bokehDream'
                          ? orb.driftY * 1.05
                          : homeDynamicWallpaperPreset === 'coolTwilight'
                            ? Math.round(orb.driftY * 1.08)
                            : orb.driftY
                      }px`,
                      '--hue': `${
                        homeDynamicWallpaperPreset === 'bokehDream'
                          ? (orb.hue + 45) % 360
                          : homeDynamicWallpaperPreset === 'coolTwilight'
                            ? (orb.hue + 328) % 360
                            : orb.hue
                      }deg`,
                      '--alpha':
                        homeDynamicWallpaperPreset === 'bokehDream'
                          ? Math.min(0.56, orb.alpha + 0.08).toFixed(2)
                          : homeDynamicWallpaperPreset === 'coolTwilight'
                            ? Math.min(0.5, orb.alpha + 0.06).toFixed(2)
                            : orb.alpha.toFixed(2),
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          {dynamicEffectPreset === 'lantern' && (
            <div className="home-wallpaper-lantern-layer">
              {dynamicLanterns.map((lantern, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`lantern-${index}`}
                  className="home-wallpaper-lantern"
                  style={
                    {
                      left: `${lantern.left}%`,
                      bottom: `${lantern.bottom}vh`,
                      animationDuration: `${lantern.duration}s`,
                      animationDelay: `${lantern.delay}s`,
                      transform: `scale(${lantern.scale})`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          {dynamicEffectPreset === 'heart' && (
            <div className="home-wallpaper-heart-layer">
              {dynamicHearts.map((heart, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`heart-${index}`}
                  className="home-wallpaper-heart"
                  style={
                    {
                      left: `${heart.left}%`,
                      bottom: `${heart.bottom}vh`,
                      animationDuration: `${heart.duration}s`,
                      animationDelay: `${heart.delay}s`,
                      '--heart-scale': heart.scale.toFixed(3),
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          {dynamicEffectPreset === 'ribbon' && (
            <div className="home-wallpaper-ribbon-layer">
              {dynamicRibbons.map((ribbon, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`ribbon-${index}`}
                  className={`home-wallpaper-ribbon home-wallpaper-ribbon-${ribbon.cls}`}
                  style={
                    {
                      top: ribbon.top,
                      left: ribbon.left,
                      animationDuration: `${ribbon.duration}s`,
                      animationDelay: `${ribbon.delay}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
          {dynamicEffectPreset === 'bubbles' && (
            <>
              <div className="home-wallpaper-bubble-layer home-wallpaper-bubble-layer-far">
                {dynamicBubbleFarParticles.map((bubble, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`bubble-up-far-${index}`}
                    className="home-wallpaper-bubble home-wallpaper-bubble-far"
                    style={
                      {
                        '--x': `${bubble.left}%`,
                        '--y': `${bubble.top}%`,
                        '--size': `${bubble.size.toFixed(2)}px`,
                        '--alpha': (bubble.opacity * 0.76).toFixed(2),
                        '--duration': `${(bubble.duration * 1.12).toFixed(2)}s`,
                        '--delay': `${bubble.delay.toFixed(2)}s`,
                        '--bubble-drift': `${Math.round(bubble.drift * 0.8)}px`,
                        '--blur': `${(bubble.blur + 0.45).toFixed(2)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="home-wallpaper-bubble-layer home-wallpaper-bubble-layer-near">
                {dynamicBubbleNearParticles.map((bubble, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`bubble-up-near-${index}`}
                    className="home-wallpaper-bubble home-wallpaper-bubble-near"
                    style={
                      {
                        '--x': `${bubble.left}%`,
                        '--y': `${bubble.top}%`,
                        '--size': `${(bubble.size * 1.24).toFixed(2)}px`,
                        '--alpha': Math.min(1, bubble.opacity * 1.12).toFixed(2),
                        '--duration': `${(bubble.duration * 0.9).toFixed(2)}s`,
                        '--delay': `${(bubble.delay * 0.9).toFixed(2)}s`,
                        '--bubble-drift': `${Math.round(bubble.drift * 1.22)}px`,
                        '--blur': `${Math.max(0, bubble.blur - 0.12).toFixed(2)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="home-wallpaper-bubble-layer home-wallpaper-bubble-layer-hero">
                {dynamicBubbleMidParticles.map((bubble, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`bubble-up-mid-${index}`}
                    className="home-wallpaper-bubble home-wallpaper-bubble-mid"
                    style={
                      {
                        '--x': `${bubble.left}%`,
                        '--y': `${bubble.top}%`,
                        '--size': `${(bubble.size * 1.18).toFixed(2)}px`,
                        '--alpha': Math.min(1, bubble.opacity * 1.16).toFixed(2),
                        '--duration': `${(bubble.duration * 1.02).toFixed(2)}s`,
                        '--delay': `${bubble.delay.toFixed(2)}s`,
                        '--bubble-drift': `${Math.round(bubble.drift * 1.28)}px`,
                        '--blur': `${Math.max(0, bubble.blur - 0.08).toFixed(2)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
                {dynamicBubbleHeroParticles.map((bubble, index) => (
                  <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={`bubble-up-hero-${index}`}
                    className="home-wallpaper-bubble home-wallpaper-bubble-hero"
                    style={
                      {
                        '--x': `${bubble.left}%`,
                        '--y': `${bubble.top}%`,
                        '--size': `${(bubble.size * 1.34).toFixed(2)}px`,
                        '--alpha': Math.min(1, bubble.opacity * 1.22).toFixed(2),
                        '--duration': `${(bubble.duration * 1.1).toFixed(2)}s`,
                        '--delay': `${(bubble.delay * 1.05).toFixed(2)}s`,
                        '--bubble-drift': `${Math.round(bubble.drift * 1.36)}px`,
                        '--blur': `${Math.max(0, bubble.blur - 0.16).toFixed(2)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </>
          )}
          {dynamicEffectPreset === 'stardust' && (
            <div className="home-wallpaper-stardust-layer">
              {dynamicStardust.map((particle, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`stardust-${index}`}
                  className="home-wallpaper-stardust"
                  style={
                    {
                      '--x': `${particle.x}%`,
                      '--y': `${particle.y}%`,
                      '--delay': `${particle.delay}s`,
                      '--duration': `${particle.duration}s`,
                      '--size': `${particle.size}px`,
                      '--drift': `${particle.drift}px`,
                      '--alpha': particle.opacity.toFixed(2),
                    } as CSSProperties
                  }
                />
              ))}
              <span className="home-wallpaper-shooting home-wallpaper-shooting-a" />
              <span className="home-wallpaper-shooting home-wallpaper-shooting-b" />
              <span className="home-wallpaper-shooting home-wallpaper-shooting-c" />
            </div>
          )}
        </div>
      )}
      <div
        ref={pagerRef}
        className={`relative z-[1] h-full w-full snap-x snap-mandatory overflow-y-hidden ${
          homeSwipeEnabled ? 'overflow-x-auto' : 'overflow-x-hidden'
        }`}
        style={{ scrollBehavior: 'smooth', touchAction: homeSwipeEnabled ? 'pan-x pan-y' : 'pan-y' }}
      >
        <div className="flex h-full w-full">
          {screens.map((screen) => (
            <section key={screen.id} className="h-full w-full shrink-0 snap-center">
              {screen.kind === 'main' ? (
                <div
                  className="flex min-h-full flex-col px-4 pb-8"
                  style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
                >
                  {screen.showDashboard && (
                    <>
                      <div className="mb-6">
                        <div className="flex items-end justify-between gap-4">
                          <div
                            className="font-semibold leading-none tracking-tight text-stone-800"
                            style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) * 3.9)' }}
                          >
                            {timeText}
                          </div>
                          <div className="pb-2 text-right">
                            <div
                              className="font-semibold tracking-[0.18em] text-stone-700"
                              style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) + 7px)' }}
                            >
                              {weekdayText}
                            </div>
                            <div
                              className="mt-1 tracking-[0.2em] text-stone-600"
                              style={{ fontSize: 'calc(var(--ui-hint-text-size, 10px) + 3px)' }}
                            >
                              {monthDayText}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        className="mb-6 cursor-pointer rounded-[2.25rem] border border-white/55 bg-white/25 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur transition active:scale-[0.995]"
                        role="button"
                        tabIndex={0}
                        aria-label="開啟打卡簽到"
                        onClick={() => onOpenCheckin()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpenCheckin();
                          }
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            className="grid h-16 w-16 place-items-center rounded-2xl bg-white/40 shadow-sm transition active:scale-95"
                            onClick={(event) => {
                              event.stopPropagation();
                              widgetIconInputRef.current?.click();
                            }}
                            aria-label="更換小圖"
                            title="點一下更換小圖"
                          >
                            <input
                              ref={widgetIconInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => {
                                event.stopPropagation();
                                const file = event.target.files?.[0];
                                event.currentTarget.value = '';
                                handleWidgetIconFilePick(file ?? null);
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                            {widgetIconDataUrl.trim() ? (
                              <img
                                src={widgetIconDataUrl}
                                alt=""
                                className="h-12 w-12 rounded-xl object-cover"
                                loading="lazy"
                                draggable={false}
                              />
                            ) : (
                              <span className="text-3xl" aria-hidden="true">
                                ♡
                              </span>
                            )}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <p
                                className="truncate font-semibold tracking-wide text-stone-800"
                                style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) + 7px)' }}
                              >
                                {headerTitle}
                              </p>
                              {badgeText && (
                                <span
                                  className="rounded-full border border-white/60 bg-white/35 px-2 py-0.5 tracking-[0.14em] text-stone-700"
                                  style={{ fontSize: 'calc(var(--ui-hint-text-size, 10px) + 1px)' }}
                                >
                                  {badgeText}
                                </span>
                              )}
                            </div>
                            {headerSubtitle && (
                              <p
                                className="mt-1 truncate text-stone-600"
                                style={{ fontSize: 'calc(var(--ui-hint-text-size, 10px) + 4px)' }}
                              >
                                {headerSubtitle}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className={`grid grid-cols-4 gap-x-4 gap-y-6 px-1 ${screen.showDashboard ? '' : 'pt-2'}`}>
                    {screen.slots.map((slot) =>
                      slot.label ? (
                        <HomeAppButton
                          key={slot.id}
                          slot={slot}
                          iconDisplayMode={tabIconDisplayMode}
                          onLaunch={onLaunchApp}
                        />
                      ) : (
                        <HomePlaceholderTile key={slot.id} />
                      ),
                    )}
                  </div>
                </div>
              ) : screen.kind === 'widget' ? (
                <div className="flex h-full items-center px-4 pb-10">
                  <div
                    className="w-full rounded-[2.4rem] border border-white/55 bg-white/25 px-6 py-8 shadow-[0_26px_60px_rgba(0,0,0,0.14)] backdrop-blur"
                    style={{ boxShadow: '0 26px 60px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.62)' }}
                  >
                    {screen.widgetPreset === 'vinylCounter' ? (
                      <>
                        <input
                          ref={counterWidgetIconInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            handleCounterVinylCoverFilePick(file ?? null);
                          }}
                        />
                        <div className="home-counter-vinyl-wrap">
                          <div
                            className={`home-counter-vinyl-stage ${isCounterVinylPlaying ? 'home-counter-vinyl-playing' : ''}`}
                            style={{ '--home-counter-vinyl-speed': `${(4 / counterVinylSpeed).toFixed(2)}s` } as CSSProperties}
                          >
                            <div className="home-counter-vinyl-console">
                              <span
                                className={`home-counter-vinyl-led ${isCounterVinylPlaying ? 'is-on' : ''}`}
                                aria-label={isCounterVinylPlaying ? '播放中' : '已暫停'}
                                title={isCounterVinylPlaying ? '播放中' : '已暫停'}
                              />
                              <button
                                type="button"
                                className={`home-counter-vinyl-power ${isCounterVinylPlaying ? 'is-on' : ''}`}
                                onClick={() => setIsCounterVinylPlaying((prev) => !prev)}
                                aria-label={isCounterVinylPlaying ? '暫停唱片' : '播放唱片'}
                                title={isCounterVinylPlaying ? '暫停唱片' : '播放唱片'}
                              >
                                <span
                                  className={`home-counter-vinyl-power-icon ${
                                    isCounterVinylPlaying ? 'is-playing' : 'is-paused'
                                  }`}
                                  aria-hidden="true"
                                />
                              </button>
                              <div className="home-counter-vinyl-speed-control" ref={counterSpeedMenuRef}>
                                <button
                                  ref={counterSpeedToggleRef}
                                  type="button"
                                  className="home-counter-vinyl-speed-knob"
                                  onClick={() => setIsCounterSpeedMenuOpen((prev) => !prev)}
                                  aria-label="調整唱片轉速"
                                  title={`轉速：${currentCounterSpeedOption.label}`}
                                >
                                  <span className="home-counter-vinyl-speed-knob-dot" />
                                </button>
                                {isCounterSpeedMenuOpen && (
                                  <div className="home-counter-vinyl-speed-menu">
                                    {COUNTER_VINYL_SPEED_OPTIONS.map((option) => (
                                      <button
                                        key={option.label}
                                        type="button"
                                        className={`home-counter-vinyl-speed-item ${
                                          counterVinylSpeed === option.value ? 'is-active' : ''
                                        }`}
                                        onClick={() => {
                                          setCounterVinylSpeed(option.value);
                                          setIsCounterSpeedMenuOpen(false);
                                        }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                    <div className="home-counter-vinyl-cover-adjust">
                                      <button
                                        type="button"
                                        className="home-counter-vinyl-cover-adjust-btn"
                                        onClick={() =>
                                          setCounterVinylCoverOffsetY((prev) =>
                                            Math.max(
                                              COUNTER_VINYL_COVER_OFFSET_MIN,
                                              prev - COUNTER_VINYL_COVER_OFFSET_STEP,
                                            ),
                                          )
                                        }
                                        title="照片上移"
                                        aria-label="照片上移"
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="home-counter-vinyl-cover-adjust-btn"
                                        onClick={() =>
                                          setCounterVinylCoverOffsetY((prev) =>
                                            Math.min(
                                              COUNTER_VINYL_COVER_OFFSET_MAX,
                                              prev + COUNTER_VINYL_COVER_OFFSET_STEP,
                                            ),
                                          )
                                        }
                                        title="照片下移"
                                        aria-label="照片下移"
                                      >
                                        ↓
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="home-counter-vinyl-shadow" />
                            <div className="home-counter-vinyl-platter">
                              <div className="home-counter-vinyl-grooves" />
                              <div className="home-counter-vinyl-highlight" />
                              <button
                                type="button"
                                className={`home-counter-vinyl-label ${counterVinylCoverDataUrl.trim() ? 'has-cover' : ''}`}
                                onClick={() => counterWidgetIconInputRef.current?.click()}
                                aria-label={counterVinylCoverDataUrl.trim() ? '更換圓盤中心圖片' : '上傳圓盤中心圖片'}
                                title={counterVinylCoverDataUrl.trim() ? '更換圓盤中心圖片' : '上傳圓盤中心圖片'}
                              >
                                {counterVinylCoverDataUrl.trim() ? (
                                  <span
                                    className="home-counter-vinyl-label-image-wrap"
                                    style={{ transform: `translateY(${counterVinylCoverOffsetY}px)` }}
                                  >
                                    <img src={counterVinylCoverDataUrl} alt="" loading="lazy" draggable={false} />
                                  </span>
                                ) : (
                                  <span>♡</span>
                                )}
                              </button>
                            </div>
                            <div className="home-counter-vinyl-base" />
                            <div
                              className={`home-counter-vinyl-arm ${
                                isCounterVinylPlaying ? 'home-counter-vinyl-arm-playing' : 'home-counter-vinyl-arm-paused'
                              }`}
                            >
                              <div className="home-counter-vinyl-arm-bar" />
                              <div className="home-counter-vinyl-arm-head" />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="home-polaroid-widget">
                        <div className="home-polaroid-stage">
                          <button
                            type="button"
                            className={`home-polaroid-photo ${isPolaroidPhotoVisible ? 'is-visible' : ''}`}
                            onClick={handlePolaroidPhotoClose}
                            aria-label="收回拍力得照片"
                            title="點一下收回照片"
                          >
                            <span
                              className="home-polaroid-photo-image"
                              style={{ backgroundImage: polaroidCard.color }}
                              aria-hidden="true"
                            />
                            <span className="home-polaroid-photo-text">{polaroidCard.text}</span>
                          </button>
                          <button
                            type="button"
                            className={`home-polaroid-camera ${isPolaroidPrinting ? 'is-printing' : ''}`}
                            style={
                              {
                                '--home-polaroid-camera-start': currentPolaroidCameraTheme.start,
                                '--home-polaroid-camera-end': currentPolaroidCameraTheme.end,
                                '--home-polaroid-camera-border': currentPolaroidCameraTheme.border,
                              } as CSSProperties
                            }
                            onClick={handlePolaroidShoot}
                            aria-label="拍一下吐出拍力得"
                            title="拍一下吐出拍力得"
                          >
                            <span className="home-polaroid-camera-slot" aria-hidden="true" />
                            <span className="home-polaroid-camera-flash-hole" aria-hidden="true" />
                            <span className="home-polaroid-camera-lens" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="home-polaroid-theme-button"
                            onClick={handlePolaroidThemeRotate}
                            aria-label="切換拍力得機身顏色"
                            title="切換拍力得機身顏色"
                          >
                            <span aria-hidden="true">🎞</span>
                          </button>
                        </div>
                      </div>
                    )}
                    <div className={screen.widgetPreset === 'polaroid' ? 'mt-5' : ''}>
                      <p className="text-center text-lg font-semibold tracking-[0.04em] text-stone-700">
                        想你的第
                        <span className="mx-2 inline-block text-[5.2rem] leading-none text-stone-800">
                          {memorialDayCount}
                        </span>
                        天
                      </p>
                      <p className="mt-5 text-center text-xs text-stone-500">
                        {memorialStartDisplay ? `起始日：${memorialStartDisplay}` : '起始日：未設定'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full w-full" aria-hidden="true" />
              )}
            </section>
          ))}
        </div>
      </div>

      {screens.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 z-[1] flex items-center justify-center gap-2">
          {screens.map((screen, idx) => (
            <span
              key={screen.id}
              className={`h-1.5 w-1.5 rounded-full transition ${idx === screenIndex ? 'bg-stone-700/60' : 'bg-stone-500/20'}`}
            />
          ))}
        </div>
      )}

      <button
        ref={cornerChibiRef}
        type="button"
        aria-label="點一下開大設定，可拖曳小人"
        title="點一下開大設定，可拖曳移動"
        onPointerDown={handleChibiPointerDown}
        onPointerMove={handleChibiPointerMove}
        onPointerUp={handleChibiPointerUp}
        onPointerCancel={handleChibiPointerUp}
        className={`absolute z-20 h-[11.25rem] w-[11.25rem] select-none touch-none ${
          isDraggingChibi ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          left: `${chibiAnchor.x * 100}%`,
          top: `${chibiAnchor.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          transition: isDraggingChibi ? 'none' : 'left 180ms ease, top 180ms ease',
        }}
      >
        <img
          src={cornerChibiUrl}
          alt=""
          draggable={false}
          className={`h-full w-full object-contain opacity-95 drop-shadow-[0_10px_18px_rgba(0,0,0,0.24)] ${
            isDraggingChibi ? '' : 'home-corner-chibi-float'
          }`}
          loading="lazy"
        />
      </button>
    </div>
  );
}
