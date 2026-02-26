import { useEffect, useMemo, useRef, useState } from 'react';

import { getActiveBaseChibiSources } from '../lib/chibiPool';
import type { StoredLetter } from '../lib/letterDB';
import { pickLetterWrittenAt } from '../lib/letterDate';
import type { LetterUiMode } from '../types/settings';

// ─── Types ───────────────────────────────────────────────────────────────────

export type { StoredLetter };

export type LetterPageProps = {
  letters: StoredLetter[];
  letterFontFamily: string;
  uiMode?: LetterUiMode;
  /** Optional: set of letter names the user has favourited — wired by CODEX */
  favoritedNames?: Set<string>;
  /** Optional: called when user taps ❤ — wired by CODEX */
  onFavorite?: (name: string) => void;
  /** Optional: called when user taps the back arrow — wired by CODEX */
  onExit?: () => void;
};

const LOCAL_FAVORITES_KEY = 'memorial-letter-favorites-v1';
const LOCAL_VARIANT_CLASSIC_KEY = 'memorial-letter-ui-variant-v1';
const LOCAL_VARIANT_PREVIEW_KEY = 'memorial-letter-ui-variant-preview-v1';
const LOCAL_READING_PREFS_KEY = 'memorial-letter-reading-prefs-v1';
const LETTER_VARIANTS = ['A', 'B', 'C'] as const;
const PREVIEW_VARIANTS = ['B', 'C'] as const;
const DEFAULT_READING_FONT_SIZE = 15;
const DEFAULT_READING_LINE_HEIGHT = 2.15;

type LetterUiVariant = (typeof LETTER_VARIANTS)[number];
type PreviewLetterVariant = (typeof PREVIEW_VARIANTS)[number];
type LetterReadingFontMode = 'default' | 'letter';
type LetterReadingPrefs = {
  fontSize: number;
  lineHeight: number;
  fontMode: LetterReadingFontMode;
};

const LETTER_CHIBI_MODULES = import.meta.glob('../../public/letter-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const LETTER_CHIBI_SOURCES = Object.entries(LETTER_CHIBI_MODULES)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, src]) => src);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomChibiSrc(except?: string): string {
  const letterSources = LETTER_CHIBI_SOURCES;
  const baseSources = getActiveBaseChibiSources();
  const hasLetterSources = letterSources.length > 0;

  const pickPool = () => {
    if (!hasLetterSources) {
      return baseSources;
    }
    // Prioritize letter-only chibi, then fall back to the global active pool.
    if (baseSources.length === 0) {
      return letterSources;
    }
    return Math.random() < 0.72 ? letterSources : baseSources;
  };

  const firstPool = pickPool();
  if (!firstPool.length) {
    return '';
  }
  if (firstPool.length === 1 && (!except || firstPool[0] !== except)) {
    return firstPool[0];
  }

  for (let i = 0; i < 6; i++) {
    const activePool = pickPool();
    if (!activePool.length) {
      continue;
    }
    const c = activePool[Math.floor(Math.random() * activePool.length)];
    if (!except || c !== except) return c;
  }

  const merged = [...letterSources, ...baseSources];
  return merged.find((s) => s !== except) ?? merged[0] ?? '';
}

function stripExt(name: string) {
  return name.replace(/\.(txt|md|docx|json)$/i, '');
}

function normalizeLetterTimestamp(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatDate(ts: number | null) {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
    return '♡';
  }

  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    return '♡';
  }

  return parsed.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

function toLetterVariant(input: string | null | undefined): LetterUiVariant {
  return LETTER_VARIANTS.find((variant) => variant === input) ?? 'A';
}

function getAvailableVariants(uiMode: LetterUiMode): readonly LetterUiVariant[] {
  return uiMode === 'preview' ? PREVIEW_VARIANTS : LETTER_VARIANTS;
}

function isNightVariant(variant: LetterUiVariant) {
  return variant !== 'A';
}

function clampReadingFontSize(value: unknown, fallback = DEFAULT_READING_FONT_SIZE) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(13, Math.min(21, Number(value.toFixed(2))));
}

function clampReadingLineHeight(value: unknown, fallback = DEFAULT_READING_LINE_HEIGHT) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(1.55, Math.min(2.75, Number(value.toFixed(2))));
}

function readReadingPrefs(): LetterReadingPrefs {
  if (typeof window === 'undefined') {
    return {
      fontSize: DEFAULT_READING_FONT_SIZE,
      lineHeight: DEFAULT_READING_LINE_HEIGHT,
      fontMode: 'default',
    };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_READING_PREFS_KEY);
    if (!raw) {
      return {
        fontSize: DEFAULT_READING_FONT_SIZE,
        lineHeight: DEFAULT_READING_LINE_HEIGHT,
        fontMode: 'default',
      };
    }
    const parsed = JSON.parse(raw) as Partial<LetterReadingPrefs>;
    const fontMode = parsed.fontMode === 'letter' || parsed.fontMode === 'default' ? parsed.fontMode : 'default';
    return {
      fontSize: clampReadingFontSize(parsed.fontSize, DEFAULT_READING_FONT_SIZE),
      lineHeight: clampReadingLineHeight(parsed.lineHeight, DEFAULT_READING_LINE_HEIGHT),
      fontMode,
    };
  } catch {
    return {
      fontSize: DEFAULT_READING_FONT_SIZE,
      lineHeight: DEFAULT_READING_LINE_HEIGHT,
      fontMode: 'default',
    };
  }
}

const CLASSIC_B_GLOW_DOTS = Array.from({ length: 16 }, (_, index) => ({
  top: `${7 + ((index * 17) % 76)}%`,
  left: `${6 + ((index * 23) % 88)}%`,
  size: 20 + ((index * 9) % 44),
  opacity: 0.16 + (index % 5) * 0.07,
  duration: 6.6 + (index % 7) * 1.2,
  delay: -((index * 1.15) % 9.6),
  blur: index % 3 === 0 ? 0.8 : 1.5,
}));

const CLASSIC_B_SPARKS = Array.from({ length: 34 }, (_, index) => ({
  top: `${4 + ((index * 19) % 90)}%`,
  left: `${2 + ((index * 29) % 95)}%`,
  size: index % 4 === 0 ? 2.4 : 1.4,
  opacity: 0.35 + (index % 3) * 0.18,
  duration: 2.2 + (index % 6) * 0.55,
  delay: -((index * 0.35) % 3.6),
}));

const CLASSIC_A_SNOW_FLAKES = Array.from({ length: 112 }, (_, index) => ({
  left: `${(index * 9.9) % 100}%`,
  top: `${-12 - ((index * 7.4) % 132)}%`,
  size: index % 11 === 0 ? 4.4 : index % 5 === 0 ? 3.2 : index % 2 === 0 ? 2.4 : 1.7,
  opacity: index % 4 === 0 ? 0.92 : index % 3 === 0 ? 0.74 : 0.56,
  duration: 6.8 + (index % 9) * 0.92,
  delay: -((index * 0.67) % 12.2),
  drift: index % 2 === 0 ? 18 + (index % 5) * 3 : -(14 + (index % 5) * 3),
  blur: index % 6 === 0 ? 0.4 : index % 3 === 0 ? 0.9 : 0,
}));

const CLASSIC_A_BIG_SNOW_FLAKES = Array.from({ length: 56 }, (_, index) => ({
  left: `${(index * 15.1) % 100}%`,
  top: `${-18 - ((index * 10.5) % 190)}%`,
  size: index % 8 === 0 ? 7.4 : index % 3 === 0 ? 5.9 : 4.2,
  opacity: index % 4 === 0 ? 0.68 : index % 2 === 0 ? 0.56 : 0.44,
  duration: 10.2 + (index % 8) * 1.06,
  delay: -((index * 0.73) % 12.8),
  drift: index % 2 === 0 ? 26 + (index % 5) * 4 : -(22 + (index % 5) * 4),
  blur: index % 5 === 0 ? 0.4 : index % 2 === 0 ? 0.9 : 1.3,
}));

const CLASSIC_C_STAR_DOTS = Array.from({ length: 38 }, (_, index) => ({
  top: `${3 + ((index * 13) % 56)}%`,
  left: `${3 + ((index * 31) % 93)}%`,
  size: index % 5 === 0 ? 2.2 : 1.2,
  opacity: 0.18 + (index % 4) * 0.16,
  duration: 2.8 + (index % 5) * 0.7,
  delay: -((index * 0.3) % 3.8),
}));

const CLASSIC_C_SNOW_FLAKES = Array.from({ length: 148 }, (_, index) => ({
  left: `${(index * 14.3) % 100}%`,
  top: `${-18 - ((index * 8) % 150)}%`,
  size: index % 12 === 0 ? 4.3 : index % 4 === 0 ? 3.1 : 2,
  opacity: index % 7 === 0 ? 0.98 : index % 3 === 0 ? 0.82 : 0.64,
  duration: 5.6 + (index % 10) * 0.96,
  delay: -((index * 0.78) % 13.2),
  reverse: index % 2 === 0,
}));

const CLASSIC_C_UP_SNOW_DOTS = Array.from({ length: 58 }, (_, index) => ({
  left: `${(index * 11.7) % 100}%`,
  top: `${102 + ((index * 7.3) % 34)}%`,
  size: index % 11 === 0 ? 6.2 : index % 5 === 0 ? 4.8 : index % 3 === 0 ? 3.5 : 2.6,
  opacity: index % 4 === 0 ? 0.86 : index % 2 === 0 ? 0.72 : 0.58,
  duration: 6.4 + (index % 8) * 0.88,
  delay: -((index * 0.54) % 9.8),
  drift: index % 2 === 0 ? 18 + (index % 5) * 4 : -(16 + (index % 5) * 4),
  blur: index % 6 === 0 ? 0.3 : index % 3 === 0 ? 0.9 : 0,
}));

// ─── LetterPage ───────────────────────────────────────────────────────────────

