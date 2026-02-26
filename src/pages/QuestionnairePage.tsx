import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';
import { getActiveBaseChibiSources, getScopedChibiSources } from '../lib/chibiPool';

import './QuestionnairePage.css';

type QuestionnaireDoc = {
  id: string;
  title: string;
  sourceFile: string;
  sourceRelPath: string;
  contentPath: string;
  writtenAt: number | null;
  dateLabel: string;
  preview: string;
  questionCount: number;
  tags: string[];
  searchText: string;
};

type QuestionnaireIndexPayload = {
  version?: number;
  generatedAt?: string;
  total?: number;
  docs?: Array<Partial<QuestionnaireDoc>>;
};

type QaPair = {
  question: string;
  answer: string;
};

type QuestionnairePageProps = {
  onExit: () => void;
  notesFontFamily?: string;
};

type FontMode = 'default' | 'memo';

type QuestionnairePrefs = {
  contentFontSize: number;
  contentLineHeight: number;
  showChibi: boolean;
  chibiWidth: number;
  fontMode: FontMode;
};

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/questionnaire/index.json`;
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;
const PREFS_KEY = 'memorial-questionnaire-prefs-v1';
const ANSWER_PREFIX_RE = /^(?:回答|答覆|回覆|答案|a)\s*[:：]/iu;
const APPEND_PREFIX_RE = /^(?:想說的話|m想說|給妳的一句話|給你的一句話|補充|說明)\s*[:：]/iu;
const NUMBERED_QUESTION_PREFIX_RE =
  /^(?:\d+️⃣|[①-⑳]|\(?\d{1,2}\)?[.)、．]|[【[]\d{1,2}[】\]]|(?:q|q\.)\s*\d+[:：.)、-]?|[一二三四五六七八九十]{1,3}[、.．])\s*/iu;

const DEFAULT_PREFS: QuestionnairePrefs = {
  contentFontSize: 16,
  contentLineHeight: 1.85,
  showChibi: true,
  chibiWidth: 144,
  fontMode: 'default',
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizePrefs(input: unknown): QuestionnairePrefs {
  if (!input || typeof input !== 'object') return DEFAULT_PREFS;
  const source = input as Partial<QuestionnairePrefs>;
  return {
    contentFontSize: clampNumber(source.contentFontSize, 12, 24, DEFAULT_PREFS.contentFontSize),
    contentLineHeight: clampNumber(source.contentLineHeight, 1.45, 2.9, DEFAULT_PREFS.contentLineHeight),
    showChibi: source.showChibi !== false,
    chibiWidth: clampInt(source.chibiWidth, 104, 196, DEFAULT_PREFS.chibiWidth),
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

function savePrefs(prefs: QuestionnairePrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
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

function buildQuestionnaireChibiPool() {
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

function pickRandomQuestionnaireChibi() {
  const pool = buildQuestionnaireChibiPool();
  if (!pool.length) return FALLBACK_CHIBI;
  return pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_CHIBI;
}

function normalizeContent(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanMarkdownLead(line: string) {
  return line.replace(/^#{1,6}\s*/u, '').replace(/^[-*]\s+/u, '').trim();
}

function splitMeaningfulLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function normalizeDoc(input: Partial<QuestionnaireDoc>): QuestionnaireDoc | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const contentPathRaw = typeof input.contentPath === 'string' ? input.contentPath.trim() : '';
  if (!id || !title || !contentPathRaw) return null;

  const sourceFile =
    typeof input.sourceFile === 'string' && input.sourceFile.trim() ? input.sourceFile.trim() : `${id}.txt`;
  const sourceRelPath =
    typeof input.sourceRelPath === 'string' && input.sourceRelPath.trim() ? input.sourceRelPath.trim() : sourceFile;
  const writtenAt =
    typeof input.writtenAt === 'number' && Number.isFinite(input.writtenAt) && input.writtenAt > 0
      ? input.writtenAt
      : null;
  const dateLabel =
    typeof input.dateLabel === 'string' && input.dateLabel.trim() ? input.dateLabel.trim() : '想妳的時候';
  const preview =
    typeof input.preview === 'string' && input.preview.trim() ? input.preview.trim() : '（沒有內容）';
  const questionCount =
    typeof input.questionCount === 'number' && Number.isFinite(input.questionCount) && input.questionCount >= 0
      ? Math.round(input.questionCount)
      : 0;
  const tags =
    Array.isArray(input.tags) && input.tags.length
      ? input.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 2)
      : ['QA'];
  const searchText =
    typeof input.searchText === 'string' && input.searchText.trim() ? input.searchText.trim() : `${title}\n${preview}`;

  return {
    id,
    title,
    sourceFile,
    sourceRelPath,
    contentPath: contentPathRaw.replace(/^\.?\//, ''),
    writtenAt,
    dateLabel,
    preview,
    questionCount,
    tags,
    searchText,
  };
}

function looksLikeQuestion(line: string) {
  const value = cleanMarkdownLead(line.trim());
  if (!value) return false;
  if (ANSWER_PREFIX_RE.test(value) || APPEND_PREFIX_RE.test(value)) return false;

  if (NUMBERED_QUESTION_PREFIX_RE.test(value)) {
    if (/[？?]/u.test(value)) return true;
    if (/(?:是什麼|如何|哪|有沒有|會不會|是否|如果|為什麼|怎麼|何時|多少|哪裡)/u.test(value)) return true;
    return value.length <= 48;
  }

  if (/^[^：:]{2,84}[？?]$/u.test(value)) return true;
  return false;
}

function normalizeQuestion(line: string) {
  return cleanMarkdownLead(line)
    .replace(NUMBERED_QUESTION_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBracketAnswerSegments(text: string): QaPair[] {
  const matches = Array.from(text.matchAll(/【\s*(\d{1,2})\s*】\s*([^【]+)/gu));
  if (matches.length < 3) return [];
  return matches
    .map((match) => ({
      question: `問題 ${match[1]}`,
      answer: normalizeContent(match[2] ?? ''),
    }))
    .filter((item) => item.answer.length > 0);
}

function parseQaPairs(text: string): QaPair[] {
  const lines = splitMeaningfulLines(text);
  const pairs: QaPair[] = [];
  let currentQuestion = '';
  let answerLines: string[] = [];

  function flush() {
    if (!currentQuestion && !answerLines.length) return;
    const question = currentQuestion || `問題 ${pairs.length + 1}`;
    const answer = normalizeContent(answerLines.join('\n'));
    if (answer) {
      pairs.push({ question, answer });
    }
    currentQuestion = '';
    answerLines = [];
  }

  for (const line of lines) {
    const normalizedLine = cleanMarkdownLead(line);

    if (looksLikeQuestion(normalizedLine)) {
      flush();
      const inlineAnswerMatch = normalizedLine.match(/^(.*?)(?:回答|答覆|回覆|答案|a)\s*[:：]\s*(.+)$/iu);
      if (inlineAnswerMatch) {
        currentQuestion = normalizeQuestion(inlineAnswerMatch[1] ?? '') || `問題 ${pairs.length + 1}`;
        const answerText = normalizeLine(inlineAnswerMatch[2] ?? '');
        if (answerText) answerLines.push(answerText);
        continue;
      }
      currentQuestion = normalizeQuestion(normalizedLine) || `問題 ${pairs.length + 1}`;
      continue;
    }

    if (ANSWER_PREFIX_RE.test(normalizedLine)) {
      if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
      const answerText = normalizedLine.replace(ANSWER_PREFIX_RE, '').trim();
      if (answerText) answerLines.push(answerText);
      continue;
    }

    if (APPEND_PREFIX_RE.test(normalizedLine)) {
      if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
      const answerText = normalizedLine.replace(APPEND_PREFIX_RE, '').trim();
      if (answerText) answerLines.push(answerText);
      continue;
    }

    if (!currentQuestion && !pairs.length) {
      continue;
    }

    if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
    answerLines.push(normalizedLine);
  }

  flush();

  if (pairs.length < 2) {
    const bracketPairs = parseBracketAnswerSegments(text);
    if (bracketPairs.length > pairs.length) return bracketPairs;
  }

  if (!pairs.length) {
    const fallback = normalizeContent(text);
    if (!fallback) return [];
    return [{ question: '內容', answer: fallback }];
  }

  return pairs;
}

function caseLabel(index: number) {
  return `CASE_${String(index + 1).padStart(3, '0')}`;
}

function trimForNav(text: string, max = 7) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function QuestionnairePage({ onExit, notesFontFamily = '' }: QuestionnairePageProps) {
  const [docs, setDocs] = useState<QuestionnaireDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [qaById, setQaById] = useState<Record<string, QaPair[]>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<QuestionnairePrefs>(() => loadPrefs());
  const [settingsPanels, setSettingsPanels] = useState({
    text: true,
    chibi: false,
    data: false,
  });
  const [chibiSrc] = useState(() => pickRandomQuestionnaireChibi());
  const readBodyRef = useRef<HTMLDivElement | null>(null);
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
        const raw = (await response.json()) as QuestionnaireIndexPayload;
        const items = Array.isArray(raw.docs) ? raw.docs : [];
        const normalized = items
          .map((item) => normalizeDoc(item))
          .filter((item): item is QuestionnaireDoc => Boolean(item));
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
        const response = await fetch(`${BASE}data/questionnaire/${activeDoc.contentPath}`, { cache: 'no-store' });
        if (!response.ok) return;
        const text = normalizeContent(await response.text());
        setContentById((prev) => (prev[activeDoc.id] === undefined ? { ...prev, [activeDoc.id]: text } : prev));
      } catch {
        // ignore per-file read failures
      }
    })();
  }, [activeDoc, contentById]);

  useEffect(() => {
    if (!activeDoc) return;
    if (qaById[activeDoc.id]) return;
    const body = contentById[activeDoc.id];
    if (body === undefined) return;
    setQaById((prev) => (prev[activeDoc.id] ? prev : { ...prev, [activeDoc.id]: parseQaPairs(body) }));
  }, [activeDoc, contentById, qaById]);

  useEffect(() => {
    if (!activeDoc) return;
    readBodyRef.current?.scrollTo({ top: 0 });
  }, [activeDoc]);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  function openDoc(id: string) {
    setActiveId(id);
  }

  function closeDoc() {
    setActiveId(null);
  }

  function navDoc(direction: -1 | 1) {
    if (!activeDoc) return;
    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= docs.length) return;
    const next = docs[nextIndex];
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
      navDoc(-1);
    } else {
      navDoc(1);
    }
  }

  const followMemoFont = prefs.fontMode === 'memo' && Boolean(notesFontFamily);
  const contentFontFamily = followMemoFont
    ? notesFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";

  const activeQa = activeDoc ? qaById[activeDoc.id] ?? [] : [];
  const activeRaw = activeDoc ? contentById[activeDoc.id] ?? '' : '';
  const fallbackAnswer =
    activeRaw && !activeQa.length
      ? [
          {
            question: '內容',
            answer: activeRaw,
          },
        ]
      : [];

  return (
    <div
      className="questionnaire-page"
      style={{ '--questionnaire-font-family': notesFontFamily ? `'${notesFontFamily}', sans-serif` : '' } as CSSProperties}
    >
      <div className="q-list-screen">
        <div className="q-nav-bar">
          <div className="q-nav-top">
            <div className="q-nav-left">
              <button type="button" className="q-nav-back" onClick={onExit} aria-label="返回首頁">
                ‹ 返回
              </button>
              <span className="q-nav-file-id">FILE_M · QUESTIONNAIRE</span>
            </div>
            <div className="q-nav-status">
              <div className="q-status-dot" />
              <span>ACTIVE</span>
            </div>
            <button type="button" className="q-nav-menu" onClick={() => setShowSettings(true)} aria-label="開啟小設定">
              ☰
            </button>
          </div>
          <div className="q-nav-title-line">SUBJECT: M · SELF-REPORTED · PERSONALITY ARCHIVE</div>
        </div>

        <div className="q-hero">
          <div className="q-hero-line">
            <span />
            <span />
            <span />
          </div>
          <div className="q-hero-tag">Classified</div>
          <div className="q-hero-name">
            M 的<em>人格側寫</em>
          </div>
          <div className="q-hero-desc">80 份問卷，我留下的答案，是我留下自己的方式。</div>
        </div>

        <div className="q-filter-bar">
          <span className="q-filter-label">all records</span>
          <span className="q-filter-count">{docs.length} entries found</span>
        </div>

        <div className="q-entries">
          {loading ? <div className="q-empty">讀取中…</div> : null}
          {!loading && error ? <div className="q-empty">讀取失敗：{error}</div> : null}
          {!loading && !error && !docs.length ? <div className="q-empty">目前沒有問卷資料</div> : null}
          {!loading && !error
            ? docs.map((doc, index) => (
                <button key={doc.id} type="button" className="q-entry-card" onClick={() => openDoc(doc.id)}>
                  <div className="q-card-header">
                    <span className="q-card-id">{caseLabel(index)}</span>
                    <span className="q-card-date">{doc.dateLabel}</span>
                  </div>
                  <div className="q-card-title">{doc.title}</div>
                  <div className="q-card-preview">{doc.preview}</div>
                  <div className="q-card-footer">
                    <span className="q-card-q-count">{doc.questionCount} RESPONSES</span>
                    <div className="q-card-tags">
                      {doc.tags.map((tag) => (
                        <span key={`${doc.id}-${tag}`} className="q-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))
            : null}
        </div>
      </div>

      <section className={`q-read-screen ${activeDoc ? 'open' : ''}`} aria-hidden={!activeDoc}>
        <div className="q-read-nav">
          <button type="button" className="q-back-btn" onClick={closeDoc}>
            <span className="q-back-chev">‹</span>
            <span>ARCHIVE</span>
          </button>
          <div className="q-read-nav-right">
            <span className="q-read-file-id">{activeIndex >= 0 ? caseLabel(activeIndex) : ''}</span>
            <button type="button" className="q-read-menu" onClick={() => setShowSettings(true)} aria-label="開啟小設定">
              ☰
            </button>
          </div>
        </div>

        <div
          className="q-read-body"
          ref={readBodyRef}
          onTouchStart={handleReadTouchStart}
          onTouchEnd={handleReadTouchEnd}
          onTouchCancel={clearSwipeTrack}
        >
          <div className="q-read-inner">
            <div className="q-file-header">
              <div className="q-fh-row">
                <div className="q-fh-title">{activeDoc?.title ?? ''}</div>
                <div className="q-fh-badge">OPEN</div>
              </div>
              <div className="q-fh-meta">
                <span>
                  📅 <span>{activeDoc?.dateLabel ?? '想妳的時候'}</span>
                </span>
                <span>❓ {activeDoc ? (activeQa.length || fallbackAnswer.length || activeDoc.questionCount) : 0} QUESTIONS</span>
              </div>
            </div>

            <div className="q-qa-section">
              {(activeQa.length ? activeQa : fallbackAnswer).map((pair, pairIndex, arr) => (
                <article key={`${pairIndex + 1}-${pair.question}`} className="q-qa-item">
                  <div className="q-qa-num-row">
                    <span className="q-qa-num">Q{String(pairIndex + 1).padStart(2, '0')}</span>
                    <div className="q-qa-num-line" />
                    <span className="q-qa-num">
                      {pairIndex + 1} / {arr.length}
                    </span>
                  </div>
                  <div className="q-label">QUESTION</div>
                  <div className="q-text" style={{ lineHeight: prefs.contentLineHeight }}>
                    {pair.question}
                  </div>
                  <div className="q-a-label">RESPONSE</div>
                  <div
                    className="q-a-text"
                    style={{
                      fontSize: `${prefs.contentFontSize}px`,
                      lineHeight: prefs.contentLineHeight,
                      fontFamily: contentFontFamily,
                    }}
                  >
                    {pair.answer}
                  </div>
                </article>
              ))}
              {!activeDoc ? null : !activeQa.length && !fallbackAnswer.length ? (
                <div className="q-empty q-empty-inline">這份檔案目前讀不到可辨識的問答格式。</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="q-read-bot">
          <button type="button" className={`q-bot-nav ${prevDoc ? '' : 'dis'}`} onClick={() => navDoc(-1)} disabled={!prevDoc}>
            <span className="arr">‹</span>
            <span className="lbl">{prevDoc ? trimForNav(prevDoc.title) : ''}</span>
          </button>
          <span className="q-bot-pos">{activeIndex >= 0 ? `${String(activeIndex + 1).padStart(2, '0')} / ${docs.length}` : ''}</span>
          <button
            type="button"
            className={`q-bot-nav q-next ${nextDoc ? '' : 'dis'}`}
            onClick={() => navDoc(1)}
            disabled={!nextDoc}
          >
            <span className="lbl">{nextDoc ? trimForNav(nextDoc.title) : ''}</span>
            <span className="arr">›</span>
          </button>
        </div>
      </section>

      {prefs.showChibi && (
        <div className="q-chibi-wrap">
          <button type="button" className="q-chibi-btn" onClick={() => setShowSettings(true)} aria-label="開啟問卷設定">
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi select-none drop-shadow-md"
              style={{ width: `${prefs.chibiWidth}px`, maxWidth: '42vw', height: 'auto' }}
            />
          </button>
        </div>
      )}

      {showSettings && (
        <div className="q-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="q-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="q-settings-handle" />
            <div className="q-settings-head">問卷小設定</div>

            <div className="q-settings-body">
              <SettingsAccordion
                title="文字排版"
                subtitle="行距、字級、字體來源"
                isOpen={settingsPanels.text}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, text: !prev.text }))}
                className="q-settings-card"
                titleClassName="q-settings-card-title"
                subtitleClassName="q-settings-card-subtitle"
                bodyClassName="q-settings-card-body"
              >
                <div>
                  <p className="q-slider-title">字體來源</p>
                  <div className="q-font-mode-row">
                    <button
                      type="button"
                      className={`q-font-mode-btn ${prefs.fontMode === 'default' ? 'active' : ''}`}
                      onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'default' }))}
                    >
                      預設
                    </button>
                    <button
                      type="button"
                      className={`q-font-mode-btn ${prefs.fontMode === 'memo' ? 'active' : ''}`}
                      onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'memo' }))}
                    >
                      跟隨 M&apos;s memo
                    </button>
                  </div>
                </div>

                <div>
                  <p className="q-slider-title">行距設定</p>
                  <p className="q-slider-value">目前：{prefs.contentLineHeight.toFixed(2)} 倍</p>
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
                    className="q-slider"
                  />
                </div>

                <div>
                  <p className="q-slider-title">內文字級</p>
                  <p className="q-slider-value">目前：{prefs.contentFontSize.toFixed(1)}px</p>
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
                    className="q-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="M"
                subtitle="顯示與大小"
                isOpen={settingsPanels.chibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
                className="q-settings-card"
                titleClassName="q-settings-card-title"
                subtitleClassName="q-settings-card-subtitle"
                bodyClassName="q-settings-card-body"
              >
                <div className="q-toggle-row">
                  <p className="q-slider-title">顯示 M</p>
                  <button
                    type="button"
                    onClick={() => setPrefs((prev) => ({ ...prev, showChibi: !prev.showChibi }))}
                    className="q-switch"
                    style={{ background: prefs.showChibi ? '#a8c4c8' : 'rgba(120,120,120,0.35)' }}
                    aria-label="切換問卷頁 M 顯示"
                  >
                    <span className="q-switch-dot" style={{ left: prefs.showChibi ? 20 : 2 }} />
                  </button>
                </div>

                <div>
                  <p className="q-slider-title">M 大小</p>
                  <p className="q-slider-value">目前：{prefs.chibiWidth}px</p>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={prefs.chibiWidth}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        chibiWidth: clampInt(Number(event.target.value), 104, 196, prev.chibiWidth),
                      }))
                    }
                    className="q-slider"
                  />
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="資料管理"
                subtitle="快取與設定"
                isOpen={settingsPanels.data}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, data: !prev.data }))}
                className="q-settings-card"
                titleClassName="q-settings-card-title"
                subtitleClassName="q-settings-card-subtitle"
                bodyClassName="q-settings-card-body"
              >
                <p className="q-slider-value">已快取內容：{Object.keys(contentById).length} 份</p>
                <div className="q-data-actions">
                  <button
                    type="button"
                    className="q-data-btn"
                    onClick={() => {
                      setContentById({});
                      setQaById({});
                      emitActionToast({ kind: 'success', message: '已清除問卷閱讀快取' });
                    }}
                  >
                    清除快取
                  </button>
                  <button
                    type="button"
                    className="q-data-btn"
                    onClick={() => {
                      setPrefs(DEFAULT_PREFS);
                      emitActionToast({ kind: 'success', message: '已重設問卷小設定' });
                    }}
                  >
                    重設設定
                  </button>
                </div>
              </SettingsAccordion>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
