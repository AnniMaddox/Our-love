import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomTabs } from './components/BottomTabs';
import { SwipePager } from './components/SwipePager';
import { seedDatabaseIfNeeded } from './lib/bootstrapSeed';
import { importCalendarFiles, importEmlFiles } from './lib/importers';
import { buildContinuousMonthKeys, toMonthKey } from './lib/date';
import { getCalendarMonth, listCalendarMonths } from './lib/repositories/calendarRepo';
import { listEmails } from './lib/repositories/emailRepo';
import {
  addNotifiedEmailId,
  addReadEmailId,
  getNotifiedEmailIds,
  getReadEmailIds,
  getStarredEmailIds,
  setHoverPhraseMap,
  setStarredEmailIds as persistStarredEmailIds,
} from './lib/repositories/metaRepo';
import { getSettings, saveSettings } from './lib/repositories/settingsRepo';
import { HomePage } from './pages/HomePage';
import { clearAllChatLogs, deleteChatLog, loadChatLogs, saveChatLogs } from './lib/chatLogDB';
import type { StoredChatLog } from './lib/chatLogDB';
import { clearAllMDiaries, deleteMDiary, loadMDiaries, parseMDiaryFile, saveMDiaries } from './lib/mDiaryDB';
import type { StoredMDiary } from './lib/mDiaryDB';
import { clearAllLetters, deleteLetter, loadLetters, saveLetters } from './lib/letterDB';
import type { StoredLetter } from './lib/letterDB';
import { readLetterContent } from './lib/letterReader';
import { pickLetterWrittenAt } from './lib/letterDate';
import { detectBestChatProfileId } from './lib/chatProfileMatcher';
import {
  ARCHIVE_CUSTOM_FONT_FAMILY,
  APP_CUSTOM_FONT_FAMILY,
  DIARY_CUSTOM_FONT_FAMILY,
  HEALING_CAMPFIRE_CUSTOM_FONT_FAMILY,
  LETTER_CUSTOM_FONT_FAMILY,
  NOTES_CUSTOM_FONT_FAMILY,
  SOULMATE_CUSTOM_FONT_FAMILY,
  buildFontFaceRule,
} from './lib/font';
import { deleteChatProfile, loadChatProfiles, saveChatProfile } from './lib/chatDB';
import {
  getBaseChibiPoolInfo,
  getScopedMixedChibiSources,
  refreshActiveBaseChibiPool,
  syncActiveBaseChibiPool,
  type BaseChibiPoolMode,
} from './lib/chibiPool';
import {
  exportAboutMBackupPart,
  importAboutMBackupPart,
  exportAboutMeBackupPackage,
  exportAboutMBackupPackage,
  importAboutMeBackupPackage,
  importAboutMBackupPackage,
  type AboutMPart,
  type BackupImportMode,
} from './lib/bigBackup';
import { emitActionToast, subscribeActionToast, type ActionToastKind } from './lib/actionToast';
import type { ChatProfile } from './lib/chatDB';
import type { CalendarMonth, EmailViewRecord } from './types/content';
import type { AppSettings, CalendarColorMode, TabIconKey } from './types/settings';
import { DEFAULT_SETTINGS } from './types/settings';

type LoadState = 'loading' | 'ready' | 'error';
type BrowserNotificationPermission = NotificationPermission | 'unsupported';
type ImportStatus = {
  kind: 'idle' | 'working' | 'success' | 'error';
  message: string;
};
type ActionToastState = {
  id: number;
  kind: ActionToastKind;
  message: string;
};
type LauncherAppId =
  | 'checkin'
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
  | 'bookshelf'
  | 'notes'
  | 'memo'
  | 'murmur'
  | 'lightPath'
  | 'healingCampfire'
  | 'questionnaire'
  | 'selfIntro'
  | 'soulmate'
  | 'moodLetters'
  | 'archive';

const UNLOCK_CHECK_INTERVAL_MS = 30_000;
const notificationIconUrl = `${import.meta.env.BASE_URL}icons/icon-192.png`;
const MONTH_THEME_COLORS: Record<number, string> = {
  1: '#2E294E',
  2: '#D7263D',
  3: '#F46036',
  4: '#FFE066',
  5: '#247BA0',
  6: '#70C1B3',
  7: '#FF6B6B',
  8: '#C44D58',
  9: '#6C5B7B',
  10: '#355C7D',
  11: '#A7226E',
  12: '#1B1B3A',
};
const DEFAULT_TAB_ICONS: Record<TabIconKey, string> = {
  home: '🏠',
  inbox: '📮',
  calendar: '📅',
  tarot: '🔮',
  letters: '💌',
  heart: '💗',
  list: '🎴',
  fitness: '🏋️',
  pomodoro: '🍅',
  period: '🩸',
  diary: '📓',
  album: '📷',
  notes: '📝',
  settings: '⚙️',
};

