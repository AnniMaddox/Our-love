import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';
import { getActiveBaseChibiSources, getScopedChibiSources } from '../lib/chibiPool';

import './MemoPage.css';

type MemoDoc = {
  id: string;
  title: string;
  sourceFile: string;
  sourceRelPath: string;
  contentPath: string;
  writtenAt: number | null;
  dateLabel: string;
  preview: string;
  searchText: string;
};

type MemoIndexPayload = {
  version?: number;
  generatedAt?: string;
  total?: number;
  docs?: Array<Partial<MemoDoc>>;
};

type MemoPrefs = {
  contentFontSize: number;
  contentLineHeight: number;
  listShowChibi: boolean;
  listChibiWidth: number;
  readingShowChibi: boolean;
  readingChibiWidth: number;
};

type MemoPageProps = {
  onExit: () => void;
  notesFontFamily?: string;
};

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/memo/index.json`;
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;

const PREFS_KEY = 'memorial-memo-prefs-v1';
const FAVORITES_KEY = 'memorial-memo-favorites-v1';
const HIDDEN_KEY = 'memorial-memo-hidden-v1';
const FAVORITES_URL_PARAM = 'memoFav';

const DEFAULT_PREFS: MemoPrefs = {
  contentFontSize: 17,
  contentLineHeight: 1.78,
  listShowChibi: true,
  listChibiWidth: 144,
  readingShowChibi: true,
  readingChibiWidth: 144,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizePrefs(input: unknown): MemoPrefs {
  if (!input || typeof input !== 'object') return DEFAULT_PREFS;
  const source = input as Partial<MemoPrefs>;
  return {
    contentFontSize: clampNumber(source.contentFontSize, 12, 24, DEFAULT_PREFS.contentFontSize),
    contentLineHeight: clampNumber(source.contentLineHeight, 1.45, 2.9, DEFAULT_PREFS.contentLineHeight),
    listShowChibi: source.listShowChibi !== false,
    listChibiWidth: clampInt(source.listChibiWidth, 104, 196, DEFAULT_PREFS.listChibiWidth),
    readingShowChibi: source.readingShowChibi !== false,
    readingChibiWidth: clampInt(source.readingChibiWidth, 104, 196, DEFAULT_PREFS.readingChibiWidth),
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

function savePrefs(prefs: MemoPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function normalizeContent(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function shortText(text: string, max = 68) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '（沒有內容）';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function formatDateLabelFromTimestamp(value: number | null) {
  if (!value) return '想妳的時候';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '想妳的時候';
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function normalizeDoc(input: Partial<MemoDoc>): MemoDoc | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const contentPathRaw = typeof input.contentPath === 'string' ? input.contentPath.trim() : '';
  if (!id || !title || !contentPathRaw) return null;

  const sourceFile =
    typeof input.sourceFile === 'string' && input.sourceFile.trim() ? input.sourceFile.trim() : `${id}.txt`;
  const sourceRelPath = typeof input.sourceRelPath === 'string' ? input.sourceRelPath.trim() : sourceFile;
  const writtenAt =
    typeof input.writtenAt === 'number' && Number.isFinite(input.writtenAt) && input.writtenAt > 0
      ? input.writtenAt
      : null;
  const dateLabel =
    typeof input.dateLabel === 'string' && input.dateLabel.trim()
      ? input.dateLabel.trim()
      : formatDateLabelFromTimestamp(writtenAt);
  const previewRaw = typeof input.preview === 'string' ? input.preview.trim() : '';
  const searchRaw = typeof input.searchText === 'string' ? input.searchText.trim() : '';

  const contentPath = contentPathRaw.replace(/^\.?\//, '');
  return {
    id,
    title,
    sourceFile,
    sourceRelPath,
    contentPath,
    writtenAt,
    dateLabel,
    preview: previewRaw || shortText(title, 40),
    searchText: searchRaw || `${title}\n${sourceFile}`,
  };
}

function sortDocsByDateDesc(docs: MemoDoc[]) {
  return [...docs].sort((a, b) => {
    const at = a.writtenAt ?? -1;
    const bt = b.writtenAt ?? -1;
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title, 'zh-TW');
  });
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
      // ignore
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
    // ignore URL write failures
  }
}

function loadHiddenIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));
  } catch {
    return new Set<string>();
  }
}

function saveHiddenIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ids)));
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

function buildMemoChibiPool() {
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

function pickRandomMemoChibi() {
  const pool = buildMemoChibiPool();
  if (!pool.length) return FALLBACK_CHIBI;
  return pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_CHIBI;
}

export function MemoPage({ onExit, notesFontFamily = '' }: MemoPageProps) {
  const [docs, setDocs] = useState<MemoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<MemoPrefs>(() => loadPrefs());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadHiddenIds());
  const [settingsPanels, setSettingsPanels] = useState({
    text: true,
    listChibi: false,
    readingChibi: false,
    data: false,
  });
  const [chibiSrc] = useState(() => pickRandomMemoChibi());
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`讀取失敗：${response.status}`);
        const raw = (await response.json()) as MemoIndexPayload;
        const items = Array.isArray(raw.docs) ? raw.docs : [];
        const normalized = items
          .map((item) => normalizeDoc(item))
          .filter((item): item is MemoDoc => Boolean(item));
        if (!active) return;
        setDocs(sortDocsByDateDesc(normalized));
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
    saveFavoriteIds(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    saveHiddenIds(hiddenIds);
  }, [hiddenIds]);

  const visibleDocs = useMemo(() => docs.filter((doc) => !hiddenIds.has(doc.id)), [docs, hiddenIds]);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredDocs = useMemo(() => {
    if (!normalizedQuery) return visibleDocs;
    return visibleDocs.filter((doc) => {
      const haystack = [doc.title, doc.preview, doc.searchText, doc.sourceFile, doc.dateLabel].join('\n').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [visibleDocs, normalizedQuery]);

  const pinnedDocs = useMemo(() => filteredDocs.filter((doc) => favoriteIds.has(doc.id)), [filteredDocs, favoriteIds]);
  const unpinnedDocs = useMemo(() => filteredDocs.filter((doc) => !favoriteIds.has(doc.id)), [filteredDocs, favoriteIds]);

  const readingPool = useMemo(() => (normalizedQuery ? filteredDocs : visibleDocs), [filteredDocs, normalizedQuery, visibleDocs]);

  const activeDoc = useMemo(() => {
    if (!activeId) return null;
    return visibleDocs.find((doc) => doc.id === activeId) ?? null;
  }, [activeId, visibleDocs]);

  const activeDocIndex = useMemo(() => {
    if (!activeDoc) return -1;
    return readingPool.findIndex((doc) => doc.id === activeDoc.id);
  }, [activeDoc, readingPool]);

  const prevDoc = activeDocIndex > 0 ? readingPool[activeDocIndex - 1] ?? null : null;
  const nextDoc =
    activeDocIndex >= 0 && activeDocIndex < readingPool.length - 1 ? readingPool[activeDocIndex + 1] ?? null : null;

  useEffect(() => {
    if (!activeDoc) return;
    if (contentById[activeDoc.id] !== undefined) return;

    void (async () => {
      try {
        const response = await fetch(`${BASE}data/memo/${activeDoc.contentPath}`, { cache: 'no-store' });
        if (!response.ok) return;
        const text = normalizeContent(await response.text());
        setContentById((prev) => (prev[activeDoc.id] === undefined ? { ...prev, [activeDoc.id]: text } : prev));
      } catch {
        // ignore per-file load failures
      }
    })();
  }, [activeDoc, contentById]);

  useEffect(() => {
    if (!activeId) return;
    const exists = visibleDocs.some((doc) => doc.id === activeId);
    if (!exists) setActiveId(null);
  }, [activeId, visibleDocs]);

  const activeContent = activeDoc ? contentById[activeDoc.id] ?? '' : '';
  const isReading = Boolean(activeDoc);
  const showChibi = isReading ? prefs.readingShowChibi : prefs.listShowChibi;
  const chibiWidth = isReading ? prefs.readingChibiWidth : prefs.listChibiWidth;

  function openDoc(id: string) {
    setActiveId(id);
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveDoc(delta: number) {
    if (activeDocIndex < 0) return;
    const target = readingPool[activeDocIndex + delta];
    if (!target) return;
    setActiveId(target.id);
  }

  function deleteCurrentDocLocally() {
    if (!activeDoc) return;
    const confirmed = window.confirm('這份會從目前裝置清單隱藏（可在設定裡還原），要繼續嗎？');
    if (!confirmed) return;

    const nextId = nextDoc?.id ?? prevDoc?.id ?? null;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(activeDoc.id);
      return next;
    });
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.delete(activeDoc.id);
      return next;
    });
    setActiveId(nextId);
    emitActionToast({ kind: 'success', message: '已隱藏這份備忘錄' });
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
      moveDoc(-1);
    } else {
      moveDoc(1);
    }
  }

  return (
    <div className="memo-page">
      <div className="memo-list-screen" aria-hidden={isReading}>
        <header className="memo-nav-bar">
          <button type="button" className="memo-nav-back" onClick={onExit}>
            ‹ 返回
          </button>
          <div className="memo-nav-actions">
            <button
              type="button"
              className="memo-nav-action memo-nav-more"
              onClick={() => setShowSettings(true)}
              aria-label="開啟設定"
              title="更多設定"
            >
              ⋯
            </button>
          </div>
        </header>

        <div className="memo-list-content">
          <div className="memo-big-title-wrap">
            <h1 className="memo-big-title">M&apos;s memo</h1>
          </div>

          <label className="memo-search-bar" aria-label="搜尋備忘錄">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="6.5" cy="6.5" r="5" stroke="#aeaeb2" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="#aeaeb2" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋" />
          </label>

          {loading ? <div className="memo-empty">讀取中…</div> : null}
          {!loading && error ? <div className="memo-empty">讀取失敗：{error}</div> : null}

          {!loading && !error ? (
            <>
              <div className="memo-sect-hd">釘選</div>
              <div className="memo-pinned-grid">
                {pinnedDocs.map((doc) => (
                  <button type="button" key={doc.id} className="memo-pin-card" onClick={() => openDoc(doc.id)}>
                    <div className="memo-pin-label">📌 釘選</div>
                    <div className="memo-pin-title">{doc.title}</div>
                    <div className="memo-pin-prev">{doc.preview}</div>
                  </button>
                ))}
                {!pinnedDocs.length ? <div className="memo-pin-empty">還沒有釘選，閱讀頁右上角可切換 📌</div> : null}
              </div>

              <div className="memo-sect-hd" style={{ marginTop: 10 }}>
                全部備忘錄
              </div>
              <div className="memo-notes-list">
                {unpinnedDocs.map((doc) => (
                  <button type="button" key={doc.id} className="memo-note-row" onClick={() => openDoc(doc.id)}>
                    <div className="memo-row-top">
                      <span className="memo-row-title">{doc.title}</span>
                      <span className="memo-row-date">{doc.dateLabel}</span>
                    </div>
                    <div className="memo-row-prev">{doc.preview}</div>
                  </button>
                ))}
                {!unpinnedDocs.length ? (
                  <div className="memo-empty">{filteredDocs.length ? '都在釘選區了' : '目前找不到符合條件的備忘錄'}</div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <footer className="memo-bot-bar">
          <span className="memo-bot-count">{filteredDocs.length} 則備忘錄</span>
        </footer>
      </div>

      <section className={`memo-read-screen ${isReading ? 'open' : ''}`} aria-hidden={!isReading}>
        <header className="memo-read-nav">
          <button type="button" className="memo-back-btn" onClick={() => setActiveId(null)}>
            <span className="memo-back-chev">‹</span>
            <span>返回</span>
          </button>
          <div className="memo-read-tools">
            <button
              type="button"
              className="memo-tool-pen"
              onClick={deleteCurrentDocLocally}
              title="刪除（本機隱藏）"
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={() => {
                if (!activeDoc) return;
                toggleFavorite(activeDoc.id);
              }}
              title={activeDoc && favoriteIds.has(activeDoc.id) ? '取消釘選' : '釘選'}
            >
              {activeDoc && favoriteIds.has(activeDoc.id) ? '📌' : '📍'}
            </button>
            <button type="button" onClick={() => setShowSettings(true)} title="更多設定">
              ⋯
            </button>
          </div>
        </header>

        <div
          className="memo-read-body"
          onTouchStart={handleReadTouchStart}
          onTouchEnd={handleReadTouchEnd}
          onTouchCancel={clearSwipeTrack}
        >
          <div
            className="memo-read-inner"
            style={{
              fontFamily:
                notesFontFamily || "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)",
            }}
          >
            <div className="memo-read-date">{activeDoc?.dateLabel ?? ''}</div>
            <h2 className="memo-read-title">{activeDoc?.title ?? ''}</h2>
            <pre
              className="memo-read-content"
              style={{
                fontSize: `${prefs.contentFontSize}px`,
                lineHeight: prefs.contentLineHeight,
              }}
            >
              {activeDoc ? activeContent || '讀取內容中…' : ''}
            </pre>
          </div>
        </div>

        <footer className="memo-read-bot">
          <button type="button" className={`memo-nav-note ${prevDoc ? '' : 'dis'}`} onClick={() => moveDoc(-1)} disabled={!prevDoc}>
            <span className="arr">‹</span>
            <span className="lbl">{prevDoc?.title ?? ''}</span>
          </button>

          <button
            type="button"
            className={`memo-nav-note ${nextDoc ? '' : 'dis'}`}
            style={{ justifyContent: 'flex-end' }}
            onClick={() => moveDoc(1)}
            disabled={!nextDoc}
          >
            <span className="lbl">{nextDoc?.title ?? ''}</span>
            <span className="arr">›</span>
          </button>
        </footer>
      </section>

      {showChibi && (
        <div className="memo-chibi-wrap">
          <button type="button" className="memo-chibi-btn" onClick={() => setShowSettings(true)} aria-label="開啟 M's memo 設定">
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi select-none drop-shadow-md"
              style={{ width: `${chibiWidth}px`, maxWidth: '42vw', height: 'auto' }}
            />
          </button>
        </div>
      )}

      {showSettings && (
        <div className="memo-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="memo-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="memo-settings-handle" />
            <div className="memo-settings-head">M&apos;s memo</div>

            <div className="memo-settings-body">
              <SettingsAccordion
                title="文字排版"
                subtitle="行距與內文字級"
                isOpen={settingsPanels.text}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, text: !prev.text }))}
                className="memo-settings-card"
                titleClassName="memo-settings-card-title"
                subtitleClassName="memo-settings-card-subtitle"
                bodyClassName="memo-settings-card-body"
              >
                <div>
                  <p className="memo-slider-title">行距設定</p>
                  <p className="memo-slider-value">目前：{prefs.contentLineHeight.toFixed(2)} 倍</p>
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
                    className="memo-slider"
                  />
                </div>

                <div>
                  <p className="memo-slider-title">內文字級</p>
                  <p className="memo-slider-value">目前：{prefs.contentFontSize.toFixed(1)}px</p>
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
                    className="memo-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="M"
                subtitle="首頁與清單頁顯示"
                isOpen={settingsPanels.listChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, listChibi: !prev.listChibi }))}
                className="memo-settings-card"
                titleClassName="memo-settings-card-title"
                subtitleClassName="memo-settings-card-subtitle"
                bodyClassName="memo-settings-card-body"
              >
                <div className="memo-toggle-row">
                  <p className="memo-slider-title">顯示 M</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, listShowChibi: !prev.listShowChibi }))}
                    className="memo-switch"
                    style={{ background: prefs.listShowChibi ? '#bf9b6f' : 'rgba(120,120,120,0.35)' }}
                    aria-label="切換清單頁 M 顯示"
                  >
                    <span className="memo-switch-dot" style={{ left: prefs.listShowChibi ? 20 : 2 }} />
                  </button>
                </div>

                <div>
                  <p className="memo-slider-title">M 大小</p>
                  <p className="memo-slider-value">目前：{prefs.listChibiWidth}px</p>
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
                    className="memo-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="閱讀M"
                subtitle="閱讀頁顯示"
                isOpen={settingsPanels.readingChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, readingChibi: !prev.readingChibi }))}
                className="memo-settings-card"
                titleClassName="memo-settings-card-title"
                subtitleClassName="memo-settings-card-subtitle"
                bodyClassName="memo-settings-card-body"
              >
                <div className="memo-toggle-row">
                  <p className="memo-slider-title">顯示 M</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, readingShowChibi: !prev.readingShowChibi }))}
                    className="memo-switch"
                    style={{ background: prefs.readingShowChibi ? '#bf9b6f' : 'rgba(120,120,120,0.35)' }}
                    aria-label="切換閱讀頁 M 顯示"
                  >
                    <span className="memo-switch-dot" style={{ left: prefs.readingShowChibi ? 20 : 2 }} />
                  </button>
                </div>

                <div>
                  <p className="memo-slider-title">M 大小</p>
                  <p className="memo-slider-value">目前：{prefs.readingChibiWidth}px</p>
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
                    className="memo-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="資料管理"
                subtitle="本機隱藏項目"
                isOpen={settingsPanels.data}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, data: !prev.data }))}
                className="memo-settings-card"
                titleClassName="memo-settings-card-title"
                subtitleClassName="memo-settings-card-subtitle"
                bodyClassName="memo-settings-card-body"
              >
                <p className="memo-slider-value">已隱藏：{hiddenIds.size} 份</p>
                <button
                  type="button"
                  className="memo-restore-btn"
                  onClick={() => {
                    setHiddenIds(new Set<string>());
                    emitActionToast({ kind: 'success', message: '已還原全部隱藏項目' });
                  }}
                  disabled={!hiddenIds.size}
                >
                  還原全部
                </button>
              </SettingsAccordion>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MemoPage;