export function LetterPage({
  letters,
  letterFontFamily,
  uiMode = 'classic',
  favoritedNames = new Set(),
  onFavorite,
  onExit,
}: LetterPageProps) {
  const [current, setCurrent] = useState<StoredLetter | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [deskChibiSrc, setDeskChibiSrc] = useState('');
  const [showSheet, setShowSheet] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [localFavoritedNames, setLocalFavoritedNames] = useState<Set<string>>(new Set<string>());
  const [readingPrefs, setReadingPrefs] = useState<LetterReadingPrefs>(() => readReadingPrefs());
  const [showReadingSettings, setShowReadingSettings] = useState(false);
  const [uiVariant, setUiVariant] = useState<LetterUiVariant>('A');
  const availableVariants = getAvailableVariants(uiMode);

  useEffect(() => {
    setDeskChibiSrc(randomChibiSrc());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storageKey = uiMode === 'preview' ? LOCAL_VARIANT_PREVIEW_KEY : LOCAL_VARIANT_CLASSIC_KEY;
    const saved = toLetterVariant(window.localStorage.getItem(storageKey));
    setUiVariant(availableVariants.includes(saved) ? saved : availableVariants[0]);
  }, [availableVariants, uiMode]);

  useEffect(() => {
    if (onFavorite || typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(LOCAL_FAVORITES_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      const next = new Set(parsed.filter((item): item is string => typeof item === 'string'));
      setLocalFavoritedNames(next);
    } catch {
      // ignore malformed local cache
    }
  }, [onFavorite]);

  useEffect(() => {
    if (onFavorite || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(Array.from(localFavoritedNames)));
  }, [localFavoritedNames, onFavorite]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!availableVariants.includes(uiVariant)) {
      return;
    }
    const storageKey = uiMode === 'preview' ? LOCAL_VARIANT_PREVIEW_KEY : LOCAL_VARIANT_CLASSIC_KEY;
    window.localStorage.setItem(storageKey, uiVariant);
  }, [availableVariants, uiMode, uiVariant]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(LOCAL_READING_PREFS_KEY, JSON.stringify(readingPrefs));
  }, [readingPrefs]);

  const effectiveFavoritedNames = onFavorite ? favoritedNames : localFavoritedNames;
  const letterDisplayDateMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const letter of letters) {
      const writtenAt =
        normalizeLetterTimestamp(letter.writtenAt) ??
        normalizeLetterTimestamp(pickLetterWrittenAt({ name: letter.name, content: letter.content }));
      const fallback = normalizeLetterTimestamp(letter.importedAt);
      map.set(letter.name, writtenAt ?? fallback);
    }
    return map;
  }, [letters]);

  function toggleFavorite(name: string) {
    if (onFavorite) {
      onFavorite(name);
      return;
    }

    setLocalFavoritedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function openLetter(letter: StoredLetter) {
    setCurrent(letter);
    setAnimKey((k) => k + 1);
    setShowSheet(false);
    setShowReadingSettings(false);
  }

  function pickRandom() {
    if (!letters.length) return;
    const pick = letters[Math.floor(Math.random() * letters.length)];
    openLetter(pick);
  }

  function handleClose() {
    setCurrent(null);
    setShowReadingSettings(false);
    setDeskChibiSrc((prev) => randomChibiSrc(prev));
  }

  return (
    <div className="relative h-full overflow-hidden">
      {uiMode === 'preview' ? (
        <PreviewLetterDeskScene
          letters={letters}
          dateMap={letterDisplayDateMap}
          uiVariant={(uiVariant === 'A' ? 'B' : uiVariant) as PreviewLetterVariant}
          variants={availableVariants}
          isReading={Boolean(current)}
          chibiSrc={deskChibiSrc}
          favoritedNames={effectiveFavoritedNames}
          showFavoritesOnly={showFavoritesOnly}
          showSheet={showSheet}
          onShowSheet={() => setShowSheet(true)}
          onHideSheet={() => setShowSheet(false)}
          onPickRandom={pickRandom}
          onOpenLetter={openLetter}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
          onVariantChange={(variant) => setUiVariant(availableVariants.includes(variant) ? variant : availableVariants[0])}
          onExit={onExit}
        />
      ) : (
        <LetterDeskScene
          letters={letters}
          dateMap={letterDisplayDateMap}
          uiVariant={uiVariant}
          variants={availableVariants}
          isReading={Boolean(current)}
          chibiSrc={deskChibiSrc}
          favoritedNames={effectiveFavoritedNames}
          showFavoritesOnly={showFavoritesOnly}
          showSheet={showSheet}
          onShowSheet={() => setShowSheet(true)}
          onHideSheet={() => setShowSheet(false)}
          onPickRandom={pickRandom}
          onOpenLetter={openLetter}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
          onVariantChange={(variant) => setUiVariant(availableVariants.includes(variant) ? variant : availableVariants[0])}
          onExit={onExit}
        />
      )}

      {current && (
        uiMode === 'preview' ? (
          <PreviewLetterFullscreenView
            letter={current}
            uiVariant={(uiVariant === 'A' ? 'B' : uiVariant) as PreviewLetterVariant}
            animKey={animKey}
            hasMultiple={letters.length > 1}
            letterFontFamily={letterFontFamily}
            rerollChibiSrc={deskChibiSrc}
            isFavorited={effectiveFavoritedNames.has(current.name)}
            readingFontSize={readingPrefs.fontSize}
            readingLineHeight={readingPrefs.lineHeight}
            readingFontMode={readingPrefs.fontMode}
            onOpenReadingSettings={() => setShowReadingSettings(true)}
            onFavorite={() => toggleFavorite(current.name)}
            onPickRandom={pickRandom}
            onClose={handleClose}
          />
        ) : (
          <LetterFullscreenView
            letter={current}
            uiVariant={uiVariant}
            animKey={animKey}
            hasMultiple={letters.length > 1}
            letterFontFamily={letterFontFamily}
            rerollChibiSrc={deskChibiSrc}
            isFavorited={effectiveFavoritedNames.has(current.name)}
            readingFontSize={readingPrefs.fontSize}
            readingLineHeight={readingPrefs.lineHeight}
            readingFontMode={readingPrefs.fontMode}
            onOpenReadingSettings={() => setShowReadingSettings(true)}
            onFavorite={() => toggleFavorite(current.name)}
            onPickRandom={pickRandom}
            onClose={handleClose}
          />
        )
      )}

      {current && showReadingSettings ? (
        <LetterReadingSettingsSheet
          fontSize={readingPrefs.fontSize}
          lineHeight={readingPrefs.lineHeight}
          fontMode={readingPrefs.fontMode}
          onFontModeChange={(value) => setReadingPrefs((prev) => ({ ...prev, fontMode: value }))}
          onFontSizeChange={(value) => setReadingPrefs((prev) => ({ ...prev, fontSize: clampReadingFontSize(value, prev.fontSize) }))}
          onLineHeightChange={(value) =>
            setReadingPrefs((prev) => ({ ...prev, lineHeight: clampReadingLineHeight(value, prev.lineHeight) }))
          }
          onClose={() => setShowReadingSettings(false)}
        />
      ) : null}
    </div>
  );
}

function LetterReadingSettingsSheet({
  fontSize,
  lineHeight,
  fontMode,
  onFontModeChange,
  onFontSizeChange,
  onLineHeightChange,
  onClose,
}: {
  fontSize: number;
  lineHeight: number;
  fontMode: LetterReadingFontMode;
  onFontModeChange: (value: LetterReadingFontMode) => void;
  onFontSizeChange: (value: number) => void;
  onLineHeightChange: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[26]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-[22px] border-t border-[#ceb596]/70 bg-[#fdf7ec] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d7c3aa]" />
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[12px] tracking-[0.12em] text-[#9b7a53]">閱讀排版</p>
          <button type="button" onClick={onClose} className="text-[18px] leading-none text-[#9b7a53]" aria-label="關閉排版設定">
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="mb-1.5 text-[12px] text-[#6d4f2f]">字體來源</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFontModeChange('default')}
              className="rounded-full border px-3 py-1 text-[12px] transition active:scale-95"
              style={{
                color: fontMode === 'default' ? '#5a3b1d' : '#8a6b47',
                background: fontMode === 'default' ? 'rgba(173,128,82,0.18)' : 'rgba(255,255,255,0.64)',
                borderColor: fontMode === 'default' ? 'rgba(173,128,82,0.45)' : 'rgba(173,128,82,0.22)',
              }}
            >
              預設
            </button>
            <button
              type="button"
              onClick={() => onFontModeChange('letter')}
              className="rounded-full border px-3 py-1 text-[12px] transition active:scale-95"
              style={{
                color: fontMode === 'letter' ? '#5a3b1d' : '#8a6b47',
                background: fontMode === 'letter' ? 'rgba(173,128,82,0.18)' : 'rgba(255,255,255,0.64)',
                borderColor: fontMode === 'letter' ? 'rgba(173,128,82,0.45)' : 'rgba(173,128,82,0.22)',
              }}
            >
              跟隨情書
            </button>
          </div>
        </div>

        <label className="mb-4 block">
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-[#6d4f2f]">
            <span>字體大小</span>
            <span>{fontSize.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={13}
            max={21}
            step={0.1}
            value={fontSize}
            onChange={(event) => onFontSizeChange(Number(event.target.value))}
            className="w-full accent-[#ad8052]"
          />
        </label>

        <label className="mb-1 block">
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-[#6d4f2f]">
            <span>行距</span>
            <span>{lineHeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={1.55}
            max={2.75}
            step={0.01}
            value={lineHeight}
            onChange={(event) => onLineHeightChange(Number(event.target.value))}
            className="w-full accent-[#ad8052]"
          />
        </label>
      </div>
    </div>
  );
}

// ─── DriedFlowers SVG ────────────────────────────────────────────────────────

function DriedFlowers() {
  return (
    <svg
      width="58"
      height="136"
      viewBox="0 0 58 136"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Stem 1 — tallest, leans left */}
      <path d="M40 134 Q37 98 28 54" stroke="#8B6B3C" strokeWidth="1.4" strokeLinecap="round" />
      {/* Flower head 1 — rose */}
      <ellipse cx="27" cy="52" rx="7.5" ry="9.5" fill="#C4697A" opacity="0.65" />
      <ellipse cx="27" cy="49" rx="4.5" ry="3.5" fill="#D47A8A" opacity="0.35" />
      {/* Stem 2 — medium, leans right */}
      <path d="M44 134 Q46 99 48 65" stroke="#9B7851" strokeWidth="1.3" strokeLinecap="round" />
      {/* Flower head 2 — dry wheat */}
      <ellipse cx="48" cy="63" rx="6" ry="8" fill="#D4A574" opacity="0.6" />
      {/* Stem 3 — shortest, center */}
      <path d="M42 134 Q41 112 38 90" stroke="#8B6B3C" strokeWidth="1.1" strokeLinecap="round" />
      {/* Leaf */}
      <path d="M39 103 Q32 97 35 88" stroke="#7A9B5C" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      {/* Bud */}
      <ellipse cx="38" cy="88" rx="4" ry="5.5" fill="#C4697A" opacity="0.5" />
      {/* Stem 4 — thin, decorative */}
      <path d="M46 134 Q49 114 52 84" stroke="#9B7851" strokeWidth="0.9" strokeLinecap="round" />
      <ellipse cx="52" cy="82" rx="3" ry="4" fill="#D4A574" opacity="0.38" />
    </svg>
  );
}

// ─── LetterPile ───────────────────────────────────────────────────────────────

function LetterPile({
  hasLetters,
  onClick,
  variant,
  scale = 1,
}: {
  hasLetters: boolean;
  onClick: () => void;
  variant: LetterUiVariant;
  scale?: number;
}) {
  const envelopes =
    variant === 'A'
      ? [
          { rotate: -4, y: 5, z: 0, bg: '#E3CFA0', inner: '#DBCA94' },
          { rotate: 2, y: 2, z: 1, bg: '#EDD9AE', inner: '#E6D1A5' },
          { rotate: -1, y: 0, z: 2, bg: '#F5E6C8', inner: '#EEDDB8' },
        ]
      : variant === 'B'
        ? [
            { rotate: -4, y: 5, z: 0, bg: '#E8DBFF', inner: '#D8C4F5' },
            { rotate: 2, y: 2, z: 1, bg: '#DDE9FF', inner: '#C9D9F8' },
            { rotate: -1, y: 0, z: 2, bg: '#F5EDFF', inner: '#E6D7FA' },
          ]
        : [
            { rotate: -4, y: 5, z: 0, bg: '#C8D8E8', inner: '#B8CCE0' },
            { rotate: 2, y: 2, z: 1, bg: '#D6E3EF', inner: '#C7D8E8' },
            { rotate: -1, y: 0, z: 2, bg: '#E4EDF5', inner: '#D8E5F1' },
          ];

  const width = Math.round(176 * scale);
  const height = Math.round(132 * scale);
  const envelopeWidth = Math.round(160 * scale);
  const envelopeHeight = Math.round(112 * scale);
  const ribbonHeight = Math.max(8, Math.round(12 * scale));
  const bowSize = Math.max(26, Math.round(34 * scale));
  const sealSymbol = variant === 'C' ? '✦' : '❤';
  const ribbonColor = variant === 'A' ? '#C4697A' : variant === 'B' ? '#9D7AE2' : '#6F98C0';
  const bowColor = variant === 'A' ? '#D4818E' : variant === 'B' ? '#C5A8F5' : '#97BEDD';
  const bowCenterColor = variant === 'A' ? '#C4697A' : variant === 'B' ? '#8362CB' : '#6F98C0';

  return (
    <button
      type="button"
      onClick={hasLetters ? onClick : undefined}
      disabled={!hasLetters}
      aria-label="隨機抽一封信"
      style={{
        position: 'relative',
        width,
        height,
        cursor: hasLetters ? 'pointer' : 'default',
        background: 'none',
        border: 'none',
        padding: 0,
        transition: 'transform 0.15s',
      }}
      onTouchStart={() => {}}
      className="active:scale-95"
    >
      {envelopes.map((env, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: envelopeWidth,
            height: envelopeHeight,
            marginTop: -envelopeHeight / 2,
            marginLeft: -envelopeWidth / 2,
            borderRadius: 6,
            background: env.bg,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.25)',
            transform: `rotate(${env.rotate}deg) translateY(${env.y}px)`,
            zIndex: env.z,
            overflow: 'hidden',
          }}
        >
          {/* Top V flap */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '52%',
              background: env.inner,
              clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            }}
          />
          {/* Bottom V fold */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '55%',
              background: env.inner,
              clipPath: 'polygon(0 100%, 50% 0, 100% 100%)',
            }}
          />
          {/* Left fold */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '50%',
              background: env.inner,
              clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
              opacity: 0.5,
            }}
          />
          {/* Right fold */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: '50%',
              background: env.inner,
              clipPath: 'polygon(0 50%, 100% 0, 100% 100%)',
              opacity: 0.45,
            }}
          />
        </div>
      ))}

      {/* Ribbon band */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: ribbonHeight,
          marginTop: -ribbonHeight / 2,
          background: ribbonColor,
          zIndex: 10,
          boxShadow: '0 1px 5px rgba(0,0,0,0.35)',
        }}
      />
      {/* Bow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 11,
        }}
      >
        <svg width={bowSize} height={Math.round(bowSize * 0.7)} viewBox="0 0 34 24" fill="none" aria-hidden="true">
          <ellipse cx="10" cy="12" rx="8.5" ry="5.5" fill={bowColor} opacity="0.9" />
          <ellipse cx="24" cy="12" rx="8.5" ry="5.5" fill={bowColor} opacity="0.9" />
          <circle cx="17" cy="12" r="4.2" fill={bowCenterColor} />
        </svg>
      </div>

      <div
        className="pointer-events-none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 12,
          fontSize: Math.round(12 * scale),
          color: 'rgba(255,255,255,0.86)',
          textShadow: '0 1px 2px rgba(0,0,0,0.35)',
          lineHeight: 1,
        }}
      >
        {sealSymbol}
      </div>

      {/* Empty state dimmer */}
      {!hasLetters && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 6,
            background: 'rgba(30,12,6,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <span style={{ fontSize: 38, opacity: 0.3 }}>✉</span>
        </div>
      )}
    </button>
  );
}