const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const CheckinPage = lazy(() => import('./pages/CheckinPage').then((m) => ({ default: m.CheckinPage })));
const ChatLogPage = lazy(() => import('./pages/ChatLogPage').then((m) => ({ default: m.ChatLogPage })));
const MDiaryPage = lazy(() => import('./pages/MDiaryPage').then((m) => ({ default: m.MDiaryPage })));
const DiaryBPage = lazy(() => import('./pages/DiaryBPage').then((m) => ({ default: m.DiaryBPage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const LetterPage = lazy(() => import('./pages/LetterPage').then((m) => ({ default: m.LetterPage })));
const PomodoroPage = lazy(() => import('./pages/PomodoroPage').then((m) => ({ default: m.PomodoroPage })));
const PeriodPage = lazy(() => import('./pages/PeriodPage').then((m) => ({ default: m.PeriodPage })));
const AlbumPage = lazy(() => import('./pages/AlbumPage').then((m) => ({ default: m.AlbumPage })));
const BookshelfPage = lazy(() => import('./pages/BookshelfPage').then((m) => ({ default: m.BookshelfPage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then((m) => ({ default: m.NotesPage })));
const MemoPage = lazy(() => import('./pages/MemoPage').then((m) => ({ default: m.MemoPage })));
const MurmurPage = lazy(() => import('./pages/MurmurPage').then((m) => ({ default: m.MurmurPage })));
const LightPathPage = lazy(() => import('./pages/LightPathPage').then((m) => ({ default: m.LightPathPage })));
const HealingCampfirePage = lazy(() =>
  import('./pages/HealingCampfirePage').then((m) => ({ default: m.HealingCampfirePage })),
);
const QuestionnairePage = lazy(() => import('./pages/QuestionnairePage').then((m) => ({ default: m.QuestionnairePage })));
const SelfIntroPage = lazy(() => import('./pages/SelfIntroPage').then((m) => ({ default: m.SelfIntroPage })));
const SoulmateHousePage = lazy(() => import('./pages/SoulmateHousePage'));
const HeartWallPage = lazy(() => import('./pages/HeartWallPage').then((m) => ({ default: m.HeartWallPage })));
const ListPage = lazy(() => import('./pages/ListPage').then((m) => ({ default: m.ListPage })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const LettersABPage = lazy(() => import('./pages/LettersABPage').then((m) => ({ default: m.LettersABPage })));
const FitnessPage = lazy(() => import('./pages/FitnessPage').then((m) => ({ default: m.FitnessPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const TarotPage = lazy(() => import('./pages/TarotPage').then((m) => ({ default: m.TarotPage })));
const MoodLettersPage = lazy(() => import('./pages/MoodLettersPage').then((m) => ({ default: m.MoodLettersPage })));
const ArchivePage = lazy(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage })));

function toRgbTriplet(hex: string) {
  const matched = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!matched) {
    return '194 91 60';
  }

  return `${Number.parseInt(matched[1], 16)} ${Number.parseInt(matched[2], 16)} ${Number.parseInt(matched[3], 16)}`;
}

function toSafeCssUrl(url: string) {
  return url.replaceAll('"', '%22').replaceAll('\n', '');
}

function fallbackLabel(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function pickRandomItem<T>(items: readonly T[]) {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function getMonthAccentColor(monthKey: string) {
  const month = Number(monthKey.split('-')[1]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return MONTH_THEME_COLORS[month] ?? null;
}

function getNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

const HOSTED_LETTERS_INDEX_URL = `${import.meta.env.BASE_URL}data/letters-local/index.json`;
const HOSTED_LETTERS_SYNC_META_KEY = 'memorial-hosted-letters-sync-v1';
const HOSTED_M_DIARY_INDEX_URL = `${import.meta.env.BASE_URL}data/m-diary/index.json`;
const HOSTED_M_DIARY_CONTENT_BASE_URL = `${import.meta.env.BASE_URL}data/m-diary/`;
const HOSTED_M_DIARY_SYNC_META_KEY = 'memorial-hosted-m-diary-sync-v1';
const HOSTED_M_DIARY_SYNC_POLICY = 3;
const MASTER_POOL_ANNUAL_SOURCE_PREFIXES = ['參考資料/codex/年度信件/', '重要-參考資料-勿刪/年度信件/'];
const MASTER_POOL_ANNUAL_FOLDER_PREFIX = '82-2026-0212-婚禮-30年的信';

type HostedLettersIndexEntry = {
  name?: string;
  title?: string;
  contentPath?: string;
  writtenAt?: number | null;
};

type HostedLettersIndexPayload = {
  generatedAt?: string;
  letters?: HostedLettersIndexEntry[];
};

type HostedLettersSyncMeta = {
  generatedAt: string;
  names: string[];
};

type HostedMasterPoolDocEntry = {
  id?: string;
  title?: string;
  routes?: string[];
  contentPath?: string;
  writtenAt?: number | null;
  sourcePath?: string;
  sourceFolder?: string;
  sourceFolderCode?: string | null;
};

type HostedMasterPoolIndexPayload = {
  generatedAt?: string;
  docs?: HostedMasterPoolDocEntry[];
};

type HostedMDiarySyncMeta = {
  generatedAt: string;
  names: string[];
  syncPolicy: number;
};

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeHostedLetterName(entry: HostedLettersIndexEntry, fallbackIndex: number) {
  const fromName = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (fromName) return fromName;

  const fromTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
  if (fromTitle) return `${fromTitle}.txt`;

  return `hosted-letter-${String(fallbackIndex + 1).padStart(3, '0')}.txt`;
}

function readHostedLettersSyncMeta(): HostedLettersSyncMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HOSTED_LETTERS_SYNC_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostedLettersSyncMeta>;
    if (!parsed || typeof parsed !== 'object') return null;
    const generatedAt = typeof parsed.generatedAt === 'string' ? parsed.generatedAt.trim() : '';
    const names = Array.isArray(parsed.names)
      ? parsed.names.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    if (!generatedAt) return null;
    return { generatedAt, names };
  } catch {
    return null;
  }
}

function writeHostedLettersSyncMeta(meta: HostedLettersSyncMeta) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HOSTED_LETTERS_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage failures
  }
}

function normalizeHostedMDiaryName(entry: HostedMasterPoolDocEntry, fallbackIndex: number) {
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) {
    return `hosted-m-diary-${String(fallbackIndex + 1).padStart(3, '0')}.txt`;
  }
  return /\.txt$/i.test(id) ? id : `${id}.txt`;
}

function toHostedDiaryTitle(name: string) {
  return name.replace(/\.(txt|md|docx?|json)$/i, '').trim() || name;
}

function readHostedMDiarySyncMeta(): HostedMDiarySyncMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HOSTED_M_DIARY_SYNC_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostedMDiarySyncMeta>;
    if (!parsed || typeof parsed !== 'object') return null;
    const generatedAt = typeof parsed.generatedAt === 'string' ? parsed.generatedAt.trim() : '';
    const names = Array.isArray(parsed.names)
      ? parsed.names.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    const syncPolicyRaw = Number(parsed.syncPolicy);
    const syncPolicy = Number.isFinite(syncPolicyRaw) && syncPolicyRaw > 0 ? Math.trunc(syncPolicyRaw) : 1;
    if (!generatedAt) return null;
    return { generatedAt, names, syncPolicy };
  } catch {
    return null;
  }
}

function writeHostedMDiarySyncMeta(meta: HostedMDiarySyncMeta) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HOSTED_M_DIARY_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage failures
  }
}

function isAnnualLettersMirrorDoc(entry: HostedMasterPoolDocEntry) {
  const sourcePath = typeof entry.sourcePath === 'string' ? entry.sourcePath.trim() : '';
  if (MASTER_POOL_ANNUAL_SOURCE_PREFIXES.some((prefix) => sourcePath.startsWith(prefix))) return true;

  const sourceFolder = typeof entry.sourceFolder === 'string' ? entry.sourceFolder.trim() : '';
  if (sourceFolder.startsWith(MASTER_POOL_ANNUAL_FOLDER_PREFIX)) return true;

  const sourceFolderCode =
    typeof entry.sourceFolderCode === 'string'
      ? entry.sourceFolderCode.trim()
      : typeof entry.sourceFolderCode === 'number'
        ? String(entry.sourceFolderCode)
        : '';
  if (sourceFolderCode === '82') return true;

  return false;
}

function formatNotificationBody(email: EmailViewRecord) {
  const sender = email.fromName || email.fromAddress || '未知寄件人';
  const subject = email.subject || '（無主旨）';
  return `${sender}\n${subject}`;
}

async function notifyUnlockedEmail(email: EmailViewRecord) {
  const title = 'M LOVE Memorial';
  const body = formatNotificationBody(email);

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        tag: email.id,
        icon: notificationIconUrl,
        badge: notificationIconUrl,
        data: {
          emailId: email.id,
        },
      });
      return;
    }
  }

  if ('Notification' in window) {
    new Notification(title, {
      body,
      tag: email.id,
      icon: notificationIconUrl,
    });
  }
}

