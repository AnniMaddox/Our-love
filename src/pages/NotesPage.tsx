import { useEffect, useMemo, useRef, useState } from 'react';
import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';
import { getScopedMixedChibiSources } from '../lib/chibiPool';
import {
  clearAllNotes,
  deleteNote,
  generateNoteId,
  importNotes,
  isValidNote,
  loadNotes,
  saveNote,
} from '../lib/noteDB';
import type { StoredNote } from '../lib/noteDB';

// ─── Constants ────────────────────────────────────────────────────────────────

function randomChibiSrc(): string {
  const sources = getScopedMixedChibiSources('notes');
  if (sources.length === 0) return '';
  return sources[Math.floor(Math.random() * sources.length)]!;
}

// 10 note colours
export const NOTE_COLORS = [
  '#FFF3B0', // 蜜黃
  '#FFE0C8', // 蜜桃
  '#FFD1DC', // 玫瑰
  '#FFB8A8', // 珊瑚
  '#E8D5F5', // 薰衣草
  '#D4B8E0', // 丁香紫
  '#C0E4F8', // 天空藍
  '#C8F0D8', // 薄荷綠
  '#D4E8C2', // 鼠尾草
  '#FFF8F0', // 奶白
] as const;

type NoteView = 'wall' | 'timeline';
type NotesPrefs = {
  showChibi: boolean;
  size: number;
  fontSize: number;
  textColor: string;
};

const NOTES_PREFS_KEY = 'memorial-notes-prefs-v2';
const LEGACY_NOTES_CHIBI_PREFS_KEY = 'memorial-notes-chibi-prefs-v1';
const DEFAULT_NOTES_PREFS: NotesPrefs = {
  showChibi: true,
  size: 148,
  fontSize: 13,
  textColor: '#44403c',
};

