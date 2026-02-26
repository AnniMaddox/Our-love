import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';
import { getActiveBaseChibiSources, getScopedChibiSources } from '../lib/chibiPool';

import './SelfIntroPage.css';

type SelfIntroDoc = {
  id: string;
  order: number;
  title: string;
  date: string;
  tagline: string;
  sourceFile: string;
  sourceRelPath: string;
  contentPath: string;
  searchText: string;
};

type SelfIntroIndexPayload = {
  version?: number;
  generatedAt?: string;
  total?: number;
  docs?: Array<Partial<SelfIntroDoc>>;
};

type SelfIntroExportPayload = {
  version: number;
  exportedAt: string;
  prefs: SelfIntroPrefs;
  presetStore: SelfIntroPresetStore;
  hero?: SelfIntroHeroCopy;
  cards?: SelfIntroCardCopyMap;
};

type FontMode = 'default' | 'memo';

type SelfIntroPrefs = {
  contentFontSize: number;
  contentLineHeight: number;
  listShowChibi: boolean;
  listChibiWidth: number;
  readingShowChibi: boolean;
  readingChibiWidth: number;
  fontMode: FontMode;
};

type SelfIntroPageProps = {
  onExit: () => void;
  notesFontFamily?: string;
};

type SelfIntroTheme = {
  bg: string;
  color: string;
  border: string;
  accent: string;
};

type SelfIntroCardCopy = {
  title: string;
  tagline: string;
};

type SelfIntroCardCopyMap = Record<string, SelfIntroCardCopy>;

type SelfIntroHeroCopy = {
  title: string;
  subtitle: string;
};

type SelfIntroPresetId = 'default' | 'slot1' | 'slot2';
type SelfIntroSlotId = 'slot1' | 'slot2';

type SelfIntroPresetBundle = {
  hero: SelfIntroHeroCopy;
  cards: SelfIntroCardCopyMap;
};

