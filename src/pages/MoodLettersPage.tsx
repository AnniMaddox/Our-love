import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveBaseChibiSources } from '../lib/chibiPool';

import './MoodLettersPage.css';

type MoodCategory = {
  id: string;
  label: string;
};

type MoodLetter = {
  id: string;
  sourceFile?: string;
  displayName: string;
  serial: number | null;
  emoji: string | null;
  title: string;
  subject: string | null;
  contentPath: string;
  moodIds: string[];
  moodLabels?: string[];
  primaryMoodId: string;
  primaryMoodLabel: string;
};

type MoodLettersIndex = {
  version: number;
  generatedAt: string;
  total: number;
  categories: MoodCategory[];
  summary?: {
    needsReviewCount?: number;
    countsByMood?: Record<string, number>;
  };
  letters: MoodLetter[];
};

type ActiveLetterState = {
  letter: MoodLetter;
  content: string;
  moodId: string;
  moodLabel: string;
  drawnAtIso: string;
  total: number;
  remaining: number;
};

type OrbPhysics = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  pulseAnchorX?: number;
  pulseAnchorY?: number;
  pulseRadius?: number;
  basePulseRadius?: number;
  pulseAngle?: number;
  pulseSpin?: number;
  burstFrames?: number;
  burstBoost?: number;
  swirlFrames?: number;
  swirlDirection?: number;
};

type MoodListTab = 'all' | 'favorites';
type PaperThemeKey = 'moon' | 'cream' | 'mint' | 'lavender' | 'peach';
type OrbMotionMode = 'bounce' | 'rise' | 'pulse';
type MoodFontMode = 'default' | 'campfire';

type MoodLettersPrefs = {
  showChibi: boolean;
  chibiWidth: number;
  orbCount: number;
  orbMode: OrbMotionMode;
  orbSpeed: number;
  fontMode: MoodFontMode;
  contentFontSize: number;
  contentLineHeight: number;
  paperTheme: PaperThemeKey;
};

