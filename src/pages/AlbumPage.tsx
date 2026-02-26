import { useEffect, useMemo, useRef, useState } from 'react';
import albumsData from '../../public/data/albums.json';
import { emitActionToast } from '../lib/actionToast';

// ─── Data ────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string;
const ALBUM_OVERRIDES_STORAGE_KEY = 'memorial-album-overrides';
const LEGACY_ALBUM_NAME_OVERRIDES_STORAGE_KEY = 'memorial-album-name-overrides';
const ALBUM_ORDER_STORAGE_KEY = 'memorial-album-order-v1';

// chibi-00 used as book-cover decoration on the shelf
const CHIBI_00_SRC = `${BASE}chibi/chibi-00.webp`;

// Single catch-all glob — covers ALL albums under public/photos/
// Key format: '../../public/photos/[album-id]/001.webp'
const ALL_PHOTO_MODULES = import.meta.glob(
  '../../public/photos/**/*.webp',
  { eager: true, import: 'default' },
) as Record<string, string>;

const ALBUM_SETTINGS_CHIBI_MODULES = import.meta.glob('../../public/chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const ALBUM_SETTINGS_CHIBI_SOURCES = Object.entries(ALBUM_SETTINGS_CHIBI_MODULES)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  .map(([, src]) => src);

type AlbumMeta = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  coverImage?: string;
  coverFit?: 'cover' | 'contain';
};

type Album = AlbumMeta & {
  images: string[];
  coverImageUrl: string;
};

type AlbumOverride = {
  title?: string;
  subtitle?: string;
  coverImage?: string;
  coverFit?: 'cover' | 'contain';
};

type AlbumOverrides = Record<string, AlbumOverride>;

function pickRandom<T>(items: T[]) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function normalizeAlbumOverride(value: unknown): AlbumOverride {
  if (!value || typeof value !== 'object') return {};
  const input = value as Partial<AlbumOverride>;
  const next: AlbumOverride = {};
  if (typeof input.title === 'string' && input.title.trim()) next.title = input.title.trim();
  if (typeof input.subtitle === 'string' && input.subtitle.trim()) next.subtitle = input.subtitle.trim();
  if (typeof input.coverImage === 'string' && input.coverImage.trim()) next.coverImage = input.coverImage.trim();
  if (input.coverFit === 'cover' || input.coverFit === 'contain') next.coverFit = input.coverFit;
  return next;
}

function loadAlbumOverrides() {
  const normalized: AlbumOverrides = {};

  try {
    const raw = window.localStorage.getItem(ALBUM_OVERRIDES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        const override = normalizeAlbumOverride(value);
        if (Object.keys(override).length) normalized[key] = override;
      }
    }
  } catch {
    // ignore malformed storage
  }

  try {
    const rawLegacy = window.localStorage.getItem(LEGACY_ALBUM_NAME_OVERRIDES_STORAGE_KEY);
    if (rawLegacy) {
      const parsedLegacy = JSON.parse(rawLegacy) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsedLegacy)) {
        if (typeof value === 'string' && value.trim()) {
          normalized[key] = {
            ...(normalized[key] ?? {}),
            title: normalized[key]?.title ?? value.trim(),
          };
        }
      }
    }
  } catch {
    // ignore malformed legacy storage
  }

  return normalized;
}