// ─── LetterDeskScene ──────────────────────────────────────────────────────────

function LetterDeskScene({
  letters,
  dateMap,
  uiVariant,
  variants,
  isReading,
  chibiSrc,
  favoritedNames,
  showFavoritesOnly,
  showSheet,
  onShowSheet,
  onHideSheet,
  onPickRandom,
  onOpenLetter,
  onToggleFavoritesOnly,
  onVariantChange,
  onExit,
}: {
  letters: StoredLetter[];
  dateMap: Map<string, number | null>;
  uiVariant: LetterUiVariant;
  variants: readonly LetterUiVariant[];
  isReading: boolean;
  chibiSrc: string;
  favoritedNames: Set<string>;
  showFavoritesOnly: boolean;
  showSheet: boolean;
  onShowSheet: () => void;
  onHideSheet: () => void;
  onPickRandom: () => void;
  onOpenLetter: (l: StoredLetter) => void;
  onToggleFavoritesOnly: () => void;
  onVariantChange: (variant: LetterUiVariant) => void;
  onExit?: () => void;
}) {
  const hasLetters = letters.length > 0;
  const isA = uiVariant === 'A';
  const isB = uiVariant === 'B';
  const isC = uiVariant === 'C';

  const sceneTheme = isA
    ? {
        base: '#2C1810',
        baseSize: 'auto',
        baseAnimation: 'none',
        glow: 'radial-gradient(ellipse 78% 52% at 16% 0%, rgba(255,216,158,0.20) 0%, transparent 68%)',
        desk: 'linear-gradient(166deg, #6B4226 0%, #5C3A24 16%, #4E3020 36%, #5A3822 54%, #4A2E1C 70%, #553620 86%, #4E3020 100%)',
        titleText: '#F6E0BD',
        titleMuted: '#D6BC95',
        switchBg: 'rgba(255,248,236,0.46)',
        switchBorder: '1px solid rgba(180,140,90,0.28)',
        switchActive: 'rgba(236,208,168,0.9)',
        switchText: '#4A3520',
        switchMuted: '#8B7355',
        deskGrain:
          'repeating-linear-gradient(2.5deg, transparent, transparent 36px, rgba(0,0,0,0.09) 36px, rgba(0,0,0,0.09) 38px)',
        backIcon: '#8B7355',
        flowerOpacity: 0.8,
      }
    : isB
      ? {
          base: 'linear-gradient(132deg, #2f245f 0%, #2e5f87 34%, #704182 66%, #2d355f 100%)',
          baseSize: '320% 320%',
          baseAnimation: 'letter-classic-b-bg-shift 18s ease infinite',
          glow: 'none',
          desk: '',
          titleText: 'rgba(247,240,255,0.96)',
          titleMuted: 'rgba(212,198,240,0.8)',
          switchBg: 'rgba(16,13,44,0.58)',
          switchBorder: '1px solid rgba(255,255,255,0.16)',
          switchActive: 'rgba(160,138,239,0.34)',
          switchText: '#F8F3FF',
          switchMuted: 'rgba(221,210,245,0.74)',
          deskGrain: 'none',
          backIcon: 'rgba(236,230,255,0.82)',
          flowerOpacity: 0,
        }
      : {
          base: 'radial-gradient(circle at 20% 15%, #3a4a72 0%, #18233f 46%, #0d142a 100%)',
          baseSize: '100% 100%',
          baseAnimation: 'none',
          glow: 'none',
          desk: '',
          titleText: 'rgba(240,235,255,0.95)',
          titleMuted: 'rgba(180,160,220,0.62)',
          switchBg: 'rgba(14,11,30,0.6)',
          switchBorder: '1px solid rgba(255,255,255,0.16)',
          switchActive: 'rgba(120,106,210,0.45)',
          switchText: '#F5EEFF',
          switchMuted: 'rgba(210,198,242,0.74)',
          deskGrain: 'none',
          backIcon: 'rgba(255,255,255,0.72)',
          flowerOpacity: 0,
        };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: sceneTheme.base,
        backgroundSize: sceneTheme.baseSize,
        animation: sceneTheme.baseAnimation,
      }}
    >
      {sceneTheme.glow !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: sceneTheme.glow }}
        />
      )}

      {isA && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 2 }}>
          {CLASSIC_A_SNOW_FLAKES.map((flake, index) => (
            <span
              key={`classic-a-snow-${index}`}
              className="absolute rounded-full"
              style={{
                ['--snow-drift' as any]: `${flake.drift}px`,
                width: flake.size,
                height: flake.size,
                top: flake.top,
                left: flake.left,
                background: 'rgba(248,252,255,0.96)',
                boxShadow: '0 0 10px rgba(255,255,255,0.88)',
                opacity: flake.opacity,
                filter: `blur(${flake.blur}px)`,
                animation: `letter-classic-a-snow ${flake.duration}s linear ${flake.delay}s infinite`,
              }}
            />
          ))}
          {CLASSIC_A_BIG_SNOW_FLAKES.map((flake, index) => (
            <span
              key={`classic-a-snow-big-${index}`}
              className="absolute rounded-full"
              style={{
                ['--snow-drift-large' as any]: `${flake.drift}px`,
                width: flake.size,
                height: flake.size,
                top: flake.top,
                left: flake.left,
                background: 'rgba(250,252,255,0.92)',
                boxShadow: '0 0 14px rgba(255,255,255,0.86)',
                opacity: flake.opacity,
                filter: `blur(${flake.blur}px)`,
                animation: `letter-classic-a-snow-large ${flake.duration}s linear ${flake.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {isC && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {CLASSIC_C_STAR_DOTS.map((star, index) => (
            <span
              key={`classic-c-star-${index}`}
              className="absolute rounded-full"
              style={{
                width: star.size,
                height: star.size,
                top: star.top,
                left: star.left,
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 0 7px rgba(255,255,255,0.75)',
                opacity: star.opacity,
                animation: `letter-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite alternate`,
              }}
            />
          ))}
          {CLASSIC_C_SNOW_FLAKES.map((flake, index) => (
            <span
              key={`classic-c-snow-${index}`}
              className="absolute rounded-full"
              style={{
                width: flake.size,
                height: flake.size,
                top: flake.top,
                left: flake.left,
                background: 'rgba(255,255,255,0.94)',
                boxShadow: '0 0 12px rgba(255,255,255,0.9)',
                opacity: flake.opacity,
                animation: `letter-classic-c-snow ${flake.duration}s linear ${flake.delay}s infinite`,
                animationDirection: flake.reverse ? 'reverse' : 'normal',
              }}
            />
          ))}
          {CLASSIC_C_UP_SNOW_DOTS.map((dot, index) => (
            <span
              key={`classic-c-up-snow-${index}`}
              className="absolute rounded-full"
              style={{
                ['--snow-up-drift' as any]: `${dot.drift}px`,
                width: dot.size,
                height: dot.size,
                top: dot.top,
                left: dot.left,
                background: 'rgba(250,251,255,0.9)',
                boxShadow: '0 0 14px rgba(255,255,255,0.72)',
                opacity: dot.opacity,
                filter: `blur(${dot.blur}px)`,
                animation: `letter-classic-c-snow-up ${dot.duration}s linear ${dot.delay}s infinite`,
              }}
            />
          ))}
          <div className="absolute right-4 top-6 opacity-45">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <path d="M38 8c8 9 8 24 0 33c4-3 7-8 8-14c1-7-1-13-5-19l-3 0Z" fill="#E8C870" />
              <circle cx="13" cy="10" r="1.4" fill="rgba(232,224,255,0.78)" />
              <circle cx="49" cy="18" r="1" fill="rgba(232,200,112,0.75)" />
            </svg>
          </div>
        </div>
      )}

      {onExit && (
        <button
          type="button"
          onClick={onExit}
          aria-label="返回"
          className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center transition active:opacity-50"
          style={{
            color: sceneTheme.backIcon,
            background: 'transparent',
            border: 'none',
            padding: 0,
            appearance: 'none',
            WebkitAppearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            boxShadow: 'none',
            textShadow: uiVariant !== 'A' ? '0 1px 4px rgba(0,0,0,0.35)' : '0 1px 3px rgba(255,255,255,0.42)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1, transform: 'translateX(-1px)' }}>
            ‹
          </span>
        </button>
      )}

      {!showSheet && !isReading && (
        <div className="absolute right-4 top-4 z-20">
          <div
            className="flex items-center gap-1 rounded-full px-1.5 py-1"
            style={{
              border: sceneTheme.switchBorder,
              background: sceneTheme.switchBg,
              backdropFilter: 'blur(6px)',
            }}
          >
            {variants.map((variant) => {
              const active = uiVariant === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  onClick={() => onVariantChange(variant)}
                  aria-label={`切換到版型 ${variant}`}
                  className="rounded-full px-2.5 py-1 text-[11px] leading-none transition active:scale-95"
                  style={{
                    color: active ? sceneTheme.switchText : sceneTheme.switchMuted,
                    background: active ? sceneTheme.switchActive : 'transparent',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {variant}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-center"
        style={{ top: '11.8%' }}
      >
        <p style={{ color: sceneTheme.titleText, fontSize: 34, letterSpacing: '0.02em', lineHeight: 1.05 }}>
          我愛你
        </p>
        <p style={{ color: sceneTheme.titleText, lineHeight: 1, marginTop: 4 }}>
          <span style={{ fontSize: 94, fontWeight: 800, letterSpacing: -3 }}>{letters.length}</span>
          <span style={{ fontSize: 30, marginLeft: 8 }}>次</span>
        </p>
      </div>

      {isB && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 3 }}>
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 16% 14%, rgba(255,255,255,0.22) 0%, transparent 34%), radial-gradient(circle at 84% 26%, rgba(173,236,255,0.2) 0%, transparent 36%), radial-gradient(circle at 48% 78%, rgba(242,157,255,0.16) 0%, transparent 35%)',
            }}
          />
          {CLASSIC_B_GLOW_DOTS.map((dot, index) => (
            <span
              key={`classic-b-glow-${index}`}
              className="absolute rounded-full"
              style={{
                width: dot.size,
                height: dot.size,
                top: dot.top,
                left: dot.left,
                background:
                  'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.94), rgba(181,235,255,0.45) 34%, rgba(158,120,255,0.03) 72%)',
                opacity: dot.opacity,
                filter: `blur(${dot.blur}px)`,
                mixBlendMode: 'screen',
                animation: `letter-classic-b-glow ${dot.duration}s ease-in-out ${dot.delay}s infinite`,
              }}
            />
          ))}
          {CLASSIC_B_SPARKS.map((spark, index) => (
            <span
              key={`classic-b-spark-${index}`}
              className="absolute rounded-full"
              style={{
                width: spark.size,
                height: spark.size,
                top: spark.top,
                left: spark.left,
                background: 'rgba(232,255,248,0.95)',
                boxShadow: '0 0 8px rgba(181,255,244,0.9)',
                opacity: spark.opacity,
                animation: `letter-classic-b-sparkle ${spark.duration}s ease-in-out ${spark.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {isA && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: '72%',
            background: sceneTheme.desk,
          }}
        >
          <div
            className="pointer-events-none absolute left-0 right-0 top-0"
            style={{
              height: 20,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: sceneTheme.deskGrain }}
          />
          <div className="pointer-events-none absolute right-4 top-[5%]" style={{ opacity: sceneTheme.flowerOpacity }}>
            <DriedFlowers />
          </div>
        </div>
      )}

      <div
        className="absolute z-10"
        style={{
          top: '35%',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <LetterPile hasLetters={hasLetters} onClick={onPickRandom} variant={uiVariant} scale={1.5} />
      </div>

      {/* Floating chibi + browse trigger */}
      {chibiSrc && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] flex items-end justify-end pb-4 pr-5">
          <button
            type="button"
            onClick={hasLetters ? onShowSheet : undefined}
            disabled={!hasLetters}
            className="pointer-events-auto transition active:scale-90"
            style={{ cursor: hasLetters ? 'pointer' : 'default' }}
          >
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi w-36 select-none drop-shadow-md"
            />
          </button>
        </div>
      )}

      {/* Browse-all bottom sheet */}
      {showSheet && (
        <LetterBrowseSheet
          letters={letters}
          dateMap={dateMap}
          uiVariant={uiVariant}
          onClose={onHideSheet}
          onOpen={onOpenLetter}
          favoritedNames={favoritedNames}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={onToggleFavoritesOnly}
        />
      )}
    </div>
  );
}

// ─── Preview B/C Scene ────────────────────────────────────────────────────────

function PreviewNightStars() {
  const stars = Array.from({ length: 40 }, (_, index) => ({
    top: `${4 + ((index * 9) % 60)}%`,
    left: `${2 + ((index * 13) % 96)}%`,
    size: index % 7 === 0 ? 2.9 : index % 3 === 0 ? 2.2 : 1.5,
    delay: (index * 0.28) % 3.2,
    duration: 1.9 + (index % 6) * 0.52,
    opacity: index % 5 === 0 ? 0.98 : index % 2 === 0 ? 0.84 : 0.7,
  }));

  const shootingStars = [
    { top: '9%', left: '5%', width: 92, delay: 0.1, duration: 4.2 },
    { top: '15%', left: '45%', width: 80, delay: 1.2, duration: 4.4 },
    { top: '27%', left: '18%', width: 70, delay: 1.9, duration: 4.1 },
    { top: '11%', left: '68%', width: 76, delay: 2.6, duration: 4.3 },
    { top: '22%', left: '73%', width: 66, delay: 3.1, duration: 4.5 },
    { top: '31%', left: '48%', width: 64, delay: 3.8, duration: 4.2 },
    { top: '18%', left: '24%', width: 72, delay: 4.5, duration: 4.6 },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((star, index) => (
        <span
          key={`preview-star-${index}`}
          className="absolute rounded-full"
          style={{
            width: star.size,
            height: star.size,
            top: star.top,
            left: star.left,
            background: '#fff',
            boxShadow: '0 0 12px rgba(255,255,255,0.98), 0 0 20px rgba(205,194,255,0.4)',
            opacity: star.opacity,
            animation: `letter-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite alternate`,
          }}
        />
      ))}
      {shootingStars.map((shoot, index) => (
        <span
          key={`preview-shoot-${index}`}
          className="absolute rounded-full"
          style={{
            top: shoot.top,
            left: shoot.left,
            width: shoot.width,
            height: 1.8,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.98), rgba(223,214,255,0.56) 62%, transparent)',
            boxShadow: '0 0 12px rgba(255,255,255,0.76)',
            transform: 'rotate(-20deg)',
            opacity: 0,
            animation: `letter-preview-shoot ${shoot.duration}s ease-in-out ${shoot.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function PreviewMoonDeco({ faded = false }: { faded?: boolean }) {
  return (
    <div className="pointer-events-none absolute right-6 top-[18px]" style={{ opacity: faded ? 0.15 : 1 }}>
      <svg width="58" height="68" viewBox="0 0 58 68" fill="none" aria-hidden="true">
        <path d="M38 8Q52 20 50 40Q48 58 34 64Q46 58 50 44Q54 28 42 12Q40 10 38 8Z" fill="#E8C870" opacity="0.18" />
        <circle cx="28" cy="36" r="18" fill="none" stroke="#E8C870" strokeWidth="0.5" opacity="0.1" />
        <circle cx="14" cy="12" r="1.5" fill="#E8E0FF" opacity="0.4" />
        <circle cx="50" cy="20" r="1" fill="#E8C870" opacity="0.5" />
        <circle cx="8" cy="30" r="1" fill="#E8E0FF" opacity="0.35" />
      </svg>
    </div>
  );
}

function PreviewConstellationDeco() {
  return (
    <div className="pointer-events-none absolute bottom-[220px] left-[14px] opacity-[0.18]">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="10" cy="54" r="2" fill="#E8E0FF" />
        <circle cx="32" cy="32" r="2" fill="#E8E0FF" />
        <circle cx="54" cy="44" r="2" fill="#E8E0FF" />
        <circle cx="22" cy="14" r="1.5" fill="#E8E0FF" />
        <circle cx="50" cy="10" r="1.5" fill="#E8C870" />
        <line x1="10" y1="54" x2="32" y2="32" stroke="#E8E0FF" strokeWidth="0.6" />
        <line x1="32" y1="32" x2="54" y2="44" stroke="#E8E0FF" strokeWidth="0.6" />
        <line x1="32" y1="32" x2="22" y2="14" stroke="#E8E0FF" strokeWidth="0.6" />
        <line x1="22" y1="14" x2="50" y2="10" stroke="#E8C870" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function PreviewPaperPlanesDeco({ faded = false }: { faded?: boolean }) {
  const planes = [
    {
      top: '34%',
      left: '-6%',
      width: 96,
      animation: 'letter-preview-plane-arc-a 5.8s linear 0s infinite',
    },
    {
      top: '28%',
      left: '102%',
      width: 72,
      animation: 'letter-preview-plane-arc-b-left 7.2s linear 2.3s infinite',
    },
    {
      top: '64%',
      left: '-8%',
      width: 66,
      animation: 'letter-preview-plane-arc-c 6.6s linear 4.4s infinite',
    },
  ] as const;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: faded ? 0.24 : 0.56 }}>
      {planes.map((plane, index) => (
        <span
          key={`preview-paper-plane-${index}`}
          className="absolute"
          style={{
            top: plane.top,
            left: plane.left,
            animation: plane.animation,
            filter: 'drop-shadow(0 2px 4px rgba(26,44,82,0.25))',
          }}
        >
          <svg
            width={plane.width}
            height={Math.round(plane.width * 0.62)}
            viewBox="-14 -10 34 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M18 0L-12 -9L-6 0L-12 9L18 0Z"
              fill="rgba(252,254,255,0.94)"
              stroke="rgba(117,138,170,0.48)"
              strokeWidth="0.9"
            />
            <path d="M-6 0H8" stroke="rgba(122,144,182,0.62)" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function PreviewBotanicalDeco({ faded = false }: { faded?: boolean }) {
  return (
    <div className="pointer-events-none absolute right-[18px] top-3" style={{ opacity: faded ? 0.3 : 0.55 }}>
      <svg width="72" height="90" viewBox="0 0 72 90" fill="none" aria-hidden="true">
        <path d="M54 88Q50 60 38 28" stroke="#9B8B5C" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M38 28Q20 22 24 8" stroke="#7A9B5C" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <ellipse cx="24" cy="10" rx="8" ry="12" fill="#9EB870" opacity="0.35" transform="rotate(-20 24 10)" />
        <path d="M44 50Q62 42 60 28" stroke="#7A9B5C" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        <ellipse cx="61" cy="29" rx="7" ry="10" fill="#9EB870" opacity="0.3" transform="rotate(15 61 29)" />
        <ellipse cx="37" cy="26" rx="9" ry="11" fill="#D4829A" opacity="0.55" />
        <ellipse cx="37" cy="22" rx="5.5" ry="4" fill="#E498B0" opacity="0.45" />
        <ellipse cx="37" cy="25" rx="3" ry="2.5" fill="#C4607A" opacity="0.4" />
        <ellipse cx="58" cy="27" rx="5" ry="6.5" fill="#C4828A" opacity="0.4" />
        <circle cx="30" cy="44" r="3" fill="#D4A0B0" opacity="0.3" />
        <circle cx="48" cy="38" r="2.5" fill="#C4B090" opacity="0.28" />
      </svg>
    </div>
  );
}

function PreviewEnvelopeStack({
  variant,
  hasLetters,
  onClick,
}: {
  variant: PreviewLetterVariant;
  hasLetters: boolean;
  onClick: () => void;
}) {
  const isB = variant === 'B';
  const envelopes = isB
    ? [
        { bg: '#E8D5A8', flap: '#D0B86E', transform: 'rotate(-7deg) translate(-4px, 8px)', z: 1, shadow: '0 8px 28px rgba(90,50,20,0.28)' },
        { bg: '#EDE0B8', flap: '#D9C078', transform: 'rotate(3deg) translate(2px, 3px)', z: 2, shadow: '0 8px 28px rgba(90,50,20,0.22)' },
        { bg: '#F7E8C4', flap: '#E8D090', transform: 'rotate(-1.5deg)', z: 3, shadow: '0 8px 28px rgba(90,50,20,0.18)' },
      ]
    : [
        { bg: '#2A2448', flap: '#3C3870', transform: 'rotate(-7deg) translate(-4px, 8px)', z: 1, shadow: '0 8px 28px rgba(0,0,0,0.55),0 0 20px rgba(100,80,200,0.12)' },
        { bg: '#332D5C', flap: '#4A4488', transform: 'rotate(3deg) translate(2px, 3px)', z: 2, shadow: '0 8px 28px rgba(0,0,0,0.5),0 0 20px rgba(100,80,200,0.1)' },
        { bg: '#3D3670', flap: '#5A52A0', transform: 'rotate(-1.5deg)', z: 3, shadow: '0 8px 32px rgba(0,0,0,0.55),0 0 30px rgba(120,100,220,0.2),inset 0 1px 0 rgba(255,255,255,0.08)' },
      ];

  return (
    <button
      type="button"
      onClick={hasLetters ? onClick : undefined}
      disabled={!hasLetters}
      aria-label="隨機抽一封信"
      className="active:scale-95"
      style={{
        position: 'relative',
        width: 200,
        height: 150,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: hasLetters ? 'pointer' : 'default',
        transition: 'transform 0.18s',
      }}
    >
      {envelopes.map((env, index) => (
        <div
          key={`${variant}-env-${index}`}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 180,
            height: 124,
            marginTop: -62,
            marginLeft: -90,
            borderRadius: 10,
            overflow: 'hidden',
            background: env.bg,
            transform: env.transform,
            zIndex: env.z,
            boxShadow: env.shadow,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '55%',
              background: env.flap,
              clipPath: 'polygon(0 0,100% 0,50% 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '58%',
              background: env.flap,
              clipPath: 'polygon(0 100%,50% 0,100% 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '50%',
              background: env.flap,
              opacity: 0.45,
              clipPath: 'polygon(0 0,100% 50%,0 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: '50%',
              background: env.flap,
              opacity: 0.4,
              clipPath: 'polygon(0 50%,100% 0,100% 100%)',
            }}
          />
        </div>
      ))}

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 42,
          height: 42,
          transform: 'translate(-50%,-50%)',
          zIndex: 10,
          borderRadius: '50%',
          background:
            variant === 'B'
              ? 'radial-gradient(circle at 36% 32%, #D96858, #A84030 60%, #8A3028)'
              : 'radial-gradient(circle at 36% 32%, #D4C060, #C0A030 60%, #A08820)',
          boxShadow:
            variant === 'B'
              ? '0 3px 10px rgba(168,64,48,0.55), inset 0 1px 0 rgba(255,255,255,0.15)'
              : '0 3px 14px rgba(200,160,40,0.45), 0 0 20px rgba(200,160,40,0.2), inset 0 1px 0 rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
        }}
      >
        {variant === 'B' ? '♡' : '✦'}
      </div>

      {!hasLetters && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.25)',
            zIndex: 20,
          }}
        />
      )}
    </button>
  );
}

function PreviewLetterDeskScene({
  letters,
  dateMap,
  uiVariant,
  variants,
  isReading,
  chibiSrc,
  favoritedNames,
  showFavoritesOnly,
  showSheet,
  onShowSheet,
  onHideSheet,
  onPickRandom,
  onOpenLetter,
  onToggleFavoritesOnly,
  onVariantChange,
  onExit,
}: {
  letters: StoredLetter[];
  dateMap: Map<string, number | null>;
  uiVariant: PreviewLetterVariant;
  variants: readonly LetterUiVariant[];
  isReading: boolean;
  chibiSrc: string;
  favoritedNames: Set<string>;
  showFavoritesOnly: boolean;
  showSheet: boolean;
  onShowSheet: () => void;
  onHideSheet: () => void;
  onPickRandom: () => void;
  onOpenLetter: (l: StoredLetter) => void;
  onToggleFavoritesOnly: () => void;
  onVariantChange: (variant: LetterUiVariant) => void;
  onExit?: () => void;
}) {
  const hasLetters = letters.length > 0;
  const isB = uiVariant === 'B';
  const switchVariants = variants.filter((variant): variant is PreviewLetterVariant => variant !== 'A');

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: isB
          ? 'radial-gradient(ellipse 100% 80% at 30% 10%, #fff8ef 0%, #fdf0dd 50%, #f8e8cc 100%)'
          : 'radial-gradient(ellipse 80% 60% at 30% 0%, #1e1840 0%, #0d0b1e 55%, #09071a 100%)',
      }}
    >
      {!isB && <PreviewNightStars />}
      {isB ? <PreviewBotanicalDeco faded={!hasLetters} /> : <PreviewMoonDeco faded={!hasLetters} />}
      {isB && <PreviewPaperPlanesDeco faded={!hasLetters} />}

      {!isB && hasLetters && <PreviewConstellationDeco />}

      {onExit && (
        <button
          type="button"
          onClick={onExit}
          aria-label="返回"
          className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center transition active:opacity-60"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            appearance: 'none',
            WebkitAppearance: 'none',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            boxShadow: 'none',
            color: isB ? '#7D6240' : 'rgba(236,230,255,0.84)',
            textShadow: isB ? '0 1px 3px rgba(255,255,255,0.45)' : '0 1px 4px rgba(0,0,0,0.35)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 28, lineHeight: 1, transform: 'translateX(-1px)' }}>
            ‹
          </span>
        </button>
      )}

      <div className="pointer-events-none absolute left-1/2 top-[18px] z-10 -translate-x-1/2 text-center">
        <p
          className="text-[9px] uppercase"
          style={{
            letterSpacing: '0.32em',
            color: isB ? '#B8A080' : 'rgba(180,160,230,0.5)',
          }}
        >
          LETTERS
        </p>
        <p className="mt-0.5 text-base" style={{ color: isB ? '#3D2414' : 'rgba(240,235,255,0.9)' }}>
          情書
        </p>
      </div>

      {!showSheet && !isReading && (
        <div className="absolute right-4 top-[106px] z-20">
          <div
            className="flex items-center gap-1 rounded-full px-1.5 py-1"
            style={{
              border: isB ? '1px solid rgba(180,140,90,0.24)' : '1px solid rgba(255,255,255,0.16)',
              background: isB ? 'rgba(255,255,255,0.72)' : 'rgba(14,11,30,0.6)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {switchVariants.map((variant) => {
              const active = uiVariant === variant;
              const label = variant === 'B' ? 'I' : 'II';
              return (
                <button
                  key={`preview-switch-${variant}`}
                  type="button"
                  onClick={() => onVariantChange(variant)}
                  className="rounded-full px-2.5 py-1 text-[11px] leading-none transition active:scale-95"
                  style={{
                    color: isB
                      ? active
                        ? '#4A3520'
                        : '#94765D'
                      : active
                        ? '#F5EEFF'
                        : 'rgba(210,198,242,0.74)',
                    background: active
                      ? isB
                        ? 'rgba(236,208,168,0.92)'
                        : 'rgba(120,106,210,0.45)'
                      : 'transparent',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasLetters ? (
        <>
          <div className="absolute left-1/2 z-10 -translate-x-1/2" style={{ top: isB ? '22%' : '23%' }}>
            <PreviewEnvelopeStack variant={uiVariant} hasLetters={hasLetters} onClick={onPickRandom} />
          </div>
          <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-center" style={{ top: isB ? '45%' : '46%' }}>
            <p
              style={{
                fontSize: 64,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: -3,
                color: isB ? '#3D2414' : 'rgba(240,235,255,0.95)',
                textShadow: isB ? '0 2px 0 rgba(200,140,80,0.25)' : '0 0 40px rgba(180,150,255,0.35),0 2px 0 rgba(0,0,0,0.4)',
              }}
            >
              {letters.length}
            </p>
          </div>
        </>
      ) : (
        <div className="absolute left-1/2 z-10 w-full -translate-x-1/2 px-5 text-center" style={{ top: '24%' }}>
          <div className="mx-auto h-[110px] w-[160px] overflow-hidden rounded-lg border"
            style={{
              background: isB ? '#EEE2C8' : '#1E1C40',
              borderColor: isB ? 'rgba(180,140,80,0.3)' : 'rgba(120,100,200,0.2)',
              boxShadow: isB ? '0 6px 20px rgba(90,50,20,0.18)' : '0 6px 20px rgba(0,0,0,0.45), 0 0 20px rgba(100,80,200,0.12)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: 'polygon(0 0,100% 0,50% 100%)',
                height: '55%',
                background: isB ? '#DFD0A8' : '#2E2A60',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                top: '42%',
                clipPath: 'polygon(0 100%,50% 0,100% 100%)',
                background: isB ? '#D8C898' : '#282450',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                opacity: isB ? 0.22 : 0.15,
                color: isB ? '#3D2414' : '#E8E0FF',
              }}
            >
              ✉
            </div>
          </div>
          <p className="mt-9 text-[22px] font-bold" style={{ color: isB ? '#3D2414' : 'rgba(230,225,255,0.9)' }}>
            信箱還是空的
          </p>
          <p
            className="mt-2 text-[13px]"
            style={{ color: isB ? '#B8A080' : 'rgba(180,160,220,0.5)', lineHeight: 1.6 }}
          >
            還沒有收到情書。{'\n'}去設定頁匯入第一封吧。
          </p>
        </div>
      )}

      {isB && hasLetters && (
        <div className="pointer-events-none absolute bottom-7 left-5 z-[7] flex items-end gap-2">
          <div className="flex h-[46px] w-[38px] flex-col items-center justify-center gap-0.5 rounded border-2 bg-white/60" style={{ borderColor: 'rgba(180,140,80,0.4)' }}>
            <span className="text-base">🌸</span>
            <span className="text-[7px]" style={{ color: '#B8A080', letterSpacing: '0.05em' }}>LOVE</span>
          </div>
          <div className="flex h-[46px] w-[38px] flex-col items-center justify-center gap-0.5 rounded border-2 bg-white/60" style={{ borderColor: 'rgba(180,140,80,0.4)' }}>
            <span className="text-base">✉</span>
            <span className="text-[7px]" style={{ color: '#B8A080', letterSpacing: '0.05em' }}>MAIL</span>
          </div>
          <div
            className="flex h-[50px] w-[50px] flex-col items-center justify-center gap-0.5 rounded-full border-2"
            style={{ borderColor: 'rgba(168,64,48,0.3)', opacity: 0.65 }}
          >
            <span className="text-[6px] font-semibold" style={{ color: '#A84030' }}>2024</span>
            <span className="text-[6px] font-semibold" style={{ color: '#A84030' }}>TO YOU</span>
            <span className="text-[6px] font-semibold" style={{ color: '#A84030' }}>♡</span>
          </div>
        </div>
      )}

      {chibiSrc && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-end pb-4 pr-5">
          <button
            type="button"
            onClick={hasLetters ? onShowSheet : undefined}
            disabled={!hasLetters}
            className="pointer-events-auto transition active:scale-90"
            style={{ cursor: hasLetters ? 'pointer' : 'default' }}
          >
            <div className="relative mx-auto w-36">
              <div
                className="pointer-events-none absolute z-[2] rounded-[14px] px-3 py-2 text-[11px]"
                style={{
                  right: 'calc(100% + 16px)',
                  top: hasLetters ? '56%' : '54%',
                  transform: 'translateY(-50%)',
                  width: 112,
                  borderRadius: '14px 14px 2px 14px',
                  color: isB ? '#6B5040' : 'rgba(220,210,255,0.85)',
                  lineHeight: 1.45,
                  background: hasLetters
                    ? isB
                      ? 'rgba(255,255,255,0.88)'
                      : 'rgba(255,255,255,0.08)'
                    : isB
                      ? 'rgba(255,255,255,0.82)'
                      : 'rgba(255,255,255,0.06)',
                  border: isB ? 'none' : '1px solid rgba(255,255,255,0.12)',
                  boxShadow: isB ? '0 3px 12px rgba(90,50,20,0.14)' : 'none',
                  backdropFilter: isB ? 'none' : 'blur(8px)',
                  textAlign: 'center',
                }}
              >
                {hasLetters ? '每封都有你。' : '等信的感覺…'}
              </div>
              <img
                src={chibiSrc}
                alt=""
                draggable={false}
                className="calendar-chibi mx-auto w-full select-none drop-shadow-md"
              />
            </div>
          </button>
        </div>
      )}

      {showSheet && (
        <PreviewLetterBrowseSheet
          letters={letters}
          dateMap={dateMap}
          uiVariant={uiVariant}
          onClose={onHideSheet}
          onOpen={onOpenLetter}
          favoritedNames={favoritedNames}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={onToggleFavoritesOnly}
        />
      )}
    </div>
  );
}

function PreviewLetterBrowseSheet({
  letters,
  dateMap,
  uiVariant,
  onClose,
  onOpen,
  favoritedNames,
  showFavoritesOnly,
  onToggleFavoritesOnly,
}: {
  letters: StoredLetter[];
  dateMap: Map<string, number | null>;
  uiVariant: PreviewLetterVariant;
  onClose: () => void;
  onOpen: (l: StoredLetter) => void;
  favoritedNames: Set<string>;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isB = uiVariant === 'B';
  const favoritesCount = letters.filter((letter) => favoritedNames.has(letter.name)).length;
  const visibleLetters = useMemo(() => {
    const base = showFavoritesOnly
      ? letters.filter((letter) => favoritedNames.has(letter.name))
      : letters;
    if (!normalizedQuery) return base;
    return base.filter((letter) => {
      const haystack = `${stripExt(letter.name)}\n${letter.content ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [favoritedNames, letters, normalizedQuery, showFavoritesOnly]);
  const favOn = isB ? '♥' : '★';
  const favOff = isB ? '♡' : '☆';

  return (
    <div className="absolute inset-0" style={{ zIndex: 24 }}>
      <div
        className="absolute inset-0"
        style={{ background: isB ? 'rgba(30,14,6,0.45)' : 'rgba(5,3,15,0.65)' }}
        onClick={onClose}
      />

      <div
        className="absolute bottom-0 left-0 right-0 flex max-h-[72%] flex-col overflow-hidden"
        style={{
          borderRadius: '26px 26px 0 0',
          background: isB ? 'linear-gradient(170deg, #fdf6e8 0%, #faf0da 100%)' : 'rgba(14,11,30,0.93)',
          backdropFilter: isB ? 'none' : 'blur(20px)',
          border: isB ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottom: 'none',
          boxShadow: isB ? '0 -8px 32px rgba(60,30,10,0.22)' : '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex shrink-0 justify-center pb-[14px] pt-3">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: isB ? 'rgba(180,140,80,0.35)' : 'rgba(255,255,255,0.15)' }}
          />
        </div>

        <div
          className="shrink-0 px-[22px] pb-3"
          style={{ borderBottom: isB ? '1px solid rgba(180,140,80,0.18)' : '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold" style={{ color: isB ? '#3D2414' : 'rgba(230,225,255,0.9)' }}>
              {showFavoritesOnly ? `${favOn} 收藏信件` : '全部信件'}
            </span>
            <span className="text-xs" style={{ color: isB ? '#B8A080' : 'rgba(180,160,220,0.5)' }}>
              {visibleLetters.length} 封
            </span>
          </div>
        </div>

        <div
          className="flex shrink-0 gap-2 px-[22px] py-2.5"
          style={{ borderBottom: isB ? '1px solid rgba(180,140,80,0.1)' : '1px solid rgba(255,255,255,0.04)' }}
        >
          <button
            type="button"
            onClick={() => {
              if (showFavoritesOnly) {
                onToggleFavoritesOnly();
              }
            }}
            className="rounded-[20px] px-[14px] py-[5px] text-xs font-medium transition active:scale-95"
            style={{
              border: !showFavoritesOnly
                ? isB
                  ? '1px solid rgba(168,64,48,0.28)'
                  : '1px solid rgba(200,160,80,0.28)'
                : isB
                  ? '1px solid rgba(0,0,0,0.08)'
                  : '1px solid rgba(255,255,255,0.08)',
              background: !showFavoritesOnly
                ? isB
                  ? 'rgba(168,64,48,0.12)'
                  : 'rgba(200,160,80,0.12)'
                : isB
                  ? 'rgba(0,0,0,0.04)'
                  : 'rgba(255,255,255,0.04)',
              color: !showFavoritesOnly ? (isB ? '#A84030' : '#E8C870') : isB ? '#9A8070' : 'rgba(180,160,220,0.5)',
            }}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => {
              if (!showFavoritesOnly) {
                onToggleFavoritesOnly();
              }
            }}
            className="rounded-[20px] px-[14px] py-[5px] text-xs font-medium transition active:scale-95"
            style={{
              border: showFavoritesOnly
                ? isB
                  ? '1px solid rgba(168,64,48,0.28)'
                  : '1px solid rgba(200,160,80,0.28)'
                : isB
                  ? '1px solid rgba(0,0,0,0.08)'
                  : '1px solid rgba(255,255,255,0.08)',
              background: showFavoritesOnly
                ? isB
                  ? 'rgba(168,64,48,0.12)'
                  : 'rgba(200,160,80,0.12)'
                : isB
                  ? 'rgba(0,0,0,0.04)'
                  : 'rgba(255,255,255,0.04)',
              color: showFavoritesOnly ? (isB ? '#A84030' : '#E8C870') : isB ? '#9A8070' : 'rgba(180,160,220,0.5)',
            }}
          >
            {favOn} 收藏 {favoritesCount}
          </button>
        </div>

        <div
          className="shrink-0 px-[22px] pb-2"
          style={{ borderBottom: isB ? '1px solid rgba(180,140,80,0.1)' : '1px solid rgba(255,255,255,0.04)' }}
        >
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜尋標題或內容"
            aria-label="搜尋信件"
            className="w-full rounded-[16px] px-3 py-1.5 text-xs outline-none"
            style={{
              border: isB ? '1px solid rgba(168,64,48,0.2)' : '1px solid rgba(255,255,255,0.14)',
              background: isB ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.06)',
              color: isB ? '#3D2414' : 'rgba(230,225,255,0.9)',
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {visibleLetters.length === 0 && (
            <p className="px-[22px] py-6 text-sm" style={{ color: isB ? '#9A8070' : 'rgba(180,160,220,0.5)' }}>
              {normalizedQuery ? '沒有符合搜尋的信件' : '還沒有收藏的信件'}
            </p>
          )}
          {visibleLetters.map((letter, index) => {
            const favored = favoritedNames.has(letter.name);
            return (
              <button
                key={`${letter.name}-${letter.importedAt}-${index}`}
                type="button"
                onClick={() => onOpen(letter)}
                className="flex w-full items-center gap-3 px-[22px] py-[13px] text-left transition active:opacity-60"
                style={{
                  borderBottom:
                    index === visibleLetters.length - 1
                      ? 'none'
                      : isB
                        ? '1px solid rgba(180,140,80,0.1)'
                        : '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span
                  className="relative h-[26px] w-9 shrink-0 overflow-hidden rounded"
                  style={{
                    background: isB ? 'linear-gradient(140deg,#f0dab2,#e8cc98)' : 'linear-gradient(140deg,#2a2450,#3a3268)',
                    border: isB ? '1px solid rgba(180,140,80,0.25)' : '1px solid rgba(120,100,200,0.25)',
                  }}
                >
                  <span
                    className="absolute left-0 right-0 top-0 h-[55%]"
                    style={{ background: isB ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.15)', clipPath: 'polygon(0 0,100% 0,50% 100%)' }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-medium"
                    style={{ color: isB ? '#3D2414' : 'rgba(230,225,255,0.85)' }}
                  >
                    {stripExt(letter.name)}
                  </span>
                  <span className="mt-0.5 block text-[10px]" style={{ color: isB ? '#B8A080' : 'rgba(180,160,220,0.45)' }}>
                    {formatDate(dateMap.get(letter.name) ?? normalizeLetterTimestamp(letter.importedAt))}
                  </span>
                </span>
                <span
                  className="text-base"
                  style={{ color: favored ? (isB ? '#C4697A' : '#E8C060') : isB ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)' }}
                >
                  {favored ? favOn : favOff}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewLetterFullscreenView({
  letter,
  uiVariant,
  animKey,
  hasMultiple,
  letterFontFamily,
  rerollChibiSrc,
  isFavorited,
  readingFontSize,
  readingLineHeight,
  readingFontMode,
  onOpenReadingSettings,
  onFavorite,
  onPickRandom,
  onClose,
}: {
  letter: StoredLetter;
  uiVariant: PreviewLetterVariant;
  animKey: number;
  hasMultiple: boolean;
  letterFontFamily: string;
  rerollChibiSrc: string;
  isFavorited: boolean;
  readingFontSize: number;
  readingLineHeight: number;
  readingFontMode: LetterReadingFontMode;
  onOpenReadingSettings: () => void;
  onFavorite?: () => void;
  onPickRandom: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [heartBeat, setHeartBeat] = useState(false);
  const isB = uiVariant === 'B';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [animKey]);

  function handleFavorite() {
    setHeartBeat(true);
    setTimeout(() => setHeartBeat(false), 320);
    onFavorite?.();
  }

  const followLetterFont = readingFontMode === 'letter' && Boolean(letterFontFamily.trim());
  const effectiveFontFamily = followLetterFont
    ? letterFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";
  const displayName = stripExt(letter.name);
  const rerollLabel = hasMultiple ? '再抽一封' : '再看一次';
  const rerollDisplaySrc = rerollChibiSrc || LETTER_CHIBI_SOURCES[0] || getActiveBaseChibiSources()[0] || '';
  const theme = isB
    ? {
        overlay: 'radial-gradient(ellipse 80% 60% at 20% 85%, rgba(120,60,20,0.55) 0%, rgba(20,8,2,0.80) 100%)',
        actionBarBg: 'transparent',
        actionBarBorder: 'none',
        iconMuted: 'rgba(255,255,255,0.38)',
        labelMuted: 'rgba(255,255,255,0.35)',
        favOn: '#D4616E',
        favoriteOnIcon: '♥',
        favoriteOffIcon: '♡',
        stampIcon: '🌸',
        stampLabel: 'LOVE',
        stampBorder: '1.5px solid rgba(170,132,73,0.45)',
        stampBg: 'rgba(255,248,230,0.82)',
        stampTextColor: '#ad8445',
        paperShadow:
          '0 20px 60px rgba(0,0,0,0.55), 0 4px 20px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(190,150,80,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
        paperBackground: 'linear-gradient(176deg, #fffef7 0%, #f7f1df 44%, #efe4c9 100%)',
        paperLineColor: 'rgba(152,126,72,0.11)',
        paperHeaderBorder: 'rgba(166,134,78,0.2)',
        paperLabelColor: '#a3824b',
        paperTitleColor: '#5a4120',
        paperContentColor: '#4c3820',
        paperFooterStrong: 'rgba(166,134,78,0.22)',
        paperFooterSoft: 'rgba(166,134,78,0.1)',
        chibiCardBg: 'linear-gradient(145deg, #fde9d7, #f0ddd0)',
        chibiCardBorder: '1px solid rgba(255,255,255,0.16)',
        chibiCardShadow: '0 8px 24px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.18)',
        floatLabelColor: 'rgba(255,255,255,0.3)',
      }
    : {
        overlay: 'radial-gradient(ellipse 60% 50% at 50% 40%,rgba(60,50,120,0.4) 0%,rgba(8,6,20,0.92) 100%)',
        actionBarBg: 'rgba(8,6,20,0.85)',
        actionBarBorder: '1px solid rgba(255,255,255,0.04)',
        iconMuted: 'rgba(255,255,255,0.3)',
        labelMuted: 'rgba(180,160,220,0.4)',
        favOn: '#E8C060',
        favoriteOnIcon: '★',
        favoriteOffIcon: '☆',
        stampIcon: '✦',
        stampLabel: '夜',
        stampBorder: '1.5px solid rgba(124,100,184,0.45)',
        stampBg: 'rgba(243,238,255,0.85)',
        stampTextColor: '#7b64b4',
        paperShadow:
          '0 20px 80px rgba(0,0,0,0.7), 0 4px 30px rgba(0,0,0,0.5), 0 0 60px rgba(200,160,80,0.08), inset 0 0 0 1px rgba(200,160,80,0.14), inset 0 1px 0 rgba(255,255,255,0.85)',
        paperBackground: 'linear-gradient(176deg, #f8f7ff 0%, #eee9ff 44%, #e3dcf8 100%)',
        paperLineColor: 'rgba(114, 92, 168, 0.12)',
        paperHeaderBorder: 'rgba(124,100,184,0.2)',
        paperLabelColor: '#7d67b8',
        paperTitleColor: '#3b2f66',
        paperContentColor: '#342a5c',
        paperFooterStrong: 'rgba(124,100,184,0.22)',
        paperFooterSoft: 'rgba(124,100,184,0.1)',
        chibiCardBg: 'linear-gradient(145deg, rgba(120,100,200,0.3), rgba(80,60,160,0.2))',
        chibiCardBorder: '1px solid rgba(255,255,255,0.1)',
        chibiCardShadow: '0 8px 24px rgba(0,0,0,0.55), 0 0 20px rgba(120,100,220,0.2)',
        floatLabelColor: 'rgba(180,160,220,0.35)',
      };

  return (
    <div className="absolute inset-0" style={{ zIndex: 15 }}>
      <div className="absolute inset-0" style={{ background: theme.overlay }} />

      <div
        key={animKey}
        className="letter-paper-reveal absolute flex flex-col overflow-hidden rounded-[22px]"
        style={{
          top: 14,
          left: 14,
          right: 14,
          bottom: 80,
          background: theme.paperBackground,
          boxShadow: theme.paperShadow,
          zIndex: 12,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[22px]"
          style={{
            backgroundImage:
              `repeating-linear-gradient(to bottom, transparent, transparent 32px, ${theme.paperLineColor} 32px, ${theme.paperLineColor} 33px)`,
            backgroundPositionY: 82,
          }}
        />

        <button
          type="button"
          onClick={onOpenReadingSettings}
          aria-label="開啟閱讀排版設定"
          className="absolute right-5 top-[19px] z-[14] text-[17px] leading-none transition active:scale-95"
          style={{
            color: theme.paperLabelColor,
            background: 'transparent',
            border: 'none',
            padding: 0,
            letterSpacing: '0.02em',
          }}
        >
          Aa
        </button>

        <div className="shrink-0 border-b px-[22px] pb-[14px] pt-[18px]" style={{ borderColor: theme.paperHeaderBorder }}>
          <p className="text-[9px] uppercase" style={{ color: theme.paperLabelColor, letterSpacing: '0.32em' }}>
            Letter · 情書
          </p>
          <p className="mt-1 truncate text-[17px]" style={{ color: theme.paperTitleColor, fontFamily: effectiveFontFamily, lineHeight: 1.3 }}>
            {displayName}
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">
          <p
            className="letter-content-fade whitespace-pre-wrap"
            style={{
              fontSize: readingFontSize,
              lineHeight: readingLineHeight,
              color: theme.paperContentColor,
              fontFamily: effectiveFontFamily,
            }}
          >
            {letter.content}
          </p>
        </div>

        <div className="shrink-0 px-[22px] pb-[14px] pt-[10px]">
          <div className="mb-[5px] h-px" style={{ background: theme.paperFooterStrong }} />
          <div className="h-px" style={{ background: theme.paperFooterSoft }} />
        </div>
      </div>

      <button
        type="button"
        onClick={onPickRandom}
        aria-label={rerollLabel}
        className="absolute left-1/2 z-[18] flex -translate-x-1/2 flex-col items-center gap-[3px] transition active:opacity-65"
        style={{ bottom: 18 }}
      >
        {rerollDisplaySrc ? (
          <img
            src={rerollDisplaySrc}
            alt=""
            draggable={false}
            className="calendar-chibi w-20 select-none drop-shadow"
          />
        ) : (
          <span
            className="grid h-24 w-20 place-items-center rounded-2xl text-[42px]"
            style={{ background: theme.chibiCardBg, border: theme.chibiCardBorder, boxShadow: theme.chibiCardShadow }}
          >
            🧸
          </span>
        )}
        <span className="text-[9px]" style={{ color: theme.floatLabelColor, letterSpacing: '0.06em' }}>
          {rerollLabel}
        </span>
      </button>

      <div
        className="absolute bottom-0 left-0 right-0 z-[13] flex items-center justify-around px-5"
        style={{
          height: 80,
          background: theme.actionBarBg,
          backdropFilter: isB ? 'none' : 'blur(12px)',
          borderTop: theme.actionBarBorder,
        }}
      >
        <button
          type="button"
          onClick={handleFavorite}
          aria-label={isFavorited ? '取消收藏' : '收藏'}
          className="flex min-w-14 flex-col items-center gap-1"
          style={{
            transform: heartBeat ? 'scale(1.35)' : 'scale(1)',
            transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <span style={{ fontSize: 22, color: isFavorited ? theme.favOn : theme.iconMuted }}>
            {isFavorited ? theme.favoriteOnIcon : theme.favoriteOffIcon}
          </span>
          <span className="text-[10px]" style={{ color: theme.labelMuted, letterSpacing: '0.04em' }}>
            收藏
          </span>
        </button>

        <div style={{ minWidth: 80 }} />

        <button
          type="button"
          onClick={onClose}
          aria-label="收起"
          className="flex min-w-14 flex-col items-center gap-1 transition active:opacity-60"
        >
          <span style={{ fontSize: 22, color: theme.iconMuted }}>✕</span>
          <span className="text-[10px]" style={{ color: theme.labelMuted, letterSpacing: '0.04em' }}>
            收起
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── LetterBrowseSheet ────────────────────────────────────────────────────────

function LetterBrowseSheet({
  letters,
  dateMap,
  uiVariant,
  onClose,
  onOpen,
  favoritedNames,
  showFavoritesOnly,
  onToggleFavoritesOnly,
}: {
  letters: StoredLetter[];
  dateMap: Map<string, number | null>;
  uiVariant: LetterUiVariant;
  onClose: () => void;
  onOpen: (l: StoredLetter) => void;
  favoritedNames: Set<string>;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleLetters = useMemo(() => {
    const base = showFavoritesOnly
      ? letters.filter((letter) => favoritedNames.has(letter.name))
      : letters;
    if (!normalizedQuery) return base;
    return base.filter((letter) => {
      const haystack = `${stripExt(letter.name)}\n${letter.content ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [favoritedNames, letters, normalizedQuery, showFavoritesOnly]);
  const sheetTheme =
    uiVariant === 'A'
      ? {
          backdrop: 'rgba(0,0,0,0.5)',
          panelBg: '#3A1E0F',
          panelBorder: '1px solid rgba(255,255,255,0.08)',
          handle: 'rgba(255,255,255,0.16)',
          title: '#C9A87A',
          toggleBorder: '1px solid rgba(255,255,255,0.2)',
          toggleOnText: '#F7EBD2',
          toggleOffText: '#D1B992',
          toggleOnBg: 'rgba(255,255,255,0.11)',
          toggleOffBg: 'rgba(0,0,0,0.14)',
          emptyText: '#A88B62',
          rowDivider: 'rgba(255,255,255,0.05)',
          rowIcon: '#8B6B3C',
          rowTitle: '#F0DFB8',
          rowDate: '#8B7355',
          rowFavorite: '#D98A95',
        }
      : uiVariant === 'B'
        ? {
            backdrop: 'rgba(34,16,26,0.52)',
            panelBg: 'linear-gradient(170deg, #fef8fb 0%, #f8eaf1 100%)',
            panelBorder: '1px solid rgba(208,154,178,0.34)',
            handle: 'rgba(156,97,122,0.36)',
            title: '#A16C86',
            toggleBorder: '1px solid rgba(156,97,122,0.28)',
            toggleOnText: '#8A4D68',
            toggleOffText: '#A47D91',
            toggleOnBg: 'rgba(224,138,168,0.18)',
            toggleOffBg: 'rgba(255,255,255,0.64)',
            emptyText: '#B28EA1',
            rowDivider: 'rgba(162,112,137,0.18)',
            rowIcon: '#B86F90',
            rowTitle: '#5F3B4D',
            rowDate: '#A98A9B',
            rowFavorite: '#C4697A',
          }
        : {
            backdrop: 'rgba(8,18,30,0.58)',
            panelBg: 'linear-gradient(170deg, #edf5fb 0%, #dce9f5 100%)',
            panelBorder: '1px solid rgba(118,156,189,0.35)',
            handle: 'rgba(93,130,163,0.36)',
            title: '#6388AC',
            toggleBorder: '1px solid rgba(93,130,163,0.28)',
            toggleOnText: '#365E87',
            toggleOffText: '#7697B6',
            toggleOnBg: 'rgba(111,152,192,0.2)',
            toggleOffBg: 'rgba(255,255,255,0.64)',
            emptyText: '#6E8EAD',
            rowDivider: 'rgba(112,148,179,0.2)',
            rowIcon: '#5C84A8',
            rowTitle: '#2E4D6C',
            rowDate: '#6E8EAD',
            rowFavorite: '#6F98C0',
          };

  return (
    <div className="absolute inset-0" style={{ zIndex: 20 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: sheetTheme.backdrop }}
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden"
        style={{
          borderRadius: '22px 22px 0 0',
          background: sheetTheme.panelBg,
          border: sheetTheme.panelBorder,
          borderBottom: 'none',
          maxHeight: '65%',
        }}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-2 pt-3">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: sheetTheme.handle }}
          />
        </div>

        {/* Title + filter */}
        <div className="shrink-0 px-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p
              className="text-xs"
              style={{
                color: sheetTheme.title,
                letterSpacing: '0.12em',
              }}
            >
              {showFavoritesOnly ? '收藏信件' : '全部信件'}
            </p>
            <button
              type="button"
              onClick={onToggleFavoritesOnly}
              className="rounded-full px-3 py-1 text-xs transition active:scale-95"
              style={{
                border: sheetTheme.toggleBorder,
                color: showFavoritesOnly ? sheetTheme.toggleOnText : sheetTheme.toggleOffText,
                background: showFavoritesOnly ? sheetTheme.toggleOnBg : sheetTheme.toggleOffBg,
              }}
            >
              {showFavoritesOnly ? '♥ 只看收藏' : '♡ 全部'}
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜尋標題或內容"
            aria-label="搜尋信件"
            className="mt-2 w-full rounded-full px-3 py-1.5 text-xs outline-none"
            style={{
              border: sheetTheme.toggleBorder,
              color: sheetTheme.rowTitle,
              background: uiVariant === 'A' ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.66)',
            }}
          />
        </div>

        {/* Scrollable list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleLetters.length === 0 && (
            <p
              className="px-5 py-8 text-sm"
              style={{ color: sheetTheme.emptyText }}
            >
              {normalizedQuery ? '沒有符合搜尋的信件' : '還沒有收藏的信件'}
            </p>
          )}
          {visibleLetters.map((letter, i) => (
            <button
              key={`${letter.name}-${letter.importedAt}-${i}`}
              type="button"
              onClick={() => onOpen(letter)}
              className="flex w-full items-start gap-3 px-5 text-left transition active:opacity-55"
              style={{
                paddingTop: 14,
                paddingBottom: 14,
                borderTop:
                  i === 0
                    ? 'none'
                    : `1px solid ${sheetTheme.rowDivider}`,
                minHeight: 52,
              }}
            >
              <span
                style={{
                  color: sheetTheme.rowIcon,
                  fontSize: 14,
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                ✉
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm"
                  style={{ color: sheetTheme.rowTitle }}
                >
                  {stripExt(letter.name)}
                </p>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: sheetTheme.rowDate }}
                >
                  {formatDate(dateMap.get(letter.name) ?? normalizeLetterTimestamp(letter.importedAt))}
                </p>
              </div>
              {favoritedNames.has(letter.name) && (
                <span className="pt-0.5 text-sm" style={{ color: sheetTheme.rowFavorite }}>
                  ♥
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LetterFullscreenView ─────────────────────────────────────────────────────

function LetterFullscreenView({
  letter,
  uiVariant,
  animKey,
  hasMultiple,
  letterFontFamily,
  rerollChibiSrc,
  isFavorited,
  readingFontSize,
  readingLineHeight,
  readingFontMode,
  onOpenReadingSettings,
  onFavorite,
  onPickRandom,
  onClose,
}: {
  letter: StoredLetter;
  uiVariant: LetterUiVariant;
  animKey: number;
  hasMultiple: boolean;
  letterFontFamily: string;
  rerollChibiSrc: string;
  isFavorited: boolean;
  readingFontSize: number;
  readingLineHeight: number;
  readingFontMode: LetterReadingFontMode;
  onOpenReadingSettings: () => void;
  onFavorite?: () => void;
  onPickRandom: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [heartBeat, setHeartBeat] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [animKey]);

  function handleFavorite() {
    setHeartBeat(true);
    setTimeout(() => setHeartBeat(false), 320);
    onFavorite?.();
  }

  const followLetterFont = readingFontMode === 'letter' && Boolean(letterFontFamily.trim());
  const effectiveFontFamily = followLetterFont
    ? letterFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";
  const displayName = stripExt(letter.name);
  const night = isNightVariant(uiVariant);
  const rerollLabel = hasMultiple ? '再抽一封' : '再看一次';
  const rerollDisplaySrc = rerollChibiSrc || LETTER_CHIBI_SOURCES[0] || getActiveBaseChibiSources()[0] || '';
  const theme =
    uiVariant === 'A'
      ? {
          overlay: 'rgba(18,8,4,0.62)',
          bar: 'linear-gradient(to top, rgba(8,2,1,0.74), rgba(8,2,1,0.18))',
          iconMuted: 'rgba(255,255,255,0.38)',
          labelMuted: 'rgba(255,255,255,0.35)',
          closeIcon: 'rgba(255,255,255,0.42)',
          favOn: '#D4616E',
          paperShadow:
            '0 10px 48px rgba(0,0,0,0.55), 0 2px 14px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(180,140,80,0.14)',
          paperBackground: 'linear-gradient(175deg, #fffdf7 0%, #fdf8ee 40%, #faf3e2 100%)',
          paperLineColor: 'rgba(140,100,50,0.08)',
          paperBorder: 'rgba(160,120,70,0.14)',
          paperDecoStrong: 'rgba(160,120,70,0.18)',
          paperDecoSoft: 'rgba(160,120,70,0.07)',
          paperLabelColor: '#B8956A',
          paperTitleColor: '#4A3520',
          paperContentColor: '#4A3520',
        }
      : uiVariant === 'B'
        ? {
            overlay: 'rgba(36,12,24,0.56)',
            bar: 'linear-gradient(to top, rgba(54,20,34,0.86), rgba(54,20,34,0.26))',
            iconMuted: 'rgba(255,237,246,0.72)',
            labelMuted: 'rgba(248,219,232,0.68)',
            closeIcon: 'rgba(255,240,248,0.76)',
            favOn: '#E08AA8',
            paperShadow:
              '0 12px 56px rgba(0,0,0,0.56), 0 3px 18px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(196,130,160,0.16)',
            paperBackground: 'linear-gradient(176deg, #fff8fb 0%, #fbeff5 42%, #f6e4ed 100%)',
            paperLineColor: 'rgba(170, 108, 136, 0.10)',
            paperBorder: 'rgba(182, 112, 142, 0.18)',
            paperDecoStrong: 'rgba(182, 112, 142, 0.22)',
            paperDecoSoft: 'rgba(182, 112, 142, 0.09)',
            paperLabelColor: '#B67A96',
            paperTitleColor: '#64394d',
            paperContentColor: '#5a3245',
          }
        : {
            overlay: 'rgba(10,28,44,0.56)',
            bar: 'linear-gradient(to top, rgba(16,42,66,0.86), rgba(16,42,66,0.26))',
            iconMuted: 'rgba(220,238,255,0.72)',
            labelMuted: 'rgba(188,216,238,0.68)',
            closeIcon: 'rgba(226,244,255,0.76)',
            favOn: '#6F98C0',
            paperShadow:
              '0 12px 56px rgba(0,0,0,0.56), 0 3px 18px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(120,168,204,0.16)',
            paperBackground: 'linear-gradient(176deg, #f8fcff 0%, #eef5ff 42%, #e3eef9 100%)',
            paperLineColor: 'rgba(100, 140, 182, 0.10)',
            paperBorder: 'rgba(112, 156, 196, 0.18)',
            paperDecoStrong: 'rgba(112, 156, 196, 0.22)',
            paperDecoSoft: 'rgba(112, 156, 196, 0.09)',
            paperLabelColor: '#6f95ba',
            paperTitleColor: '#2f4a63',
            paperContentColor: '#2b445d',
          };

  return (
    <div className="absolute inset-0" style={{ zIndex: 15 }}>
      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{ background: theme.overlay }}
      />

      {/* Letter paper */}
      <div
        key={animKey}
        className="letter-paper-reveal absolute flex flex-col overflow-hidden rounded-2xl"
        style={{
          top: 16,
          left: 16,
          right: 16,
          bottom: 86,
          background: theme.paperBackground,
          boxShadow: theme.paperShadow,
        }}
      >
        {/* Ruled lines watermark */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            backgroundImage:
              `repeating-linear-gradient(to bottom, transparent, transparent 31px, ${theme.paperLineColor} 31px, ${theme.paperLineColor} 32px)`,
            backgroundPositionY: 72,
          }}
        />

        <button
          type="button"
          onClick={onOpenReadingSettings}
          aria-label="開啟閱讀排版設定"
          className="absolute right-5 top-[18px] z-[14] text-[17px] leading-none transition active:scale-95"
          style={{
            color: theme.paperLabelColor,
            background: 'transparent',
            border: 'none',
            padding: 0,
            letterSpacing: '0.02em',
          }}
        >
          Aa
        </button>

        {/* Paper header */}
        <div
          className="shrink-0 px-5 py-4"
          style={{ borderBottom: `1px solid ${theme.paperBorder}` }}
        >
          <p
            className="text-[10px] uppercase tracking-widest"
            style={{ color: theme.paperLabelColor }}
          >
            Letter
          </p>
          <p
            className="mt-0.5 truncate text-base"
            style={{ fontFamily: effectiveFontFamily, color: theme.paperTitleColor }}
          >
            {displayName}
          </p>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p
            className="letter-content-fade whitespace-pre-wrap"
            style={{
              fontFamily: effectiveFontFamily,
              fontSize: readingFontSize,
              lineHeight: readingLineHeight,
              color: theme.paperContentColor,
            }}
          >
            {letter.content}
          </p>
        </div>

        {/* Bottom decoration lines */}
        <div className="shrink-0 space-y-1.5 px-6 pb-4 pt-2">
          <div className="h-px" style={{ background: theme.paperDecoStrong }} />
          <div className="h-px" style={{ background: theme.paperDecoSoft }} />
        </div>

      </div>

      {/* Action bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-around"
        style={{
          height: 86,
          paddingLeft: 8,
          paddingRight: 8,
          background: theme.bar,
          backdropFilter: night ? 'blur(10px)' : 'none',
          borderTop: night ? '1px solid rgba(255,255,255,0.06)' : 'none',
          overflow: 'visible',
        }}
      >
        {/* ❤ Favorite */}
        <button
          type="button"
          onClick={handleFavorite}
          aria-label={isFavorited ? '取消收藏' : '收藏'}
          className="flex flex-col items-center gap-1"
          style={{
            minWidth: 64,
            minHeight: 48,
            transform: heartBeat ? 'scale(1.35)' : 'scale(1)',
            transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <span style={{ fontSize: 24, color: isFavorited ? theme.favOn : theme.iconMuted }}>
            {isFavorited ? '♥' : '♡'}
          </span>
          <span style={{ fontSize: 10, color: theme.labelMuted }}>收藏</span>
        </button>

        {/* ✉ Re-draw */}
        <button
          type="button"
          onClick={onPickRandom}
          aria-label={rerollLabel}
          className="flex flex-col items-center gap-1 transition active:opacity-55"
          style={{
            minWidth: 64,
            minHeight: 48,
            transform: 'translateY(-4px)',
          }}
        >
          {rerollDisplaySrc ? (
            <img
              src={rerollDisplaySrc}
              alt=""
              draggable={false}
              className="calendar-chibi w-20 select-none drop-shadow"
            />
          ) : (
            <span style={{ fontSize: 22, color: theme.iconMuted }}>✉</span>
          )}
          <span style={{ fontSize: 10, color: theme.labelMuted }}>{rerollLabel}</span>
        </button>

        {/* ↩ Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="收起"
          className="flex flex-col items-center gap-1 transition active:opacity-55"
          style={{ minWidth: 64, minHeight: 48 }}
        >
          <span style={{ fontSize: 24, color: theme.closeIcon }}>✕</span>
          <span style={{ fontSize: 10, color: theme.labelMuted }}>收起</span>
        </button>
      </div>
    </div>
  );
}