type MoodLettersPageProps = {
  onExit: () => void;
  letterFontFamily?: string;
};

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/mood-letters/index.json`;
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;
const ALL_MOODS_KEY = 'all';
const PREFS_KEY = 'memorial-mood-letters-prefs-v1';
const FAVORITES_KEY = 'memorial-mood-letters-favorites-v1';
const FAVORITES_URL_PARAM = 'mlFav';
const ORB_COUNT_MIN = 11;
const ORB_COUNT_MAX = 15;

const BASE_ORB_COLORS = [
  '255,182,162',
  '255,170,145',
  '255,156,186',
  '234,166,216',
  '198,166,250',
  '161,205,255',
  '150,230,235',
  '166,226,176',
  '243,214,138',
  '255,206,156',
  '201,196,242',
  '180,228,255',
  '243,186,222',
] as const;

const BASE_ORB_SIZES = [72, 68, 65, 63, 61, 60, 65, 62, 64, 68, 61, 63, 67] as const;

const PAPER_THEMES: Record<
  PaperThemeKey,
  {
    label: string;
    paperBg: string;
    titleColor: string;
    bodyColor: string;
    accentColor: string;
    pillBg: string;
    pillBorder: string;
    pillText: string;
  }
> = {
  moon: {
    label: '月光紙',
    paperBg: '#f4f8ff',
    titleColor: '#2f4c7b',
    bodyColor: '#2b4166',
    accentColor: '#5f7eb2',
    pillBg: 'rgba(95, 126, 178, 0.12)',
    pillBorder: 'rgba(95, 126, 178, 0.32)',
    pillText: '#496797',
  },
  cream: {
    label: '奶油紙',
    paperBg: '#fff1f6',
    titleColor: '#7a4360',
    bodyColor: '#60354a',
    accentColor: '#b06a8a',
    pillBg: 'rgba(176, 106, 138, 0.15)',
    pillBorder: 'rgba(176, 106, 138, 0.36)',
    pillText: '#8d5370',
  },
  mint: {
    label: '薄荷紙',
    paperBg: '#f4fff8',
    titleColor: '#36645a',
    bodyColor: '#34584e',
    accentColor: '#4e8b7e',
    pillBg: 'rgba(88, 145, 132, 0.12)',
    pillBorder: 'rgba(88, 145, 132, 0.28)',
    pillText: '#3f766a',
  },
  lavender: {
    label: '薰衣草紙',
    paperBg: '#faf7ff',
    titleColor: '#5e4f88',
    bodyColor: '#4f446d',
    accentColor: '#7e6ab0',
    pillBg: 'rgba(116, 100, 170, 0.12)',
    pillBorder: 'rgba(116, 100, 170, 0.28)',
    pillText: '#65549a',
  },
  peach: {
    label: '蜜桃紙',
    paperBg: '#fff5f0',
    titleColor: '#7a4a3f',
    bodyColor: '#5e4038',
    accentColor: '#b76754',
    pillBg: 'rgba(180, 99, 81, 0.12)',
    pillBorder: 'rgba(180, 99, 81, 0.28)',
    pillText: '#8e4f42',
  },
};

const DEFAULT_PREFS: MoodLettersPrefs = {
  showChibi: true,
  chibiWidth: 144,
  orbCount: 13,
  orbMode: 'bounce',
  orbSpeed: 1.25,
  fontMode: 'default',
  contentFontSize: 15,
  contentLineHeight: 2.02,
  paperTheme: 'moon',
};

const ORB_MODE_OPTIONS: Array<{ id: OrbMotionMode; label: string }> = [
  { id: 'bounce', label: '碰撞' },
  { id: 'rise', label: '上浮' },
  { id: 'pulse', label: '脈動漂流' },
];

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function loadPrefs() {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<MoodLettersPrefs>;
    const theme = parsed.paperTheme;
    const paperTheme: PaperThemeKey = theme && theme in PAPER_THEMES ? theme : DEFAULT_PREFS.paperTheme;
    const orbMode = parsed.orbMode;
    const normalizedOrbMode: OrbMotionMode =
      orbMode === 'bounce' || orbMode === 'rise' || orbMode === 'pulse' ? orbMode : DEFAULT_PREFS.orbMode;
    const fontMode = parsed.fontMode;
    const normalizedFontMode: MoodFontMode =
      fontMode === 'campfire' || fontMode === 'default' ? fontMode : DEFAULT_PREFS.fontMode;
    return {
      showChibi: parsed.showChibi !== false,
      chibiWidth: clampInt(parsed.chibiWidth, 104, 196, DEFAULT_PREFS.chibiWidth),
      orbCount: clampInt(parsed.orbCount, ORB_COUNT_MIN, ORB_COUNT_MAX, DEFAULT_PREFS.orbCount),
      orbMode: normalizedOrbMode,
      orbSpeed: clampNumber(parsed.orbSpeed, 0.7, 2.4, DEFAULT_PREFS.orbSpeed),
      fontMode: normalizedFontMode,
      contentFontSize: clampNumber(parsed.contentFontSize, 12, 24, DEFAULT_PREFS.contentFontSize),
      contentLineHeight: clampNumber(parsed.contentLineHeight, 1.35, 2.9, DEFAULT_PREFS.contentLineHeight),
      paperTheme,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: MoodLettersPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function loadFavoriteIds() {
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(FAVORITES_URL_PARAM)) {
        const raw = url.searchParams.get(FAVORITES_URL_PARAM) ?? '';
        if (!raw.trim()) return new Set<string>();
        const fromUrl = raw
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        return new Set(fromUrl);
      }
    } catch {
      // Ignore URL parse failures and fallback to storage.
    }
  }

  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));
  } catch {
    return new Set<string>();
  }
}

function saveFavoriteIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  const serialized = Array.from(ids);
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(serialized));
  try {
    const url = new URL(window.location.href);
    if (serialized.length) {
      url.searchParams.set(FAVORITES_URL_PARAM, serialized.join(','));
    } else {
      url.searchParams.delete(FAVORITES_URL_PARAM);
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch {
    // Ignore URL write failures and keep storage as fallback.
  }
}

function pickRandom<T>(items: readonly T[]) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index]!;
    next[index] = next[randomIndex]!;
    next[randomIndex] = current;
  }
  return next;
}

function normalizeContent(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function formatDrawnAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '剛剛抽到';
  }
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pickMoodLabel(index: MoodLettersIndex | null, moodId: string, fallback = '全部') {
  if (moodId === ALL_MOODS_KEY) return '全部';
  const found = index?.categories.find((item) => item.id === moodId);
  return found?.label || fallback;
}

export function MoodLettersPage({ onExit, letterFontFamily = '' }: MoodLettersPageProps) {
  const [index, setIndex] = useState<MoodLettersIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMood, setSelectedMood] = useState<string>(ALL_MOODS_KEY);
  const [statusText, setStatusText] = useState('');
  const [activeLetter, setActiveLetter] = useState<ActiveLetterState | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listTab, setListTab] = useState<MoodListTab>('all');
  const [listMoodFilter, setListMoodFilter] = useState<string>(ALL_MOODS_KEY);
  const [listQuery, setListQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<MoodLettersPrefs>(() => loadPrefs());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [hiddenOrbIndex, setHiddenOrbIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isChibiPressing, setIsChibiPressing] = useState(false);
  const [chibiSrc] = useState(() => {
    const pool = getActiveBaseChibiSources();
    return pickRandom(pool) ?? FALLBACK_CHIBI;
  });

  const contentCacheRef = useRef<Record<string, string>>({});
  const drawBagRef = useRef<Record<string, string[]>>({});
  const orbZoneRef = useRef<HTMLDivElement | null>(null);
  const orbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const orbPhysicsRef = useRef<OrbPhysics[]>([]);
  const rafRef = useRef<number | null>(null);
  const chibiPressTimerRef = useRef<number | null>(null);
  const chibiPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const chibiLongPressedRef = useRef(false);

  const orbColors = useMemo(
    () =>
      Array.from({ length: prefs.orbCount }, (_, indexValue) => BASE_ORB_COLORS[indexValue % BASE_ORB_COLORS.length]!),
    [prefs.orbCount],
  );

  const orbSizes = useMemo(
    () =>
      Array.from({ length: prefs.orbCount }, (_, indexValue) => BASE_ORB_SIZES[indexValue % BASE_ORB_SIZES.length] ?? 62),
    [prefs.orbCount],
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 92 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        duration: `${2.1 + Math.random() * 4.2}s`,
        delay: `${-Math.random() * 5}s`,
        size: Math.random() < 0.17 ? 3 : 2,
      })),
    [],
  );

  const shootings = useMemo(
    () =>
      Array.from({ length: 8 }, () => ({
        left: `${-20 + Math.random() * 20}%`,
        top: `${Math.random() * 42}%`,
        duration: `${5.2 + Math.random() * 7.8}s`,
        delay: `${-Math.random() * 9}s`,
      })),
    [],
  );

  const orbSeeds = useMemo(
    () =>
      orbColors.map((_, indexValue) => {
        const size = orbSizes[indexValue] ?? 60;
        return {
          size,
          xPercent: 11 + Math.random() * 78,
          yPercent: 10 + Math.random() * 76,
          driftX: (18 + Math.random() * 34) * (Math.random() < 0.5 ? -1 : 1),
          driftY: (16 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1),
          duration: 1.18 + Math.random() * 1.48,
          delay: -Math.random() * 1.8,
        };
      }),
    [orbColors, orbSizes],
  );

  const lettersById = useMemo(() => {
    const map = new Map<string, MoodLetter>();
    if (!index) return map;
    for (const letter of index.letters) {
      map.set(letter.id, letter);
    }
    return map;
  }, [index]);

  const sortedLetters = useMemo(() => {
    if (!index) return [] as MoodLetter[];
    return [...index.letters].sort((a, b) => {
      const sa = a.serial ?? Number.MAX_SAFE_INTEGER;
      const sb = b.serial ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title, 'zh-Hant');
    });
  }, [index]);

  const countsByMood = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!index) return counts;
    counts[ALL_MOODS_KEY] = index.letters.length;
    for (const category of index.categories) {
      counts[category.id] = 0;
    }
    for (const letter of index.letters) {
      for (const moodId of letter.moodIds) {
        counts[moodId] = (counts[moodId] ?? 0) + 1;
      }
    }
    return counts;
  }, [index]);

  const moodOptions = useMemo(() => {
    if (!index) return [{ id: ALL_MOODS_KEY, label: '全部', count: 0 }];
    return [
      { id: ALL_MOODS_KEY, label: '全部', count: countsByMood[ALL_MOODS_KEY] ?? index.letters.length },
      ...index.categories.map((item) => ({ id: item.id, label: item.label, count: countsByMood[item.id] ?? 0 })),
    ];
  }, [countsByMood, index]);

  const listMoodOptions = useMemo(() => {
    if (!index) return [{ id: ALL_MOODS_KEY, label: '全部' }];
    return [{ id: ALL_MOODS_KEY, label: '全部' }, ...index.categories.map((item) => ({ id: item.id, label: item.label }))];
  }, [index]);

  const eligibleIdsByMood = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!index) return map;
    map[ALL_MOODS_KEY] = index.letters.map((item) => item.id);
    for (const category of index.categories) {
      map[category.id] = index.letters.filter((item) => item.moodIds.includes(category.id)).map((item) => item.id);
    }
    return map;
  }, [index]);

  const listedLetters = useMemo(() => {
    const byFavorite = listTab === 'all' ? sortedLetters : sortedLetters.filter((item) => favoriteIds.has(item.id));
    const byMood =
      listMoodFilter === ALL_MOODS_KEY
        ? byFavorite
        : byFavorite.filter((item) => item.moodIds.includes(listMoodFilter) || item.primaryMoodId === listMoodFilter);
    const query = listQuery.trim().toLowerCase();
    if (!query) return byMood;
    return byMood.filter((item) => {
      const haystack = [
        item.title,
        item.displayName,
        item.subject ?? '',
        item.sourceFile ?? '',
        item.primaryMoodLabel,
        ...(Array.isArray(item.moodLabels) ? item.moodLabels : []),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [favoriteIds, listMoodFilter, listQuery, listTab, sortedLetters]);

  const activePaper = PAPER_THEMES[prefs.paperTheme];

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`讀取失敗：${response.status}`);
        }
        const raw = (await response.json()) as MoodLettersIndex;
        if (!active) return;
        const parsed: MoodLettersIndex = {
          version: Number(raw?.version ?? 1),
          generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : '',
          total: Number(raw?.total ?? 0),
          categories: Array.isArray(raw?.categories)
            ? raw.categories
                .filter((item): item is MoodCategory => typeof item?.id === 'string' && typeof item?.label === 'string')
                .map((item) => ({ id: item.id.trim(), label: item.label.trim() }))
            : [],
          summary: raw?.summary,
          letters: Array.isArray(raw?.letters)
            ? raw.letters
                .filter(
                  (item): item is MoodLetter =>
                    typeof item?.id === 'string' &&
                    typeof item?.title === 'string' &&
                    typeof item?.contentPath === 'string' &&
                    Array.isArray(item?.moodIds),
                )
                .map((item) => ({
                  ...item,
                  id: item.id.trim(),
                  title: item.title.trim(),
                  contentPath: item.contentPath.replace(/^\.?\//, ''),
                  moodIds: item.moodIds
                    .filter((moodId): moodId is string => typeof moodId === 'string' && moodId.trim().length > 0)
                    .map((moodId) => moodId.trim()),
                }))
            : [],
        };
        setIndex(parsed);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '未知錯誤');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    saveFavoriteIds(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    if (!index) return;
    const validIds = new Set(index.letters.map((letter) => letter.id));
    setFavoriteIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (!validIds.has(id)) {
          changed = true;
          continue;
        }
        next.add(id);
      }
      return changed ? next : prev;
    });
  }, [index]);

  useEffect(
    () => () => {
      if (chibiPressTimerRef.current !== null) {
        window.clearTimeout(chibiPressTimerRef.current);
        chibiPressTimerRef.current = null;
      }
    },
    [],
  );

  const loadLetterContent = useCallback(async (letter: MoodLetter) => {
    const cached = contentCacheRef.current[letter.id];
    if (typeof cached === 'string') return cached;
    const filePath = letter.contentPath.replace(/^\.?\//, '');
    const response = await fetch(`${BASE}data/mood-letters/${filePath}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`讀取內容失敗：${response.status}`);
    }
    const text = normalizeContent(await response.text());
    contentCacheRef.current[letter.id] = text;
    return text;
  }, []);

  const drawFromMood = useCallback(
    (moodId: string) => {
      const eligible = eligibleIdsByMood[moodId] ?? [];
      if (!eligible.length) return null;
      const validSet = new Set(eligible);
      let bag = (drawBagRef.current[moodId] ?? []).filter((id) => validSet.has(id));
      if (!bag.length) {
        bag = shuffle(eligible);
      }
      const pickedId = bag.pop();
      drawBagRef.current[moodId] = bag;
      if (!pickedId) return null;
      const picked = lettersById.get(pickedId);
      if (!picked) return null;
      return {
        letter: picked,
        total: eligible.length,
        remaining: bag.length,
      };
    },
    [eligibleIdsByMood, lettersById],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runOrbAnimation = useCallback((orbIndex: number) => {
    const orbEl = orbRefs.current[orbIndex];
    if (!orbEl) return;

    const rect = orbEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const flyer = document.createElement('div');
    flyer.className = 'ml-flying-orb';
    flyer.style.left = `${rect.left}px`;
    flyer.style.top = `${rect.top}px`;
    flyer.style.width = `${rect.width}px`;
    flyer.style.height = `${rect.height}px`;
    flyer.style.setProperty('--orb-rgb', orbColors[orbIndex % orbColors.length] ?? orbColors[0] ?? '255,182,162');
    document.body.appendChild(flyer);

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    requestAnimationFrame(() => {
      flyer.style.left = `${centerX}px`;
      flyer.style.top = `${centerY}px`;
      flyer.classList.add('go');
    });

    window.setTimeout(() => {
      flyer.remove();
    }, 1050);
  }, [orbColors]);

  const openLetter = useCallback(
    async ({
      letter,
      moodId,
      moodLabel,
      total,
      remaining,
      orbIndex = null,
      drawnAtIso = new Date().toISOString(),
    }: {
      letter: MoodLetter;
      moodId: string;
      moodLabel: string;
      total: number;
      remaining: number;
      orbIndex?: number | null;
      drawnAtIso?: string;
    }) => {
      setShowFontPanel(false);
      if (orbIndex !== null) {
        setHiddenOrbIndex(orbIndex);
        runOrbAnimation(orbIndex);
      } else {
        setHiddenOrbIndex(null);
      }

      setActiveLetter({
        letter,
        content: '讀取內容中...',
        moodId,
        moodLabel,
        drawnAtIso,
        total,
        remaining,
      });
      if (orbIndex !== null) {
        window.setTimeout(() => setOverlayOpen(true), 360);
      } else {
        setOverlayOpen(true);
      }

      try {
        const content = await loadLetterContent(letter);
        setActiveLetter((prev) => {
          if (!prev || prev.letter.id !== letter.id) return prev;
          return {
            ...prev,
            content: content || '（這封信目前是空白）',
          };
        });
      } catch (contentError) {
        const message = contentError instanceof Error ? contentError.message : '讀取失敗';
        setActiveLetter((prev) => {
          if (!prev || prev.letter.id !== letter.id) return prev;
          return {
            ...prev,
            content: `（${message}）`,
          };
        });
      }
    },
    [loadLetterContent, runOrbAnimation],
  );

  const drawWithOrb = useCallback(
    async (orbIndex: number) => {
      if (!index || isAnimating) return;
      const draw = drawFromMood(selectedMood);
      if (!draw) {
        setStatusText('這個心情目前還沒有信件可以抽。');
        return;
      }
      setStatusText('');
      setIsAnimating(true);

      const moodLabel = pickMoodLabel(index, selectedMood, draw.letter.primaryMoodLabel || '全部');
      await openLetter({
        letter: draw.letter,
        moodId: selectedMood,
        moodLabel,
        total: draw.total,
        remaining: draw.remaining,
        orbIndex,
      });

      window.setTimeout(() => {
        setIsAnimating(false);
      }, 860);
    },
    [drawFromMood, index, isAnimating, openLetter, selectedMood],
  );

  const drawByFate = useCallback(() => {
    const orbIndex = Math.floor(Math.random() * orbColors.length);
    void drawWithOrb(orbIndex);
  }, [drawWithOrb, orbColors.length]);

  const drawAgain = useCallback(() => {
    if (isAnimating) return;
    setOverlayOpen(false);
    setHiddenOrbIndex(null);
    setShowFontPanel(false);
    window.setTimeout(() => {
      drawByFate();
    }, 180);
  }, [drawByFate, isAnimating]);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
    setHiddenOrbIndex(null);
    setShowFontPanel(false);
  }, []);

  const openList = useCallback((tab: MoodListTab) => {
    setShowFontPanel(false);
    setListTab(tab);
    setListMoodFilter(selectedMood);
    setListOpen(true);
  }, [selectedMood]);

  const openFromList = useCallback(
    (letter: MoodLetter) => {
      setListOpen(false);
      setShowFontPanel(false);
      void openLetter({
        letter,
        moodId: letter.primaryMoodId || ALL_MOODS_KEY,
        moodLabel: letter.primaryMoodLabel || pickMoodLabel(index, letter.primaryMoodId, '心情信'),
        total: -1,
        remaining: -1,
        orbIndex: null,
      });
    },
    [index, openLetter],
  );

  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setIsChibiPressing(false);
    chibiLongPressedRef.current = false;
  }, []);

  const clearChibiTimer = useCallback(() => {
    if (chibiPressTimerRef.current !== null) {
      window.clearTimeout(chibiPressTimerRef.current);
      chibiPressTimerRef.current = null;
    }
  }, []);

  const onChibiPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (isAnimating) return;
      event.preventDefault();
      setIsChibiPressing(true);
      chibiLongPressedRef.current = false;
      chibiPressStartRef.current = { x: event.clientX, y: event.clientY };
      clearChibiTimer();
      chibiPressTimerRef.current = window.setTimeout(() => {
        chibiLongPressedRef.current = true;
        setIsChibiPressing(false);
        setShowSettings(true);
      }, 320);
    },
    [clearChibiTimer, isAnimating],
  );

  const onChibiPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = chibiPressStartRef.current;
      if (!start) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance > 8) {
        clearChibiTimer();
      }
    },
    [clearChibiTimer],
  );

  const onChibiPointerUp = useCallback(() => {
    const isLongPress = chibiLongPressedRef.current;
    clearChibiTimer();
    setIsChibiPressing(false);
    chibiPressStartRef.current = null;
    chibiLongPressedRef.current = false;
    if (!isLongPress) {
      drawByFate();
    }
  }, [clearChibiTimer, drawByFate]);

  const onChibiPointerCancel = useCallback(() => {
    clearChibiTimer();
    setIsChibiPressing(false);
    chibiPressStartRef.current = null;
    chibiLongPressedRef.current = false;
  }, [clearChibiTimer]);

  useEffect(() => {
    const host = orbZoneRef.current;
    if (!host) return;

    const mode = prefs.orbMode;

    const applyStateToOrb = (indexValue: number, state: OrbPhysics) => {
      const orb = orbRefs.current[indexValue];
      if (!orb) return;
      orb.style.left = `${state.x}px`;
      orb.style.top = `${state.y}px`;
    };

    const initPhysics = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 10 || height < 10) {
        return false;
      }
      const speed = prefs.orbSpeed;
      orbPhysicsRef.current = orbColors.map((_, indexValue) => {
        const size = orbSizes[indexValue] ?? 60;
        const maxX = Math.max(1, width - size);
        const maxY = Math.max(1, height - size);
        if (mode === 'pulse') {
          const pulseRadius = 10 + Math.random() * 18;
          const minAnchorX = pulseRadius;
          const minAnchorY = pulseRadius;
          const maxAnchorX = Math.max(minAnchorX, maxX - pulseRadius);
          const maxAnchorY = Math.max(minAnchorY, maxY - pulseRadius);
          const anchorX = minAnchorX + Math.random() * Math.max(0, maxAnchorX - minAnchorX);
          const anchorY = minAnchorY + Math.random() * Math.max(0, maxAnchorY - minAnchorY);
          const driftAbs = (0.28 + Math.random() * 0.58) * speed;
          return {
            size,
            x: Math.min(maxX, Math.max(0, anchorX)),
            y: Math.min(maxY, Math.max(0, anchorY)),
            vx: Math.random() < 0.5 ? -driftAbs : driftAbs,
            vy: Math.random() < 0.5 ? -driftAbs : driftAbs,
            pulseAnchorX: anchorX,
            pulseAnchorY: anchorY,
            pulseRadius,
            basePulseRadius: pulseRadius,
            pulseAngle: Math.random() * Math.PI * 2,
            pulseSpin: (0.02 + Math.random() * 0.04) * (Math.random() < 0.5 ? -1 : 1),
            burstFrames: 0,
            burstBoost: 1,
            swirlFrames: 0,
            swirlDirection: Math.random() < 0.5 ? -1 : 1,
          };
        }
        if (mode === 'rise') {
          const driftAbs = (0.55 + Math.random() * 1.15) * speed;
          const riseAbs = (2.4 + Math.random() * 3.4) * speed;
          return {
            size,
            x: Math.random() * maxX,
            y: Math.random() * maxY,
            vx: Math.random() < 0.5 ? -driftAbs : driftAbs,
            vy: -riseAbs,
          };
        }
        const vxAbs = (3.0 + Math.random() * 5.4) * speed;
        const vyAbs = (2.8 + Math.random() * 4.8) * speed;
        return {
          size,
          x: Math.random() * maxX,
          y: Math.random() * maxY,
          vx: Math.random() < 0.5 ? -vxAbs : vxAbs,
          vy: Math.random() < 0.5 ? -vyAbs : vyAbs,
        };
      });
      for (let indexValue = 0; indexValue < orbPhysicsRef.current.length; indexValue += 1) {
        const state = orbPhysicsRef.current[indexValue];
        if (!state) continue;
        applyStateToOrb(indexValue, state);
      }
      return true;
    };

    const step = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 10 || height < 10) {
        rafRef.current = window.requestAnimationFrame(step);
        return;
      }
      const states = orbPhysicsRef.current;
      if (states.length !== orbColors.length) {
        initPhysics();
      }
      for (let indexValue = 0; indexValue < states.length; indexValue += 1) {
        const state = states[indexValue];
        if (!state) continue;

        const maxX = Math.max(1, width - state.size);
        const maxY = Math.max(1, height - state.size);
        if (mode === 'pulse') {
          let pulseRadius = state.pulseRadius ?? 12;
          const basePulseRadius = state.basePulseRadius ?? pulseRadius;
          const spin = state.pulseSpin ?? 0.03;
          let anchorX = state.pulseAnchorX ?? maxX / 2;
          let anchorY = state.pulseAnchorY ?? maxY / 2;
          const minAnchorX = pulseRadius;
          const minAnchorY = pulseRadius;
          const maxAnchorX = Math.max(minAnchorX, maxX - pulseRadius);
          const maxAnchorY = Math.max(minAnchorY, maxY - pulseRadius);
          const centerX = maxX / 2;
          const centerY = maxY / 2;

          let burstFrames = state.burstFrames ?? 0;
          let burstBoost = state.burstBoost ?? 1;
          let swirlFrames = state.swirlFrames ?? 0;
          let swirlDirection = state.swirlDirection ?? 1;

          if (swirlFrames <= 0 && Math.random() < 0.00055) {
            swirlFrames = 120 + Math.floor(Math.random() * 84);
            swirlDirection = Math.random() < 0.5 ? -1 : 1;
            burstFrames = 0;
            burstBoost = 1;
          }

          if (swirlFrames <= 0 && burstFrames <= 0 && Math.random() < 0.0008) {
            burstFrames = 34 + Math.floor(Math.random() * 26);
            burstBoost = 1.45 + Math.random() * 0.9;
          }

          if (swirlFrames > 0) {
            swirlFrames -= 1;
            anchorX += (centerX - anchorX) * 0.072;
            anchorY += (centerY - anchorY) * 0.072;
            pulseRadius += (22 + ((indexValue * 7) % 16) - pulseRadius) * 0.09;
          } else {
            const driftFactor = burstFrames > 0 ? burstBoost : 1;
            anchorX += state.vx * driftFactor;
            anchorY += state.vy * driftFactor;
            if (anchorX <= minAnchorX || anchorX >= maxAnchorX) {
              state.vx *= -1;
              anchorX = Math.min(maxAnchorX, Math.max(minAnchorX, anchorX));
            }
            if (anchorY <= minAnchorY || anchorY >= maxAnchorY) {
              state.vy *= -1;
              anchorY = Math.min(maxAnchorY, Math.max(minAnchorY, anchorY));
            }
            pulseRadius += (basePulseRadius - pulseRadius) * 0.12;
            if (burstFrames > 0) {
              burstFrames -= 1;
              burstBoost = Math.max(1.02, burstBoost * 0.982);
            } else {
              burstBoost = 1;
            }
          }

          const nextAngle =
            (state.pulseAngle ?? 0) +
            (swirlFrames > 0 ? swirlDirection * (0.16 + Math.abs(spin) * 2.2) : spin * (burstFrames > 0 ? 1.7 : 1.1));
          state.pulseAngle = nextAngle;
          state.pulseAnchorX = anchorX;
          state.pulseAnchorY = anchorY;
          state.pulseRadius = pulseRadius;
          state.basePulseRadius = basePulseRadius;
          state.burstFrames = burstFrames;
          state.burstBoost = burstBoost;
          state.swirlFrames = swirlFrames;
          state.swirlDirection = swirlDirection;
          state.x = Math.min(maxX, Math.max(0, anchorX + Math.cos(nextAngle) * pulseRadius));
          state.y = Math.min(maxY, Math.max(0, anchorY + Math.sin(nextAngle * 0.9) * pulseRadius * 0.72));
        } else if (mode === 'rise') {
          state.x += state.vx;
          state.y += state.vy;
          if (state.x <= 0 || state.x >= maxX) {
            state.vx *= -1;
            state.x = Math.min(maxX, Math.max(0, state.x));
          }
          if (state.y <= -state.size * 0.45) {
            const speed = prefs.orbSpeed;
            const driftAbs = (0.55 + Math.random() * 1.15) * speed;
            const riseAbs = (2.4 + Math.random() * 3.4) * speed;
            state.x = Math.random() * maxX;
            state.y = maxY + Math.random() * (state.size * 0.8 + 26);
            state.vx = Math.random() < 0.5 ? -driftAbs : driftAbs;
            state.vy = -riseAbs;
          }
        } else {
          state.x += state.vx;
          state.y += state.vy;

          if (state.x <= 0 || state.x >= maxX) {
            state.vx *= -1;
            state.x = Math.min(maxX, Math.max(0, state.x));
          }
          if (state.y <= 0 || state.y >= maxY) {
            state.vy *= -1;
            state.y = Math.min(maxY, Math.max(0, state.y));
          }
        }
        applyStateToOrb(indexValue, state);
      }
      rafRef.current = window.requestAnimationFrame(step);
    };

    initPhysics();
    const initTimerA = window.setTimeout(() => {
      initPhysics();
    }, 100);
    const initTimerB = window.setTimeout(() => {
      initPhysics();
    }, 300);
    rafRef.current = window.requestAnimationFrame(step);

    let resizeObserver: ResizeObserver | null = null;
    const onWindowResize = () => {
      initPhysics();
    };
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        initPhysics();
      });
      resizeObserver.observe(host);
    } else {
      window.addEventListener('resize', onWindowResize);
    }

    return () => {
      window.clearTimeout(initTimerA);
      window.clearTimeout(initTimerB);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', onWindowResize);
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [orbColors, orbSizes, prefs.orbMode, prefs.orbSpeed]);

  if (loading) {
    return <div className="ml-loading grid h-full place-items-center text-sm text-white/70">讀取星辰心情信中...</div>;
  }

  if (error) {
    return (
      <div className="ml-loading grid h-full place-items-center px-5 text-center text-sm text-rose-200">
        讀取失敗：{error}
      </div>
    );
  }

  if (!index || !index.letters.length) {
    return <div className="ml-loading grid h-full place-items-center text-sm text-white/70">目前沒有心情信資料。</div>;
  }

  const followCampfireFont = prefs.fontMode === 'campfire' && Boolean(letterFontFamily.trim());
  const contentFontFamily = followCampfireFont
    ? letterFontFamily.trim()
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";

  return (
    <div className="mood-letters-page">
      <div className="ml-stars-layer" aria-hidden="true">
        {stars.map((item, indexValue) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={`star-${indexValue}`}
            className="ml-star"
            style={{
              left: item.left,
              top: item.top,
              width: `${item.size}px`,
              height: `${item.size}px`,
              animationDuration: item.duration,
              animationDelay: item.delay,
            }}
          />
        ))}
      </div>
      <div className="ml-shooting-layer" aria-hidden="true">
        {shootings.map((item, indexValue) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={`shoot-${indexValue}`}
            className="ml-shooting"
            style={{
              left: item.left,
              top: item.top,
              animationDuration: item.duration,
              animationDelay: item.delay,
            }}
          />
        ))}
      </div>

      <main className="ml-content">
        <header className="ml-topbar">
          <button type="button" className="ml-nav-btn" onClick={onExit} aria-label="返回首頁">
            ‹
          </button>
          <h1 className="ml-title">給現在的妳</h1>
          <div className="ml-top-actions">
            <button type="button" className="ml-icon-btn" onClick={() => openList('all')} aria-label="全部清單">
              ☰
            </button>
            <button type="button" className="ml-icon-btn" onClick={() => setShowSettings(true)} aria-label="開啟設定">
              ⋯
            </button>
          </div>
        </header>

        <div className="ml-moods" role="tablist" aria-label="心情篩選">
          {moodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`ml-mood-pill ${selectedMood === option.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedMood(option.id);
                setStatusText('');
              }}
            >
              {option.label} · {option.count}
            </button>
          ))}
        </div>

        <section className="ml-jar-panel">
          <div className="ml-jar-container">
            <div className="ml-jar-lid" />
            <div className="ml-jar-neck" />
            <div className="ml-jar">
              <div ref={orbZoneRef} className={`ml-orb-zone mode-${prefs.orbMode}`}>
                {orbColors.map((rgb, indexValue) => (
                  <button
                    key={`orb-${rgb}-${indexValue}`}
                    ref={(node) => {
                      orbRefs.current[indexValue] = node;
                    }}
                    type="button"
                    aria-label="抽一封心情信"
                    className={`ml-orb ${hiddenOrbIndex === indexValue ? 'hidden' : ''}`}
                    style={{
                      width: `${orbSeeds[indexValue]?.size ?? orbSizes[indexValue] ?? 60}px`,
                      height: `${orbSeeds[indexValue]?.size ?? orbSizes[indexValue] ?? 60}px`,
                      left: `calc(${orbSeeds[indexValue]?.xPercent ?? 50}% - ${(orbSeeds[indexValue]?.size ?? 60) / 2}px)`,
                      top: `calc(${orbSeeds[indexValue]?.yPercent ?? 50}% - ${(orbSeeds[indexValue]?.size ?? 60) / 2}px)`,
                      ['--float-x' as string]: `${orbSeeds[indexValue]?.driftX ?? 0}px`,
                      ['--float-y' as string]: `${orbSeeds[indexValue]?.driftY ?? 0}px`,
                      ['--float-dur' as string]: `${orbSeeds[indexValue]?.duration ?? 1.9}s`,
                      ['--float-delay' as string]: `${orbSeeds[indexValue]?.delay ?? 0}s`,
                      ['--pulse-dur' as string]: `${1.6 + ((orbSeeds[indexValue]?.duration ?? 1.9) % 1.25)}s`,
                      ['--pulse-delay' as string]: `${orbSeeds[indexValue]?.delay ?? 0}s`,
                    }}
                    onClick={() => {
                      void drawWithOrb(indexValue);
                    }}
                    disabled={isAnimating}
                  >
                    <span className="ml-orb-core" style={{ ['--orb-rgb' as string]: rgb }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {statusText ? <p className="ml-status">{statusText}</p> : null}

        {prefs.showChibi ? (
          <button
            type="button"
            className={`ml-chibi-btn ${isChibiPressing ? 'pressing' : ''}`}
            onPointerDown={onChibiPointerDown}
            onPointerMove={onChibiPointerMove}
            onPointerUp={onChibiPointerUp}
            onPointerCancel={onChibiPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            aria-label="小人：點擊抽卡，長按設定"
          >
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              loading="lazy"
              style={{ width: prefs.chibiWidth, height: 'auto' }}
            />
          </button>
        ) : null}
      </main>

      <section className={`ml-overlay ${overlayOpen ? 'open' : ''}`} onClick={closeOverlay}>
        <article
          className="ml-paper"
          onClick={(event) => event.stopPropagation()}
          style={
            {
              ['--ml-paper-bg' as string]: activePaper.paperBg,
              ['--ml-paper-title' as string]: activePaper.titleColor,
              ['--ml-paper-body' as string]: activePaper.bodyColor,
              ['--ml-paper-accent' as string]: activePaper.accentColor,
              ['--ml-pill-bg' as string]: activePaper.pillBg,
              ['--ml-pill-border' as string]: activePaper.pillBorder,
              ['--ml-pill-text' as string]: activePaper.pillText,
              ['--ml-content-size' as string]: `${prefs.contentFontSize}px`,
              ['--ml-content-line' as string]: prefs.contentLineHeight,
              ['--ml-letter-font' as string]: contentFontFamily,
            } as React.CSSProperties
          }
        >
          <header className="ml-paper-head">
            <span className="ml-pill">{activeLetter?.moodLabel ?? '心情信'}</span>
            {activeLetter ? (
              <button
                type="button"
                className="ml-paper-icon ml-paper-favorite"
                onClick={() => toggleFavorite(activeLetter.letter.id)}
                aria-label={favoriteIds.has(activeLetter.letter.id) ? '取消收藏' : '加入收藏'}
              >
                {favoriteIds.has(activeLetter.letter.id) ? '★' : '☆'}
              </button>
            ) : null}
            <button type="button" className="ml-paper-icon ml-paper-list" onClick={() => openList('all')} aria-label="開啟清單">
              ☰
            </button>
            <button
              type="button"
              className="ml-paper-icon ml-paper-aa"
              onClick={() => setShowFontPanel((prev) => !prev)}
              aria-label="文字設定"
            >
              Aa
            </button>
            <button type="button" className="ml-close ml-paper-close" onClick={closeOverlay} aria-label="關閉">
              ×
            </button>
          </header>

          {showFontPanel ? (
            <div className="ml-font-panel">
              <p className="ml-font-title">字體來源</p>
              <div className="ml-font-row">
                <button
                  type="button"
                  className={`ml-font-mode ${prefs.fontMode === 'default' ? 'active' : ''}`}
                  onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'default' }))}
                >
                  預設
                </button>
                <button
                  type="button"
                  className={`ml-font-mode ${prefs.fontMode === 'campfire' ? 'active' : ''}`}
                  onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'campfire' }))}
                >
                  跟隨篝火
                </button>
              </div>

              <div className="ml-font-control">
                <div className="ml-font-control-head">
                  <p className="ml-font-title">字級</p>
                  <p className="ml-font-value">{prefs.contentFontSize.toFixed(1)}px</p>
                </div>
                <input
                  type="range"
                  min={12}
                  max={24}
                  step={0.5}
                  value={prefs.contentFontSize}
                  onChange={(event) =>
                    setPrefs((prev) => ({
                      ...prev,
                      contentFontSize: clampNumber(Number(event.target.value), 12, 24, prev.contentFontSize),
                    }))
                  }
                  className="ml-font-slider"
                />
              </div>

              <div className="ml-font-control">
                <div className="ml-font-control-head">
                  <p className="ml-font-title">行距</p>
                  <p className="ml-font-value">{prefs.contentLineHeight.toFixed(2)}</p>
                </div>
                <input
                  type="range"
                  min={1.35}
                  max={2.9}
                  step={0.05}
                  value={prefs.contentLineHeight}
                  onChange={(event) =>
                    setPrefs((prev) => ({
                      ...prev,
                      contentLineHeight: clampNumber(Number(event.target.value), 1.35, 2.9, prev.contentLineHeight),
                    }))
                  }
                  className="ml-font-slider"
                />
              </div>
            </div>
          ) : null}

          <h2 className="ml-paper-title">{activeLetter?.letter.title ?? ''}</h2>
          <div className="ml-paper-body">{activeLetter?.content ?? ''}</div>

          <footer className="ml-paper-foot">
            <span className="ml-pool-hint">
              {activeLetter && activeLetter.total >= 0 ? `本輪剩餘 ${activeLetter.remaining} / ${activeLetter.total}` : '來自清單查看'}
            </span>
            <span className="ml-drawn-time-foot">{activeLetter ? `抽中時間 ${formatDrawnAt(activeLetter.drawnAtIso)}` : ''}</span>
            <button type="button" className="ml-redraw-chibi" onClick={drawAgain} disabled={isAnimating} aria-label="再抽一次">
              <img src={chibiSrc} alt="" draggable={false} loading="lazy" />
            </button>
          </footer>
        </article>
      </section>

      <section className={`ml-list-overlay ${listOpen ? 'open' : ''}`} onClick={() => setListOpen(false)}>
        <article className="ml-list-sheet" onClick={(event) => event.stopPropagation()}>
          <header className="ml-list-head">
            <div className="ml-list-head-main">
              <h3>信件清單</h3>
              <div className="ml-list-tabs-inline">
                <button type="button" className={listTab === 'all' ? 'active' : ''} onClick={() => setListTab('all')}>
                  全部
                </button>
                <button
                  type="button"
                  className={listTab === 'favorites' ? 'active' : ''}
                  onClick={() => setListTab('favorites')}
                >
                  收藏
                </button>
              </div>
            </div>
            <button type="button" className="ml-close" onClick={() => setListOpen(false)} aria-label="關閉清單">
              ×
            </button>
          </header>

          <div className="ml-list-moods">
            {listMoodOptions.map((option) => (
              <button
                key={`list-mood-${option.id}`}
                type="button"
                className={listMoodFilter === option.id ? 'active' : ''}
                onClick={() => setListMoodFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ml-list-search-wrap">
            <input
              className="ml-list-search"
              value={listQuery}
              onChange={(event) => setListQuery(event.target.value)}
              placeholder="搜尋標題、檔名或關鍵字"
            />
          </div>

          <div className="ml-list-body">
            {listedLetters.length ? (
              listedLetters.map((letter) => (
                <article
                  key={letter.id}
                  className="ml-list-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => openFromList(letter)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openFromList(letter);
                    }
                  }}
                >
                  <span className="ml-list-item-main">
                    <span className="ml-list-title">{letter.title}</span>
                    <span className="ml-list-mood">{letter.primaryMoodLabel}</span>
                  </span>
                  <button
                    type="button"
                    className="ml-list-star"
                    aria-label={favoriteIds.has(letter.id) ? '取消收藏' : '加入收藏'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(letter.id);
                    }}
                  >
                    {favoriteIds.has(letter.id) ? '★' : '☆'}
                  </button>
                </article>
              ))
            ) : (
              <p className="ml-list-empty">這裡還沒有符合條件的信件。</p>
            )}
          </div>
        </article>
      </section>

      <section className={`ml-settings-overlay ${showSettings ? 'open' : ''}`} onClick={closeSettings}>
        <article className="ml-settings-sheet" onClick={(event) => event.stopPropagation()}>
          <header className="ml-settings-head">
            <h3>心情星球小設定</h3>
            <button type="button" className="ml-close ml-settings-close" onClick={closeSettings} aria-label="關閉設定">
              ×
            </button>
          </header>

          <section className="ml-setting-block">
            <div className="ml-setting-row">
              <span>M</span>
              <button
                type="button"
                className={`ml-switch ${prefs.showChibi ? 'on' : ''}`}
                onClick={() => setPrefs((prev) => ({ ...prev, showChibi: !prev.showChibi }))}
              >
                <span />
              </button>
            </div>
            <label className="ml-setting-label">
              大小
              <input
                type="range"
                min={104}
                max={196}
                step={1}
                value={prefs.chibiWidth}
                onChange={(event) => setPrefs((prev) => ({ ...prev, chibiWidth: Number(event.target.value) }))}
              />
            </label>
            <label className="ml-setting-label">
              球數（{prefs.orbCount} 顆）
              <input
                type="range"
                min={ORB_COUNT_MIN}
                max={ORB_COUNT_MAX}
                step={1}
                value={prefs.orbCount}
                onChange={(event) => setPrefs((prev) => ({ ...prev, orbCount: Number(event.target.value) }))}
              />
            </label>
            <label className="ml-setting-label">
              球速（{prefs.orbSpeed.toFixed(2)}x）
              <input
                type="range"
                min={0.7}
                max={2.4}
                step={0.01}
                value={prefs.orbSpeed}
                onChange={(event) => setPrefs((prev) => ({ ...prev, orbSpeed: Number(event.target.value) }))}
              />
            </label>
            <div className="ml-setting-label">
              <span>球球模式</span>
              <div className="ml-orb-mode-options" role="radiogroup" aria-label="球球模式">
                {ORB_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={prefs.orbMode === option.id}
                    className={`ml-orb-mode-btn ${prefs.orbMode === option.id ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, orbMode: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="ml-setting-block">
            <label className="ml-setting-label">
              文字大小（{prefs.contentFontSize.toFixed(1)}px）
              <input
                type="range"
                min={12}
                max={24}
                step={0.1}
                value={prefs.contentFontSize}
                onChange={(event) => setPrefs((prev) => ({ ...prev, contentFontSize: Number(event.target.value) }))}
              />
            </label>
            <label className="ml-setting-label">
              行距（{prefs.contentLineHeight.toFixed(2)}）
              <input
                type="range"
                min={1.35}
                max={2.9}
                step={0.01}
                value={prefs.contentLineHeight}
                onChange={(event) => setPrefs((prev) => ({ ...prev, contentLineHeight: Number(event.target.value) }))}
              />
            </label>
          </section>

          <section className="ml-setting-block">
            <p className="ml-setting-caption">紙張色票</p>
            <div className="ml-paper-themes">
              {(Object.keys(PAPER_THEMES) as PaperThemeKey[]).map((key) => {
                const theme = PAPER_THEMES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`ml-paper-chip ${prefs.paperTheme === key ? 'active' : ''}`}
                    style={
                      {
                        ['--chip-bg' as string]: theme.paperBg,
                        ['--chip-accent' as string]: theme.accentColor,
                        ['--chip-text' as string]: theme.titleColor,
                      } as React.CSSProperties
                    }
                    onClick={() => setPrefs((prev) => ({ ...prev, paperTheme: key }))}
                  >
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </section>
        </article>
      </section>
    </div>
  );
}

export default MoodLettersPage;
