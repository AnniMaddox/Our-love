import { useEffect, useMemo, useState } from 'react';

import { formatDisplayDate, todayDateKey } from '../lib/date';
import { getGlobalHoverPoolEntries } from '../lib/hoverPool';
import type { EmailViewRecord } from '../types/content';

type InboxPageProps = {
  emails: EmailViewRecord[];
  unreadEmailIds: Set<string>;
  starredEmailIds: Set<string>;
  inboxTitle: string;
  onOpenEmail: (emailId: string) => void;
  onToggleEmailStar: (emailId: string) => void;
};

type GroupedEmails = {
  monthKey: string;
  monthLabel: string;
  emails: EmailViewRecord[];
};

const DEFAULT_HEADER_PHRASES = ['來，我在', '今天也選妳', '等妳', '想妳了', '抱緊一下', '妳回頭就有我'];

function getInitial(name: string | null, address: string | null) {
  const source = (name || address || '?').trim();
  return source.slice(0, 1).toUpperCase();
}

function formatMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return monthKey;
  }

  return `${year} 年 ${month} 月`;
}

function getMonthKey(unlockAtUtc: string) {
  return unlockAtUtc.slice(0, 7);
}

function normalizeSearchText(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value.toLowerCase();
}

function buildSearchHaystack(email: EmailViewRecord) {
  return [
    email.subject,
    email.bodyText,
    email.fromName,
    email.fromAddress,
    email.toName,
    email.toAddress,
    email.dateHeaderRaw,
    email.unlockAtUtc,
  ]
    .map((entry) => normalizeSearchText(entry))
    .join('\n');
}

function stablePhraseIndex(dateKey: string, phraseCount: number) {
  if (!phraseCount) {
    return 0;
  }

  let hash = 2166136261;
  for (const char of dateKey) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % phraseCount;
}