// Deterministic rotation -2…+2 degrees from note id
function noteRotDeg(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h * 31 + id.charCodeAt(i)) | 0);
  return (((h % 3) + 3) % 3) - 1;
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function resolveNoteWallOrder(note: StoredNote) {
  if (typeof note.wallOrder === 'number' && Number.isFinite(note.wallOrder)) {
    return note.wallOrder;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortNotesForWall(notes: StoredNote[]) {
  return [...notes].sort((a, b) => {
    const aOrder = resolveNoteWallOrder(a);
    const bOrder = resolveNoteWallOrder(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.createdAt - a.createdAt;
  });
}

function normalizeNotesPrefs(input: unknown): NotesPrefs {
  if (!input || typeof input !== 'object') return DEFAULT_NOTES_PREFS;
  const source = input as Partial<NotesPrefs>;
  const showChibi = source.showChibi !== false;
  const size =
    typeof source.size === 'number' && Number.isFinite(source.size)
      ? Math.min(196, Math.max(104, Math.round(source.size)))
      : DEFAULT_NOTES_PREFS.size;
  const fontSize =
    typeof source.fontSize === 'number' && Number.isFinite(source.fontSize)
      ? Math.min(20, Math.max(11, Math.round(source.fontSize)))
      : DEFAULT_NOTES_PREFS.fontSize;
  const textColor =
    typeof source.textColor === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(source.textColor.trim())
      ? source.textColor.trim()
      : DEFAULT_NOTES_PREFS.textColor;
  return { showChibi, size, fontSize, textColor };
}

function loadNotesPrefs(): NotesPrefs {
  if (typeof window === 'undefined') return DEFAULT_NOTES_PREFS;
  try {
    const raw = window.localStorage.getItem(NOTES_PREFS_KEY);
    if (raw) {
      return normalizeNotesPrefs(JSON.parse(raw) as unknown);
    }
  } catch {
    return DEFAULT_NOTES_PREFS;
  }

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_NOTES_CHIBI_PREFS_KEY);
    if (!legacyRaw) return DEFAULT_NOTES_PREFS;
    const legacy = normalizeNotesPrefs(JSON.parse(legacyRaw) as unknown);
    return { ...DEFAULT_NOTES_PREFS, ...legacy };
  } catch {
    return DEFAULT_NOTES_PREFS;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── NotesPage ────────────────────────────────────────────────────────────────

export function NotesPage({
  onExit,
}: {
  onExit: () => void;
}) {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<NoteView>('wall');
  // Random chibi picked once per page mount, won't reroll until unmount
  const [chibiSrc] = useState(randomChibiSrc);
  const [notesPrefs, setNotesPrefs] = useState<NotesPrefs>(loadNotesPrefs);
  const [composing, setComposing] = useState(false);
  const [editingNote, setEditingNote] = useState<StoredNote | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const hideFloatingChibi = !notesPrefs.showChibi || !chibiSrc;
  const wallNotes = useMemo(() => sortNotesForWall(notes), [notes]);

  useEffect(() => {
    loadNotes()
      .then((data) => { setNotes(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(NOTES_PREFS_KEY, JSON.stringify(notesPrefs));
  }, [notesPrefs]);

  const refreshNotes = async () => {
    const updated = await loadNotes();
    setNotes(updated);
  };

  const handleSave = async (note: StoredNote) => {
    try {
      const hasWallOrder = notes.some((item) => typeof item.wallOrder === 'number' && Number.isFinite(item.wallOrder));
      const maxWallOrder = notes.reduce((max, item) => {
        if (typeof item.wallOrder !== 'number' || !Number.isFinite(item.wallOrder)) return max;
        return Math.max(max, item.wallOrder);
      }, -1);
      const noteToSave: StoredNote = {
        ...note,
        wallOrder:
          typeof note.wallOrder === 'number' && Number.isFinite(note.wallOrder)
            ? note.wallOrder
            : hasWallOrder
              ? maxWallOrder + 1
              : undefined,
      };
      await saveNote(noteToSave);
      await refreshNotes();
      setComposing(false);
      setEditingNote(null);
      emitActionToast({ kind: 'success', message: '便利貼已儲存' });
    } catch (error) {
      emitActionToast({
        kind: 'error',
        message: `便利貼儲存失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        durationMs: 2600,
      });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setEditingNote(null);
  };

  const handleClearAll = async () => {
    await clearAllNotes();
    setNotes([]);
    setShowSettings(false);
  };

  const handleImport = async (imported: StoredNote[]) => {
    await importNotes(imported);
    await refreshNotes();
  };

  const handleWallReorder = async (orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const next = notes.map((note) => ({
      ...note,
      wallOrder: orderMap.get(note.id) ?? note.wallOrder ?? Number.MAX_SAFE_INTEGER,
    }));
    await importNotes(next);
    await refreshNotes();
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: '#fdf6ee' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="relative shrink-0 border-b border-stone-200/70 px-4 pb-3 pt-4" style={{ background: '#fdf6ee' }}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white/80 text-[22px] leading-none text-stone-600 transition active:scale-95"
          >
            ‹
          </button>

          <div className="flex items-center gap-1.5">
            <div className="flex overflow-hidden rounded-xl border border-stone-300 bg-white/80 text-xs">
              <button
                type="button"
                onClick={() => setView('wall')}
                className={`px-3 py-1.5 transition ${view === 'wall' ? 'bg-stone-800 text-white' : 'text-stone-600'}`}
              >
                牆
              </button>
              <button
                type="button"
                onClick={() => setView('timeline')}
                className={`px-3 py-1.5 transition ${view === 'timeline' ? 'bg-stone-800 text-white' : 'text-stone-600'}`}
              >
                流
              </button>
            </div>
            {hideFloatingChibi && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                aria-label="更多設定"
                className="grid h-7 w-7 place-items-center text-[20px] leading-none text-[#b3a393] transition active:opacity-60"
              >
                ⋯
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="uppercase tracking-[0.25em] text-stone-400" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
            Notes
          </p>
          <h1
            className="leading-tight text-stone-800"
            style={{ fontFamily: 'var(--app-heading-family)', fontSize: 'var(--ui-header-title-size, 17px)' }}
          >
            便利貼
          </h1>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto pb-56 pt-4">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-400">載入中…</div>
        ) : notes.length === 0 ? (
          <NoteEmptyState />
        ) : view === 'wall' ? (
          <NoteWall
            notes={wallNotes}
            onTap={setEditingNote}
            onReorder={(orderedIds) => void handleWallReorder(orderedIds)}
            notesFontSize={notesPrefs.fontSize}
            notesTextColor={notesPrefs.textColor}
          />
        ) : (
          <NoteTimeline notes={notes} onTap={setEditingNote} notesFontSize={notesPrefs.fontSize} notesTextColor={notesPrefs.textColor} />
        )}
      </div>

      {/* ── Bottom FAB row ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between pl-4 pr-5 pb-4">
        {/* Pin New note */}
        <button
          type="button"
          onClick={() => { setEditingNote(null); setComposing(true); }}
          aria-label="新增便利貼"
          className="pointer-events-auto flex h-16 w-16 items-center justify-center bg-transparent leading-none transition active:scale-90"
          style={{ fontSize: '56px' }}
        >
          <span
            aria-hidden="true"
            className="select-none drop-shadow-[0_6px_12px_rgba(200,70,70,0.28)]"
            style={{ transform: 'translateY(1px)' }}
          >
            📍
          </span>
        </button>
        {!hideFloatingChibi && (
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="pointer-events-auto transition active:scale-90"
            aria-label="設定 / 匯出"
          >
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi select-none drop-shadow-md"
              style={{ width: `${notesPrefs.size}px`, maxWidth: '42vw', height: 'auto' }}
            />
          </button>
        )}
      </div>

      {/* ── Compose / Edit sheet ─────────────────────────────────── */}
      {(composing || editingNote) && (
        <NoteComposeSheet
          initial={editingNote}
          onSave={(note) => void handleSave(note)}
          onDelete={editingNote ? () => void handleDelete(editingNote.id) : undefined}
          onClose={() => { setComposing(false); setEditingNote(null); }}
        />
      )}

      {/* ── Settings sheet ───────────────────────────────────────── */}
      {showSettings && (
        <NoteSettingsSheet
          notes={notes}
          showChibi={notesPrefs.showChibi}
          chibiSize={notesPrefs.size}
          notesFontSize={notesPrefs.fontSize}
          notesTextColor={notesPrefs.textColor}
          onToggleChibi={() => setNotesPrefs((prev) => ({ ...prev, showChibi: !prev.showChibi }))}
          onChibiSizeChange={(size) => setNotesPrefs((prev) => ({ ...prev, size: Math.min(196, Math.max(104, Math.round(size))) }))}
          onNotesFontSizeChange={(fontSize) => setNotesPrefs((prev) => ({ ...prev, fontSize: Math.min(20, Math.max(11, Math.round(fontSize))) }))}
          onNotesTextColorChange={(textColor) => setNotesPrefs((prev) => ({ ...prev, textColor }))}
          onImport={(imported) => void handleImport(imported)}
          onClearAll={() => void handleClearAll()}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ─── NoteEmptyState ───────────────────────────────────────────────────────────

function NoteEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-20 text-center">
      <p className="mb-3 text-5xl">📝</p>
      <p className="text-base text-stone-500">還沒有便利貼</p>
      <p className="mt-1 text-sm text-stone-400">點左下角大頭針寫下第一個想法</p>
    </div>
  );
}

// ─── NoteWall ─────────────────────────────────────────────────────────────────

function NoteWall({
  notes,
  onTap,
  onReorder,
  notesFontSize,
  notesTextColor,
}: {
  notes: StoredNote[];
  onTap: (n: StoredNote) => void;
  onReorder: (orderedIds: string[]) => void;
  notesFontSize: number;
  notesTextColor: string;
}) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => notes.map((item) => item.id));
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
  } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const dragStartSignatureRef = useRef('');
  const pressRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const orderedIdsRef = useRef<string[]>(orderedIds);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    orderedIdsRef.current = orderedIds;
  }, [orderedIds]);

  useEffect(() => {
    setOrderedIds((prev) => {
      const incoming = notes.map((item) => item.id);
      const incomingSet = new Set(incoming);
      const kept = prev.filter((id) => incomingSet.has(id));
      const appended = incoming.filter((id) => !kept.includes(id));
      return [...kept, ...appended];
    });
  }, [notes]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const noteById = useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes]);
  const orderedNotes = useMemo(
    () => orderedIds.map((id) => noteById.get(id)).filter((item): item is StoredNote => Boolean(item)),
    [orderedIds, noteById],
  );
  const draggingNote = dragState ? noteById.get(dragState.id) ?? null : null;

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function reorderTowards(dragId: string, clientX: number, clientY: number) {
    let nearestId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const id of orderedIdsRef.current) {
      if (id === dragId) continue;
      const el = itemRefs.current[id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - clientX;
      const dy = cy - clientY;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestId = id;
      }
    }
    if (!nearestId) return;
    setOrderedIds((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(nearestId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  }

  function beginDragging(id: string, pointerId: number) {
    const press = pressRef.current;
    const node = itemRefs.current[id];
    if (!press || !node) return;
    const rect = node.getBoundingClientRect();
    dragStartSignatureRef.current = orderedIdsRef.current.join('|');
    setDragState({
      id,
      x: press.lastX,
      y: press.lastY,
      offsetX: press.lastX - rect.left,
      offsetY: press.lastY - rect.top,
      width: rect.width,
    });
    const target = node;
    if (target.hasPointerCapture(pointerId)) return;
    target.setPointerCapture(pointerId);
  }

  function endPointer(note: StoredNote, pointerId: number) {
    const press = pressRef.current;
    if (!press || press.pointerId !== pointerId || press.id !== note.id) return;

    const wasDragging = dragState?.id === note.id;
    clearHoldTimer();
    pressRef.current = null;
    setPressedId(null);

    if (wasDragging) {
      setDragState(null);
      const nextSignature = orderedIdsRef.current.join('|');
      if (nextSignature !== dragStartSignatureRef.current) {
        onReorder(orderedIdsRef.current);
      }
      return;
    }

    if (!press.moved) {
      onTap(note);
    }
  }

  return (
    <div className="relative px-3 pt-4">
      <div className="grid grid-cols-2 gap-3">
        {orderedNotes.map((note) => {
          const isDragging = dragState?.id === note.id;
          const isPressed = pressedId === note.id && !isDragging;
          return (
            <div
              key={note.id}
              ref={(node) => {
                itemRefs.current[note.id] = node;
              }}
              className="touch-pan-y select-none transition-transform"
              style={{
                transform: isPressed ? 'scale(0.975)' : undefined,
                opacity: isDragging ? 0.2 : 1,
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                setPressedId(note.id);
                pressRef.current = {
                  id: note.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  lastX: event.clientX,
                  lastY: event.clientY,
                  moved: false,
                };
                clearHoldTimer();
                holdTimerRef.current = window.setTimeout(() => {
                  beginDragging(note.id, event.pointerId);
                }, 170);
              }}
              onPointerMove={(event) => {
                const press = pressRef.current;
                if (!press || press.id !== note.id || press.pointerId !== event.pointerId) return;
                press.lastX = event.clientX;
                press.lastY = event.clientY;

                const movedX = event.clientX - press.startX;
                const movedY = event.clientY - press.startY;
                if (!press.moved && Math.hypot(movedX, movedY) > 8) {
                  press.moved = true;
                  if (!dragState) {
                    clearHoldTimer();
                  }
                }

                if (!dragState || dragState.id !== note.id) return;
                event.preventDefault();
                setDragState((prev) =>
                  prev && prev.id === note.id
                    ? {
                        ...prev,
                        x: event.clientX,
                        y: event.clientY,
                      }
                    : prev,
                );
                reorderTowards(note.id, event.clientX, event.clientY);
              }}
              onPointerUp={(event) => {
                endPointer(note, event.pointerId);
              }}
              onPointerCancel={(event) => {
                endPointer(note, event.pointerId);
              }}
            >
              <StickyNote note={note} notesFontSize={notesFontSize} notesTextColor={notesTextColor} />
            </div>
          );
        })}
      </div>

      {dragState && draggingNote ? (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{
            left: dragState.x - dragState.offsetX,
            top: dragState.y - dragState.offsetY,
            width: dragState.width,
          }}
        >
          <StickyNote note={draggingNote} notesFontSize={notesFontSize} notesTextColor={notesTextColor} lifted />
        </div>
      ) : null}
    </div>
  );
}

function StickyNote({
  note,
  notesFontSize,
  notesTextColor,
  lifted = false,
}: {
  note: StoredNote;
  notesFontSize: number;
  notesTextColor: string;
  lifted?: boolean;
}) {
  const rot = noteRotDeg(note.id);
  const dateStr = new Date(note.createdAt).toLocaleDateString('zh-TW', {
    month: 'short', day: 'numeric',
  });

  return (
    <div
      className="rounded-2xl p-3.5 shadow-sm transition"
      style={{
        background: note.color,
        transform: `rotate(${rot}deg) ${lifted ? 'scale(1.02)' : ''}`.trim(),
        boxShadow: lifted
          ? '0 16px 32px rgba(0,0,0,0.24), 0 4px 10px rgba(0,0,0,0.16)'
          : undefined,
      }}
    >
      <p
        className="line-clamp-6 whitespace-pre-wrap leading-relaxed"
        style={{ fontSize: `${notesFontSize}px`, color: notesTextColor }}
      >
        {note.content}
      </p>
      <p className="mt-2 text-[10px] text-stone-400/80">{dateStr}</p>
    </div>
  );
}

// ─── NoteTimeline ─────────────────────────────────────────────────────────────

function NoteTimeline({ notes, onTap, notesFontSize, notesTextColor }: { notes: StoredNote[]; onTap: (n: StoredNote) => void; notesFontSize: number; notesTextColor: string }) {
  return (
    <div className="space-y-3 px-4">
      {notes.map((note) => (
        <TimelineItem key={note.id} note={note} onTap={onTap} notesFontSize={notesFontSize} notesTextColor={notesTextColor} />
      ))}
    </div>
  );
}

function TimelineItem({ note, onTap, notesFontSize, notesTextColor }: { note: StoredNote; onTap: (n: StoredNote) => void; notesFontSize: number; notesTextColor: string }) {
  const d = new Date(note.createdAt);
  const dateStr = d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  const stripe = note.color;

  return (
    <div
      className="flex cursor-pointer gap-3 transition active:opacity-75"
      onClick={() => onTap(note)}
    >
      <div
        className="mt-1 w-1 shrink-0 rounded-full"
        style={{ background: stripe, filter: 'saturate(1.8) brightness(0.78)' }}
      />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] text-stone-400">{dateStr} {timeStr}</p>
        <div className="rounded-2xl p-3.5 shadow-sm" style={{ background: note.color }}>
          <p
            className="line-clamp-6 whitespace-pre-wrap leading-relaxed"
            style={{ fontSize: `${notesFontSize}px`, color: notesTextColor }}
          >
            {note.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── NoteComposeSheet ─────────────────────────────────────────────────────────

function NoteComposeSheet({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: StoredNote | null;
  onSave: (note: StoredNote) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? NOTE_COLORS[0]!);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  function handleSave() {
    if (!content.trim() || saving) return;
    setSaving(true);
    const now = Date.now();
    const note: StoredNote = {
      id: initial?.id ?? generateNoteId(),
      content: content.trim(),
      color,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      wallOrder: initial?.wallOrder,
    };
    onSave(note);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative flex max-h-[92dvh] flex-col rounded-t-3xl px-4 pb-8 pt-4 shadow-xl"
        style={{ background: color }}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-400/40" />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="寫下想法…"
          rows={6}
          className="min-h-[120px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-stone-700 outline-none placeholder:text-stone-400/70"
        />

        {/* Colour picker */}
        <div className="mt-3 flex flex-wrap gap-2">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full border-2 transition"
              style={{
                background: c,
                borderColor: color === c ? '#44403c' : 'transparent',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                transform: color === c ? 'scale(1.15)' : undefined,
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              className={`rounded-xl border px-3 py-2 text-xs transition active:scale-95 ${
                confirmDelete
                  ? 'border-rose-500 bg-rose-500 text-white'
                  : 'border-stone-300/70 text-stone-500'
              }`}
            >
              {confirmDelete ? '確定刪除' : '刪除'}
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300/70 px-3 py-2 text-xs text-stone-500 transition active:scale-95"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="rounded-xl bg-stone-800 px-4 py-2 text-xs text-white transition active:scale-95 disabled:opacity-40"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NoteSettingsSheet ────────────────────────────────────────────────────────

function NoteSettingsSheet({
  notes,
  showChibi,
  chibiSize,
  notesFontSize,
  notesTextColor,
  onToggleChibi,
  onChibiSizeChange,
  onNotesFontSizeChange,
  onNotesTextColorChange,
  onImport,
  onClearAll,
  onClose,
}: {
  notes: StoredNote[];
  showChibi: boolean;
  chibiSize: number;
  notesFontSize: number;
  notesTextColor: string;
  onToggleChibi: () => void;
  onChibiSizeChange: (size: number) => void;
  onNotesFontSizeChange: (size: number) => void;
  onNotesTextColorChange: (color: string) => void;
  onImport: (notes: StoredNote[]) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openPanels, setOpenPanels] = useState({
    chibi: false,
    text: false,
    backup: false,
    danger: false,
  });

  function exportJSON() {
    const json = JSON.stringify(notes, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `memorial-notes-${todayDateStr()}.json`);
  }

  function exportTXT() {
    const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
    const lines = sorted
      .map((n) => {
        const d = new Date(n.createdAt).toLocaleString('zh-TW');
        return `[${d}]\n${n.content}`;
      })
      .join('\n\n───────────\n\n');
    downloadBlob(
      new Blob([lines], { type: 'text/plain;charset=utf-8' }),
      `memorial-notes-${todayDateStr()}.txt`,
    );
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      if (!Array.isArray(raw)) throw new Error('not array');
      const valid = raw.filter(isValidNote);
      if (!valid.length) throw new Error('no valid notes');
      onImport(valid);
    } catch {
      alert('匯入失敗：請確認是由本頁匯出的 JSON 檔案');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative rounded-t-3xl bg-white px-5 pb-10 pt-4 shadow-xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />

        <p className="mb-4 text-center text-xs text-stone-400">共 {notes.length} 則便條</p>

        <div className="space-y-2">
          <SettingsAccordion
            title="M"
            subtitle="顯示與大小"
            isOpen={openPanels.chibi}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">M</span>
              <button
                type="button"
                onClick={onToggleChibi}
                className="relative h-6 w-10 rounded-full transition"
                style={{ background: showChibi ? '#7a6858' : '#bab3aa' }}
                aria-label="切換M顯示"
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all"
                  style={{ left: showChibi ? 18 : 2 }}
                />
              </button>
            </div>
            <input
              type="range"
              min={104}
              max={196}
              step={1}
              value={chibiSize}
              onChange={(event) => onChibiSizeChange(Number(event.target.value))}
              className="mt-2 w-full accent-stone-700"
            />
          </SettingsAccordion>

          <SettingsAccordion
            title="文字"
            subtitle="字級與顏色"
            isOpen={openPanels.text}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, text: !prev.text }))}
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
          >
            <label className="block space-y-1">
              <span className="flex items-center justify-between text-xs text-stone-600">
                <span>文字大小</span>
                <span>{notesFontSize}px</span>
              </span>
              <input
                type="range"
                min={11}
                max={20}
                step={1}
                value={notesFontSize}
                onChange={(event) => onNotesFontSizeChange(Number(event.target.value))}
                className="w-full accent-stone-700"
              />
            </label>
            <label className="mt-3 flex items-center justify-between">
              <span className="text-xs text-stone-600">文字顏色</span>
              <input
                type="color"
                value={notesTextColor}
                onChange={(event) => onNotesTextColorChange(event.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-stone-300 bg-white"
              />
            </label>
          </SettingsAccordion>

          <SettingsAccordion
            title="匯入匯出"
            subtitle="備份與還原"
            isOpen={openPanels.backup}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, backup: !prev.backup }))}
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
          >
            <div className="space-y-2">
              <button
                type="button"
                onClick={exportJSON}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm text-stone-700 transition active:scale-[0.98]"
              >
                📤 匯出 JSON（備份 · 可還原）
              </button>

              <button
                type="button"
                onClick={exportTXT}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm text-stone-700 transition active:scale-[0.98]"
              >
                📄 匯出 TXT（純文字 · 方便閱讀）
              </button>

              <label className="block w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 transition active:scale-[0.98]">
                {importing ? '匯入中…' : '📥 匯入 JSON（還原備份）'}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (f) void handleImportFile(f);
                  }}
                />
              </label>
            </div>
          </SettingsAccordion>

          <SettingsAccordion
            title="資料清理"
            subtitle="危險操作"
            isOpen={openPanels.danger}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, danger: !prev.danger }))}
            className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
            subtitleClassName={confirmClear ? 'mt-0.5 text-xs text-rose-500' : undefined}
          >
            <button
              type="button"
              onClick={() => (confirmClear ? onClearAll() : setConfirmClear(true))}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition active:scale-[0.98] ${
                confirmClear
                  ? 'border-rose-400 bg-rose-50 text-rose-600'
                  : 'border-stone-200 bg-white text-stone-400'
              }`}
            >
              🗑️ {confirmClear ? '確定清除全部便條？' : '清除全部便條'}
            </button>
          </SettingsAccordion>
        </div>
      </div>
    </div>
  );
}