function saveAlbumOverrides(overrides: AlbumOverrides) {
  try {
    window.localStorage.setItem(ALBUM_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

function normalizeAlbumOrder(value: unknown, availableIds: string[]) {
  const fallback = [...availableIds];
  if (!Array.isArray(value)) return fallback;

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!availableIds.includes(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    ordered.push(item);
  }

  for (const id of availableIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

function loadAlbumOrder(availableIds: string[]) {
  if (typeof window === 'undefined') return [...availableIds];
  try {
    const raw = window.localStorage.getItem(ALBUM_ORDER_STORAGE_KEY);
    if (!raw) return [...availableIds];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAlbumOrder(parsed, availableIds);
  } catch {
    return [...availableIds];
  }
}

function saveAlbumOrder(order: string[]) {
  try {
    window.localStorage.setItem(ALBUM_ORDER_STORAGE_KEY, JSON.stringify(order));
    return true;
  } catch {
    return false;
  }
}

function sortAlbumsByOrder(albums: Album[], order: string[]) {
  const rank = new Map(order.map((id, idx) => [id, idx]));
  return [...albums].sort((a, b) => {
    const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.id.localeCompare(b.id);
  });
}

function resolveAlbumCoverUrl(value: string | undefined) {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
  return `${BASE}${normalized}`;
}

function buildAlbum(meta: AlbumMeta): Album {
  const images = Object.entries(ALL_PHOTO_MODULES)
    .filter(([path]) => path.includes(`/photos/${meta.id}/`))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([, url]) => url);
  return {
    ...meta,
    images,
    coverImageUrl: resolveAlbumCoverUrl(meta.coverImage),
  };
}

const ALBUMS: Album[] = (albumsData as AlbumMeta[]).map(buildAlbum);

// ─── AlbumPage ────────────────────────────────────────────────────────────────

export function AlbumPage() {
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [albumOverrides, setAlbumOverrides] = useState<AlbumOverrides>(() => loadAlbumOverrides());
  const [drafts, setDrafts] = useState<AlbumOverrides>(() => loadAlbumOverrides());
  const [albumOrder, setAlbumOrder] = useState<string[]>(() => loadAlbumOrder(ALBUMS.map((album) => album.id)));

  const displayAlbums = useMemo(
    () =>
      ALBUMS.map((album) => ({
        ...album,
        title: albumOverrides[album.id]?.title || album.title,
        subtitle: albumOverrides[album.id]?.subtitle || album.subtitle,
        coverImageUrl: resolveAlbumCoverUrl(albumOverrides[album.id]?.coverImage || album.coverImage),
        coverFit: albumOverrides[album.id]?.coverFit || album.coverFit,
      })),
    [albumOverrides],
  );
  const sortedDisplayAlbums = useMemo(() => sortAlbumsByOrder(displayAlbums, albumOrder), [displayAlbums, albumOrder]);
  const sortedBaseAlbums = useMemo(() => sortAlbumsByOrder(ALBUMS, albumOrder), [albumOrder]);

  useEffect(() => {
    if (manageMode) {
      setDrafts(albumOverrides);
    }
  }, [albumOverrides, manageMode]);

  useEffect(() => {
    const availableIds = ALBUMS.map((album) => album.id);
    setAlbumOrder((current) => normalizeAlbumOrder(current, availableIds));
  }, []);

  useEffect(() => {
    saveAlbumOrder(albumOrder);
  }, [albumOrder]);

  function moveAlbum(albumId: string, direction: 'up' | 'down') {
    setAlbumOrder((current) => {
      const index = current.indexOf(albumId);
      if (index === -1) return current;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  const openedAlbum = openAlbumId ? sortedDisplayAlbums.find((album) => album.id === openAlbumId) ?? null : null;

  if (openedAlbum) {
    return <AlbumReader album={openedAlbum} onClose={() => setOpenAlbumId(null)} />;
  }

  if (manageMode) {
    return (
      <AlbumManager
        albums={sortedBaseAlbums}
        albumOrder={albumOrder}
        drafts={drafts}
        onDraftChange={(albumId, patch) => {
          setDrafts((current) => ({
            ...current,
            [albumId]: {
              ...(current[albumId] ?? {}),
              ...patch,
            },
          }));
        }}
        onResetAlbum={(albumId) => {
          setDrafts((current) => {
            const next = { ...current };
            delete next[albumId];
            return next;
          });
        }}
        onSave={() => {
          const next: AlbumOverrides = {};
          for (const album of ALBUMS) {
            const draft = normalizeAlbumOverride(drafts[album.id]);
            const normalizedTitle = draft.title?.trim() ?? '';
            const normalizedSubtitle = draft.subtitle?.trim() ?? '';
            const normalizedCoverImage = draft.coverImage?.trim() ?? '';
            const normalizedCoverFit = draft.coverFit;
            const hasChangedTitle = normalizedTitle && normalizedTitle !== album.title;
            const hasChangedSubtitle = normalizedSubtitle && normalizedSubtitle !== album.subtitle;
            const hasChangedCover = normalizedCoverImage && normalizedCoverImage !== (album.coverImage ?? '').trim();
            const hasChangedCoverFit =
              normalizedCoverFit && normalizedCoverFit !== (album.coverFit ?? 'cover');

            if (hasChangedTitle || hasChangedSubtitle || hasChangedCover || hasChangedCoverFit) {
              next[album.id] = {};
              if (hasChangedTitle) next[album.id].title = normalizedTitle;
              if (hasChangedSubtitle) next[album.id].subtitle = normalizedSubtitle;
              if (hasChangedCover) next[album.id].coverImage = normalizedCoverImage;
              if (hasChangedCoverFit) next[album.id].coverFit = normalizedCoverFit;
            }
          }

          setAlbumOverrides(next);
          const saved = saveAlbumOverrides(next);
          if (saved) {
            emitActionToast({ kind: 'success', message: '相冊設定已儲存' });
            setManageMode(false);
          } else {
            emitActionToast({ kind: 'error', message: '相冊設定儲存失敗', durationMs: 2600 });
          }
        }}
        onMoveUp={(albumId) => moveAlbum(albumId, 'up')}
        onMoveDown={(albumId) => moveAlbum(albumId, 'down')}
        onCancel={() => setManageMode(false)}
      />
    );
  }

  return <AlbumShelf albums={sortedDisplayAlbums} onOpen={setOpenAlbumId} onOpenManager={() => setManageMode(true)} />;
}

// ─── AlbumShelf ───────────────────────────────────────────────────────────────

function AlbumShelf({
  albums,
  onOpen,
  onOpenManager,
}: {
  albums: Album[];
  onOpen: (albumId: string) => void;
  onOpenManager: () => void;
}) {
  const [shelfChibiSrc] = useState(() => pickRandom(ALBUM_SETTINGS_CHIBI_SOURCES) ?? CHIBI_00_SRC);

  return (
    <div
      className="mx-auto w-full max-w-xl overflow-y-auto px-4 pb-6 pt-5"
      style={{ height: 'calc(100dvh - 72px)' }}
    >
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-stone-400">Album</p>
          <h1
            className="mt-0.5 text-2xl text-stone-800"
            style={{ fontFamily: 'var(--app-heading-family)' }}
          >
            相冊
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenManager}
          className="rounded-full p-1 transition active:scale-95"
          aria-label="相冊設定"
          title="相冊設定"
        >
          <img
            src={shelfChibiSrc}
            alt=""
            draggable={false}
            className="calendar-chibi w-24 select-none"
          />
        </button>
      </header>

      {/* Album books grid */}
      <div className="grid grid-cols-2 gap-4">
        {albums.map((album) => (
          <AlbumBookCard key={album.id} album={album} onOpen={() => onOpen(album.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── AlbumBookCard ────────────────────────────────────────────────────────────

function AlbumBookCard({
  album,
  onOpen,
}: {
  album: Album;
  onOpen: () => void;
}) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <div
      className="group relative w-full overflow-hidden rounded-2xl shadow-md transition"
      style={{
        aspectRatio: '3/4',
        transform: isPressed ? 'scale(0.985)' : 'scale(1)',
        filter: isPressed ? 'brightness(0.93)' : 'brightness(1)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[9] bg-black/20 transition-opacity duration-150"
        style={{ opacity: isPressed ? 0.36 : 0 }}
      />
      <button
        type="button"
        onClick={onOpen}
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        onPointerCancel={() => setIsPressed(false)}
        onBlur={() => setIsPressed(false)}
        className="absolute inset-0 z-10 transition"
        aria-label={`打開相冊：${album.title}`}
        title={album.title}
      />

      {album.coverImageUrl ? (
        <>
          <img
            src={album.coverImageUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectFit: album.coverFit === 'contain' ? 'contain' : 'cover' }}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/10" />
        </>
      ) : (
        <>
          {/* Cover gradient background */}
          <div className="absolute inset-0" style={{ background: album.accent }} />

          {/* Chibi-00 as cover decoration */}
          <img
            src={CHIBI_00_SRC}
            alt=""
            draggable={false}
            className="absolute bottom-10 left-1/2 w-3/4 -translate-x-1/2 select-none object-contain drop-shadow-md transition group-active:scale-95"
          />
        </>
      )}

      {/* Bottom label */}
      <div
        className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-6"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
        }}
      >
        <p className="text-sm font-semibold leading-tight text-white">{album.title}</p>
        <p className="mt-0.5 text-[10px] text-white/65">{album.subtitle}</p>
        <p className="mt-1 text-[10px] text-white/50">{album.images.length} 張</p>
      </div>

      {/* Spine shadow on left */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-3"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.15) 0%, transparent 100%)' }}
      />
    </div>
  );
}

// ─── AlbumManager ────────────────────────────────────────────────────────────

function AlbumManager({
  albums,
  albumOrder,
  drafts,
  onDraftChange,
  onResetAlbum,
  onMoveUp,
  onMoveDown,
  onSave,
  onCancel,
}: {
  albums: Album[];
  albumOrder: string[];
  drafts: AlbumOverrides;
  onDraftChange: (albumId: string, patch: AlbumOverride) => void;
  onResetAlbum: (albumId: string) => void;
  onMoveUp: (albumId: string) => void;
  onMoveDown: (albumId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedMap((previous) => {
      const next: Record<string, boolean> = {};
      albums.forEach((album, index) => {
        next[album.id] = previous[album.id] ?? index !== 0;
      });
      return next;
    });
  }, [albums]);

  function toggleAlbumCollapse(albumId: string) {
    setCollapsedMap((previous) => ({
      ...previous,
      [albumId]: !previous[albumId],
    }));
  }

  return (
    <div
      className="mx-auto w-full max-w-xl overflow-y-auto px-4 pb-6 pt-5"
      style={{ height: 'calc(100dvh - 72px)' }}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white/85 text-[22px] leading-none text-stone-700 transition active:scale-95"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] uppercase tracking-[0.25em] text-stone-400">Album Settings</p>
          <h1 className="text-xl text-stone-800" style={{ fontFamily: 'var(--app-heading-family)' }}>
            相冊設定
          </h1>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="rounded-xl border border-stone-800 bg-stone-800 px-3 py-1.5 text-xs text-white transition active:scale-95"
        >
          儲存
        </button>
      </header>

      <div className="space-y-4">
        {albums.map((album) => {
          const orderIndex = albumOrder.indexOf(album.id);
          const canMoveUp = orderIndex > 0;
          const canMoveDown = orderIndex >= 0 && orderIndex < albumOrder.length - 1;
          const draft = drafts[album.id] ?? {};
          const titleValue = draft.title ?? '';
          const subtitleValue = draft.subtitle ?? '';
          const coverImageValue = draft.coverImage ?? '';
          const coverFitValue = draft.coverFit ?? album.coverFit ?? 'cover';
          const collapsed = !!collapsedMap[album.id];

          return (
            <section key={album.id} className="space-y-2 rounded-2xl border border-stone-300 bg-white/90 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleAlbumCollapse(album.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition active:scale-[0.99]"
                >
                  <span className="truncate text-sm font-medium text-stone-800">{album.title}</span>
                  <span className="text-xs text-stone-500">{collapsed ? '▸' : '▾'}</span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveUp(album.id)}
                    disabled={!canMoveUp}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-stone-300 text-sm text-stone-600 transition active:scale-95 disabled:opacity-35"
                    title="往上移"
                    aria-label="往上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(album.id)}
                    disabled={!canMoveDown}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-stone-300 text-sm text-stone-600 transition active:scale-95 disabled:opacity-35"
                    title="往下移"
                    aria-label="往下移"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetAlbum(album.id)}
                    className="grid h-7 w-7 place-items-center rounded-full border border-stone-300 text-sm text-stone-600 transition active:scale-95"
                    title="還原預設"
                    aria-label="還原預設"
                  >
                    ↺
                  </button>
                </div>
              </div>

              {!collapsed && (
                <>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-stone-500">名稱</span>
                    <input
                      type="text"
                      value={titleValue}
                      onChange={(event) => onDraftChange(album.id, { title: event.target.value })}
                      placeholder={album.title}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] text-stone-500">標籤（副標）</span>
                    <input
                      type="text"
                      value={subtitleValue}
                      onChange={(event) => onDraftChange(album.id, { subtitle: event.target.value })}
                      placeholder={album.subtitle}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] text-stone-500">封面圖 URL（可留空）</span>
                    <input
                      type="url"
                      value={coverImageValue}
                      onChange={(event) => onDraftChange(album.id, { coverImage: event.target.value })}
                      placeholder={album.coverImage || 'https://...'}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                    />
                  </label>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700">
                    上傳封面
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = typeof reader.result === 'string' ? reader.result : '';
                          if (result) onDraftChange(album.id, { coverImage: result });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onDraftChange(album.id, { coverFit: 'cover' })}
                      className={`rounded-lg border px-2 py-1.5 text-xs transition active:scale-95 ${
                        coverFitValue === 'cover'
                          ? 'border-stone-800 bg-stone-800 text-white'
                          : 'border-stone-300 bg-white text-stone-700'
                      }`}
                    >
                      滿版裁切
                    </button>
                    <button
                      type="button"
                      onClick={() => onDraftChange(album.id, { coverFit: 'contain' })}
                      className={`rounded-lg border px-2 py-1.5 text-xs transition active:scale-95 ${
                        coverFitValue === 'contain'
                          ? 'border-stone-800 bg-stone-800 text-white'
                          : 'border-stone-300 bg-white text-stone-700'
                      }`}
                    >
                      完整顯示
                    </button>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── AlbumReader ──────────────────────────────────────────────────────────────

function AlbumReader({ album, onClose }: { album: Album; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'reader'>('preview');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swiped = useRef(false);
  const lightboxTouchStartX = useRef<number | null>(null);
  const lightboxTouchStartY = useRef<number | null>(null);
  const lightboxSwiped = useRef(false);

  const total = album.images.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  function prev() {
    if (hasPrev) setIndex((i) => i - 1);
  }
  function next() {
    if (hasNext) setIndex((i) => i + 1);
  }

  function prevLightbox() {
    setLightboxIndex((current) => (current === null ? current : Math.max(0, current - 1)));
  }

  function nextLightbox() {
    setLightboxIndex((current) => (current === null ? current : Math.min(total - 1, current + 1)));
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]!.clientX;
    touchStartY.current = e.touches[0]!.clientY;
    swiped.current = false;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0]!.clientX - touchStartX.current;
    const dy = e.changedTouches[0]!.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Only swipe if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      swiped.current = true;
      if (dx < 0) next();
      else prev();
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w * 0.35) prev();
    else if (x > w * 0.65) next();
  }

  function handleLightboxTouchStart(e: React.TouchEvent) {
    lightboxTouchStartX.current = e.touches[0]!.clientX;
    lightboxTouchStartY.current = e.touches[0]!.clientY;
    lightboxSwiped.current = false;
  }

  function handleLightboxTouchEnd(e: React.TouchEvent) {
    if (lightboxTouchStartX.current === null || lightboxTouchStartY.current === null) return;
    const dx = e.changedTouches[0]!.clientX - lightboxTouchStartX.current;
    const dy = e.changedTouches[0]!.clientY - lightboxTouchStartY.current;
    lightboxTouchStartX.current = null;
    lightboxTouchStartY.current = null;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      lightboxSwiped.current = true;
      if (dx < 0) nextLightbox();
      else prevLightbox();
    }
  }

  function handleLightboxClick(e: React.MouseEvent<HTMLDivElement>) {
    if (lightboxSwiped.current) {
      lightboxSwiped.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w * 0.34) {
      prevLightbox();
      return;
    }
    if (x > w * 0.66) {
      nextLightbox();
      return;
    }
    if (lightboxIndex !== null) setIndex(lightboxIndex);
    setLightboxIndex(null);
  }

  const progress = total > 1 ? (index / (total - 1)) * 100 : 100;

  return (
    <div
      className={`relative mx-auto flex w-full max-w-xl flex-col overflow-hidden ${
        viewMode === 'reader' ? 'bg-black' : 'bg-stone-100'
      }`}
      style={{ height: 'calc(100dvh - 72px)' }}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-4 pt-3"
        style={{
          background:
            viewMode === 'reader'
              ? 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)'
              : 'linear-gradient(to bottom, rgba(250,248,245,0.96) 0%, rgba(250,248,245,0.74) 70%, transparent 100%)',
        }}
      >
        <button
          type="button"
          className={`rounded-full border px-3 py-1.5 text-sm transition active:scale-90 ${
            viewMode === 'reader'
              ? 'border-white/30 bg-black/35 text-white/85 backdrop-blur-sm'
              : 'border-stone-300 bg-white/90 text-stone-700'
          }`}
          onClick={onClose}
        >
          ‹ {album.title}
        </button>
        <div className="flex items-center gap-1 rounded-full border border-stone-300 bg-white/90 p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`rounded-full px-2.5 py-1 text-[11px] transition active:scale-95 ${
              viewMode === 'preview' ? 'bg-stone-800 text-white' : 'text-stone-600'
            }`}
          >
            預覽
          </button>
          <button
            type="button"
            onClick={() => setViewMode('reader')}
            className={`rounded-full px-2.5 py-1 text-[11px] transition active:scale-95 ${
              viewMode === 'reader' ? 'bg-stone-800 text-white' : 'text-stone-600'
            }`}
          >
            翻閱
          </button>
        </div>
        <span className={`text-xs tabular-nums ${viewMode === 'reader' ? 'text-white/55' : 'text-stone-500'}`}>
          {viewMode === 'reader' ? `${index + 1} / ${total}` : `${total} 張`}
        </span>
      </div>

      {total === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="text-sm text-stone-500">這本相冊還沒有照片</p>
        </div>
      ) : viewMode === 'reader' ? (
        <div
          className="relative flex-1"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
        >
          {/* ── Image ─────────────────────────────────────────────────── */}
          <img
            key={index}
            src={album.images[index]}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-contain"
          />

          {/* ── Tap-zone chevrons ─────────────────────────────────────── */}
          {hasPrev && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-start pl-2">
              <span className="text-2xl text-white/25">‹</span>
            </div>
          )}
          {hasNext && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end pr-2">
              <span className="text-2xl text-white/25">›</span>
            </div>
          )}

          {/* ── Progress bar ──────────────────────────────────────────── */}
          <div className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/10">
            <div
              className="h-full bg-white/40 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-16">
          <div className="grid grid-cols-3 gap-2">
            {album.images.map((src, imageIndex) => (
              <button
                key={src}
                type="button"
                onClick={() => {
                  setIndex(imageIndex);
                  setLightboxIndex(imageIndex);
                }}
                className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100 shadow-sm transition active:scale-[0.98]"
                style={{ aspectRatio: '1 / 1' }}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <div
          className="absolute inset-0 z-40 bg-black/95"
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
          onClick={handleLightboxClick}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-5 pt-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIndex(lightboxIndex);
                setLightboxIndex(null);
              }}
              className="pointer-events-auto rounded-full bg-black/45 px-3 py-1.5 text-sm text-white/85 backdrop-blur-sm transition active:scale-90"
            >
              × 關閉
            </button>
            <span className="text-xs text-white/60 tabular-nums">
              {lightboxIndex + 1} / {total}
            </span>
          </div>

          <img
            key={lightboxIndex}
            src={album.images[lightboxIndex]}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-contain"
          />

          {lightboxIndex > 0 && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-start pl-2">
              <span className="text-2xl text-white/25">‹</span>
            </div>
          )}
          {lightboxIndex < total - 1 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end pr-2">
              <span className="text-2xl text-white/25">›</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