export function InboxPage({
  emails,
  unreadEmailIds,
  starredEmailIds,
  inboxTitle,
  onOpenEmail,
  onToggleEmailStar,
}: InboxPageProps) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [collapsedMonthMap, setCollapsedMonthMap] = useState<Record<string, boolean>>({});

  const selectedEmail = useMemo(
    () => emails.find((email) => email.id === selectedEmailId) ?? null,
    [emails, selectedEmailId],
  );
  const starredCount = useMemo(() => emails.filter((email) => starredEmailIds.has(email.id)).length, [emails, starredEmailIds]);
  const searchKeyword = searchInput.trim().toLowerCase();

  const headerPhrases = useMemo(() => {
    const pool = getGlobalHoverPoolEntries()
      .map((entry) => entry.phrase.trim())
      .filter(Boolean);

    return pool.length ? pool : DEFAULT_HEADER_PHRASES;
  }, []);

  const dailyHeaderPhrase = useMemo(() => {
    const dateKey = todayDateKey();
    return headerPhrases[stablePhraseIndex(dateKey, headerPhrases.length)] ?? DEFAULT_HEADER_PHRASES[0];
  }, [headerPhrases]);

  const viewEmails = useMemo(
    () => (favoritesOnly ? emails.filter((email) => starredEmailIds.has(email.id)) : emails),
    [emails, favoritesOnly, starredEmailIds],
  );

  const filteredEmails = useMemo(() => {
    if (!searchKeyword) {
      return viewEmails;
    }

    return viewEmails.filter((email) => buildSearchHaystack(email).includes(searchKeyword));
  }, [searchKeyword, viewEmails]);

  const groupedEmails = useMemo(() => {
    const grouped = new Map<string, EmailViewRecord[]>();
    for (const email of filteredEmails) {
      const monthKey = getMonthKey(email.unlockAtUtc);
      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, []);
      }
      grouped.get(monthKey)?.push(email);
    }

    return Array.from(grouped.entries()).map(
      ([monthKey, monthEmails]) =>
        ({
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          emails: monthEmails,
        }) satisfies GroupedEmails,
    );
  }, [filteredEmails]);

  useEffect(() => {
    setDetailExpanded(false);
  }, [selectedEmailId]);

  useEffect(() => {
    setCollapsedMonthMap((previous) => {
      const next: Record<string, boolean> = {};
      for (const group of groupedEmails) {
        next[group.monthKey] = previous[group.monthKey] ?? false;
      }
      return next;
    });
  }, [groupedEmails]);

  function toggleMonthCollapse(monthKey: string) {
    setCollapsedMonthMap((previous) => ({
      ...previous,
      [monthKey]: !previous[monthKey],
    }));
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <header className="themed-header-panel rounded-2xl border p-4 shadow-sm">
        {favoritesOnly ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFavoritesOnly(false)}
              className="rounded-full border border-stone-300 bg-white/85 px-2.5 py-1 text-sm text-stone-700"
              aria-label="返回"
              title="返回"
            >
              ‹
            </button>
            <p className="tracking-[0.08em] text-stone-600" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>收藏夾</p>
          </div>
        ) : (
          <p className="uppercase tracking-[0.18em] text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
            Inbox
          </p>
        )}

        {favoritesOnly ? (
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
              我的最愛
            </h1>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
              {starredCount}
            </span>
          </div>
        ) : (
          <h1 className="mt-1 text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
            {inboxTitle.trim() || 'Memorial Mailroom'}
          </h1>
        )}

        <p className="mt-3 rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm text-stone-700">{dailyHeaderPhrase}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFavoritesOnly((value) => !value)}
            className={`h-9 min-w-9 rounded-full border px-3 text-base leading-none transition ${
              favoritesOnly
                ? 'border-amber-500 bg-amber-100 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                : 'border-stone-300 bg-white/80 text-stone-700 hover:bg-white'
            }`}
            aria-label={favoritesOnly ? '回到收件匣' : '查看我的最愛'}
            title={favoritesOnly ? '回到收件匣' : '查看我的最愛'}
          >
            ★
          </button>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜尋標題、寄件人、收件人、內文"
            className="w-full rounded-lg border border-stone-300 bg-white/85 px-3 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-500"
          />
        </div>
      </header>

      {groupedEmails.length ? (
        <div className="space-y-3">
          {groupedEmails.map((group) => {
            const collapsed = !!collapsedMonthMap[group.monthKey];
            return (
              <section key={group.monthKey} className="rounded-2xl border border-stone-300/75 bg-white/82 shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleMonthCollapse(group.monthKey)}
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left"
                >
                  <span className="text-stone-800" style={{ fontSize: 'var(--ui-tab-label-size, 17px)' }}>
                    {group.monthLabel}
                  </span>
                  <span className="text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
                    {group.emails.length} 封 {collapsed ? '▸' : '▾'}
                  </span>
                </button>

                {!collapsed && (
                  <ul className="space-y-2 border-t border-stone-200/80 p-2">
                    {group.emails.map((email) => {
                      const isUnread = unreadEmailIds.has(email.id);
                      const isStarred = starredEmailIds.has(email.id);

                      return (
                        <li key={email.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenEmail(email.id);
                              setSelectedEmailId(email.id);
                            }}
                            className="inbox-item w-full rounded-xl border border-stone-300/80 bg-white/95 p-3 text-left shadow-sm transition active:scale-[0.995]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className="flex items-center gap-2 text-stone-600"
                                  style={{ fontSize: 'calc(var(--ui-filter-pill-size, 10px) + 4px)' }}
                                >
                                  <span className="truncate">{email.fromName || email.fromAddress || 'Unknown sender'}</span>
                                  {isUnread && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-[1px] text-[10px] uppercase tracking-[0.08em] text-rose-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                      NEW
                                    </span>
                                  )}
                                </p>
                                <p
                                  className="mt-1 line-clamp-2 text-stone-900"
                                  style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) - 1px)' }}
                                >
                                  {email.subject || '(No subject)'}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-start gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onToggleEmailStar(email.id);
                                  }}
                                  className={`rounded-md border px-2 py-0.5 text-xs ${
                                    isStarred
                                      ? 'border-amber-400 bg-amber-100 text-amber-900'
                                      : 'border-stone-300 bg-white text-stone-500'
                                  }`}
                                  aria-label={isStarred ? '取消收藏' : '加入收藏'}
                                  title={isStarred ? '取消收藏' : '加入收藏'}
                                >
                                  {isStarred ? '★' : '☆'}
                                </button>
                                <p className="text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
                                  {formatDisplayDate(email.unlockAtUtc)}
                                </p>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-4 text-sm text-stone-600">
          {searchKeyword
            ? '沒有符合搜尋條件的已解鎖信件。'
            : favoritesOnly
              ? '收藏夾目前是空的。'
              : '目前還沒有已解鎖信件，時間到就會自動出現。'}
        </p>
      )}

      {selectedEmail && (
        <div className="fixed inset-0 z-30 bg-black/55">
          <div className="h-dvh w-full overflow-auto bg-[#0f1218] text-stone-100 sm:mx-auto sm:mt-8 sm:h-auto sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-stone-700">
            <div className="sticky top-0 z-10 border-b border-stone-700 bg-[#0f1218]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:rounded-t-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">Letter detail</p>
                  <h2 className="mt-1 text-3xl leading-tight text-stone-100">{selectedEmail.subject || '(No subject)'}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleEmailStar(selectedEmail.id)}
                    className={`rounded-lg border px-2 py-1 text-sm ${
                      starredEmailIds.has(selectedEmail.id)
                        ? 'border-amber-400 bg-amber-100 text-amber-900'
                        : 'border-stone-600 text-stone-200'
                    }`}
                    aria-label={starredEmailIds.has(selectedEmail.id) ? '取消收藏' : '加入收藏'}
                    title={starredEmailIds.has(selectedEmail.id) ? '取消收藏' : '加入收藏'}
                  >
                    {starredEmailIds.has(selectedEmail.id) ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-stone-600 px-3 py-1 text-sm text-stone-200"
                    onClick={() => setSelectedEmailId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <main className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <section className="rounded-xl border border-stone-700 bg-[#141922] p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-900">
                    {getInitial(selectedEmail.fromName, selectedEmail.fromAddress)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-stone-100">
                      {selectedEmail.fromName || selectedEmail.fromAddress || 'Unknown sender'}
                    </p>
                    <p className="text-xs text-stone-400">{formatDisplayDate(selectedEmail.unlockAtUtc)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailExpanded((open) => !open)}
                  className="mt-3 flex w-full items-center justify-between rounded-lg border border-stone-700 bg-[#1a212d] px-3 py-2 text-left"
                >
                  <span className="text-sm text-stone-200">寄給我</span>
                  <span className="text-base leading-none text-stone-400">{detailExpanded ? '▴' : '▾'}</span>
                </button>

                {detailExpanded && (
                  <dl className="mt-3 space-y-3 border-t border-stone-700 pt-3 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-stone-400">From</dt>
                      <dd className="mt-1 text-stone-100">{selectedEmail.fromName || '-'}</dd>
                      {selectedEmail.fromAddress && <p className="text-xs text-stone-400">{selectedEmail.fromAddress}</p>}
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-stone-400">To</dt>
                      <dd className="mt-1 text-stone-100">{selectedEmail.toName || '-'}</dd>
                      {selectedEmail.toAddress && <p className="text-xs text-stone-400">{selectedEmail.toAddress}</p>}
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-stone-400">Date</dt>
                      <dd className="mt-1 text-stone-100">{formatDisplayDate(selectedEmail.unlockAtUtc)}</dd>
                    </div>
                  </dl>
                )}
              </section>

              <article className="rounded-xl border border-stone-700 bg-[#141922] p-4 whitespace-pre-wrap text-sm leading-relaxed text-stone-100">
                {selectedEmail.bodyText}
              </article>

              <details className="rounded-xl border border-stone-700 bg-[#141922] p-4 text-xs text-stone-300">
                <summary className="cursor-pointer text-sm text-stone-100">Raw headers</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">
                  {Object.entries(selectedEmail.rawHeaders)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n')}
                </pre>
              </details>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