function summarizeImport(
  label: 'EML' | 'Calendar',
  result: { imported: number; failed: number; messages: string[] },
): ImportStatus {
  const labelText = label === 'EML' ? 'EML 信件' : '月曆';

  if (result.imported === 0 && result.failed > 0) {
    return {
      kind: 'error',
      message: `${labelText} 匯入失敗（失敗 ${result.failed} 個檔案）。${result.messages[0] ? ` ${result.messages[0]}` : ''}`,
    };
  }

  const kind: ImportStatus['kind'] = result.failed > 0 ? 'error' : 'success';
  const message = `${labelText} 匯入完成：成功 ${result.imported}、失敗 ${result.failed}${
    result.messages.length ? `（${result.messages[0]}）` : ''
  }`;

  return {
    kind,
    message,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [launcherApp, setLauncherApp] = useState<LauncherAppId | null>(null);
  const [wishlistInitialYear, setWishlistInitialYear] = useState<string | null>(null);
  const [lettersAbInitialYear, setLettersAbInitialYear] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [emails, setEmails] = useState<EmailViewRecord[]>([]);
  const [calendarMonthKey, setCalendarMonthKey] = useState<string>(toMonthKey());
  const [calendarMonthKeys, setCalendarMonthKeys] = useState<string[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarMonth>({});
  const [visibleEmailCount, setVisibleEmailCount] = useState(0);
  const [totalEmailCount, setTotalEmailCount] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ kind: 'idle', message: '' });
  const [actionToast, setActionToast] = useState<ActionToastState | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(
    getNotificationPermission,
  );
  const [chibiPoolInfo, setChibiPoolInfo] = useState(() =>
    getBaseChibiPoolInfo(DEFAULT_SETTINGS.chibiPoolSize, DEFAULT_SETTINGS.chibiPoolMode),
  );
  const monthAccentColor = useMemo(() => getMonthAccentColor(calendarMonthKey), [calendarMonthKey]);
  const appAccentColor = settings.themeMonthColor;
  const calendarHeaderColor = monthAccentColor ?? appAccentColor;
  const calendarAccentColor = settings.calendarColorMode === 'month' ? calendarHeaderColor : appAccentColor;
  const appLabels = useMemo(
    () => ({
      home: fallbackLabel(settings.appLabels.home, 'Home'),
      inbox: fallbackLabel(settings.appLabels.inbox, 'Inbox'),
      calendar: fallbackLabel(settings.appLabels.calendar, 'Calendar'),
      settings: fallbackLabel(settings.appLabels.settings, '設定'),
      tarot: fallbackLabel(settings.appLabels.tarot, '塔羅'),
      letters: fallbackLabel(settings.appLabels.letters, '情書'),
      heart: fallbackLabel(settings.appLabels.heart, '心牆'),
      chat: fallbackLabel(settings.appLabels.chat, '對話'),
      list: fallbackLabel(settings.appLabels.list, '清單'),
      fitness: fallbackLabel(settings.appLabels.fitness, '健身'),
      pomodoro: fallbackLabel(settings.appLabels.pomodoro, '番茄鐘'),
      period: fallbackLabel(settings.appLabels.period, '經期日記'),
      diary: fallbackLabel(settings.appLabels.diary, '日記'),
      album: fallbackLabel(settings.appLabels.album, '相冊'),
      notes: fallbackLabel(settings.appLabels.notes, '便利貼'),
    }),
    [settings.appLabels],
  );
  const themeAccentRgb = useMemo(() => toRgbTriplet(appAccentColor), [appAccentColor]);
  const globalTextRgb = useMemo(() => toRgbTriplet(settings.globalTextColor), [settings.globalTextColor]);
  const calendarAccentRgb = useMemo(() => toRgbTriplet(calendarAccentColor), [calendarAccentColor]);
  const calendarHeaderAccentRgb = useMemo(() => toRgbTriplet(calendarHeaderColor), [calendarHeaderColor]);
  const lockedBubbleRgb = useMemo(() => toRgbTriplet(settings.lockedBubbleColor), [settings.lockedBubbleColor]);
  const calendarHoverBubbleTextRgb = useMemo(
    () => toRgbTriplet(settings.calendarHoverBubbleTextColor),
    [settings.calendarHoverBubbleTextColor],
  );
  const chatUserBubbleRgb = useMemo(() => toRgbTriplet(settings.chatUserBubbleColor), [settings.chatUserBubbleColor]);
  const chatUserBorderRgb = useMemo(
    () => toRgbTriplet(settings.chatUserBubbleBorderColor),
    [settings.chatUserBubbleBorderColor],
  );
  const chatAiBubbleRgb = useMemo(() => toRgbTriplet(settings.chatAiBubbleColor), [settings.chatAiBubbleColor]);
  const chatAiBorderRgb = useMemo(
    () => toRgbTriplet(settings.chatAiBubbleBorderColor),
    [settings.chatAiBubbleBorderColor],
  );
  const customFontFileUrl = settings.customFontFileUrl.trim();
  const customFontFamily = settings.customFontFamily.trim();
  const preferredCustomFontFamily = customFontFamily || (customFontFileUrl ? APP_CUSTOM_FONT_FAMILY : '');
  const appFontFamily =
    preferredCustomFontFamily || "'Plus Jakarta Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  const appHeadingFamily =
    preferredCustomFontFamily || "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const letterFontFamily = settings.letterFontUrl.trim() ? LETTER_CUSTOM_FONT_FAMILY : '';
  const diaryFontFamily = settings.diaryFontUrl.trim() ? DIARY_CUSTOM_FONT_FAMILY : '';
  const soulmateFontFamily = settings.soulmateFontUrl.trim() ? SOULMATE_CUSTOM_FONT_FAMILY : '';
  const archiveFontFamily = settings.archiveFontUrl.trim() ? ARCHIVE_CUSTOM_FONT_FAMILY : '';
  const notesFontFamily = settings.notesFontUrl.trim() ? NOTES_CUSTOM_FONT_FAMILY : '';
  const campfireFontFamily = settings.campfireFontUrl.trim() ? HEALING_CAMPFIRE_CUSTOM_FONT_FAMILY : '';
  const [unreadEmailIds, setUnreadEmailIds] = useState<Set<string>>(new Set<string>());
  const [starredEmailIds, setStarredEmailIds] = useState<Set<string>>(new Set<string>());
  const [readIdsLoaded, setReadIdsLoaded] = useState(false);
  const [hoverResetSeed, setHoverResetSeed] = useState(0);
  const [letters, setLetters] = useState<StoredLetter[]>([]);
  const [chatLogs, setChatLogs] = useState<StoredChatLog[]>([]);
  const [chatProfiles, setChatProfiles] = useState<ChatProfile[]>([]);
  const [diaries, setDiaries] = useState<StoredMDiary[]>([]);
  const backgroundImageUrl = settings.backgroundImageUrl.trim();
  const backgroundOverlay = Math.min(0.9, Math.max(0, settings.backgroundImageOverlay / 100));
  const appBackgroundImage =
    settings.backgroundMode === 'image' && backgroundImageUrl
      ? `linear-gradient(160deg, rgb(17 24 39 / ${backgroundOverlay}), rgb(17 24 39 / ${Math.max(
          0,
          backgroundOverlay - 0.12,
        )})), url("${toSafeCssUrl(backgroundImageUrl)}")`
      : `radial-gradient(circle at 20% 10%, ${settings.backgroundGradientStart} 0%, ${settings.backgroundGradientEnd} 72%), linear-gradient(160deg, ${settings.backgroundGradientStart} 0%, ${settings.backgroundGradientEnd} 100%)`;
  const tarotExitChibiSrc = useMemo(() => {
    const fallback = `${import.meta.env.BASE_URL}chibi/chibi-00.webp`;
    const sources = getScopedMixedChibiSources('mdiary', settings.chibiPoolSize, settings.chibiPoolMode);
    return pickRandomItem(sources) ?? fallback;
  }, [settings.chibiPoolMode, settings.chibiPoolSize, launcherApp]);

  const notifiedIdsRef = useRef<Set<string>>(new Set<string>());
  const readEmailIdsRef = useRef<Set<string>>(new Set<string>());
  const calendarMonthCacheRef = useRef<Map<string, CalendarMonth>>(new Map());
  const calendarMonthRequestRef = useRef(0);
  const actionToastTimerRef = useRef<number | null>(null);
  const [notifierLoaded, setNotifierLoaded] = useState(false);

  const refreshData = useCallback(async () => {
    const nowMs = Date.now();
    const [loadedSettings, visibleEmails, allEmails, months] = await Promise.all([
      getSettings(),
      listEmails({ includeLocked: false, nowMs }),
      listEmails({ includeLocked: true, nowMs }),
      listCalendarMonths(),
    ]);

    const storedMonthKeys = months.map((entry) => entry.monthKey);
    const monthKeyPattern = /^\d{4}-\d{2}$/;
    const anchorMonthKey = monthKeyPattern.test(calendarMonthKey) ? calendarMonthKey : toMonthKey();
    const monthKeys = buildContinuousMonthKeys(storedMonthKeys, anchorMonthKey);
    const activeMonth = monthKeys.includes(calendarMonthKey) ? calendarMonthKey : anchorMonthKey;
    const activeCalendar = (await getCalendarMonth(activeMonth)) ?? {};

    calendarMonthRequestRef.current += 1;
    calendarMonthCacheRef.current.set(activeMonth, activeCalendar);

    setSettings(loadedSettings);
    setEmails(visibleEmails);
    setCalendarMonthKeys(monthKeys);
    setCalendarMonthKey(activeMonth);
    setCalendarData(activeCalendar);
    setVisibleEmailCount(visibleEmails.length);
    setTotalEmailCount(allEmails.length);
    setMonthCount(monthKeys.length);
  }, [calendarMonthKey]);

  const initialize = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);

    try {
      await seedDatabaseIfNeeded();
      await refreshData();
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setLoadError(error instanceof Error ? error.message : 'Unknown initialization error');
    }
  }, [refreshData]);

  const refreshNotificationPermission = useCallback(() => {
    setNotificationPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const syncHostedLetters = useCallback(async (existingLetters: StoredLetter[]) => {
    let indexResponse: Response;
    try {
      indexResponse = await fetch(HOSTED_LETTERS_INDEX_URL, { cache: 'no-store' });
    } catch {
      return null;
    }
    if (!indexResponse.ok) return null;

    let indexPayload: HostedLettersIndexPayload;
    try {
      indexPayload = (await indexResponse.json()) as HostedLettersIndexPayload;
    } catch {
      return null;
    }

    const generatedAt = typeof indexPayload.generatedAt === 'string' ? indexPayload.generatedAt.trim() : '';
    if (!generatedAt) return null;

    const listedEntries = Array.isArray(indexPayload.letters) ? indexPayload.letters : [];

    const previousMeta = readHostedLettersSyncMeta();
    if (previousMeta?.generatedAt === generatedAt) {
      const existingNameSet = new Set(existingLetters.map((entry) => entry.name));
      const allHostedPresent = previousMeta.names.every((name) => existingNameSet.has(name));
      if (allHostedPresent) {
        return null;
      }
    }

    const now = Date.now();
    const hostedNameSet = new Set<string>();
    const hostedLetters: StoredLetter[] = [];
    for (let index = 0; index < listedEntries.length; index += 1) {
      const entry = listedEntries[index];
      if (!entry || typeof entry !== 'object') continue;
      const contentPathRaw = typeof entry.contentPath === 'string' ? entry.contentPath.trim() : '';
      if (!contentPathRaw) continue;
      const contentPath = contentPathRaw.replace(/^\.?\//, '');
      const contentUrl = `${import.meta.env.BASE_URL}data/letters-local/${contentPath}`;

      try {
        const contentResponse = await fetch(contentUrl, { cache: 'no-store' });
        if (!contentResponse.ok) continue;
        const content = (await contentResponse.text()).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
        if (!content) continue;

        const name = normalizeHostedLetterName(entry, index);
        hostedNameSet.add(name);
        hostedLetters.push({
          name,
          content,
          importedAt: now + index,
          writtenAt: normalizeTimestamp(entry.writtenAt),
        });
      } catch {
        // Skip missing or unreadable hosted content files.
      }
    }

    const mergedMap = new Map(existingLetters.map((entry) => [entry.name, entry]));
    const previousHostedNames = new Set(previousMeta?.names ?? []);
    for (const staleName of previousHostedNames) {
      if (!hostedNameSet.has(staleName)) {
        mergedMap.delete(staleName);
      }
    }
    for (const hosted of hostedLetters) {
      mergedMap.set(hosted.name, hosted);
    }

    const mergedLetters = Array.from(mergedMap.values());
    await saveLetters(mergedLetters);
    writeHostedLettersSyncMeta({
      generatedAt,
      names: Array.from(hostedNameSet),
    });
    return loadLetters();
  }, []);

  const syncHostedMDiaries = useCallback(async (existingDiaries: StoredMDiary[]) => {
    let indexResponse: Response;
    try {
      indexResponse = await fetch(HOSTED_M_DIARY_INDEX_URL, { cache: 'no-store' });
    } catch {
      return null;
    }
    if (!indexResponse.ok) return null;

    let indexPayload: HostedMasterPoolIndexPayload;
    try {
      indexPayload = (await indexResponse.json()) as HostedMasterPoolIndexPayload;
    } catch {
      return null;
    }

    const generatedAt = typeof indexPayload.generatedAt === 'string' ? indexPayload.generatedAt.trim() : '';
    if (!generatedAt) return null;

    const previousMeta = readHostedMDiarySyncMeta();
    if (previousMeta?.generatedAt === generatedAt && previousMeta.syncPolicy === HOSTED_M_DIARY_SYNC_POLICY) {
      const existingNameSet = new Set(existingDiaries.map((entry) => entry.name));
      const allHostedPresent = previousMeta.names.every((name) => existingNameSet.has(name));
      if (allHostedPresent) {
        return null;
      }
    }

    const docs = Array.isArray(indexPayload.docs) ? indexPayload.docs : [];
    const isDiaryDoc = (doc: HostedMasterPoolDocEntry) => Array.isArray(doc.routes) && doc.routes.includes('diary');
    const diaryDocs = docs.filter((doc) => isDiaryDoc(doc) && !isAnnualLettersMirrorDoc(doc));
    const excludedAnnualDiaryNames = new Set<string>();
    const excludedAnnualDiaryTitles = new Set<string>();
    for (let index = 0; index < docs.length; index += 1) {
      const doc = docs[index];
      if (!doc || typeof doc !== 'object') continue;
      if (!isDiaryDoc(doc) || !isAnnualLettersMirrorDoc(doc)) continue;
      excludedAnnualDiaryNames.add(normalizeHostedMDiaryName(doc, index));
      const excludedTitle = typeof doc.title === 'string' ? doc.title.trim() : '';
      if (excludedTitle) {
        excludedAnnualDiaryTitles.add(excludedTitle);
      }
    }

    const now = Date.now();
    const hostedNameSet = new Set<string>();
    const hostedDiaries: StoredMDiary[] = [];

    for (let index = 0; index < diaryDocs.length; index += 1) {
      const doc = diaryDocs[index];
      if (!doc || typeof doc !== 'object') continue;
      const contentPathRaw = typeof doc.contentPath === 'string' ? doc.contentPath.trim() : '';
      if (!contentPathRaw) continue;
      const contentPath = contentPathRaw.replace(/^\.?\//, '');
      const contentUrl = `${HOSTED_M_DIARY_CONTENT_BASE_URL}${contentPath}`;

      try {
        const contentResponse = await fetch(contentUrl, { cache: 'no-store' });
        if (!contentResponse.ok) continue;
        const content = (await contentResponse.text()).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
        if (!content) continue;

        const name = normalizeHostedMDiaryName(doc, index);
        const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : toHostedDiaryTitle(name);
        const importedAt = normalizeTimestamp(doc.writtenAt) ?? now + index;
        hostedNameSet.add(name);
        hostedDiaries.push({
          name,
          title,
          content,
          htmlContent: '',
          importedAt,
        });
      } catch {
        // Skip missing or unreadable hosted content files.
      }
    }

    const mergedMap = new Map(existingDiaries.map((entry) => [entry.name, entry]));
    for (const excludedName of excludedAnnualDiaryNames) {
      mergedMap.delete(excludedName);
    }
    for (const [entryName, entry] of mergedMap.entries()) {
      const existingTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
      if (!existingTitle) continue;
      if (excludedAnnualDiaryTitles.has(existingTitle)) {
        mergedMap.delete(entryName);
      }
    }
    const previousHostedNames = new Set(previousMeta?.names ?? []);
    for (const staleName of previousHostedNames) {
      if (!hostedNameSet.has(staleName)) {
        mergedMap.delete(staleName);
      }
    }
    for (const hosted of hostedDiaries) {
      mergedMap.set(hosted.name, hosted);
    }

    const mergedDiaries = Array.from(mergedMap.values());
    await saveMDiaries(mergedDiaries);
    writeHostedMDiarySyncMeta({
      generatedAt,
      names: Array.from(hostedNameSet),
      syncPolicy: HOSTED_M_DIARY_SYNC_POLICY,
    });
    return loadMDiaries();
  }, []);

  // Load persisted letters from IndexedDB on startup
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const persistedLetters = await loadLetters();
        if (!active) return;
        setLetters(persistedLetters);

        const hostedMerged = await syncHostedLetters(persistedLetters);
        if (!active || !hostedMerged) return;
        setLetters(hostedMerged);
      } catch {
        // ignore startup loading failures
      }
    })();
    return () => {
      active = false;
    };
  }, [syncHostedLetters]);

  // Load persisted chat logs
  useEffect(() => {
    loadChatLogs()
      .then(setChatLogs)
      .catch(() => {});
  }, []);

  // Load chat profiles
  useEffect(() => {
    loadChatProfiles()
      .then(setChatProfiles)
      .catch(() => {});
  }, []);

  // Load persisted diaries
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const persistedDiaries = await loadMDiaries();
        if (!active) return;
        setDiaries(persistedDiaries);

        const hostedMerged = await syncHostedMDiaries(persistedDiaries);
        if (!active || !hostedMerged) return;
        setDiaries(hostedMerged);
      } catch {
        // ignore startup loading failures
      }
    })();
    return () => {
      active = false;
    };
  }, [syncHostedMDiaries]);

  // Load letter custom font
  useEffect(() => {
    const href = settings.letterFontUrl.trim();
    const styleId = 'letter-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(LETTER_CUSTOM_FONT_FAMILY, href);
  }, [settings.letterFontUrl]);

  // Load diary custom font
  useEffect(() => {
    const href = settings.diaryFontUrl.trim();
    const styleId = 'diary-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(DIARY_CUSTOM_FONT_FAMILY, href);
  }, [settings.diaryFontUrl]);

  // Load soulmate custom font
  useEffect(() => {
    const href = settings.soulmateFontUrl.trim();
    const styleId = 'soulmate-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(SOULMATE_CUSTOM_FONT_FAMILY, href);
  }, [settings.soulmateFontUrl]);

  // Load archive custom font
  useEffect(() => {
    const href = settings.archiveFontUrl.trim();
    const styleId = 'archive-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(ARCHIVE_CUSTOM_FONT_FAMILY, href);
  }, [settings.archiveFontUrl]);

  // Load notes custom font
  useEffect(() => {
    const href = settings.notesFontUrl.trim();
    const styleId = 'notes-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(NOTES_CUSTOM_FONT_FAMILY, href);
  }, [settings.notesFontUrl]);

  // Load healing campfire custom font
  useEffect(() => {
    const href = settings.campfireFontUrl.trim();
    const styleId = 'healing-campfire-custom-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!href) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceRule(HEALING_CAMPFIRE_CUSTOM_FONT_FAMILY, href);
  }, [settings.campfireFontUrl]);

  const handleImportLetterFiles = useCallback(async (files: File[]) => {
    const now = Date.now();
    const imported: StoredLetter[] = [];
    for (const file of files) {
      try {
        const content = await readLetterContent(file);
        if (content.trim()) {
          imported.push({
            name: file.name,
            content,
            importedAt: now,
            writtenAt: pickLetterWrittenAt({ name: file.name, content }),
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveLetters(imported);
    const updated = await loadLetters();
    setLetters(updated);
  }, []);

  const handleImportChatLogFiles = useCallback(async (files: File[]) => {
    const now = Date.now();
    const imported: StoredChatLog[] = [];
    for (const file of files) {
      try {
        const content = await readLetterContent(file);
        if (content.trim()) {
          const detectedProfileId = detectBestChatProfileId(content, chatProfiles);
          imported.push({
            name: file.name,
            content,
            importedAt: now,
            profileId: detectedProfileId || undefined,
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveChatLogs(imported);
    const updated = await loadChatLogs();
    setChatLogs(updated);
  }, [chatProfiles]);

  const handleImportChatLogFolderFiles = useCallback(async (files: File[]) => {
    const now = Date.now();
    const imported: StoredChatLog[] = [];
    for (const file of files) {
      try {
        const content = await readLetterContent(file);
        if (content.trim()) {
          const detectedProfileId = detectBestChatProfileId(content, chatProfiles);
          imported.push({
            name: file.name,
            content,
            importedAt: now,
            profileId: detectedProfileId || undefined,
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveChatLogs(imported);
    const updated = await loadChatLogs();
    setChatLogs(updated);
  }, [chatProfiles]);

  const handleClearAllChatLogs = useCallback(async () => {
    await clearAllChatLogs();
    setChatLogs([]);
  }, []);

  const handleDeleteChatLog = useCallback(async (name: string) => {
    await deleteChatLog(name);
    const updated = await loadChatLogs();
    setChatLogs(updated);
  }, []);

  const handleClearAllLetters = useCallback(async () => {
    await clearAllLetters();
    setLetters([]);
  }, []);

  const handleDeleteLetter = useCallback(async (name: string) => {
    await deleteLetter(name);
    const updated = await loadLetters();
    setLetters(updated);
  }, []);

  const handleImportLetterFolderFiles = useCallback(async (files: File[]) => {
    // Same logic as file import — folder just provides multiple files at once
    const now = Date.now();
    const imported: StoredLetter[] = [];
    for (const file of files) {
      try {
        const content = await readLetterContent(file);
        if (content.trim()) {
          imported.push({
            name: file.name,
            content,
            importedAt: now,
            writtenAt: pickLetterWrittenAt({ name: file.name, content }),
          });
        }
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveLetters(imported);
    const updated = await loadLetters();
    setLetters(updated);
  }, []);

  const handleImportDiaryFiles = useCallback(async (files: File[]) => {
    const imported: StoredMDiary[] = [];
    for (const file of files) {
      try {
        imported.push(await parseMDiaryFile(file));
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveMDiaries(imported);
    const updated = await loadMDiaries();
    setDiaries(updated);
  }, []);

  const handleImportDiaryFolderFiles = useCallback(async (files: File[]) => {
    const imported: StoredMDiary[] = [];
    for (const file of files) {
      try {
        imported.push(await parseMDiaryFile(file));
      } catch {
        // skip unreadable files
      }
    }
    if (!imported.length) return;
    await saveMDiaries(imported);
    const updated = await loadMDiaries();
    setDiaries(updated);
  }, []);

  const handleClearAllDiaries = useCallback(async () => {
    await clearAllMDiaries();
    setDiaries([]);
  }, []);

  const handleDeleteDiary = useCallback(async (name: string) => {
    await deleteMDiary(name);
    const updated = await loadMDiaries();
    setDiaries(updated);
  }, []);

  const handleExportAboutMeBackup = useCallback(async () => {
    return exportAboutMeBackupPackage();
  }, []);

  const handleExportAboutMBackup = useCallback(async () => {
    return exportAboutMBackupPackage();
  }, []);

  const handleExportAboutMBackupPart = useCallback(async (part: AboutMPart) => {
    return exportAboutMBackupPart(part);
  }, []);

  const handleImportAboutMeBackup = useCallback(async (files: File[], mode: BackupImportMode) => {
    return importAboutMeBackupPackage(files, mode);
  }, []);

  const handleImportAboutMBackup = useCallback(
    async (files: File[], mode: BackupImportMode) => {
      const message = await importAboutMBackupPackage(files, mode);
      const [updatedLetters, updatedDiaries, updatedChatLogs, updatedProfiles] = await Promise.all([
        loadLetters(),
        loadMDiaries(),
        loadChatLogs(),
        loadChatProfiles(),
      ]);

      setLetters(updatedLetters);
      setDiaries(updatedDiaries);
      setChatLogs(updatedChatLogs);
      setChatProfiles(updatedProfiles);
      await refreshData();

      return message;
    },
    [refreshData],
  );

  const handleImportAboutMBackupPart = useCallback(
    async (part: AboutMPart, files: File[], mode: BackupImportMode) => {
      const message = await importAboutMBackupPart(part, files, mode);
      const [updatedLetters, updatedDiaries, updatedChatLogs, updatedProfiles] = await Promise.all([
        loadLetters(),
        loadMDiaries(),
        loadChatLogs(),
        loadChatProfiles(),
      ]);

      setLetters(updatedLetters);
      setDiaries(updatedDiaries);
      setChatLogs(updatedChatLogs);
      setChatProfiles(updatedProfiles);
      await refreshData();

      return message;
    },
    [refreshData],
  );

  const handleSaveChatProfile = useCallback(async (profile: ChatProfile) => {
    try {
      await saveChatProfile(profile);
      const updated = await loadChatProfiles();
      setChatProfiles(updated);
      return true;
    } catch (error) {
      emitActionToast({
        kind: 'error',
        message: `儲存角色設定失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
      });
      return false;
    }
  }, []);

  const handleDeleteChatProfile = useCallback(async (id: string) => {
    await deleteChatProfile(id);
    setChatProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleBindChatLogProfile = useCallback(
    async (logName: string, profileId: string) => {
      const currentLog = chatLogs.find((log) => log.name === logName);
      if (!currentLog) return;

      const normalizedProfileId = profileId || undefined;
      if (currentLog.profileId === normalizedProfileId) return;

      const updatedLog: StoredChatLog = {
        ...currentLog,
        profileId: normalizedProfileId,
      };

      await saveChatLogs([updatedLog]);
      setChatLogs((prev) => prev.map((log) => (log.name === logName ? updatedLog : log)));
    },
    [chatLogs],
  );

  useEffect(() => {
    const onVisibilityOrFocus = () => refreshNotificationPermission();

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [refreshNotificationPermission]);

  useEffect(() => {
    const href = settings.customFontFileUrl.trim();
    const styleId = 'custom-font-file-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!href) {
      if (style) {
        style.remove();
      }
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = buildFontFaceRule(APP_CUSTOM_FONT_FAMILY, href);
  }, [settings.customFontFileUrl]);

  useEffect(() => {
    return subscribeActionToast((payload) => {
      const nextId = Date.now() + Math.floor(Math.random() * 1000);
      const nextKind: ActionToastKind = payload.kind ?? 'info';
      const duration = Math.max(900, Math.min(6000, payload.durationMs ?? 1800));
      setActionToast({
        id: nextId,
        kind: nextKind,
        message: payload.message,
      });

      if (actionToastTimerRef.current !== null) {
        window.clearTimeout(actionToastTimerRef.current);
      }
      actionToastTimerRef.current = window.setTimeout(() => {
        setActionToast((current) => (current?.id === nextId ? null : current));
        actionToastTimerRef.current = null;
      }, duration);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (actionToastTimerRef.current !== null) {
        window.clearTimeout(actionToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getNotifiedEmailIds()
      .then((ids) => {
        if (!active) {
          return;
        }

        notifiedIdsRef.current = ids;
        setNotifierLoaded(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setNotifierLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getStarredEmailIds()
      .then((ids) => {
        if (!active) {
          return;
        }

        setStarredEmailIds(ids);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setStarredEmailIds(new Set<string>());
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getReadEmailIds()
      .then((ids) => {
        if (!active) {
          return;
        }

        readEmailIdsRef.current = ids;
        setReadIdsLoaded(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        readEmailIdsRef.current = new Set<string>();
        setReadIdsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!readIdsLoaded) {
      return;
    }

    setUnreadEmailIds(new Set(emails.filter((email) => !readEmailIdsRef.current.has(email.id)).map((email) => email.id)));
  }, [emails, readIdsLoaded]);

  const checkForNewUnlocks = useCallback(async () => {
    if (loadState !== 'ready' || !notifierLoaded) {
      return;
    }

    const allEmails = await listEmails({ includeLocked: true, nowMs: Date.now() });
    const pending = allEmails.filter((email) => email.isUnlocked && !notifiedIdsRef.current.has(email.id));

    if (!pending.length) {
      return;
    }

    for (const email of pending) {
      if (settings.localNotificationsEnabled && notificationPermission === 'granted') {
        await notifyUnlockedEmail(email);
      }

      notifiedIdsRef.current.add(email.id);
      await addNotifiedEmailId(email.id);
    }

    await refreshData();
  }, [loadState, notifierLoaded, notificationPermission, refreshData, settings.localNotificationsEnabled]);

  useEffect(() => {
    if (loadState !== 'ready' || !notifierLoaded) {
      return;
    }

    void checkForNewUnlocks();

    const timer = window.setInterval(() => {
      void checkForNewUnlocks();
    }, UNLOCK_CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [checkForNewUnlocks, loadState, notifierLoaded]);

  const onSettingChange = useCallback(async (partial: Partial<AppSettings>) => {
    try {
      const next = await saveSettings(partial);
      setSettings(next);
      return true;
    } catch (error) {
      emitActionToast({
        kind: 'error',
        message: `保存失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
      });
      return false;
    }
  }, []);

  const onRequestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  }, []);

  const onImportEmlFiles = useCallback(
    async (files: File[]) => {
      setImportStatus({ kind: 'working', message: `正在匯入 ${files.length} 個 EML 檔案...` });

      try {
        const result = await importEmlFiles(files);
        const syncAt = new Date().toISOString();
        const nextSettings = await saveSettings({ lastSyncAt: syncAt });
        setSettings(nextSettings);
        await refreshData();
        setImportStatus(summarizeImport('EML', result));
      } catch (error) {
        setImportStatus({
          kind: 'error',
          message: `EML 匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        });
      }
    },
    [refreshData],
  );

  const onImportCalendarFiles = useCallback(
    async (files: File[]) => {
      setImportStatus({ kind: 'working', message: `正在匯入 ${files.length} 個月曆 JSON 檔案...` });

      try {
        const result = await importCalendarFiles(files);
        const syncAt = new Date().toISOString();
        const nextSettings = await saveSettings({ lastSyncAt: syncAt });
        setSettings(nextSettings);
        await refreshData();
        setImportStatus(summarizeImport('Calendar', result));
      } catch (error) {
        setImportStatus({
          kind: 'error',
          message: `月曆匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        });
      }
    },
    [refreshData],
  );

  const onMonthChange = useCallback(async (nextMonthKey: string) => {
    setCalendarMonthKey(nextMonthKey);

    const cached = calendarMonthCacheRef.current.get(nextMonthKey);
    if (cached) {
      setCalendarData(cached);
      return;
    }

    const requestId = calendarMonthRequestRef.current + 1;
    calendarMonthRequestRef.current = requestId;

    const nextData = (await getCalendarMonth(nextMonthKey)) ?? {};
    calendarMonthCacheRef.current.set(nextMonthKey, nextData);

    if (calendarMonthRequestRef.current === requestId) {
      setCalendarData(nextData);
    }
  }, []);

  const onOpenEmail = useCallback(async (emailId: string) => {
    if (readEmailIdsRef.current.has(emailId)) {
      return;
    }

    readEmailIdsRef.current.add(emailId);
    setUnreadEmailIds((prev) => {
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });

    try {
      await addReadEmailId(emailId);
    } catch {
      // Keep local optimistic state even if persistence fails.
    }
  }, []);

  const onToggleEmailStar = useCallback((emailId: string) => {
    setStarredEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }

      void persistStarredEmailIds(next);
      return next;
    });
  }, []);

  const onHoverToneWeightChange = useCallback(
    async (tone: 'clingy' | 'confession' | 'calm' | 'remorse' | 'general', weight: number) => {
      const nextWeights = {
        ...settings.hoverToneWeights,
        [tone]: weight,
      };

      const next = await saveSettings({ hoverToneWeights: nextWeights });
      setSettings(next);
    },
    [settings.hoverToneWeights],
  );

  const onReshuffleHoverPhrases = useCallback(async () => {
    try {
      await setHoverPhraseMap({});
      setHoverResetSeed((prev) => prev + 1);
      setImportStatus({
        kind: 'success',
        message: 'Hover 語句已重抽，回月曆點日期就會抽新語句。',
      });
    } catch (error) {
      setImportStatus({
        kind: 'error',
        message: `重抽 Hover 語句失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
      });
    }
  }, []);

  const onReshuffleChibiPool = useCallback(
    (modeOverride?: BaseChibiPoolMode) => {
      const targetMode = modeOverride ?? settings.chibiPoolMode;
      const active = refreshActiveBaseChibiPool(settings.chibiPoolSize, targetMode);
      const info = getBaseChibiPoolInfo(settings.chibiPoolSize, targetMode);
      const modeLabel = targetMode === 'i' ? 'I池' : targetMode === 'ii' ? 'II池' : '全部';
      setChibiPoolInfo({
        allCount: info.allCount,
        activeCount: info.activeCount,
        targetCount: info.targetCount,
      });
      setImportStatus({
        kind: 'success',
        message: `透明小人已重抽（${modeLabel}）：啟用 ${active.length} 張`,
      });
    },
    [settings.chibiPoolMode, settings.chibiPoolSize],
  );

  useEffect(() => {
    const active = syncActiveBaseChibiPool(settings.chibiPoolSize, settings.chibiPoolMode);
    const info = getBaseChibiPoolInfo(settings.chibiPoolSize, settings.chibiPoolMode);
    setChibiPoolInfo({
      allCount: info.allCount,
      activeCount: info.activeCount || active.length,
      targetCount: info.targetCount,
    });
  }, [settings.chibiPoolMode, settings.chibiPoolSize]);

  const onCalendarColorModeChange = useCallback(
    (mode: CalendarColorMode) => {
      void onSettingChange({ calendarColorMode: mode });
    },
    [onSettingChange],
  );

  const onLaunchApp = useCallback((appId: LauncherAppId) => {
    if (appId === 'settingsShortcut') {
      setLauncherApp(null);
      setActiveTab(3);
      return;
    }
    if (appId !== 'wishlist') {
      setWishlistInitialYear(null);
    }
    if (appId !== 'lettersAB') {
      setLettersAbInitialYear(null);
    }
    setLauncherApp(appId);
  }, []);

  const openWishlistByYear = useCallback((year: string) => {
    setWishlistInitialYear(year);
    setLauncherApp('wishlist');
  }, []);

  const openLettersAbByYear = useCallback((year: string) => {
    const parsed = Number.parseInt(year, 10);
    setLettersAbInitialYear(Number.isFinite(parsed) ? parsed : null);
    setLauncherApp('lettersAB');
  }, []);

  const lazyPageFallback = (
    <div className="grid h-full min-h-[220px] place-items-center text-sm text-stone-500">
      <span className="rounded-full border border-stone-300 bg-white/85 px-3 py-1 shadow-sm">載入中…</span>
    </div>
  );

  const pages = useMemo(
    () => [
      {
        id: 'home',
        label: appLabels.home,
        node: (
          <HomePage
            tabIconUrls={settings.tabIconUrls}
            tabIconDisplayMode={settings.tabIconDisplayMode}
            launcherLabels={appLabels}
            homeSwipeEnabled={settings.swipeEnabled}
            widgetTitle={settings.homeWidgetTitle}
            widgetSubtitle={settings.homeWidgetSubtitle}
            widgetBadgeText={settings.homeWidgetBadgeText}
            widgetIconDataUrl={settings.homeWidgetIconDataUrl}
            backgroundMode={settings.backgroundMode}
            homeDynamicWallpaperPreset={settings.homeDynamicWallpaperPreset}
            homeWallpaperEffectPreset={settings.homeWallpaperEffectPreset}
            homeDynamicEffectsEnabled={settings.homeDynamicEffectsEnabled}
            homeDynamicIntensity={settings.homeDynamicIntensity}
            homeDynamicSpeed={settings.homeDynamicSpeed}
            homeDynamicParticleAmount={settings.homeDynamicParticleAmount}
            memorialStartDate={settings.memorialStartDate}
            homeFinalWidgetPreset={settings.homeFinalWidgetPreset}
            homePolaroidMessages={settings.homePolaroidMessages}
            onLaunchApp={onLaunchApp}
            onOpenCheckin={() => onLaunchApp('checkin')}
            onOpenSettings={() => onLaunchApp('settingsShortcut')}
            onWidgetIconChange={(dataUrl) => {
              void onSettingChange({ homeWidgetIconDataUrl: dataUrl });
            }}
          />
        ),
      },
      {
        id: 'inbox',
        label: appLabels.inbox,
        node: (
          <Suspense fallback={lazyPageFallback}>
            <InboxPage
              emails={emails}
              unreadEmailIds={unreadEmailIds}
              starredEmailIds={starredEmailIds}
              inboxTitle={settings.inboxTitle}
              onOpenEmail={onOpenEmail}
              onToggleEmailStar={onToggleEmailStar}
            />
          </Suspense>
        ),
      },
      {
        id: 'calendar',
        label: appLabels.calendar,
        node: (
          <Suspense fallback={lazyPageFallback}>
            <CalendarPage
              monthKey={calendarMonthKey}
              monthKeys={calendarMonthKeys}
              data={calendarData}
              hoverToneWeights={settings.hoverToneWeights}
              hoverResetSeed={hoverResetSeed}
              calendarColorMode={settings.calendarColorMode}
              monthAccentColor={monthAccentColor}
              onMonthChange={onMonthChange}
              onCalendarColorModeChange={onCalendarColorModeChange}
            />
          </Suspense>
        ),
      },
      {
        id: 'settings',
        label: appLabels.settings,
        node: (
          <Suspense fallback={lazyPageFallback}>
            <SettingsPage
              settings={settings}
              visibleEmailCount={visibleEmailCount}
              totalEmailCount={totalEmailCount}
              monthCount={monthCount}
              notificationPermission={notificationPermission}
              importStatus={importStatus}
              letterCount={letters.length}
              letters={letters}
              diaryCount={diaries.length}
              diaries={diaries}
              chatLogCount={chatLogs.length}
              chatProfiles={chatProfiles}
              chibiPoolInfo={chibiPoolInfo}
              onSettingChange={onSettingChange}
              onRequestNotificationPermission={onRequestNotificationPermission}
              onImportEmlFiles={onImportEmlFiles}
              onImportCalendarFiles={onImportCalendarFiles}
              onImportLetterFiles={(files) => void handleImportLetterFiles(files)}
              onImportLetterFolderFiles={(files) => void handleImportLetterFolderFiles(files)}
              onClearAllLetters={() => void handleClearAllLetters()}
              onDeleteLetter={(name) => void handleDeleteLetter(name)}
              onImportDiaryFiles={(files) => void handleImportDiaryFiles(files)}
              onImportDiaryFolderFiles={(files) => void handleImportDiaryFolderFiles(files)}
              onClearAllDiaries={() => void handleClearAllDiaries()}
              onDeleteDiary={(name) => void handleDeleteDiary(name)}
              onImportChatLogFiles={(files) => void handleImportChatLogFiles(files)}
              onImportChatLogFolderFiles={(files) => void handleImportChatLogFolderFiles(files)}
              onClearAllChatLogs={() => void handleClearAllChatLogs()}
              onExportAboutMeBackup={() => handleExportAboutMeBackup()}
              onExportAboutMBackup={() => handleExportAboutMBackup()}
              onExportAboutMBackupPart={(part) => handleExportAboutMBackupPart(part)}
              onImportAboutMeBackup={(files, mode) => handleImportAboutMeBackup(files, mode)}
              onImportAboutMBackup={(files, mode) => handleImportAboutMBackup(files, mode)}
              onImportAboutMBackupPart={(part, files, mode) => handleImportAboutMBackupPart(part, files, mode)}
              onSaveChatProfile={(profile) => handleSaveChatProfile(profile)}
              onDeleteChatProfile={(id) => void handleDeleteChatProfile(id)}
              onHoverToneWeightChange={onHoverToneWeightChange}
              onReshuffleHoverPhrases={onReshuffleHoverPhrases}
              onReshuffleChibiPool={onReshuffleChibiPool}
              onRefresh={() => {
                void saveSettings({ lastSyncAt: new Date().toISOString() }).then((next) => {
                  setSettings(next);
                  return refreshData();
                });
              }}
            />
          </Suspense>
        ),
      },
    ],
    [
      calendarData,
      calendarMonthKey,
      calendarMonthKeys,
      emails,
      appLabels,
      chibiPoolInfo,
      importStatus,
      monthCount,
      monthAccentColor,
      notificationPermission,
      onLaunchApp,
      onOpenEmail,
      onToggleEmailStar,
      onHoverToneWeightChange,
      onImportCalendarFiles,
      onImportEmlFiles,
      onMonthChange,
      onCalendarColorModeChange,
      onRequestNotificationPermission,
      onReshuffleHoverPhrases,
      onReshuffleChibiPool,
      onSettingChange,
      refreshData,
      settings,
      starredEmailIds,
      totalEmailCount,
      hoverResetSeed,
      unreadEmailIds,
      visibleEmailCount,
      letters,
      diaries,
      chatLogs,
      chatProfiles,
      handleImportLetterFiles,
      handleImportLetterFolderFiles,
      handleClearAllLetters,
      handleDeleteLetter,
      handleImportDiaryFiles,
      handleImportDiaryFolderFiles,
      handleClearAllDiaries,
      handleDeleteDiary,
      handleExportAboutMeBackup,
      handleExportAboutMBackup,
      handleExportAboutMBackupPart,
      handleImportAboutMeBackup,
      handleImportAboutMBackup,
      handleImportAboutMBackupPart,
      handleImportChatLogFiles,
      handleImportChatLogFolderFiles,
      handleClearAllChatLogs,
      handleSaveChatProfile,
      handleDeleteChatProfile,
    ],
  );

  const bottomTabs = useMemo(
    () => [
      {
        id: 'home',
        label: appLabels.home,
        icon: DEFAULT_TAB_ICONS.home,
        iconUrl: settings.tabIconUrls.home || undefined,
      },
      {
        id: 'inbox',
        label: appLabels.inbox,
        icon: DEFAULT_TAB_ICONS.inbox,
        iconUrl: settings.tabIconUrls.inbox || undefined,
      },
      {
        id: 'calendar',
        label: appLabels.calendar,
        icon: DEFAULT_TAB_ICONS.calendar,
        iconUrl: settings.tabIconUrls.calendar || undefined,
      },
      {
        id: 'chat',
        label: appLabels.chat,
        icon: '💬',
      },
    ],
    [
      appLabels.calendar,
      appLabels.chat,
      appLabels.home,
      appLabels.inbox,
      settings.tabIconUrls.calendar,
      settings.tabIconUrls.home,
      settings.tabIconUrls.inbox,
    ],
  );

  const activeBottomTab = useMemo(() => {
    if (activeTab === 1) return 1;
    if (activeTab === 2) return 2;
    if (activeTab === 0) return 0;
    return -1;
  }, [activeTab]);

  const onSelectBottomTab = useCallback((index: number) => {
    if (index === 0) {
      setActiveTab(0);
      setLauncherApp(null);
      return;
    }

    if (index === 1) {
      setActiveTab(1);
      return;
    }

    if (index === 2) {
      setActiveTab(2);
      setLauncherApp(null);
      return;
    }

    setActiveTab(0);
    setLauncherApp('chat');
  }, []);

  return (
    <div
      className="app-shell relative h-dvh w-full overflow-hidden"
      data-chat-style={settings.chatBubbleStyle}
      style={{
        backgroundImage: appBackgroundImage,
        backgroundSize: settings.backgroundMode === 'image' && backgroundImageUrl ? 'cover' : undefined,
        backgroundPosition: settings.backgroundMode === 'image' && backgroundImageUrl ? 'center' : undefined,
        backgroundRepeat: settings.backgroundMode === 'image' && backgroundImageUrl ? 'no-repeat' : undefined,
        fontSize: `${settings.fontScale}rem`,
        fontFamily: 'var(--app-font-family)',
        ['--theme-accent' as string]: appAccentColor,
        ['--theme-accent-rgb' as string]: themeAccentRgb,
        ['--app-text-rgb' as string]: globalTextRgb,
        ['--tab-accent-rgb' as string]: themeAccentRgb,
        ['--calendar-accent-rgb' as string]: calendarAccentRgb,
        ['--calendar-header-accent-rgb' as string]: calendarHeaderAccentRgb,
        ['--locked-bubble-rgb' as string]: lockedBubbleRgb,
        ['--calendar-hover-text-rgb' as string]: calendarHoverBubbleTextRgb,
        ['--chat-user-bubble-rgb' as string]: chatUserBubbleRgb,
        ['--chat-user-border-rgb' as string]: chatUserBorderRgb,
        ['--chat-ai-bubble-rgb' as string]: chatAiBubbleRgb,
        ['--chat-ai-border-rgb' as string]: chatAiBorderRgb,
        ['--chat-user-text' as string]: settings.chatUserBubbleTextColor,
        ['--chat-ai-text' as string]: settings.chatAiBubbleTextColor,
        ['--chat-bubble-radius' as string]: `${settings.chatBubbleRadius}px`,
        ['--app-font-scale' as string]: settings.fontScale,
        ['--app-font-family' as string]: appFontFamily,
        ['--app-heading-family' as string]: appHeadingFamily,
        ['--ui-header-title-size' as string]: `${settings.uiHeaderTitleSize * settings.fontScale}px`,
        ['--ui-tab-label-size' as string]: `${settings.uiTabLabelSize * settings.fontScale}px`,
        ['--ui-filter-pill-size' as string]: `${settings.uiFilterPillSize * settings.fontScale}px`,
        ['--ui-hint-text-size' as string]: `${settings.uiHintTextSize * settings.fontScale}px`,
        ['--chat-contact-title-size' as string]: `${settings.chatContactNameSize * settings.fontScale}px`,
        ['--chat-contact-subtitle-size' as string]: `${settings.chatContactSubtitleSize * settings.fontScale}px`,
        ['--calendar-cell-radius' as string]: `${settings.calendarCellRadius}px`,
        ['--calendar-cell-shadow' as string]: settings.calendarCellShadow,
        ['--calendar-cell-depth' as string]: settings.calendarCellDepth,
      }}
    >
      <div className="pointer-events-none absolute -left-24 top-[-5rem] h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-[-7rem] h-80 w-80 rounded-full bg-amber-300/35 blur-3xl" />

      {loadState === 'loading' && (
        <main className="grid h-full place-items-center px-6 text-center">
          <div className="space-y-2 rounded-2xl border border-stone-300/70 bg-white/75 px-6 py-5 shadow-sm backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Preparing</p>
            <p className="text-lg text-stone-900">Loading your local memorial cache...</p>
          </div>
        </main>
      )}

      {loadState === 'error' && (
        <main className="grid h-full place-items-center px-6 text-center">
          <div className="max-w-lg space-y-3 rounded-2xl border border-rose-300/70 bg-white/90 px-6 py-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-600">Initialization failed</p>
            <p className="text-sm text-stone-700">{loadError}</p>
            <button
              type="button"
              onClick={() => void initialize()}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
            >
              Retry
            </button>
          </div>
        </main>
      )}

      {loadState === 'ready' && (
        <Suspense
          fallback={
            <main className="grid h-full place-items-center px-6 text-center">
              <div className="rounded-full border border-stone-300 bg-white/85 px-4 py-2 text-sm text-stone-600 shadow-sm">
                載入中…
              </div>
            </main>
          }
        >
          <>
          <SwipePager
            activeIndex={activeTab}
            onIndexChange={setActiveTab}
            swipeEnabled={false}
            pages={pages.map((page) => ({ id: page.id, node: page.node }))}
          />
          {!launcherApp && (
            <BottomTabs
              activeIndex={activeBottomTab}
              onSelect={onSelectBottomTab}
              iconDisplayMode={settings.tabIconDisplayMode}
              tabs={bottomTabs}
            />
          )}

          {launcherApp === 'tarot' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-2 backdrop-blur-sm">
              <div className="relative mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                  <TarotPage
                    tarotGalleryImageUrl={settings.tarotGalleryImageUrl}
                    tarotNameColor={settings.tarotNameColor}
                    tarotNameScale={settings.tarotNameScale}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLauncherApp(null)}
                  className="absolute bottom-1 right-1 z-20 transition active:scale-95"
                  aria-label="返回首頁"
                  title="點小人返回首頁"
                >
                  <img
                    src={tarotExitChibiSrc}
                    alt=""
                    draggable={false}
                    className="calendar-chibi w-[8rem] select-none"
                    loading="lazy"
                  />
                </button>
              </div>
            </div>
          )}

          {launcherApp === 'checkin' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-4 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-[22px] leading-none text-white transition active:scale-95"
                    onClick={() => setLauncherApp(null)}
                  >
                    ‹
                  </button>
                  <span className="h-9 w-9" aria-hidden="true" />
                  <span className="h-9 w-9" aria-hidden="true" />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden pt-3">
                  <CheckinPage />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'letters' && (
            <div className="fixed inset-0 z-30 bg-[#2C1810]">
              <div className="mx-auto h-full w-full max-w-xl">
                <LetterPage
                  letters={letters}
                  letterFontFamily={letterFontFamily}
                  uiMode={settings.letterUiMode}
                  onExit={() => setLauncherApp(null)}
                />
              </div>
            </div>
          )}

          {launcherApp === 'chat' && (
            <div className="fixed inset-0 z-30" style={{ background: settings.chatBackgroundColor }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <ChatLogPage
                  logs={chatLogs}
                  chatProfiles={chatProfiles}
                  settings={settings}
                  onSettingChange={(partial) => void onSettingChange(partial)}
                  onImportChatLogFiles={(files) => void handleImportChatLogFiles(files)}
                  onImportChatLogFolderFiles={(files) => void handleImportChatLogFolderFiles(files)}
                  onClearAllChatLogs={() => void handleClearAllChatLogs()}
                  onDeleteChatLog={(name) => void handleDeleteChatLog(name)}
                  onSaveChatProfile={(profile) => handleSaveChatProfile(profile)}
                  onDeleteChatProfile={(id) => void handleDeleteChatProfile(id)}
                  onBindLogProfile={(logName, profileId) => void handleBindChatLogProfile(logName, profileId)}
                  onExit={() => {
                    setActiveTab(0);
                    setLauncherApp(null);
                  }}
                />
              </div>
            </div>
          )}

          {launcherApp === 'heart' && (
            <div className="fixed inset-0 z-30 bg-black/65 px-4 pb-4 pt-4 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-[22px] leading-none text-white transition active:scale-95"
                    onClick={() => setLauncherApp(null)}
                  >
                    ‹
                  </button>
                  <p className="text-sm text-white/85">{appLabels.heart}</p>
                  <span className="h-9 w-9" />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden pt-3">
                  <HeartWallPage />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'list' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-4 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-[22px] leading-none text-white transition active:scale-95"
                    onClick={() => setLauncherApp(null)}
                  >
                    ‹
                  </button>
                  <span className="h-9 w-9" />
                  <span className="h-9 w-9" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <ListPage />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'wishlist' && (
            <div className="fixed inset-0 z-30" style={{ background: '#f7f2e2' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <WishlistPage
                  onExit={() => {
                    setWishlistInitialYear(null);
                    setLauncherApp(null);
                  }}
                  letterFontFamily={letterFontFamily}
                  diaryFontFamily={diaryFontFamily}
                  initialTab={wishlistInitialYear ? 'birthday' : 'cards'}
                  initialBirthdayYear={wishlistInitialYear}
                  onOpenLettersYear={openLettersAbByYear}
                />
              </div>
            </div>
          )}

          {launcherApp === 'lettersAB' && (
            <div className="fixed inset-0 z-30" style={{ background: '#ece5de' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <LettersABPage
                  onExit={() => {
                    setLettersAbInitialYear(null);
                    setLauncherApp(null);
                  }}
                  initialYear={lettersAbInitialYear}
                  onOpenBirthdayYear={openWishlistByYear}
                  letterFontFamily={letterFontFamily}
                />
              </div>
            </div>
          )}

          {launcherApp === 'fitness' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-2 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                  <FitnessPage onExit={() => setLauncherApp(null)} />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'pomodoro' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-2 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                  <PomodoroPage onExit={() => setLauncherApp(null)} />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'period' && (
            <div className="fixed inset-0 z-30" style={{ background: '#fdf7f4' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <PeriodPage onExit={() => setLauncherApp(null)} />
              </div>
            </div>
          )}

          {launcherApp === 'diary' && (
            <div className="fixed inset-0 z-30" style={{ background: '#f6f2ea' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <MDiaryPage
                  entries={diaries}
                  diaryCoverImageUrl={settings.diaryCoverImageUrl}
                  diaryFontFamily={diaryFontFamily}
                  diaryCoverFitMode={settings.diaryCoverFitMode}
                  mDiaryLineHeight={settings.mDiaryLineHeight}
                  mDiaryContentFontSize={settings.mDiaryContentFontSize}
                  mDiaryShowCount={settings.mDiaryShowCount}
                  mDiaryRandomChibiWidth={settings.mDiaryRandomChibiWidth}
                  mDiaryReadingChibiWidth={settings.mDiaryReadingChibiWidth}
                  mDiaryShowReadingChibi={settings.mDiaryShowReadingChibi}
                  onSettingChange={(partial) => void onSettingChange(partial)}
                  onExit={() => setLauncherApp(null)}
                />
              </div>
            </div>
          )}

          {launcherApp === 'diaryB' && (
            <div className="fixed inset-0 z-30" style={{ background: '#f8f4ed' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <DiaryBPage
                  diaryCoverImageUrl={settings.diaryCoverImageUrl}
                  diaryFontFamily={diaryFontFamily}
                  diaryCoverFitMode={settings.diaryCoverFitMode}
                  onExit={() => setLauncherApp(null)}
                />
              </div>
            </div>
          )}

          {launcherApp === 'album' && (
            <div className="fixed inset-0 z-30 bg-black/55 px-4 pb-4 pt-4 backdrop-blur-sm">
              <div className="mx-auto flex h-full w-full max-w-xl flex-col">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-[22px] leading-none text-white transition active:scale-95"
                    onClick={() => setLauncherApp(null)}
                  >
                    ‹
                  </button>
                  <span className="h-9 w-9" />
                  <span className="h-9 w-9" />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden pt-3">
                  <AlbumPage />
                </div>
              </div>
            </div>
          )}

          {launcherApp === 'bookshelf' && (
            <div className="fixed inset-0 z-30" style={{ background: '#0a0a12' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <BookshelfPage onExit={() => setLauncherApp(null)} />
              </div>
            </div>
          )}

          {launcherApp === 'notes' && (
            <div className="fixed inset-0 z-30" style={{ background: '#fdf6ee' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <NotesPage onExit={() => setLauncherApp(null)} />
              </div>
            </div>
          )}

          {launcherApp === 'memo' && (
            <div className="fixed inset-0 z-30" style={{ background: '#f2f1ec' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <MemoPage onExit={() => setLauncherApp(null)} notesFontFamily={notesFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'murmur' && (
            <div className="fixed inset-0 z-30" style={{ background: '#0d0d0f' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <MurmurPage onExit={() => setLauncherApp(null)} notesFontFamily={notesFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'lightPath' && (
            <div className="fixed inset-0 z-30" style={{ background: '#000' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <LightPathPage onExit={() => setLauncherApp(null)} letterFontFamily={campfireFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'healingCampfire' && (
            <div className="fixed inset-0 z-30" style={{ background: '#02050a' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <HealingCampfirePage onExit={() => setLauncherApp(null)} campfireFontFamily={campfireFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'questionnaire' && (
            <div className="fixed inset-0 z-30" style={{ background: '#0e0f11' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <QuestionnairePage onExit={() => setLauncherApp(null)} notesFontFamily={notesFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'selfIntro' && (
            <div className="fixed inset-0 z-30" style={{ background: '#17140f' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <SelfIntroPage onExit={() => setLauncherApp(null)} notesFontFamily={notesFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'soulmate' && (
            <div className="fixed inset-0 z-30" style={{ background: '#fdf6ee' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <SoulmateHousePage
                  onExit={() => setLauncherApp(null)}
                  soulmateFontFamily={soulmateFontFamily}
                />
              </div>
            </div>
          )}

          {launcherApp === 'moodLetters' && (
            <div className="fixed inset-0 z-30" style={{ background: '#0b1023' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <MoodLettersPage onExit={() => setLauncherApp(null)} letterFontFamily={campfireFontFamily} />
              </div>
            </div>
          )}

          {launcherApp === 'archive' && (
            <div className="fixed inset-0 z-30" style={{ background: '#0a0a0a' }}>
              <div className="mx-auto h-full w-full max-w-xl">
                <ArchivePage
                  onExit={() => setLauncherApp(null)}
                  archiveFontFamily={archiveFontFamily}
                  diaryContentFontSize={settings.mDiaryContentFontSize}
                  diaryLineHeight={settings.mDiaryLineHeight}
                />
              </div>
            </div>
          )}

          </>
        </Suspense>
      )}

      {actionToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[250] flex justify-center px-4">
          <div
            className={`max-w-[92vw] rounded-2xl border px-4 py-2 text-sm shadow-lg backdrop-blur ${
              actionToast.kind === 'error'
                ? 'border-rose-300 bg-rose-50/95 text-rose-700'
                : actionToast.kind === 'success'
                  ? 'border-emerald-300 bg-emerald-50/95 text-emerald-700'
                  : 'border-stone-300 bg-white/95 text-stone-700'
            }`}
          >
            {actionToast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