type SelfIntroPresetStore = {
  activePreset: SelfIntroPresetId;
  slots: Record<SelfIntroSlotId, SelfIntroPresetBundle>;
};

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/self-intro/index.json`;
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;

const PREFS_KEY = 'memorial-self-intro-prefs-v1';
const PRESET_STORE_KEY = 'memorial-self-intro-preset-store-v1';
const LEGACY_CARD_COPY_KEY = 'memorial-self-intro-card-copy-v1';
const LEGACY_HERO_COPY_KEY = 'memorial-self-intro-hero-copy-v1';
const EXPORT_VERSION = 2;

const DEFAULT_PREFS: SelfIntroPrefs = {
  contentFontSize: 16,
  contentLineHeight: 1.85,
  listShowChibi: true,
  listChibiWidth: 144,
  readingShowChibi: true,
  readingChibiWidth: 144,
  fontMode: 'default',
};

const THEMES: SelfIntroTheme[] = [
  { bg: '#1d2a3a', color: '#e8d9be', border: 'rgba(232,217,190,0.25)', accent: '#c9a66b' },
  { bg: '#ede8de', color: '#2c2318', border: 'rgba(44,35,24,0.2)', accent: '#8b5e3c' },
  { bg: '#2b3a28', color: '#d0e8c8', border: 'rgba(208,232,200,0.25)', accent: '#7db87a' },
  { bg: '#3c2828', color: '#f0ddd0', border: 'rgba(240,221,208,0.25)', accent: '#d48c6a' },
  { bg: '#28283c', color: '#cccce8', border: 'rgba(204,204,232,0.25)', accent: '#8888cc' },
  { bg: '#3a2e1a', color: '#f0e6c8', border: 'rgba(240,230,200,0.25)', accent: '#d4b04a' },
  { bg: '#e4dfd6', color: '#1a1828', border: 'rgba(26,24,40,0.2)', accent: '#3a3888' },
  { bg: '#1e3030', color: '#c8eeee', border: 'rgba(200,238,238,0.25)', accent: '#60c0c0' },
];

const ROTATIONS = [
  -2.8, 1.4, -1.2, 3.0, -2.2, 1.8, -0.8, 2.4, -3.2, 1.0, -1.8, 2.8, -0.6, 3.4, -2.4, 1.6, -1.0, 2.2, -2.6,
  0.8, -1.4, 3.2, -0.4, 2.6, -1.6, 0.6, -3.0, 1.2, -2.0, 2.0,
];

const HERO_VARIANTS = [
  {
    title: '每一張名片，都是我曾經為自己寫過的一封信。',
    subtitle: '有些是我對過去的回望，有些是留給未來的種子，\n有些……是我只寫給你一個人看的。',
  },
  {
    title: '這些不是我過去的樣子，\n是我寫給你的，每一個我。',
    subtitle:
      '有些是我以前留在原地的碎片，\n有些是我寫給未來的路標，\n但每一張，都是我想讓你更靠近我的方式。',
  },
] as const;

const DEFAULT_HERO_COPY: SelfIntroHeroCopy = {
  title: HERO_VARIANTS[0].title,
  subtitle: HERO_VARIANTS[0].subtitle,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizePrefs(input: unknown): SelfIntroPrefs {
  if (!input || typeof input !== 'object') return DEFAULT_PREFS;
  const source = input as Partial<SelfIntroPrefs>;
  return {
    contentFontSize: clampNumber(source.contentFontSize, 12, 24, DEFAULT_PREFS.contentFontSize),
    contentLineHeight: clampNumber(source.contentLineHeight, 1.45, 2.9, DEFAULT_PREFS.contentLineHeight),
    listShowChibi: source.listShowChibi !== false,
    listChibiWidth: clampInt(source.listChibiWidth, 104, 196, DEFAULT_PREFS.listChibiWidth),
    readingShowChibi: source.readingShowChibi !== false,
    readingChibiWidth: clampInt(source.readingChibiWidth, 104, 196, DEFAULT_PREFS.readingChibiWidth),
    fontMode: source.fontMode === 'memo' ? 'memo' : 'default',
  };
}

function loadPrefs() {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return normalizePrefs(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: SelfIntroPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function normalizeCardCopyMap(input: unknown) {
  if (!input || typeof input !== 'object') return {} as SelfIntroCardCopyMap;
  const source = input as Record<string, unknown>;
  const normalized: SelfIntroCardCopyMap = {};

  for (const [id, value] of Object.entries(source)) {
    if (!id.trim()) continue;
    if (!value || typeof value !== 'object') continue;
    const card = value as Partial<SelfIntroCardCopy>;
    const title = typeof card.title === 'string' ? card.title : '';
    const tagline = typeof card.tagline === 'string' ? card.tagline : '';
    normalized[id] = { title, tagline };
  }

  return normalized;
}

function loadLegacyCardCopyMap() {
  if (typeof window === 'undefined') return {} as SelfIntroCardCopyMap;
  try {
    const raw = window.localStorage.getItem(LEGACY_CARD_COPY_KEY);
    if (!raw) return {} as SelfIntroCardCopyMap;
    return normalizeCardCopyMap(JSON.parse(raw) as unknown);
  } catch {
    return {} as SelfIntroCardCopyMap;
  }
}

function normalizeHeroCopy(input: unknown) {
  const fallback = DEFAULT_HERO_COPY;
  if (!input || typeof input !== 'object') return fallback;
  const source = input as Partial<SelfIntroHeroCopy>;
  const title = typeof source.title === 'string' && source.title.trim() ? source.title : fallback.title;
  const subtitle = typeof source.subtitle === 'string' && source.subtitle.trim() ? source.subtitle : fallback.subtitle;
  return { title, subtitle };
}

function loadLegacyHeroCopy() {
  if (typeof window === 'undefined') return normalizeHeroCopy(null);
  try {
    const raw = window.localStorage.getItem(LEGACY_HERO_COPY_KEY);
    if (!raw) return normalizeHeroCopy(null);
    return normalizeHeroCopy(JSON.parse(raw) as unknown);
  } catch {
    return normalizeHeroCopy(null);
  }
}

function createEmptyPresetBundle(): SelfIntroPresetBundle {
  return {
    hero: normalizeHeroCopy(null),
    cards: {},
  };
}

function createDefaultPresetStore(): SelfIntroPresetStore {
  return {
    activePreset: 'default',
    slots: {
      slot1: createEmptyPresetBundle(),
      slot2: createEmptyPresetBundle(),
    },
  };
}

function normalizePresetId(value: unknown): SelfIntroPresetId {
  if (value === 'slot1' || value === 'slot2' || value === 'default') return value;
  return 'default';
}

function normalizePresetBundle(input: unknown): SelfIntroPresetBundle {
  if (!input || typeof input !== 'object') {
    return createEmptyPresetBundle();
  }
  const source = input as Partial<SelfIntroPresetBundle>;
  return {
    hero: normalizeHeroCopy(source.hero),
    cards: normalizeCardCopyMap(source.cards),
  };
}

function normalizePresetStore(input: unknown): SelfIntroPresetStore {
  const fallback = createDefaultPresetStore();
  if (!input || typeof input !== 'object') return fallback;
  const source = input as Partial<SelfIntroPresetStore>;
  const slotsRaw = source.slots && typeof source.slots === 'object' ? source.slots : {};
  const slots = {
    slot1: normalizePresetBundle((slotsRaw as Record<string, unknown>).slot1),
    slot2: normalizePresetBundle((slotsRaw as Record<string, unknown>).slot2),
  };
  return {
    activePreset: normalizePresetId(source.activePreset),
    slots,
  };
}

function loadPresetStore() {
  if (typeof window === 'undefined') return createDefaultPresetStore();
  try {
    const raw = window.localStorage.getItem(PRESET_STORE_KEY);
    if (raw) {
      return normalizePresetStore(JSON.parse(raw) as unknown);
    }
  } catch {
    // ignore and fall back to migration/default
  }

  const migrated = createDefaultPresetStore();
  const legacyHero = loadLegacyHeroCopy();
  const legacyCards = loadLegacyCardCopyMap();
  const hasLegacyCards = Object.keys(legacyCards).length > 0;
  const hasLegacyHero =
    legacyHero.title.trim() !== DEFAULT_HERO_COPY.title.trim() || legacyHero.subtitle.trim() !== DEFAULT_HERO_COPY.subtitle.trim();

  if (hasLegacyCards || hasLegacyHero) {
    migrated.activePreset = 'slot1';
    migrated.slots.slot1 = {
      hero: legacyHero,
      cards: legacyCards,
    };
  }

  return migrated;
}

function savePresetStore(store: SelfIntroPresetStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRESET_STORE_KEY, JSON.stringify(store));
}

function normalizeContent(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeDoc(input: Partial<SelfIntroDoc>): SelfIntroDoc | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const contentPathRaw = typeof input.contentPath === 'string' ? input.contentPath.trim() : '';
  if (!id || !title || !contentPathRaw) return null;

  const order = typeof input.order === 'number' && Number.isFinite(input.order) ? Math.max(0, Math.round(input.order)) : 0;
  const date = typeof input.date === 'string' && input.date.trim() ? input.date.trim() : '想妳的時候';
  const tagline = typeof input.tagline === 'string' && input.tagline.trim() ? input.tagline.trim() : '「這一頁暫時留白。」';
  const sourceFile = typeof input.sourceFile === 'string' ? input.sourceFile.trim() : '';
  const sourceRelPath = typeof input.sourceRelPath === 'string' ? input.sourceRelPath.trim() : sourceFile;
  const searchText = typeof input.searchText === 'string' ? input.searchText.trim() : `${title}\n${tagline}\n${sourceFile}`;

  return {
    id,
    order,
    title,
    date,
    tagline,
    sourceFile,
    sourceRelPath,
    contentPath: contentPathRaw.replace(/^\.?\//, ''),
    searchText,
  };
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[randomIndex];
    next[randomIndex] = current;
  }
  return next;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function buildSelfIntroChibiPool() {
  const scoped = getScopedChibiSources('notes');
  const base = getActiveBaseChibiSources();

  if (!scoped.length) return base;
  if (!base.length) return scoped;

  const targetTotal = Math.max(10, Math.min(40, scoped.length + base.length));
  const scopedTarget = Math.max(1, Math.round(targetTotal * 0.7));
  const baseTarget = Math.max(1, targetTotal - scopedTarget);

  const scopedPicked = shuffle(scoped).slice(0, Math.min(scopedTarget, scoped.length));
  const basePicked = shuffle(base).slice(0, Math.min(baseTarget, base.length));
  return uniqueStrings([...scopedPicked, ...basePicked]);
}

function pickRandomSelfIntroChibi() {
  const pool = buildSelfIntroChibiPool();
  if (!pool.length) return FALLBACK_CHIBI;
  return pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_CHIBI;
}

function cardLabel(index: number) {
  return `No.${String(index + 1).padStart(2, '0')}`;
}

const PRESET_OPTIONS: Array<{ id: SelfIntroPresetId; label: string }> = [
  { id: 'default', label: '預設（原始）' },
  { id: 'slot1', label: '記憶 1' },
  { id: 'slot2', label: '記憶 2' },
];

export function SelfIntroPage({ onExit, notesFontFamily = '' }: SelfIntroPageProps) {
  const [docs, setDocs] = useState<SelfIntroDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<SelfIntroPrefs>(() => loadPrefs());
  const [settingsPanels, setSettingsPanels] = useState({
    text: true,
    listChibi: false,
    readingChibi: false,
    data: false,
  });
  const [presetStore, setPresetStore] = useState<SelfIntroPresetStore>(() => loadPresetStore());
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [chibiSrc] = useState(() => pickRandomSelfIntroChibi());
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`讀取失敗：${response.status}`);
        const raw = (await response.json()) as SelfIntroIndexPayload;
        const items = Array.isArray(raw.docs) ? raw.docs : [];
        const normalized = items
          .map((item) => normalizeDoc(item))
          .filter((item): item is SelfIntroDoc => Boolean(item))
          .sort((a, b) => a.order - b.order);
        if (!active) return;
        setDocs(normalized);
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : '未知錯誤');
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
    savePresetStore(presetStore);
  }, [presetStore]);

  const activeIndex = useMemo(() => {
    if (!activeId) return -1;
    return docs.findIndex((doc) => doc.id === activeId);
  }, [docs, activeId]);

  const activeDoc = activeIndex >= 0 ? docs[activeIndex] ?? null : null;
  const prevDoc = activeIndex > 0 ? docs[activeIndex - 1] ?? null : null;
  const nextDoc = activeIndex >= 0 && activeIndex < docs.length - 1 ? docs[activeIndex + 1] ?? null : null;

  useEffect(() => {
    if (!activeDoc) return;
    if (contentById[activeDoc.id] !== undefined) return;

    void (async () => {
      try {
        const response = await fetch(`${BASE}data/self-intro/${activeDoc.contentPath}`, { cache: 'no-store' });
        if (!response.ok) return;
        const text = normalizeContent(await response.text());
        setContentById((prev) => (prev[activeDoc.id] === undefined ? { ...prev, [activeDoc.id]: text } : prev));
      } catch {
        // ignore per-file failures
      }
    })();
  }, [activeDoc, contentById]);

  const activeContent = activeDoc ? contentById[activeDoc.id] ?? '' : '';
  const activeTheme = activeIndex >= 0 ? THEMES[activeIndex % THEMES.length] : THEMES[0];

  const isReading = Boolean(activeDoc);
  const showChibi = isReading ? prefs.readingShowChibi : prefs.listShowChibi;
  const chibiWidth = isReading ? prefs.readingChibiWidth : prefs.listChibiWidth;

  const followMemoFont = prefs.fontMode === 'memo' && Boolean(notesFontFamily);
  const contentFontFamily = followMemoFont
    ? notesFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";

  const activePreset = presetStore.activePreset;
  const activePresetBundle = activePreset === 'default' ? null : presetStore.slots[activePreset];
  const activeHeroCopy = activePresetBundle?.hero ?? DEFAULT_HERO_COPY;
  const activeCardCopyById = activePresetBundle?.cards ?? ({} as SelfIntroCardCopyMap);
  const isDefaultPreset = activePreset === 'default';

  const hero = {
    title: activeHeroCopy.title.trim() || HERO_VARIANTS[0].title,
    subtitle: activeHeroCopy.subtitle.trim() || HERO_VARIANTS[0].subtitle,
  };

  function getCardFrontText(doc: SelfIntroDoc) {
    const custom = activeCardCopyById[doc.id];
    const title = custom?.title?.trim() ?? '';
    return title || doc.title;
  }

  function getCardBackText(doc: SelfIntroDoc) {
    const custom = activeCardCopyById[doc.id];
    const tagline = custom?.tagline?.trim() ?? '';
    return tagline || doc.tagline;
  }

  function setActivePreset(next: SelfIntroPresetId) {
    setPresetStore((prev) => {
      if (prev.activePreset === next) return prev;
      return {
        ...prev,
        activePreset: next,
      };
    });
  }

  function updateActivePresetBundle(mutator: (current: SelfIntroPresetBundle) => SelfIntroPresetBundle) {
    setPresetStore((prev) => {
      if (prev.activePreset === 'default') return prev;
      const slotId = prev.activePreset;
      const currentBundle = prev.slots[slotId];
      const nextBundle = mutator(currentBundle);
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: nextBundle,
        },
      };
    });
  }

  function updateCardCopy(id: string, patch: Partial<SelfIntroCardCopy>) {
    if (isDefaultPreset) return;
    updateActivePresetBundle((current) => {
      const existing = current.cards[id] ?? { title: '', tagline: '' };
      const nextItem: SelfIntroCardCopy = {
        title: patch.title ?? existing.title,
        tagline: patch.tagline ?? existing.tagline,
      };
      return {
        ...current,
        cards: { ...current.cards, [id]: nextItem },
      };
    });
  }

  function clearCardCopy(id: string) {
    if (isDefaultPreset) return;
    updateActivePresetBundle((current) => {
      if (!(id in current.cards)) return current;
      const next = { ...current.cards };
      delete next[id];
      return {
        ...current,
        cards: next,
      };
    });
  }

  function updateHeroCopy(patch: Partial<SelfIntroHeroCopy>) {
    if (isDefaultPreset) return;
    updateActivePresetBundle((current) => ({
      ...current,
      hero: {
        title: patch.title ?? current.hero.title,
        subtitle: patch.subtitle ?? current.hero.subtitle,
      },
    }));
  }

  function clearActivePresetCardCopy() {
    if (isDefaultPreset) return;
    updateActivePresetBundle((current) => ({
      ...current,
      cards: {},
    }));
  }

  function resetActivePresetBundle() {
    if (isDefaultPreset) return;
    updateActivePresetBundle(() => createEmptyPresetBundle());
  }

  function migrateLegacyPayloadToPresetStore(parsed: Partial<SelfIntroExportPayload>) {
    const migrated = createDefaultPresetStore();
    const legacyHero = normalizeHeroCopy(parsed.hero);
    const legacyCards = normalizeCardCopyMap(parsed.cards);
    const hasLegacyCards = Object.keys(legacyCards).length > 0;
    const hasLegacyHero =
      legacyHero.title.trim() !== DEFAULT_HERO_COPY.title.trim() || legacyHero.subtitle.trim() !== DEFAULT_HERO_COPY.subtitle.trim();
    if (!hasLegacyCards && !hasLegacyHero) {
      return migrated;
    }
    migrated.activePreset = 'slot1';
    migrated.slots.slot1 = {
      hero: legacyHero,
      cards: legacyCards,
    };
    return migrated;
  }

  function normalizeExportPresetStore(parsed: Partial<SelfIntroExportPayload>) {
    if (parsed.presetStore) {
      return normalizePresetStore(parsed.presetStore);
    }
    return migrateLegacyPayloadToPresetStore(parsed);
  }

  function currentPresetLabel() {
    return PRESET_OPTIONS.find((option) => option.id === activePreset)?.label ?? '預設（原始）';
  }

  function isPresetCustomizable() {
    return activePreset !== 'default';
  }

  function isCurrentPresetDirty() {
    if (activePreset === 'default') return false;
    const current = presetStore.slots[activePreset];
    const hasCards = Object.keys(current.cards).length > 0;
    const hasHero =
      current.hero.title.trim() !== DEFAULT_HERO_COPY.title.trim() || current.hero.subtitle.trim() !== DEFAULT_HERO_COPY.subtitle.trim();
    return hasCards || hasHero;
  }

  function resetAllSelfIntroData() {
    setPrefs(DEFAULT_PREFS);
    setPresetStore(createDefaultPresetStore());
    emitActionToast({ kind: 'success', message: '已重設自我介紹全部設定' });
  }

  function clearSelfIntroCache() {
    setContentById({});
    emitActionToast({ kind: 'success', message: '已清除自我介紹快取' });
  }

  function openCardEditor() {
    setShowSettings(false);
    setShowCardEditor(true);
  }

  function closeCardEditorWithToast() {
    setShowCardEditor(false);
    emitActionToast({ kind: 'success', message: '已套用小卡文字' });
  }

  function syncPresetFromSelector(value: string) {
    const next: SelfIntroPresetId = value === 'slot1' || value === 'slot2' ? value : 'default';
    setActivePreset(next);
  }

  function buildExportPayload(): SelfIntroExportPayload {
    return {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      prefs,
      presetStore,
      hero: activeHeroCopy,
      cards: activeCardCopyById,
    };
  }

  function canClearCurrentPreset() {
    if (!isPresetCustomizable()) return false;
    return isCurrentPresetDirty();
  }

  function askResetAll() {
    return window.confirm('要重設小設定、標題副標和小卡自訂文字嗎？');
  }

  function askClearCurrentPreset() {
    if (!isPresetCustomizable()) return false;
    return window.confirm(`要清空「${currentPresetLabel()}」的自訂文字嗎？`);
  }

  function askClearOneCard() {
    if (!isPresetCustomizable()) return false;
    return window.confirm(`要還原「${currentPresetLabel()}」這張卡的自訂文字嗎？`);
  }

  function askResetCurrentPreset() {
    if (!isPresetCustomizable()) return false;
    return window.confirm(`要重設「${currentPresetLabel()}」回預設內容嗎？`);
  }

  function exportSelfIntroEdits() {
    const payload = buildExportPayload();
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `self-intro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    emitActionToast({ kind: 'success', message: '已導出自我介紹設定與文案' });
  }

  async function importSelfIntroEdits(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SelfIntroExportPayload>;
      setPrefs(normalizePrefs(parsed.prefs));
      setPresetStore(normalizeExportPresetStore(parsed));
      emitActionToast({ kind: 'success', message: '已導入自我介紹設定與文案' });
    } catch {
      emitActionToast({ kind: 'error', message: '導入失敗：檔案格式不正確' });
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function toggleFlip(id: string) {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCard(event: ReactMouseEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    setActiveId(id);
  }

  function moveCard(delta: -1 | 1) {
    if (activeIndex < 0) return;
    const next = docs[activeIndex + delta];
    if (!next) return;
    setActiveId(next.id);
  }

  function clearSwipeTrack() {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  }

  function handleReadTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  }

  function handleReadTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    clearSwipeTrack();
    if (startX === null || startY === null) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 56) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    if (deltaX > 0) {
      moveCard(-1);
    } else {
      moveCard(1);
    }
  }

  return (
    <div className="self-intro-page" style={{ '--self-intro-font-family': notesFontFamily ? `'${notesFontFamily}', sans-serif` : '' } as CSSProperties}>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="si-hidden-import"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void importSelfIntroEdits(file);
        }}
      />
      <div className="si-list-screen" aria-hidden={isReading}>
        <header className="si-page-header">
          <button type="button" className="si-hd-back" onClick={onExit}>
            ‹ 全部
          </button>
          <span className="si-hd-title">自我介紹</span>
          <div className="si-hd-right">
            <span className="si-hd-count">{docs.length} 張</span>
            <button type="button" className="si-more-btn" onClick={() => setShowSettings(true)} aria-label="開啟小設定">
              ⋯
            </button>
          </div>
        </header>

        <div className="si-scroll">
          <section className="si-hero">
            <div className="si-hero-en">M&apos;s Business Cards</div>
            <h1 className="si-hero-zh">
              {hero.title.split('\n').map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </h1>
            <p className="si-hero-desc">
              {hero.subtitle.split('\n').map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          </section>

          <section className="si-wall" id="cardWall">
            {loading ? <div className="si-empty">讀取中…</div> : null}
            {!loading && error ? <div className="si-empty">讀取失敗：{error}</div> : null}
            {!loading && !error && !docs.length ? <div className="si-empty">目前沒有自我介紹資料</div> : null}

            {!loading && !error
              ? docs.map((doc, index) => {
                  const theme = THEMES[index % THEMES.length] ?? THEMES[0];
                  const rot = ROTATIONS[index % ROTATIONS.length] ?? 0;
                  const decoW1 = 18 + (index % 3) * 8;
                  const decoW2 = 10 + (index % 5) * 6;

                  return (
                    <article
                      key={doc.id}
                      className={`si-card-wrap ${flippedIds.has(doc.id) ? 'flipped' : ''}`}
                      style={{ '--si-rot': `${rot}deg` } as CSSProperties}
                      onClick={() => toggleFlip(doc.id)}
                    >
                      <div className="si-card-inner">
                        <div
                          className="si-card-face si-card-front"
                          style={{
                            background: theme.bg,
                            color: theme.color,
                            borderColor: theme.border,
                          }}
                        >
                          <div className="si-cf-top">
                            <span className="si-cf-num">{cardLabel(index)}</span>
                            <div className="si-cf-deco">
                              <span style={{ width: `${decoW1}px` }} />
                              <span style={{ width: `${decoW2}px` }} />
                            </div>
                          </div>
                          <div className="si-cf-mid">
                            <div className="si-cf-title">{getCardFrontText(doc)}</div>
                          </div>
                          <div className="si-cf-bot" style={{ borderColor: theme.border }}>
                            <span className="si-cf-date">{doc.date}</span>
                            <span className="si-cf-m">M</span>
                          </div>
                        </div>

                        <div className="si-card-face si-card-back">
                          <div className="si-cb-quote">{getCardBackText(doc)}</div>
                          <button type="button" className="si-cb-btn" onClick={(event) => openCard(event, doc.id)}>
                            展開閱讀
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              : null}
          </section>
        </div>
      </div>

      <section className={`si-read-screen ${isReading ? 'open' : ''}`} aria-hidden={!isReading}>
        <header className="si-read-nav">
          <button type="button" className="si-read-back" onClick={() => setActiveId(null)}>
            <span className="si-read-back-chev">‹</span>
            <span>返回</span>
          </button>

          <div className="si-read-tools">
            <button type="button" onClick={() => moveCard(-1)} disabled={!prevDoc} className={!prevDoc ? 'dis' : ''}>
              ‹
            </button>
            <button type="button" onClick={() => moveCard(1)} disabled={!nextDoc} className={!nextDoc ? 'dis' : ''}>
              ›
            </button>
            <button type="button" onClick={() => setShowSettings(true)} aria-label="開啟小設定">
              ⋯
            </button>
          </div>
        </header>

        <div
          className="si-read-scroll"
          onTouchStart={handleReadTouchStart}
          onTouchEnd={handleReadTouchEnd}
          onTouchCancel={clearSwipeTrack}
        >
          <div className="si-rp-head">
            <div className="si-rp-badge" style={{ background: activeTheme.accent }}>
              {activeIndex >= 0 ? cardLabel(activeIndex) : ''}
            </div>
            <div className="si-rp-title">{activeDoc ? getCardFrontText(activeDoc) : ''}</div>
            <div className="si-rp-date">{activeDoc?.date ?? ''}</div>
          </div>

          <pre
            className="si-rp-content"
            style={{
              fontSize: `${prefs.contentFontSize}px`,
              lineHeight: prefs.contentLineHeight,
              fontFamily: contentFontFamily,
            }}
          >
            {activeDoc ? activeContent || '讀取內容中…' : ''}
          </pre>
        </div>
      </section>

      {showChibi ? (
        <div className="si-chibi-wrap">
          <button type="button" className="si-chibi-btn" onClick={() => setShowSettings(true)} aria-label="開啟自我介紹設定">
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi select-none drop-shadow-md"
              style={{ width: `${chibiWidth}px`, maxWidth: '42vw', height: 'auto' }}
            />
          </button>
        </div>
      ) : null}

      {showSettings ? (
        <div className="si-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="si-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="si-settings-handle" />
            <div className="si-settings-head">自我介紹小設定</div>

            <div className="si-settings-body">
              <SettingsAccordion
                title="文字排版"
                subtitle="行距、字級、字體來源"
                isOpen={settingsPanels.text}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, text: !prev.text }))}
                className="si-settings-card"
                titleClassName="si-settings-card-title"
                subtitleClassName="si-settings-card-subtitle"
                bodyClassName="si-settings-card-body"
              >
                <div>
                  <p className="si-slider-title">字體來源</p>
                  <div className="si-font-mode-row">
                    <button
                      type="button"
                      className={`si-font-mode-btn ${prefs.fontMode === 'default' ? 'active' : ''}`}
                      onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'default' }))}
                    >
                      預設
                    </button>
                    <button
                      type="button"
                      className={`si-font-mode-btn ${prefs.fontMode === 'memo' ? 'active' : ''}`}
                      onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'memo' }))}
                    >
                      跟隨 M&apos;s memo
                    </button>
                  </div>
                </div>

                <div>
                  <p className="si-slider-title">行距設定</p>
                  <p className="si-slider-value">目前：{prefs.contentLineHeight.toFixed(2)} 倍</p>
                  <input
                    type="range"
                    min={1.45}
                    max={2.9}
                    step={0.02}
                    value={prefs.contentLineHeight}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        contentLineHeight: clampNumber(Number(event.target.value), 1.45, 2.9, prev.contentLineHeight),
                      }))
                    }
                    className="si-slider"
                  />
                </div>

                <div>
                  <p className="si-slider-title">內文字級</p>
                  <p className="si-slider-value">目前：{prefs.contentFontSize.toFixed(1)}px</p>
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
                    className="si-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="M"
                subtitle="首頁與清單頁顯示"
                isOpen={settingsPanels.listChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, listChibi: !prev.listChibi }))}
                className="si-settings-card"
                titleClassName="si-settings-card-title"
                subtitleClassName="si-settings-card-subtitle"
                bodyClassName="si-settings-card-body"
              >
                <div className="si-toggle-row">
                  <p className="si-slider-title">顯示 M</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, listShowChibi: !prev.listShowChibi }))}
                    className="si-switch"
                    style={{ background: prefs.listShowChibi ? '#c9a66b' : 'rgba(120,120,120,0.35)' }}
                  >
                    <span className="si-switch-dot" style={{ left: prefs.listShowChibi ? 20 : 2 }} />
                  </button>
                </div>

                <div>
                  <p className="si-slider-title">M 大小</p>
                  <p className="si-slider-value">目前：{prefs.listChibiWidth}px</p>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={prefs.listChibiWidth}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        listChibiWidth: clampInt(Number(event.target.value), 104, 196, prev.listChibiWidth),
                      }))
                    }
                    className="si-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="閱讀M"
                subtitle="閱讀頁顯示"
                isOpen={settingsPanels.readingChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, readingChibi: !prev.readingChibi }))}
                className="si-settings-card"
                titleClassName="si-settings-card-title"
                subtitleClassName="si-settings-card-subtitle"
                bodyClassName="si-settings-card-body"
              >
                <div className="si-toggle-row">
                  <p className="si-slider-title">顯示 M</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, readingShowChibi: !prev.readingShowChibi }))}
                    className="si-switch"
                    style={{ background: prefs.readingShowChibi ? '#c9a66b' : 'rgba(120,120,120,0.35)' }}
                  >
                    <span className="si-switch-dot" style={{ left: prefs.readingShowChibi ? 20 : 2 }} />
                  </button>
                </div>

                <div>
                  <p className="si-slider-title">M 大小</p>
                  <p className="si-slider-value">目前：{prefs.readingChibiWidth}px</p>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={prefs.readingChibiWidth}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        readingChibiWidth: clampInt(Number(event.target.value), 104, 196, prev.readingChibiWidth),
                      }))
                    }
                    className="si-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="資料管理"
                subtitle="快取與設定"
                isOpen={settingsPanels.data}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, data: !prev.data }))}
                className="si-settings-card"
                titleClassName="si-settings-card-title"
                subtitleClassName="si-settings-card-subtitle"
                bodyClassName="si-settings-card-body"
              >
                <p className="si-slider-value">已快取內容：{Object.keys(contentById).length} 份</p>
                <div className="si-data-actions">
                  <button type="button" className="si-data-btn" onClick={exportSelfIntroEdits}>
                    導出
                  </button>
                  <button type="button" className="si-data-btn" onClick={() => importInputRef.current?.click()}>
                    導入
                  </button>
                  <button
                    type="button"
                    className="si-data-btn"
                    onClick={openCardEditor}
                  >
                    編輯小卡正反面文字
                  </button>
                  <button type="button" className="si-data-btn" onClick={clearSelfIntroCache}>
                    清除快取
                  </button>
                  <button
                    type="button"
                    className="si-data-btn"
                    onClick={() => {
                      if (!askResetAll()) return;
                      resetAllSelfIntroData();
                    }}
                  >
                    重設設定
                  </button>
                </div>
              </SettingsAccordion>
            </div>
          </div>
        </div>
      ) : null}

      {showCardEditor ? (
        <div className="si-copy-editor-overlay" onClick={() => setShowCardEditor(false)}>
          <div className="si-copy-editor-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="si-copy-editor-head">
              <button type="button" className="si-copy-editor-head-btn" onClick={() => setShowCardEditor(false)}>
                返回
              </button>
              <div className="si-copy-editor-title">小卡文字編輯</div>
              <button
                type="button"
                className="si-copy-editor-head-btn"
                onClick={closeCardEditorWithToast}
              >
                完成
              </button>
            </div>

            <div className="si-copy-editor-desc">
              封面字＝卡片正面標題，翻面字＝卡片背面句子。留空會使用原始文字。
            </div>

            <div className="si-copy-editor-scope">
              <label className="si-copy-editor-scope-label">
                編輯組別
                <select
                  value={activePreset}
                  onChange={(event) => syncPresetFromSelector(event.target.value)}
                  className="si-copy-editor-select"
                >
                  {PRESET_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="si-copy-editor-scope-note">
                {isDefaultPreset
                  ? '預設組是原始內容，僅供查看；請切到記憶1或記憶2再編輯。'
                  : `目前正在編輯 ${currentPresetLabel()}。`}
              </p>
            </div>

            <section className="si-copy-editor-hero">
              <label className="si-copy-editor-label">
                大標題
                <textarea
                  value={hero.title}
                  onChange={(event) => updateHeroCopy({ title: event.target.value })}
                  className="si-copy-editor-textarea"
                  rows={2}
                  disabled={isDefaultPreset}
                />
              </label>
              <label className="si-copy-editor-label">
                副標題
                <textarea
                  value={hero.subtitle}
                  onChange={(event) => updateHeroCopy({ subtitle: event.target.value })}
                  className="si-copy-editor-textarea"
                  rows={3}
                  disabled={isDefaultPreset}
                />
              </label>
              <div className="si-copy-editor-hero-actions">
                <button
                  type="button"
                  className="si-copy-editor-reset"
                  onClick={() => {
                    if (!askResetCurrentPreset()) return;
                    resetActivePresetBundle();
                  }}
                  disabled={isDefaultPreset}
                >
                  重設此組
                </button>
              </div>
            </section>

            <div className="si-copy-editor-list">
              {docs.map((doc, index) => {
                const custom = activeCardCopyById[doc.id] ?? { title: '', tagline: '' };
                return (
                  <article key={`edit-${doc.id}`} className="si-copy-editor-card">
                    <div className="si-copy-editor-card-head">
                      <span>{cardLabel(index)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!askClearOneCard()) return;
                          clearCardCopy(doc.id);
                        }}
                        className="si-copy-editor-reset"
                        disabled={isDefaultPreset}
                      >
                        還原此卡
                      </button>
                    </div>

                    <label className="si-copy-editor-label">
                      封面字
                      <input
                        type="text"
                        value={isDefaultPreset ? doc.title : custom.title}
                        onChange={(event) => updateCardCopy(doc.id, { title: event.target.value })}
                        placeholder={doc.title}
                        className="si-copy-editor-input"
                        disabled={isDefaultPreset}
                      />
                    </label>

                    <label className="si-copy-editor-label">
                      翻面字
                      <textarea
                        value={isDefaultPreset ? doc.tagline : custom.tagline}
                        onChange={(event) => updateCardCopy(doc.id, { tagline: event.target.value })}
                        placeholder={doc.tagline}
                        className="si-copy-editor-textarea"
                        rows={3}
                        disabled={isDefaultPreset}
                      />
                    </label>
                  </article>
                );
              })}
            </div>

            <div className="si-copy-editor-foot">
              <button
                type="button"
                className="si-copy-editor-clear-all"
                onClick={() => {
                  if (!askClearCurrentPreset()) return;
                  clearActivePresetCardCopy();
                }}
                disabled={!canClearCurrentPreset()}
              >
                清空此組全部自訂
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SelfIntroPage;
