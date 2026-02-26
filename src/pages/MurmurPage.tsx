import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type TouchEvent as ReactTouchEvent } from 'react';

import './MurmurPage.css';

const BASE = import.meta.env.BASE_URL;
const INDEX_URL = `${BASE}data/murmur/index.json`;
const FALLBACK_INDEX_URL = '/data/murmur/index.json';
const AVATAR_STORAGE_KEY = 'memorial-murmur-avatar-v1';
const FALLBACK_AVATAR = 'M';

type MurmurDoc = {
  id: string;
  title: string;
  timeLabel: string;
  contentPath: string;
  preview: string;
  order?: number;
};

type MurmurIndexPayload = {
  docs?: MurmurDoc[];
};

type MurmurPageProps = {
  onExit: () => void;
  notesFontFamily?: string;
};

function normalizeBasePath(base: string) {
  const trimmed = (base || '/').trim();
  if (!trimmed) return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function joinPath(base: string, path: string) {
  const normalizedBase = normalizeBasePath(base);
  const normalizedPath = path.replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchWithFallback(primaryUrl: string, fallbackUrl: string) {
  const fetchInit: RequestInit = { cache: 'no-store' };
  try {
    const response = await fetch(primaryUrl, fetchInit);
    if (response.ok || primaryUrl === fallbackUrl) return response;
    const fallbackResponse = await fetch(fallbackUrl, fetchInit);
    return fallbackResponse.ok ? fallbackResponse : response;
  } catch {
    if (primaryUrl === fallbackUrl) throw new Error('NETWORK_FETCH_FAILED');
    return fetch(fallbackUrl, fetchInit);
  }
}

function readAvatarUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

function persistAvatarUrl(value: string) {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(AVATAR_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(AVATAR_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function MurmurPage({ onExit, notesFontFamily = '' }: MurmurPageProps) {
  const [docs, setDocs] = useState<MurmurDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bodyMap, setBodyMap] = useState<Record<string, string>>({});
  const [avatarUrl, setAvatarUrl] = useState(() => readAvatarUrl());
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  useEffect(() => {
    persistAvatarUrl(avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    let disposed = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const response = await fetchWithFallback(INDEX_URL, FALLBACK_INDEX_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as MurmurIndexPayload;
        const next = Array.isArray(payload.docs) ? payload.docs : [];
        if (!disposed) {
          setDocs(
            [...next].sort((a, b) => {
              const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
              const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
              if (ao !== bo) return ao - bo;
              return a.title.localeCompare(b.title, 'zh-TW');
            }),
          );
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '未知錯誤');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void run();
    return () => {
      disposed = true;
    };
  }, []);

  const activeIndex = useMemo(
    () => docs.findIndex((doc) => doc.id === activeId),
    [docs, activeId],
  );
  const activeDoc = activeIndex >= 0 ? docs[activeIndex] : null;
  const prevDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
  const nextDoc = activeIndex >= 0 && activeIndex < docs.length - 1 ? docs[activeIndex + 1] : null;

  useEffect(() => {
    const activeDocId = activeDoc?.id;
    const activeDocContentPath = activeDoc?.contentPath;
    if (!activeDocId || !activeDocContentPath) return;
    const docId = activeDocId;
    const docContentPath = activeDocContentPath;
    if (bodyMap[docId] !== undefined) return;

    let disposed = false;

    async function loadBody() {
      try {
        const primaryContentUrl = joinPath(BASE, `data/murmur/${docContentPath}`);
        const fallbackContentUrl = joinPath('/', `data/murmur/${docContentPath}`);
        const response = await fetchWithFallback(primaryContentUrl, fallbackContentUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!disposed) {
          setBodyMap((prev) => ({ ...prev, [docId]: text.trim() }));
        }
      } catch {
        if (!disposed) {
          setBodyMap((prev) => ({ ...prev, [docId]: '讀取內容失敗，請稍後再試。' }));
        }
      }
    }

    void loadBody();
    return () => {
      disposed = true;
    };
  }, [activeDoc, bodyMap]);

  const subtitle = useMemo(() => `碎碎念 · ${docs.length} 則`, [docs.length]);

  function openRead(id: string) {
    setActiveId(id);
  }

  function closeRead() {
    setActiveId(null);
  }

  function navRead(delta: -1 | 1) {
    if (activeIndex < 0) return;
    const target = docs[activeIndex + delta];
    if (!target) return;
    setActiveId(target.id);
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
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
      navRead(-1);
    } else {
      navRead(1);
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('請選擇圖片檔案');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setAvatarUrl(result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="murmur-page" style={{ '--murmur-font-family': notesFontFamily ? `'${notesFontFamily}', sans-serif` : '' } as CSSProperties}>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="murmur-avatar-input"
        onChange={handleAvatarChange}
      />
      <header className="chat-header">
        <button type="button" className="hd-back" onClick={onExit} aria-label="返回">
          ‹
        </button>
        <div className="contact-wrap">
          <button type="button" className="contact-avatar" onClick={openAvatarPicker} aria-label="更換頭像">
            {avatarUrl ? <img src={avatarUrl} alt="M avatar" /> : <span>{FALLBACK_AVATAR}</span>}
          </button>
          <div className="contact-sub">{subtitle}</div>
        </div>
        <span className="hd-side-spacer" aria-hidden="true" />
      </header>

      <main className="chat-body">
        {loading ? <div className="murmur-empty">讀取中…</div> : null}
        {!loading && error ? <div className="murmur-empty">讀取失敗：{error}</div> : null}
        {!loading && !error && !docs.length ? <div className="murmur-empty">目前沒有碎碎念</div> : null}

        {!loading && !error
          ? docs.map((doc) => (
              <div key={doc.id}>
                <div className="time-divider">{doc.timeLabel}</div>
                <div className="msg-row">
                  <div className="msg-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt="M avatar" /> : <span>{FALLBACK_AVATAR}</span>}
                  </div>
                  <button type="button" className="bubble" onClick={() => openRead(doc.id)}>
                    <div className="bubble-text">{doc.preview}</div>
                    <div className="bubble-hint">▾ 展開閱讀</div>
                    <div className="bubble-read">已讀</div>
                  </button>
                </div>
              </div>
            ))
          : null}
      </main>

      <footer className="chat-bottom">
        <div className="input-mock">有什麼想回覆他的嗎...</div>
      </footer>

      <section id="readScreen" className={activeDoc ? 'open' : ''} aria-hidden={!activeDoc}>
        <div className="rs-nav">
          <button type="button" className="rs-back" onClick={closeRead}>
            <span className="rs-back-chev">‹</span>
            <span>碎碎念</span>
          </button>
          <span className="rs-time-label">{activeDoc?.timeLabel ?? ''}</span>
        </div>

        <div className="rs-sender">
          <div className="rs-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="M avatar" /> : <span>{FALLBACK_AVATAR}</span>}
          </div>
          <div className="rs-sender-info">
            <div className="rs-sender-name" />
            <div className="rs-sender-sub">
              傳送於 <span>{activeDoc?.timeLabel ?? ''}</span>
            </div>
          </div>
        </div>

        <div className="rs-body" onTouchStart={handleReadTouchStart} onTouchEnd={handleReadTouchEnd}>
          <div className="rs-inner">
            <div className="rs-content">{activeDoc ? bodyMap[activeDoc.id] ?? '讀取中…' : ''}</div>
          </div>
        </div>

        <div className="rs-bot">
          <button type="button" className={`rs-nav-btn ${prevDoc ? '' : 'dis'}`} onClick={() => navRead(-1)} disabled={!prevDoc}>
            <span className="arr">‹</span>
            <span className="lbl">{prevDoc?.timeLabel ?? ''}</span>
          </button>
          <span className="rs-pos">{activeDoc ? `${activeIndex + 1} / ${docs.length}` : ''}</span>
          <button
            type="button"
            className={`rs-nav-btn next ${nextDoc ? '' : 'dis'}`}
            onClick={() => navRead(1)}
            disabled={!nextDoc}
          >
            <span className="lbl">{nextDoc?.timeLabel ?? ''}</span>
            <span className="arr">›</span>
          </button>
        </div>
      </section>
    </div>
  );
}
