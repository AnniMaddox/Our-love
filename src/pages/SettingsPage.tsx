import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { emitActionToast } from '../lib/actionToast';
import { APP_CUSTOM_FONT_FAMILY, SETTINGS_PREVIEW_FONT_FAMILY, buildFontFaceRule } from '../lib/font';
import type { ChatProfile } from '../lib/chatDB';
import type { StoredLetter } from '../lib/letterDB';
import type { StoredMDiary } from '../lib/mDiaryDB';
import { DEFAULT_SETTINGS, type AppLabelKey, type AppLabels, type AppSettings, type BackgroundMode, type TabIconKey, type TabIconUrls } from '../types/settings';

type SettingsPageProps = {
  settings: AppSettings;
  visibleEmailCount: number;
  totalEmailCount: number;
  monthCount: number;
  notificationPermission: NotificationPermission | 'unsupported';
  importStatus: {
    kind: 'idle' | 'working' | 'success' | 'error';
    message: string;
  };
  letterCount: number;
  letters: StoredLetter[];
  diaryCount: number;
  diaries: StoredMDiary[];
  chatLogCount: number;
  chatProfiles: ChatProfile[];
  chibiPoolInfo: {
    allCount: number;
    activeCount: number;
    targetCount: number;
  };
  onSettingChange: (partial: Partial<AppSettings>) => void;
  onRequestNotificationPermission: () => void;
  onImportEmlFiles: (files: File[]) => void;
  onImportCalendarFiles: (files: File[]) => void;
  onImportLetterFiles: (files: File[]) => void;
  onImportLetterFolderFiles: (files: File[]) => void;
  onImportDiaryFiles: (files: File[]) => void;
  onImportDiaryFolderFiles: (files: File[]) => void;
  onImportChatLogFiles: (files: File[]) => void;
  onImportChatLogFolderFiles: (files: File[]) => void;
  onClearAllLetters: () => void;
  onDeleteLetter: (name: string) => void;
  onClearAllDiaries: () => void;
  onDeleteDiary: (name: string) => void;
  onClearAllChatLogs: () => void;
  onExportAboutMeBackup: () => Promise<string> | string;
  onExportAboutMBackup: () => Promise<string> | string;
  onExportAboutMBackupPart: (part: 'mDiary' | 'letters' | 'chatLogs' | 'inbox' | 'soulmate' | 'other') => Promise<string> | string;
  onImportAboutMeBackup: (files: File[], mode: 'merge' | 'overwrite') => Promise<string> | string;
  onImportAboutMBackup: (files: File[], mode: 'merge' | 'overwrite') => Promise<string> | string;
  onImportAboutMBackupPart: (
    part: 'mDiary' | 'letters' | 'chatLogs' | 'inbox' | 'soulmate' | 'other',
    files: File[],
    mode: 'merge' | 'overwrite',
  ) => Promise<string> | string;
  onSaveChatProfile: (profile: ChatProfile) => Promise<boolean> | boolean;
  onDeleteChatProfile: (id: string) => void;
  onHoverToneWeightChange: (tone: 'clingy' | 'confession' | 'calm' | 'remorse' | 'general', weight: number) => void;
  onReshuffleHoverPhrases: () => void;
  onReshuffleChibiPool: (mode?: AppSettings['chibiPoolMode']) => void;
  onRefresh: () => void;
};

type AboutMBackupPart = 'mDiary' | 'letters' | 'chatLogs' | 'inbox' | 'soulmate' | 'other';

type PanelKey =
  | 'overview'
  | 'bigBackup'
  | 'manuals'
  | 'appearance'
  | 'wallpaper'
  | 'fontCenter'
  | 'home'
  | 'homeWidget'
  | 'labels'
  | 'tabIcons'
  | 'notification'
  | 'imports'
  | 'hover'
  | 'tarot'
  | 'letters'
  | 'diary'
  | 'chatLogs'
  | 'maintenance';

type AppearanceGroupKey = 'colorScale' | 'calendar' | 'chibi' | 'preset';
type FontCenterGroupKey = 'preset' | 'scope' | 'usage' | 'size';
type FontSlotSettingKey = 'customFontUrlSlots' | 'letterFontUrlSlots' | 'diaryFontUrlSlots' | 'soulmateFontUrlSlots';
type FontSlotNameSettingKey =
  | 'customFontUrlSlotNames'
  | 'letterFontUrlSlotNames'
  | 'diaryFontUrlSlotNames'
  | 'soulmateFontUrlSlotNames';
type FontApplyTargetKey = 'app' | 'letter' | 'campfire' | 'diary' | 'soulmate' | 'archive' | 'notes';
type UiSizeSettingKey =
  | 'uiHeaderTitleSize'
  | 'uiTabLabelSize'
  | 'uiFilterPillSize'
  | 'uiHintTextSize'
  | 'chatContactNameSize'
  | 'chatContactSubtitleSize';
const FONT_PRESET_KEY: FontSlotSettingKey = 'customFontUrlSlots';
const FONT_PRESET_LIMIT = 10;
const FONT_PRESET_INDICES = Array.from({ length: FONT_PRESET_LIMIT }, (_, index) => index);

function normalizeFontSlotArray(input: unknown, fallback: string[]) {
  if (!Array.isArray(input)) {
    return [...fallback];
  }
  return Array.from({ length: FONT_PRESET_LIMIT }, (_, index) => {
    const value = input[index];
    return typeof value === 'string' ? value.trim() : '';
  });
}

function stripLetterExtension(name: string) {
  return name.replace(/\.(txt|md|docx?|json)$/i, '');
}

function normalizeLetterTimestamp(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizePolaroidMessagesInput(input: string, fallback: string[]) {
  const normalized = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return normalized.length ? normalized : [...fallback];
}

function formatLetterDateForList(letter: StoredLetter) {
  const timestamp = normalizeLetterTimestamp(letter.writtenAt) ?? normalizeLetterTimestamp(letter.importedAt);
  if (!timestamp) return '未知日期';
  return new Date(timestamp).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatMDiaryDateForList(diary: StoredMDiary) {
  const timestamp = normalizeLetterTimestamp(diary.importedAt);
  if (!timestamp) return '未知日期';
  return new Date(timestamp).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

const FONT_TARGET_OPTIONS: Array<{ key: FontApplyTargetKey; label: string; hint: string }> = [
  { key: 'app', label: '整站', hint: '主標題 / 頁籤等基底字體' },
  { key: 'letter', label: '情書', hint: '情書頁閱讀文字' },
  { key: 'campfire', label: '治癒篝火', hint: '治癒篝火／心情星球／留光給妳的路閱讀文字' },
  { key: 'diary', label: '日記', hint: 'M 日記 / Anni 日記 / 願望' },
  { key: 'soulmate', label: '家頁', hint: '家閱讀頁' },
  { key: 'archive', label: '總攬', hint: '總攬入口閱讀文字' },
  { key: 'notes', label: "M's memo", hint: 'M 的備忘錄閱讀文字' },
];
const UI_SIZE_CONTROLS: Array<{ key: UiSizeSettingKey; label: string; hint: string; min: number; max: number; step: number }> = [
  { key: 'uiHeaderTitleSize', label: '頁首標題', hint: 'M日記 / Anni日記 / 經期 / 願望 / 對話頁標題', min: 14, max: 24, step: 1 },
  { key: 'uiTabLabelSize', label: '頁籤文字', hint: '閱讀/月曆/格狀、願望/清單/生日任務 等頁籤', min: 6, max: 24, step: 1 },
  { key: 'uiFilterPillSize', label: '篩選籤條', hint: '全部/收藏/未知時刻/已完成/未完成', min: 9, max: 16, step: 1 },
  { key: 'uiHintTextSize', label: '提示小字', hint: '已完成計數、滑動提示、細節小字', min: 8, max: 14, step: 1 },
  { key: 'chatContactNameSize', label: '對話聯絡人名', hint: '對話首頁卡片上的大名稱（例如 M）', min: 12, max: 38, step: 1 },
  { key: 'chatContactSubtitleSize', label: '對話聯絡人副標', hint: '對話首頁卡片上的副標（例如 你♡）', min: 12, max: 24, step: 1 },
];
const CHAT_BACKGROUND_PRESETS = ['#efeff4', '#f6f1e7', '#eaf1f6', '#f4e9ef', '#eef3e6'] as const;
const HOME_DYNAMIC_WALLPAPER_OPTIONS: Array<{
  value: AppSettings['homeDynamicWallpaperPreset'];
  label: string;
  hint: string;
}> = [
  { value: 'gradientFlow', label: '糖霧幻彩', hint: 'R1 彩糖散景：粉黃青藍同場慢慢流動' },
  { value: 'snowNight', label: '雪夜', hint: '冷藍晚霞 + 自然飄雪' },
  { value: 'bokehDream', label: '夢幻散景', hint: '柔焦光斑 + 明顯色相變化' },
  { value: 'firefly', label: '奶霧薄荷', hint: 'R2 奶霧薄荷：淡綠奶白薰紫，柔和換色' },
  { value: 'meteorShower', label: '夜藍閃變', hint: '青綠粉暮色 + 一瞬偏藍變暗（純背景）' },
  { value: 'skyLantern', label: '夢幻甜彩', hint: '像晚霞一樣一寸寸自然換色' },
  { value: 'coolTwilight', label: '好酷流焰', hint: 'Untitled-3 原版紅藍金純變色（無圈圈）' },
  { value: 'prismDepth', label: '藍紫深境', hint: 'R3 藍紫深度：藍紫青層次更深、流動更有空間感' },
  { value: 'auroraDance', label: 'Anni專屬：極光之舞', hint: '照抄：#00cdac → #02aab0 → #00cdac → #8EE4AF，15s 緩慢循環' },
];
const HOME_DYNAMIC_EFFECT_OPTIONS: Array<{
  value: AppSettings['homeWallpaperEffectPreset'];
  label: string;
  hint: string;
}> = [
  { value: 'none', label: '無特效', hint: '只留背景，先專心看換色節奏' },
  { value: 'orbs', label: '光暈圓斑', hint: '柔焦漂浮光斑，存在感中等' },
  { value: 'snow', label: '雪花', hint: '前後景層次飄雪，立體感最強' },
  { value: 'lantern', label: '天燈上飄', hint: '暖色天燈慢慢往上，帶輕微搖晃' },
  { value: 'heart', label: '愛心飄浮', hint: '柔和愛心緩慢上飄，微微搖晃' },
  { value: 'ribbon', label: '柔光帶', hint: '流動光束像絲帶一樣漂移' },
  { value: 'stardust', label: '星塵流星', hint: '細亮點 + 流星掠過，動感較強' },
  { value: 'bubbles', label: '上飄泡泡', hint: '參考手札 C：小泡泡由下往上慢慢飄移' },
];
const HOME_FINAL_WIDGET_OPTIONS: Array<{
  value: AppSettings['homeFinalWidgetPreset'];
  label: string;
  hint: string;
}> = [
  { value: 'vinylCounter', label: '唱片機', hint: '保留現在的唱片機外觀與控制鈕。' },
  { value: 'polaroid', label: '拍力得', hint: '改成拍立得相機。' },
];
const TAB_ICON_FALLBACK: Record<TabIconKey, string> = {
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

const TAB_ICON_LABELS: Array<{ key: TabIconKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'tarot', label: 'Tarot' },
  { key: 'letters', label: 'Letters' },
  { key: 'heart', label: 'MY LOVE' },
  { key: 'list', label: 'List 清單' },
  { key: 'fitness', label: 'Fitness 健身' },
  { key: 'pomodoro', label: 'Pomodoro 番茄鐘' },
  { key: 'period', label: 'Period 經期日記' },
  { key: 'diary', label: 'Diary 日記' },
  { key: 'album', label: 'Album 相冊' },
  { key: 'notes', label: 'Notes 便利貼' },
  { key: 'settings', label: 'Settings' },
];

const APP_LABEL_FIELDS: Array<{ key: AppLabelKey; label: string }> = [
  { key: 'home', label: '底部分頁：Home' },
  { key: 'inbox', label: '底部分頁：Inbox' },
  { key: 'calendar', label: '底部分頁：Calendar' },
  { key: 'settings', label: '底部分頁：Settings' },
  { key: 'tarot', label: '首頁入口：塔羅' },
  { key: 'letters', label: '首頁入口：情書' },
  { key: 'heart', label: '首頁入口：心牆' },
  { key: 'chat', label: '首頁入口：對話' },
  { key: 'list', label: '首頁入口：清單' },
  { key: 'fitness', label: '首頁入口：健身' },
  { key: 'pomodoro', label: '首頁入口：番茄鐘' },
  { key: 'period', label: '首頁入口：經期日記' },
  { key: 'diary', label: '首頁入口：日記' },
  { key: 'album', label: '首頁入口：相冊' },
  { key: 'notes', label: '首頁入口：便利貼' },
];

const ABOUT_M_PART_FIELDS: Array<{ key: AboutMBackupPart; label: string; hint: string }> = [
  { key: 'mDiary', label: 'M日記', hint: 'mDiary.json' },
  { key: 'letters', label: '情書', hint: 'letters.json' },
  { key: 'chatLogs', label: '對話紀錄', hint: 'chatLogs.json' },
  { key: 'inbox', label: 'Inbox / 月曆', hint: 'inbox.json' },
  { key: 'soulmate', label: '搬家計劃書', hint: 'soulmate.json' },
  { key: 'other', label: "其他（M's memo / 自我介紹）", hint: 'other.json' },
];

const CHIBI_POOL_GUIDE: Array<{ page: string; path: string; note?: string }> = [
  { page: 'M 日記 / 願望 / 家 / 塔羅返回小人', path: 'public/mdiary-chibi/' },
  { page: '健身', path: 'public/fitness-chibi/' },
  { page: '番茄鐘', path: 'public/pomodoro-chibi/' },
  { page: '便利貼', path: 'public/notes-chibi/' },
  { page: '主月曆', path: 'public/calendar-chibi/' },
  { page: '年度信件', path: 'public/letters-ab-chibi/' },
  { page: '情書（舊 LetterPage）', path: 'public/letter-chibi/' },
  { page: '經期日記', path: 'public/period-chibi/' },
  { page: '打卡', path: 'public/checkin-chibi/' },
  { page: '全域大池', path: 'public/chibi/', note: '其他頁面回退池與混池來源' },
];

const DATA_CONTENT_GUIDE: Array<{ path: string; target: string; note?: string }> = [
  { path: 'public/data/movies.json', target: '清單-片單', note: '片單卡片內容' },
  { path: 'public/data/songs.json', target: '清單-歌單', note: '歌單卡片內容' },
  { path: 'public/data/books.json', target: '清單-書單', note: '書單卡片內容' },
  { path: 'public/data/wishlist/wishes.json', target: '願望頁', note: '願望（翻閱/清單）內容' },
  { path: 'public/data/wishlist/birthday-tasks.json', target: '願望頁', note: '生日任務內容' },
  { path: 'public/data/letters-ab/index.json', target: '年度信件', note: '年份/文章索引' },
  { path: 'public/data/letters-ab/content/*.txt', target: '年度信件', note: '每篇正文內容' },
  { path: 'public/data/checkin/checkin_phrases.json', target: '打卡', note: '打卡語句（JSON）' },
  { path: 'public/data/checkin/checkin_phrases.txt', target: '打卡', note: '打卡語句（TXT 備援）' },
  { path: 'public/data/checkin/checkin_milestones.json', target: '打卡', note: '里程碑語句' },
  { path: 'public/data/mood-letters/index.json', target: '心情星球', note: '心情信索引（標題 / 分類 / 路徑）' },
  { path: 'public/data/mood-letters/content/*.txt', target: '心情星球', note: '每封信正文（由腳本自動產生）' },
  { path: 'public/data/mood-letters/overrides.json', target: '心情星球', note: '心情分類人工覆蓋（修正）' },
  { path: 'public/data/mood-letters/review.json', target: '心情星球', note: '待人工確認清單（腳本輸出）' },
  { path: 'public/data/period/period_hover_phrases.json', target: '經期日記', note: '月曆 hover 語句' },
  { path: 'public/data/period/period_post_end_phrases.json', target: '經期日記', note: '經期結束後語句' },
  { path: 'public/data/period/period_chibi_phrases.json', target: '經期日記', note: '經期小人台詞' },
  { path: 'public/data/fitness-weeks.json', target: '健身', note: '每週健身/飲食資料' },
  { path: 'public/data/albums.json', target: '相冊', note: '相冊清單與設定' },
];

const ASSET_GUIDE: Array<{ path: string; target: string; note?: string }> = [
  { path: 'public/diary-covers/', target: 'M日記 / Anni日記', note: '日記封面圖池' },
  { path: 'public/photos/', target: '相冊', note: '相簿圖片' },
  { path: 'public/tarot/', target: '塔羅', note: '塔羅牌圖檔' },
  { path: 'public/icons/', target: '網站 / PWA', note: '網站圖示與通知 icon' },
  { path: 'public/chibi*/', target: '所有含小人頁面', note: '小人素材（含各專屬池）' },
];

const IMPORTANT_NOTES: string[] = [
  'GitHub 網頁上傳檔案到 main 分支也可以更新，不一定要本機 git push。',
  '上傳後需等待 Actions build/deploy（通常約 1-5 分鐘），手機端重整才會看到。',
  '小人新增到 public/chibi/ 後，若暫時抽不到新圖，可在外觀設定按「重抽小人池」。',
  '年度信件建議維持 index.json + txt 分檔（不要前端一次解析大量 docx）。',
  '心情信新增後執行 `npm run build:mood-letters`，會自動更新 index/content/review。',
  '心情分類不準時，改 `public/data/mood-letters/overrides.json` 後再重跑腳本。',
  '心情星球小設定/收藏 key：`memorial-mood-letters-prefs-v1`、`memorial-mood-letters-favorites-v1`。',
  '頁內「手動匯入」的資料是本機資料庫，不會被 GitHub 檔案直接覆蓋。',
  '文字檔建議 UTF-8，圖片建議壓縮後再上傳，手機載入會更穩。',
];

const BOOKSHELF_FILE_GUIDE: Array<{ path: string; required: string; note: string }> = [
  { path: 'public/data/bookshelf.json', required: '必填', note: '書本清單與顯示順序（由上到下）' },
  { path: 'public/books/<bookId>/cover.webp', required: '選填', note: '封面（不放也可）' },
  { path: 'public/books/<bookId>/001.webp', required: '必填（至少一頁）', note: '閱讀頁第 1 張' },
  { path: 'public/books/<bookId>/002.webp, 003.webp ...', required: '選填', note: '後續頁面，依檔名數字排序' },
];

const BOOKSHELF_SETUP_STEPS: string[] = [
  '在 `public/data/bookshelf.json` 新增一本書（建議先複製既有一筆再改）。',
  '把 `id` 設成唯一值（例如 `book-006`），這個 id 要和資料夾名稱一致。',
  '建立資料夾 `public/books/<id>/`，放進封面與閱讀頁圖片。',
  '圖片檔名建議用 `001.webp`、`002.webp`...（可混 jpg/png/webp，系統會按檔名排序）。',
  '存檔後上傳 GitHub main，等待部署完成，手機重整就會看到。',
];

const BOOKSHELF_JSON_SAMPLE = `[
  {
    "id": "book-006",
    "title": "新書名稱",
    "subtitle": "",
    "icon": "📖",
    "coverImage": ""
  }
]`;

const MOOD_LETTERS_FILE_GUIDE: Array<{ path: string; required: string; note: string }> = [
  { path: '參考資料/codex/心情信/*.docx|*.txt', required: '必填來源', note: '你新增的 Word/TXT 信件都放這裡' },
  { path: 'scripts/build-mood-letters-index.mjs', required: '工具腳本', note: '自動轉檔與分類（不用手動改 index）' },
  { path: 'public/data/mood-letters/content/*.txt', required: '自動產生', note: '每封信轉成 txt 後會在這裡' },
  { path: 'public/data/mood-letters/index.json', required: '自動產生', note: '心情星球讀取的主索引' },
  { path: 'public/data/mood-letters/review.json', required: '自動產生', note: '待人工確認分類清單' },
  { path: 'public/data/mood-letters/overrides.json', required: '人工修正', note: '分類不準時，在這裡覆蓋 moodIds' },
];

const MOOD_LETTERS_SETUP_STEPS: string[] = [
  '把新信件（.docx / .txt）丟到 `參考資料/codex/心情信/`。檔名保留原檔名即可。',
  '在專案根目錄執行：`npm run build:mood-letters`。',
  '腳本會自動解析 Word/TXT，並重建 `public/data/mood-letters/index.json` 與 `content/*.txt`。',
  '打開 `public/data/mood-letters/review.json`，看 `unresolved` 是否有待分類項目。',
  '如果有待分類：到 `public/data/mood-letters/overrides.json` 新增該檔名對應的 moodIds。',
  '修正後再跑一次 `npm run build:mood-letters`，直到 `review.json` 的 unresolvedCount 降到你可接受。',
  '最後把這些檔案一起上傳 GitHub main：來源信件 + `public/data/mood-letters/*`（至少 index/content/overrides/review）。',
];

const MOOD_LETTERS_OVERRIDE_SAMPLE = `{
  "version": 1,
  "updatedAt": "2026-02-23T00:00:00.000Z",
  "note": "key 要填 displayName（含副檔名）",
  "overrides": {
    "今天有點低潮.docx": ["low", "support"],
    "想妳抱抱晚安.txt": ["longing", "night"]
  }
}`;

type AppearancePresetPayload = {
  version: 1;
  savedAt: string;
  appearance: {
    themeMonthColor: string;
    globalTextColor: string;
    calendarColorMode: AppSettings['calendarColorMode'];
    lockedBubbleColor: string;
    calendarHoverBubbleTextColor: string;
    chatBubbleStyle: AppSettings['chatBubbleStyle'];
    chatUserBubbleColor: string;
    chatUserBubbleBorderColor: string;
    chatUserBubbleTextColor: string;
    chatAiBubbleColor: string;
    chatAiBubbleBorderColor: string;
    chatAiBubbleTextColor: string;
    chatBubbleRadius: number;
    chatBackgroundColor: string;
    chatBackgroundImageUrl: string;
    chatBackgroundOverlay: number;
    customFontCssUrl: string;
    customFontFileUrl: string;
    customFontFamily: string;
    customFontUrlSlots: string[];
    customFontUrlSlotNames: string[];
    letterFontUrl: string;
    letterFontUrlSlots: string[];
    letterFontUrlSlotNames: string[];
    diaryFontUrl: string;
    diaryFontUrlSlots: string[];
    diaryFontUrlSlotNames: string[];
    soulmateFontUrl: string;
    soulmateFontUrlSlots: string[];
    soulmateFontUrlSlotNames: string[];
    archiveFontUrl: string;
    notesFontUrl: string;
    campfireFontUrl: string;
    fontScale: number;
    uiHeaderTitleSize: number;
    uiTabLabelSize: number;
    uiFilterPillSize: number;
    uiHintTextSize: number;
    chatContactNameSize: number;
    chatContactSubtitleSize: number;
    tabIconUrls: TabIconUrls;
    tabIconDisplayMode: AppSettings['tabIconDisplayMode'];
    calendarCellRadius: number;
    calendarCellShadow: number;
    calendarCellDepth: number;
    backgroundMode: BackgroundMode;
    backgroundGradientStart: string;
    backgroundGradientEnd: string;
    homeDynamicWallpaperPreset: AppSettings['homeDynamicWallpaperPreset'];
    homeDynamicEffectsEnabled: boolean;
    homeDynamicIntensity: number;
    homeDynamicSpeed: number;
    homeDynamicParticleAmount: number;
    homeWallpaperGradientPreset: AppSettings['homeWallpaperGradientPreset'];
    homeWallpaperEffectPreset: AppSettings['homeWallpaperEffectPreset'];
    backgroundImageUrl: string;
    backgroundImageOverlay: number;
    homeWidgetTitle: string;
    homeWidgetSubtitle: string;
    homeWidgetBadgeText: string;
    homeWidgetIconDataUrl: string;
    inboxTitle: string;
    memorialStartDate: string;
    homeFinalWidgetPreset: AppSettings['homeFinalWidgetPreset'];
    homePolaroidMessages: string[];
    diaryCoverFitMode: AppSettings['diaryCoverFitMode'];
    tarotNameColor: string;
    tarotNameScale: number;
    chibiPoolSize: number;
    chibiPoolMode: AppSettings['chibiPoolMode'];
    appLabels: AppLabels;
  };
};

type SettingPanelProps = {
  icon: string;
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
};

type SettingSubgroupProps = {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function SettingPanel({ icon, title, subtitle, isOpen, onToggle, children }: SettingPanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-700/80 bg-[#161b26] shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-white transition hover:bg-white/5"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 text-lg">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{title}</span>
          <span className="block truncate text-xs text-stone-300">{subtitle}</span>
        </span>
        <span
          className={`text-xl leading-none text-stone-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {isOpen && <div className="border-t border-stone-700/70 bg-white/95 p-4 text-sm text-stone-700">{children}</div>}
    </section>
  );
}

function SettingSubgroup({ title, subtitle, isOpen, onToggle, children }: SettingSubgroupProps) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm text-stone-800">{title}</span>
          {subtitle ? <span className="mt-0.5 block text-xs text-stone-500">{subtitle}</span> : null}
        </span>
        <span
          className={`text-lg leading-none text-stone-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>
      {isOpen && <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">{children}</div>}
    </div>
  );
}

export function SettingsPage({
  settings,
  visibleEmailCount,
  totalEmailCount,
  monthCount,
  notificationPermission,
  importStatus,
  letterCount,
  letters,
  diaryCount,
  diaries,
  chatLogCount,
  chatProfiles,
  chibiPoolInfo,
  onSettingChange,
  onRequestNotificationPermission,
  onImportEmlFiles,
  onImportCalendarFiles,
  onImportLetterFiles,
  onImportLetterFolderFiles,
  onImportDiaryFiles,
  onImportDiaryFolderFiles,
  onImportChatLogFiles,
  onImportChatLogFolderFiles,
  onClearAllLetters,
  onDeleteLetter,
  onClearAllDiaries,
  onDeleteDiary,
  onClearAllChatLogs,
  onExportAboutMeBackup,
  onExportAboutMBackup,
  onExportAboutMBackupPart,
  onImportAboutMeBackup,
  onImportAboutMBackup,
  onImportAboutMBackupPart,
  onSaveChatProfile,
  onDeleteChatProfile,
  onHoverToneWeightChange,
  onReshuffleHoverPhrases,
  onReshuffleChibiPool,
  onRefresh,
}: SettingsPageProps) {
  const [openPanel, setOpenPanel] = useState<PanelKey | null>('appearance');
  const [diaryCoverUrlDraft, setDiaryCoverUrlDraft] = useState(settings.diaryCoverImageUrl);
  const [tarotGalleryUrlDraft, setTarotGalleryUrlDraft] = useState(settings.tarotGalleryImageUrl);
  const [homeWidgetTitleDraft, setHomeWidgetTitleDraft] = useState(settings.homeWidgetTitle);
  const [homeWidgetBadgeDraft, setHomeWidgetBadgeDraft] = useState(settings.homeWidgetBadgeText);
  const [homeWidgetSubtitleDraft, setHomeWidgetSubtitleDraft] = useState(settings.homeWidgetSubtitle);
  const [inboxTitleDraft, setInboxTitleDraft] = useState(settings.inboxTitle);
  const [memorialStartDateDraft, setMemorialStartDateDraft] = useState(settings.memorialStartDate);
  const [homeFinalWidgetDraft, setHomeFinalWidgetDraft] = useState(settings.homeFinalWidgetPreset);
  const [homePolaroidMessagesDraft, setHomePolaroidMessagesDraft] = useState(
    settings.homePolaroidMessages.join('\n'),
  );
  const [newProfileDraft, setNewProfileDraft] = useState<Omit<ChatProfile, 'id'>>({
    name: '',
    leftNick: 'M',
    rightNick: '你',
    leftAvatarDataUrl: '',
    rightAvatarDataUrl: '',
  });
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [fontFileUrlDraft, setFontFileUrlDraft] = useState(settings.customFontUrlSlots[0] ?? settings.customFontFileUrl);
  const [backgroundImageUrlDraft, setBackgroundImageUrlDraft] = useState(settings.backgroundImageUrl);
  const [homeDynamicWallpaperDraft, setHomeDynamicWallpaperDraft] = useState(settings.homeDynamicWallpaperPreset);
  const [homeDynamicEffectDraft, setHomeDynamicEffectDraft] = useState(settings.homeWallpaperEffectPreset);
  const [chatBackgroundImageUrlDraft, setChatBackgroundImageUrlDraft] = useState(settings.chatBackgroundImageUrl);
  const [tabIconDrafts, setTabIconDrafts] = useState<TabIconUrls>(settings.tabIconUrls);
  const [labelDrafts, setLabelDrafts] = useState<AppLabels>(settings.appLabels);
  const [tabIconStatus, setTabIconStatus] = useState('');
  const [appearancePresetStatus, setAppearancePresetStatus] = useState('');
  const [chibiPoolStatus, setChibiPoolStatus] = useState('');
  const [homeTextStatus, setHomeTextStatus] = useState('');
  const [homeWidgetStatus, setHomeWidgetStatus] = useState('');
  const [homePolaroidStatus, setHomePolaroidStatus] = useState('');
  const [labelStatus, setLabelStatus] = useState('');
  const [aboutMeBackupStatus, setAboutMeBackupStatus] = useState('');
  const [aboutMBackupStatus, setAboutMBackupStatus] = useState('');
  const [backupBusy, setBackupBusy] = useState<'aboutMe' | 'aboutM' | null>(null);
  const [openBackupGroup, setOpenBackupGroup] = useState<'aboutMe' | 'aboutM' | null>('aboutMe');
  const [openAppearanceGroup, setOpenAppearanceGroup] = useState<AppearanceGroupKey | null>('colorScale');
  const [openFontCenterGroup, setOpenFontCenterGroup] = useState<FontCenterGroupKey | null>('preset');
  const [openChatBubbleGroup, setOpenChatBubbleGroup] = useState(false);
  const [openChatBackgroundGroup, setOpenChatBackgroundGroup] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideManualType, setGuideManualType] = useState<'general' | 'bookshelf' | 'moodLetters'>('general');
  const [selectedFontSlotIndex, setSelectedFontSlotIndex] = useState<Record<FontSlotSettingKey, number>>({
    customFontUrlSlots: 0,
    letterFontUrlSlots: 0,
    diaryFontUrlSlots: 0,
    soulmateFontUrlSlots: 0,
  });
  const [fontPresetSelection, setFontPresetSelection] = useState<number | null>(0);
  const [fontScopePresetSelection, setFontScopePresetSelection] = useState<number | null>(() => {
    const appUrl = settings.customFontFileUrl.trim();
    if (!appUrl) return null;
    const slots = FONT_PRESET_INDICES.map((index) => settings.customFontUrlSlots[index] ?? '').map((item) =>
      item.trim(),
    );
    const found = slots.findIndex((item) => item === appUrl);
    return found >= 0 ? found : null;
  });
  const [fontUsagePreviewTarget, setFontUsagePreviewTarget] = useState<FontApplyTargetKey>('app');
  const [fontApplyTargets, setFontApplyTargets] = useState<Record<FontApplyTargetKey, boolean>>({
    app: true,
    letter: true,
    campfire: false,
    diary: true,
    soulmate: false,
    archive: false,
    notes: false,
  });
  const [fontSlotNameDrafts, setFontSlotNameDrafts] = useState<Record<FontSlotSettingKey, string>>({
    customFontUrlSlots: settings.customFontUrlSlotNames[0] ?? '',
    letterFontUrlSlots: settings.letterFontUrlSlotNames[0] ?? '',
    diaryFontUrlSlots: settings.diaryFontUrlSlotNames[0] ?? '',
    soulmateFontUrlSlots: settings.soulmateFontUrlSlotNames[0] ?? '',
  });
  const activeHomeDynamicOption = useMemo(
    () =>
      HOME_DYNAMIC_WALLPAPER_OPTIONS.find((option) => option.value === settings.homeDynamicWallpaperPreset) ??
      HOME_DYNAMIC_WALLPAPER_OPTIONS[0],
    [settings.homeDynamicWallpaperPreset],
  );
  const selectedHomeDynamicOption = useMemo(
    () =>
      HOME_DYNAMIC_WALLPAPER_OPTIONS.find((option) => option.value === homeDynamicWallpaperDraft) ??
      HOME_DYNAMIC_WALLPAPER_OPTIONS[0],
    [homeDynamicWallpaperDraft],
  );
  const activeHomeDynamicEffectOption = useMemo(
    () =>
      HOME_DYNAMIC_EFFECT_OPTIONS.find((option) => option.value === settings.homeWallpaperEffectPreset) ??
      HOME_DYNAMIC_EFFECT_OPTIONS[0],
    [settings.homeWallpaperEffectPreset],
  );
  const selectedHomeDynamicEffectOption = useMemo(
    () =>
      HOME_DYNAMIC_EFFECT_OPTIONS.find((option) => option.value === homeDynamicEffectDraft) ??
      HOME_DYNAMIC_EFFECT_OPTIONS[0],
    [homeDynamicEffectDraft],
  );
  const isHomeDynamicWallpaperDirty = homeDynamicWallpaperDraft !== settings.homeDynamicWallpaperPreset;
  const isHomeDynamicEffectDirty = homeDynamicEffectDraft !== settings.homeWallpaperEffectPreset;

  useEffect(() => {
    setBackgroundImageUrlDraft(settings.backgroundImageUrl);
    setHomeDynamicWallpaperDraft(settings.homeDynamicWallpaperPreset);
    setHomeDynamicEffectDraft(settings.homeWallpaperEffectPreset);
    setChatBackgroundImageUrlDraft(settings.chatBackgroundImageUrl);
    setTabIconDrafts(settings.tabIconUrls);
    setLabelDrafts(settings.appLabels);
    setDiaryCoverUrlDraft(settings.diaryCoverImageUrl);
    setTarotGalleryUrlDraft(settings.tarotGalleryImageUrl);
    setHomeWidgetTitleDraft(settings.homeWidgetTitle);
    setHomeWidgetBadgeDraft(settings.homeWidgetBadgeText);
    setHomeWidgetSubtitleDraft(settings.homeWidgetSubtitle);
    setInboxTitleDraft(settings.inboxTitle);
    setMemorialStartDateDraft(settings.memorialStartDate);
    setHomeFinalWidgetDraft(settings.homeFinalWidgetPreset);
    setHomePolaroidMessagesDraft(settings.homePolaroidMessages.join('\n'));
  }, [
    settings.backgroundImageUrl,
    settings.homeDynamicWallpaperPreset,
    settings.homeWallpaperEffectPreset,
    settings.chatBackgroundImageUrl,
    settings.tabIconUrls,
    settings.appLabels,
    settings.diaryCoverImageUrl,
    settings.tarotGalleryImageUrl,
    settings.homeWidgetTitle,
    settings.homeWidgetBadgeText,
    settings.homeWidgetSubtitle,
    settings.inboxTitle,
    settings.memorialStartDate,
    settings.homeFinalWidgetPreset,
    settings.homePolaroidMessages,
  ]);

  useEffect(() => {
    setFontSlotNameDrafts({
      customFontUrlSlots: settings.customFontUrlSlotNames[selectedFontSlotIndex.customFontUrlSlots] ?? '',
      letterFontUrlSlots: settings.letterFontUrlSlotNames[selectedFontSlotIndex.letterFontUrlSlots] ?? '',
      diaryFontUrlSlots: settings.diaryFontUrlSlotNames[selectedFontSlotIndex.diaryFontUrlSlots] ?? '',
      soulmateFontUrlSlots: settings.soulmateFontUrlSlotNames[selectedFontSlotIndex.soulmateFontUrlSlots] ?? '',
    });
  }, [
    selectedFontSlotIndex.customFontUrlSlots,
    selectedFontSlotIndex.letterFontUrlSlots,
    selectedFontSlotIndex.diaryFontUrlSlots,
    selectedFontSlotIndex.soulmateFontUrlSlots,
    settings.customFontUrlSlotNames,
    settings.letterFontUrlSlotNames,
    settings.diaryFontUrlSlotNames,
    settings.soulmateFontUrlSlotNames,
  ]);

  useEffect(() => {
    if (fontPresetSelection === null) {
      return;
    }
    const slots = getFontSlots(FONT_PRESET_KEY);
    const names = getFontSlotNames(FONT_PRESET_KEY);
    setFontFileUrlDraft(slots[fontPresetSelection] ?? '');
    setFontSlotLabelDraft(FONT_PRESET_KEY, names[fontPresetSelection] ?? '');
  }, [fontPresetSelection, settings.customFontUrlSlots, settings.customFontUrlSlotNames]);

  useEffect(() => {
    const styleId = 'settings-preview-font-file-style';
    const href = fontFileUrlDraft.trim();
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

    style.textContent = buildFontFaceRule(SETTINGS_PREVIEW_FONT_FAMILY, href);
  }, [fontFileUrlDraft]);

  useEffect(() => {
    return () => {
      const style = document.getElementById('settings-preview-font-file-style');
      style?.remove();
    };
  }, []);

  function togglePanel(panel: PanelKey) {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  function toggleBackupGroup(group: 'aboutMe' | 'aboutM') {
    setOpenBackupGroup((current) => (current === group ? null : group));
  }

  function toggleAppearanceGroup(group: AppearanceGroupKey) {
    setOpenAppearanceGroup((current) => (current === group ? null : group));
  }

  function toggleFontCenterGroup(group: FontCenterGroupKey) {
    setOpenFontCenterGroup((current) => (current === group ? null : group));
  }

  function toggleFontApplyTarget(key: FontApplyTargetKey) {
    setFontApplyTargets((current) => ({ ...current, [key]: !current[key] }));
  }

  function setAllFontApplyTargets(checked: boolean) {
    setFontApplyTargets({
      app: checked,
      letter: checked,
      campfire: checked,
      diary: checked,
      soulmate: checked,
      archive: checked,
      notes: checked,
    });
  }

  function getAppliedFontUrlByTarget(target: FontApplyTargetKey) {
    if (target === 'app') {
      return settings.customFontFileUrl.trim();
    }
    if (target === 'letter') {
      return settings.letterFontUrl.trim();
    }
    if (target === 'campfire') {
      return settings.campfireFontUrl.trim();
    }
    if (target === 'diary') {
      return settings.diaryFontUrl.trim();
    }
    if (target === 'archive') {
      return settings.archiveFontUrl.trim();
    }
    if (target === 'notes') {
      return settings.notesFontUrl.trim();
    }
    return settings.soulmateFontUrl.trim();
  }

  function parseFontPresetSelection(value: string): number | null {
    if (value === 'blank') {
      return null;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0 || parsed >= FONT_PRESET_LIMIT) {
      return null;
    }
    return parsed;
  }

  function selectFontPreset(index: number | null) {
    setFontPresetSelection(index);
    if (index === null) {
      setFontFileUrlDraft('');
      setFontSlotLabelDraft(FONT_PRESET_KEY, '');
      return;
    }
    setSelectedFontSlotIndex((prev) => ({ ...prev, [FONT_PRESET_KEY]: index }));
    loadFontSlot(FONT_PRESET_KEY, index);
  }

  function handleScopedFontFileUpload(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }

      setFontDraftValue(FONT_PRESET_KEY, reader.result);
    };
    reader.readAsDataURL(file);
  }

  function handleSaveCurrentFontPreset() {
    if (fontPresetSelection === null) {
      emitActionToast({ kind: 'error', message: '請先選擇記憶 1~10 再保存' });
      return;
    }
    saveFontSlot(FONT_PRESET_KEY, fontPresetSelection);
  }

  function handleDeleteCurrentFontPreset() {
    if (fontPresetSelection === null) {
      emitActionToast({ kind: 'error', message: '請先選擇要刪除的記憶 1~10' });
      return;
    }
    clearFontSlot(FONT_PRESET_KEY, fontPresetSelection);
  }

  function applyFontToCheckedTargets() {
    const selectedTargets = FONT_TARGET_OPTIONS.filter((item) => fontApplyTargets[item.key]);
    if (!selectedTargets.length) {
      emitActionToast({ kind: 'error', message: '請先勾選至少一個套用範圍' });
      return;
    }

    const slots = getFontSlots(FONT_PRESET_KEY);
    const url = fontScopePresetSelection === null ? '' : (slots[fontScopePresetSelection] ?? '').trim();
    if (fontScopePresetSelection !== null && !url) {
      emitActionToast({ kind: 'error', message: '此字體預設是空白，請先回上方保存字體來源' });
      return;
    }

    const next: Partial<AppSettings> = {};
    for (const target of selectedTargets) {
      if (target.key === 'app') {
        next.customFontCssUrl = '';
        next.customFontFileUrl = url;
        next.customFontFamily = '';
      } else if (target.key === 'letter') {
        next.letterFontUrl = url;
      } else if (target.key === 'campfire') {
        next.campfireFontUrl = url;
      } else if (target.key === 'diary') {
        next.diaryFontUrl = url;
      } else if (target.key === 'soulmate') {
        next.soulmateFontUrl = url;
      } else if (target.key === 'archive') {
        next.archiveFontUrl = url;
      } else if (target.key === 'notes') {
        next.notesFontUrl = url;
      }
    }

    onSettingChange(next);
    emitActionToast({
      kind: 'success',
      message:
        fontScopePresetSelection === null
          ? `已還原預設字體：${selectedTargets.map((item) => item.label).join('、')}`
          : `已套用字體預設 ${fontScopePresetSelection + 1}：${selectedTargets.map((item) => item.label).join('、')}`,
    });
  }

  function restoreFontScopeDraft() {
    setFontApplyTargets({
      app: true,
      letter: true,
      campfire: false,
      diary: true,
      soulmate: false,
      archive: false,
      notes: false,
    });

    const slots = getFontSlots(FONT_PRESET_KEY).map((item) => item.trim());
    const appFontUrl = settings.customFontFileUrl.trim();
    if (!appFontUrl) {
      setFontScopePresetSelection(null);
      emitActionToast({ kind: 'success', message: '字體套用範圍草稿已還原' });
      return;
    }

    const foundIndex = slots.findIndex((item) => item === appFontUrl);
    setFontScopePresetSelection(foundIndex >= 0 ? foundIndex : null);
    emitActionToast({ kind: 'success', message: '字體套用範圍草稿已還原' });
  }

  function getFontSlots(key: FontSlotSettingKey) {
    const source =
      key === 'customFontUrlSlots'
        ? settings.customFontUrlSlots
        : key === 'letterFontUrlSlots'
          ? settings.letterFontUrlSlots
          : key === 'diaryFontUrlSlots'
            ? settings.diaryFontUrlSlots
            : settings.soulmateFontUrlSlots;
    return FONT_PRESET_INDICES.map((index) => source[index] ?? '');
  }

  function getFontSlotNameKey(key: FontSlotSettingKey): FontSlotNameSettingKey {
    if (key === 'customFontUrlSlots') return 'customFontUrlSlotNames';
    if (key === 'letterFontUrlSlots') return 'letterFontUrlSlotNames';
    if (key === 'diaryFontUrlSlots') return 'diaryFontUrlSlotNames';
    return 'soulmateFontUrlSlotNames';
  }

  function getFontSlotNames(key: FontSlotSettingKey) {
    const source =
      key === 'customFontUrlSlots'
        ? settings.customFontUrlSlotNames
        : key === 'letterFontUrlSlots'
          ? settings.letterFontUrlSlotNames
          : key === 'diaryFontUrlSlots'
            ? settings.diaryFontUrlSlotNames
            : settings.soulmateFontUrlSlotNames;
    return FONT_PRESET_INDICES.map((index) => source[index] ?? '');
  }

  function getFontDraftValue(key: FontSlotSettingKey) {
    if (key === 'customFontUrlSlots') return fontFileUrlDraft.trim();
    if (key === 'letterFontUrlSlots') return settings.letterFontUrl.trim();
    if (key === 'diaryFontUrlSlots') return settings.diaryFontUrl.trim();
    return settings.soulmateFontUrl.trim();
  }

  function setFontDraftValue(key: FontSlotSettingKey, value: string) {
    if (key === 'customFontUrlSlots') {
      setFontFileUrlDraft(value);
    }
  }

  function getFontSlotLabelDraft(key: FontSlotSettingKey) {
    return fontSlotNameDrafts[key] ?? '';
  }

  function setFontSlotLabelDraft(key: FontSlotSettingKey, value: string) {
    setFontSlotNameDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function saveFontSlot(key: FontSlotSettingKey, index: number) {
    const nextSlots = getFontSlots(key);
    const nextNames = getFontSlotNames(key);
    const nameKey = getFontSlotNameKey(key);
    nextSlots[index] = getFontDraftValue(key);
    nextNames[index] = getFontSlotLabelDraft(key).trim();
    onSettingChange({
      [key]: nextSlots,
      [nameKey]: nextNames,
    } as Partial<AppSettings>);
    emitActionToast({ kind: 'success', message: `字體記憶 ${index + 1} 已保存` });
  }

  function clearFontSlot(key: FontSlotSettingKey, index: number) {
    const nextSlots = getFontSlots(key);
    const nextNames = getFontSlotNames(key);
    const nameKey = getFontSlotNameKey(key);
    nextSlots[index] = '';
    nextNames[index] = '';
    onSettingChange({
      [key]: nextSlots,
      [nameKey]: nextNames,
    } as Partial<AppSettings>);
    setFontDraftValue(key, '');
    setFontSlotLabelDraft(key, '');
    emitActionToast({ kind: 'success', message: `字體記憶 ${index + 1} 已清除` });
  }

  function loadFontSlot(key: FontSlotSettingKey, index: number) {
    const nextSlots = getFontSlots(key);
    const nextNames = getFontSlotNames(key);
    setFontDraftValue(key, nextSlots[index] ?? '');
    setFontSlotLabelDraft(key, nextNames[index] ?? '');
  }

  function getFontSlotName(value: string, fallbackIndex: number, customName = '') {
    const named = customName.trim();
    if (named) return named;
    const source = value.trim();
    if (!source) return `記憶 ${fallbackIndex + 1}`;
    if (source.startsWith('data:')) return `本機字體 ${fallbackIndex + 1}`;
    try {
      const url = new URL(source);
      const last = decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
      if (last) return last;
    } catch {
      // ignore
    }
    return source.length > 26 ? `${source.slice(0, 26)}...` : source;
  }

  function setTabIconDraft(tab: TabIconKey, value: string) {
    setTabIconDrafts((current) => ({
      ...current,
      [tab]: value,
    }));
    setTabIconStatus('');
  }

  function handleTabIconUpload(tab: TabIconKey, file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }
      setTabIconDraft(tab, reader.result);
      setTabIconStatus(`${TAB_ICON_LABELS.find((item) => item.key === tab)?.label ?? tab} 圖示已放入草稿`);
    };
    reader.readAsDataURL(file);
  }

  function setLabelDraft(key: AppLabelKey, value: string) {
    setLabelDrafts((current) => ({
      ...current,
      [key]: value,
    }));
    setLabelStatus('');
  }

  function saveTabIcons() {
    const next: TabIconUrls = {
      home: tabIconDrafts.home.trim(),
      inbox: tabIconDrafts.inbox.trim(),
      calendar: tabIconDrafts.calendar.trim(),
      tarot: tabIconDrafts.tarot.trim(),
      letters: tabIconDrafts.letters.trim(),
      heart: tabIconDrafts.heart.trim(),
      list: tabIconDrafts.list.trim(),
      fitness: tabIconDrafts.fitness.trim(),
      pomodoro: tabIconDrafts.pomodoro.trim(),
      period: tabIconDrafts.period.trim(),
      diary: tabIconDrafts.diary.trim(),
      album: tabIconDrafts.album.trim(),
      notes: tabIconDrafts.notes.trim(),
      settings: tabIconDrafts.settings.trim(),
    };

    onSettingChange({ tabIconUrls: next });
    setTabIconStatus('圖標設定已儲存');
    emitActionToast({ kind: 'success', message: '圖標設定已儲存' });
  }

  function restoreSavedTabIcons() {
    setTabIconDrafts(settings.tabIconUrls);
    setTabIconStatus('已還原成目前儲存值');
  }

  function saveAppLabels() {
    const next: AppLabels = {
      home: labelDrafts.home.trim(),
      inbox: labelDrafts.inbox.trim(),
      calendar: labelDrafts.calendar.trim(),
      settings: labelDrafts.settings.trim(),
      tarot: labelDrafts.tarot.trim(),
      letters: labelDrafts.letters.trim(),
      heart: labelDrafts.heart.trim(),
      chat: labelDrafts.chat.trim(),
      list: labelDrafts.list.trim(),
      fitness: labelDrafts.fitness.trim(),
      pomodoro: labelDrafts.pomodoro.trim(),
      period: labelDrafts.period.trim(),
      diary: labelDrafts.diary.trim(),
      album: labelDrafts.album.trim(),
      notes: labelDrafts.notes.trim(),
    };

    onSettingChange({ appLabels: next });
    setLabelStatus('入口名稱已儲存');
    emitActionToast({ kind: 'success', message: '入口名稱已儲存' });
  }

  function restoreSavedAppLabels() {
    setLabelDrafts(settings.appLabels);
    setLabelStatus('已還原成目前儲存值');
  }

  function exportAppearancePreset() {
    const payload: AppearancePresetPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      appearance: {
        themeMonthColor: settings.themeMonthColor,
        globalTextColor: settings.globalTextColor,
        calendarColorMode: settings.calendarColorMode,
        lockedBubbleColor: settings.lockedBubbleColor,
        calendarHoverBubbleTextColor: settings.calendarHoverBubbleTextColor,
        chatBubbleStyle: settings.chatBubbleStyle,
        chatUserBubbleColor: settings.chatUserBubbleColor,
        chatUserBubbleBorderColor: settings.chatUserBubbleBorderColor,
        chatUserBubbleTextColor: settings.chatUserBubbleTextColor,
        chatAiBubbleColor: settings.chatAiBubbleColor,
        chatAiBubbleBorderColor: settings.chatAiBubbleBorderColor,
        chatAiBubbleTextColor: settings.chatAiBubbleTextColor,
        chatBubbleRadius: settings.chatBubbleRadius,
        chatBackgroundColor: settings.chatBackgroundColor,
        chatBackgroundImageUrl: settings.chatBackgroundImageUrl,
        chatBackgroundOverlay: settings.chatBackgroundOverlay,
        customFontCssUrl: settings.customFontCssUrl,
        customFontFileUrl: settings.customFontFileUrl,
        customFontFamily: settings.customFontFamily,
        customFontUrlSlots: [...settings.customFontUrlSlots],
        customFontUrlSlotNames: [...settings.customFontUrlSlotNames],
        letterFontUrl: settings.letterFontUrl,
        letterFontUrlSlots: [...settings.letterFontUrlSlots],
        letterFontUrlSlotNames: [...settings.letterFontUrlSlotNames],
        diaryFontUrl: settings.diaryFontUrl,
        diaryFontUrlSlots: [...settings.diaryFontUrlSlots],
        diaryFontUrlSlotNames: [...settings.diaryFontUrlSlotNames],
        soulmateFontUrl: settings.soulmateFontUrl,
        soulmateFontUrlSlots: [...settings.soulmateFontUrlSlots],
        soulmateFontUrlSlotNames: [...settings.soulmateFontUrlSlotNames],
        archiveFontUrl: settings.archiveFontUrl,
        notesFontUrl: settings.notesFontUrl,
        campfireFontUrl: settings.campfireFontUrl,
        fontScale: settings.fontScale,
        uiHeaderTitleSize: settings.uiHeaderTitleSize,
        uiTabLabelSize: settings.uiTabLabelSize,
        uiFilterPillSize: settings.uiFilterPillSize,
        uiHintTextSize: settings.uiHintTextSize,
        chatContactNameSize: settings.chatContactNameSize,
        chatContactSubtitleSize: settings.chatContactSubtitleSize,
        tabIconUrls: settings.tabIconUrls,
        tabIconDisplayMode: settings.tabIconDisplayMode,
        calendarCellRadius: settings.calendarCellRadius,
        calendarCellShadow: settings.calendarCellShadow,
        calendarCellDepth: settings.calendarCellDepth,
        backgroundMode: settings.backgroundMode,
        backgroundGradientStart: settings.backgroundGradientStart,
        backgroundGradientEnd: settings.backgroundGradientEnd,
        homeDynamicWallpaperPreset: settings.homeDynamicWallpaperPreset,
        homeDynamicEffectsEnabled: settings.homeDynamicEffectsEnabled,
        homeDynamicIntensity: settings.homeDynamicIntensity,
        homeDynamicSpeed: settings.homeDynamicSpeed,
        homeDynamicParticleAmount: settings.homeDynamicParticleAmount,
        homeWallpaperGradientPreset: settings.homeWallpaperGradientPreset,
        homeWallpaperEffectPreset: settings.homeWallpaperEffectPreset,
        backgroundImageUrl: settings.backgroundImageUrl,
        backgroundImageOverlay: settings.backgroundImageOverlay,
        homeWidgetTitle: settings.homeWidgetTitle,
        homeWidgetSubtitle: settings.homeWidgetSubtitle,
        homeWidgetBadgeText: settings.homeWidgetBadgeText,
        homeWidgetIconDataUrl: settings.homeWidgetIconDataUrl,
        inboxTitle: settings.inboxTitle,
        memorialStartDate: settings.memorialStartDate,
        homeFinalWidgetPreset: settings.homeFinalWidgetPreset,
        homePolaroidMessages: settings.homePolaroidMessages,
        diaryCoverFitMode: settings.diaryCoverFitMode,
        tarotNameColor: settings.tarotNameColor,
        tarotNameScale: settings.tarotNameScale,
        chibiPoolSize: settings.chibiPoolSize,
        chibiPoolMode: settings.chibiPoolMode,
        appLabels: settings.appLabels,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `memorial-style-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setAppearancePresetStatus('已匯出美化設定 JSON');
  }

  async function importAppearancePreset(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppearancePresetPayload> & { appearance?: Partial<AppSettings> };
      const source = (parsed.appearance ?? parsed) as Partial<AppSettings>;
      const next: Partial<AppSettings> = {};

      if (typeof source.themeMonthColor === 'string') {
        next.themeMonthColor = source.themeMonthColor;
      }
      if (typeof source.globalTextColor === 'string') {
        next.globalTextColor = source.globalTextColor;
      }
      if (source.calendarColorMode === 'month' || source.calendarColorMode === 'custom') {
        next.calendarColorMode = source.calendarColorMode;
      }
      if (typeof source.lockedBubbleColor === 'string') {
        next.lockedBubbleColor = source.lockedBubbleColor;
      }
      if (typeof source.calendarHoverBubbleTextColor === 'string') {
        next.calendarHoverBubbleTextColor = source.calendarHoverBubbleTextColor;
      }
      if (
        source.chatBubbleStyle === 'jelly' ||
        source.chatBubbleStyle === 'imessage' ||
        source.chatBubbleStyle === 'imessageClassic'
      ) {
        next.chatBubbleStyle = source.chatBubbleStyle;
      }
      if (typeof source.chatUserBubbleColor === 'string') {
        next.chatUserBubbleColor = source.chatUserBubbleColor;
      }
      if (typeof source.chatUserBubbleBorderColor === 'string') {
        next.chatUserBubbleBorderColor = source.chatUserBubbleBorderColor;
      }
      if (typeof source.chatUserBubbleTextColor === 'string') {
        next.chatUserBubbleTextColor = source.chatUserBubbleTextColor;
      }
      if (typeof source.chatAiBubbleColor === 'string') {
        next.chatAiBubbleColor = source.chatAiBubbleColor;
      }
      if (typeof source.chatAiBubbleBorderColor === 'string') {
        next.chatAiBubbleBorderColor = source.chatAiBubbleBorderColor;
      }
      if (typeof source.chatAiBubbleTextColor === 'string') {
        next.chatAiBubbleTextColor = source.chatAiBubbleTextColor;
      }
      if (typeof source.chatBubbleRadius === 'number' && Number.isFinite(source.chatBubbleRadius)) {
        next.chatBubbleRadius = source.chatBubbleRadius;
      }
      if (typeof source.chatBackgroundColor === 'string') {
        next.chatBackgroundColor = source.chatBackgroundColor;
      }
      if (typeof source.chatBackgroundImageUrl === 'string') {
        next.chatBackgroundImageUrl = source.chatBackgroundImageUrl;
      }
      if (typeof source.chatBackgroundOverlay === 'number' && Number.isFinite(source.chatBackgroundOverlay)) {
        next.chatBackgroundOverlay = Math.max(0, Math.min(90, Math.round(source.chatBackgroundOverlay)));
      }
      if (typeof source.customFontCssUrl === 'string') {
        next.customFontCssUrl = source.customFontCssUrl;
      }
      if (typeof source.customFontFileUrl === 'string') {
        next.customFontFileUrl = source.customFontFileUrl;
      }
      if (typeof source.customFontFamily === 'string') {
        next.customFontFamily = source.customFontFamily;
      }
      if (typeof source.letterFontUrl === 'string') {
        next.letterFontUrl = source.letterFontUrl;
      }
      if (typeof source.diaryFontUrl === 'string') {
        next.diaryFontUrl = source.diaryFontUrl;
      }
      if (typeof source.soulmateFontUrl === 'string') {
        next.soulmateFontUrl = source.soulmateFontUrl;
      }
      if (typeof source.archiveFontUrl === 'string') {
        next.archiveFontUrl = source.archiveFontUrl;
      }
      if (typeof source.notesFontUrl === 'string') {
        next.notesFontUrl = source.notesFontUrl;
      }
      if (typeof source.campfireFontUrl === 'string') {
        next.campfireFontUrl = source.campfireFontUrl;
      }
      if (Array.isArray(source.customFontUrlSlots)) {
        next.customFontUrlSlots = normalizeFontSlotArray(source.customFontUrlSlots, settings.customFontUrlSlots);
      }
      if (Array.isArray(source.customFontUrlSlotNames)) {
        next.customFontUrlSlotNames = normalizeFontSlotArray(source.customFontUrlSlotNames, settings.customFontUrlSlotNames);
      }
      if (Array.isArray(source.letterFontUrlSlots)) {
        next.letterFontUrlSlots = normalizeFontSlotArray(source.letterFontUrlSlots, settings.letterFontUrlSlots);
      }
      if (Array.isArray(source.letterFontUrlSlotNames)) {
        next.letterFontUrlSlotNames = normalizeFontSlotArray(source.letterFontUrlSlotNames, settings.letterFontUrlSlotNames);
      }
      if (Array.isArray(source.diaryFontUrlSlots)) {
        next.diaryFontUrlSlots = normalizeFontSlotArray(source.diaryFontUrlSlots, settings.diaryFontUrlSlots);
      }
      if (Array.isArray(source.diaryFontUrlSlotNames)) {
        next.diaryFontUrlSlotNames = normalizeFontSlotArray(source.diaryFontUrlSlotNames, settings.diaryFontUrlSlotNames);
      }
      if (Array.isArray(source.soulmateFontUrlSlots)) {
        next.soulmateFontUrlSlots = normalizeFontSlotArray(source.soulmateFontUrlSlots, settings.soulmateFontUrlSlots);
      }
      if (Array.isArray(source.soulmateFontUrlSlotNames)) {
        next.soulmateFontUrlSlotNames = normalizeFontSlotArray(source.soulmateFontUrlSlotNames, settings.soulmateFontUrlSlotNames);
      }
      if (typeof source.fontScale === 'number' && Number.isFinite(source.fontScale)) {
        next.fontScale = source.fontScale;
      }
      if (typeof source.uiHeaderTitleSize === 'number' && Number.isFinite(source.uiHeaderTitleSize)) {
        next.uiHeaderTitleSize = source.uiHeaderTitleSize;
      }
      if (typeof source.uiTabLabelSize === 'number' && Number.isFinite(source.uiTabLabelSize)) {
        next.uiTabLabelSize = source.uiTabLabelSize;
      }
      if (typeof source.uiFilterPillSize === 'number' && Number.isFinite(source.uiFilterPillSize)) {
        next.uiFilterPillSize = source.uiFilterPillSize;
      }
      if (typeof source.uiHintTextSize === 'number' && Number.isFinite(source.uiHintTextSize)) {
        next.uiHintTextSize = source.uiHintTextSize;
      }
      if (typeof source.chatContactNameSize === 'number' && Number.isFinite(source.chatContactNameSize)) {
        next.chatContactNameSize = source.chatContactNameSize;
      }
      if (typeof source.chatContactSubtitleSize === 'number' && Number.isFinite(source.chatContactSubtitleSize)) {
        next.chatContactSubtitleSize = source.chatContactSubtitleSize;
      }
      if (source.tabIconUrls && typeof source.tabIconUrls === 'object') {
        const input = source.tabIconUrls as Partial<TabIconUrls>;
        next.tabIconUrls = {
          home: typeof input.home === 'string' ? input.home.trim() : '',
          inbox: typeof input.inbox === 'string' ? input.inbox.trim() : '',
          calendar: typeof input.calendar === 'string' ? input.calendar.trim() : '',
          tarot: typeof input.tarot === 'string' ? input.tarot.trim() : '',
          letters: typeof input.letters === 'string' ? input.letters.trim() : '',
          heart: typeof input.heart === 'string' ? input.heart.trim() : '',
          list: typeof input.list === 'string' ? input.list.trim() : '',
          fitness: typeof input.fitness === 'string' ? input.fitness.trim() : '',
          pomodoro: typeof input.pomodoro === 'string' ? input.pomodoro.trim() : '',
          period: typeof input.period === 'string' ? input.period.trim() : '',
          diary: typeof input.diary === 'string' ? input.diary.trim() : '',
          album: typeof input.album === 'string' ? input.album.trim() : '',
          notes: typeof input.notes === 'string' ? input.notes.trim() : '',
          settings: typeof input.settings === 'string' ? input.settings.trim() : '',
        };
      }
      if (source.tabIconDisplayMode === 'framed' || source.tabIconDisplayMode === 'full') {
        next.tabIconDisplayMode = source.tabIconDisplayMode;
      }
      if (typeof source.calendarCellRadius === 'number' && Number.isFinite(source.calendarCellRadius)) {
        next.calendarCellRadius = source.calendarCellRadius;
      }
      if (typeof source.calendarCellShadow === 'number' && Number.isFinite(source.calendarCellShadow)) {
        next.calendarCellShadow = source.calendarCellShadow;
      }
      if (typeof source.calendarCellDepth === 'number' && Number.isFinite(source.calendarCellDepth)) {
        next.calendarCellDepth = source.calendarCellDepth;
      }
      if (source.backgroundMode === 'gradient' || source.backgroundMode === 'image' || source.backgroundMode === 'dynamic') {
        next.backgroundMode = source.backgroundMode;
      }
      if (typeof source.backgroundGradientStart === 'string') {
        next.backgroundGradientStart = source.backgroundGradientStart;
      }
      if (typeof source.backgroundGradientEnd === 'string') {
        next.backgroundGradientEnd = source.backgroundGradientEnd;
      }
      if (
        source.homeDynamicWallpaperPreset === 'gradientFlow' ||
        source.homeDynamicWallpaperPreset === 'snowNight' ||
        source.homeDynamicWallpaperPreset === 'bokehDream' ||
        source.homeDynamicWallpaperPreset === 'firefly' ||
        source.homeDynamicWallpaperPreset === 'meteorShower' ||
        source.homeDynamicWallpaperPreset === 'skyLantern' ||
        source.homeDynamicWallpaperPreset === 'coolTwilight' ||
        source.homeDynamicWallpaperPreset === 'auroraDance' ||
        source.homeDynamicWallpaperPreset === 'prismDepth'
      ) {
        next.homeDynamicWallpaperPreset = source.homeDynamicWallpaperPreset;
      }
      if (typeof source.homeDynamicEffectsEnabled === 'boolean') {
        next.homeDynamicEffectsEnabled = source.homeDynamicEffectsEnabled;
      }
      if (typeof source.homeDynamicIntensity === 'number' && Number.isFinite(source.homeDynamicIntensity)) {
        next.homeDynamicIntensity = source.homeDynamicIntensity;
      }
      if (typeof source.homeDynamicSpeed === 'number' && Number.isFinite(source.homeDynamicSpeed)) {
        next.homeDynamicSpeed = source.homeDynamicSpeed;
      }
      if (
        typeof source.homeDynamicParticleAmount === 'number' &&
        Number.isFinite(source.homeDynamicParticleAmount)
      ) {
        next.homeDynamicParticleAmount = source.homeDynamicParticleAmount;
      }
      if (
        source.homeWallpaperGradientPreset === 'auroraCandy' ||
        source.homeWallpaperGradientPreset === 'bokehDream' ||
        source.homeWallpaperGradientPreset === 'neonTwilight' ||
        source.homeWallpaperGradientPreset === 'peachSky' ||
        source.homeWallpaperGradientPreset === 'mintLilac' ||
        source.homeWallpaperGradientPreset === 'nightBlue'
      ) {
        next.homeWallpaperGradientPreset = source.homeWallpaperGradientPreset;
      }
      if (
        source.homeWallpaperEffectPreset === 'orbs' ||
        source.homeWallpaperEffectPreset === 'snow' ||
        source.homeWallpaperEffectPreset === 'heart' ||
        source.homeWallpaperEffectPreset === 'lantern' ||
        source.homeWallpaperEffectPreset === 'ribbon' ||
        source.homeWallpaperEffectPreset === 'stardust' ||
        source.homeWallpaperEffectPreset === 'bubbles' ||
        source.homeWallpaperEffectPreset === 'none'
      ) {
        next.homeWallpaperEffectPreset = source.homeWallpaperEffectPreset;
      } else if (source.homeWallpaperEffectPreset === 'firefly') {
        next.homeWallpaperEffectPreset = 'heart';
      }
      if (typeof source.backgroundImageUrl === 'string') {
        next.backgroundImageUrl = source.backgroundImageUrl;
      }
      if (typeof source.backgroundImageOverlay === 'number' && Number.isFinite(source.backgroundImageOverlay)) {
        next.backgroundImageOverlay = source.backgroundImageOverlay;
      }
      if (typeof source.homeWidgetTitle === 'string') {
        next.homeWidgetTitle = source.homeWidgetTitle;
      }
      if (typeof source.homeWidgetSubtitle === 'string') {
        next.homeWidgetSubtitle = source.homeWidgetSubtitle;
      }
      if (typeof source.homeWidgetBadgeText === 'string') {
        next.homeWidgetBadgeText = source.homeWidgetBadgeText;
      }
      if (typeof source.homeWidgetIconDataUrl === 'string') {
        next.homeWidgetIconDataUrl = source.homeWidgetIconDataUrl;
      }
      if (typeof source.inboxTitle === 'string') {
        next.inboxTitle = source.inboxTitle;
      }
      if (typeof source.memorialStartDate === 'string') {
        next.memorialStartDate = source.memorialStartDate;
      }
      if (source.homeFinalWidgetPreset === 'vinylCounter' || source.homeFinalWidgetPreset === 'polaroid') {
        next.homeFinalWidgetPreset = source.homeFinalWidgetPreset;
      }
      if (Array.isArray(source.homePolaroidMessages)) {
        const normalizedPolaroidMessages = source.homePolaroidMessages
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
        if (normalizedPolaroidMessages.length) {
          next.homePolaroidMessages = normalizedPolaroidMessages;
        }
      }
      if (source.diaryCoverFitMode === 'cover' || source.diaryCoverFitMode === 'contain') {
        next.diaryCoverFitMode = source.diaryCoverFitMode;
      }
      if (typeof source.tarotNameColor === 'string') {
        next.tarotNameColor = source.tarotNameColor;
      }
      if (typeof source.tarotNameScale === 'number' && Number.isFinite(source.tarotNameScale)) {
        next.tarotNameScale = source.tarotNameScale;
      }
      if (typeof source.chibiPoolSize === 'number' && Number.isFinite(source.chibiPoolSize)) {
        next.chibiPoolSize = Math.max(20, Math.min(200, Math.round(source.chibiPoolSize)));
      }
      const rawChibiPoolMode = (source as Record<string, unknown>).chibiPoolMode;
      if (
        rawChibiPoolMode === 'i' ||
        rawChibiPoolMode === 'ii' ||
        rawChibiPoolMode === 'all' ||
        rawChibiPoolMode === 'a' ||
        rawChibiPoolMode === 'b'
      ) {
        next.chibiPoolMode =
          rawChibiPoolMode === 'a' ? 'i' : rawChibiPoolMode === 'b' ? 'ii' : rawChibiPoolMode;
      }
      if (source.appLabels && typeof source.appLabels === 'object') {
        const input = source.appLabels as Partial<AppLabels>;
        next.appLabels = {
          home: typeof input.home === 'string' ? input.home.trim() : '',
          inbox: typeof input.inbox === 'string' ? input.inbox.trim() : '',
          calendar: typeof input.calendar === 'string' ? input.calendar.trim() : '',
          settings: typeof input.settings === 'string' ? input.settings.trim() : '',
          tarot: typeof input.tarot === 'string' ? input.tarot.trim() : '',
          letters: typeof input.letters === 'string' ? input.letters.trim() : '',
          heart: typeof input.heart === 'string' ? input.heart.trim() : '',
          chat: typeof input.chat === 'string' ? input.chat.trim() : '',
          list: typeof input.list === 'string' ? input.list.trim() : '',
          fitness: typeof input.fitness === 'string' ? input.fitness.trim() : '',
          pomodoro: typeof input.pomodoro === 'string' ? input.pomodoro.trim() : '',
          period: typeof input.period === 'string' ? input.period.trim() : '',
          diary: typeof input.diary === 'string' ? input.diary.trim() : '',
          album: typeof input.album === 'string' ? input.album.trim() : '',
          notes: typeof input.notes === 'string' ? input.notes.trim() : '',
        };
      }

      onSettingChange(next);
      setAppearancePresetStatus('已匯入美化設定');
    } catch {
      setAppearancePresetStatus('匯入失敗：檔案不是有效的 JSON');
    }
  }

  function handleBackgroundImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }

      setBackgroundImageUrlDraft(reader.result);
      onSettingChange({
        backgroundMode: 'image',
        backgroundImageUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }

  function handleChatBackgroundImageUpload(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }

      setChatBackgroundImageUrlDraft(reader.result);
      onSettingChange({
        chatBackgroundImageUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }

  function applyHomeTextSettings() {
    onSettingChange({
      homeWidgetTitle: homeWidgetTitleDraft.trim(),
      homeWidgetBadgeText: homeWidgetBadgeDraft.trim(),
      homeWidgetSubtitle: homeWidgetSubtitleDraft.trim(),
      inboxTitle: inboxTitleDraft.trim(),
      memorialStartDate: memorialStartDateDraft.trim(),
    });
    setHomeTextStatus('已儲存');
    emitActionToast({ kind: 'success', message: '首頁與信箱設定已儲存' });
    window.setTimeout(() => setHomeTextStatus(''), 1200);
  }

  function applyHomeWidgetSettings() {
    onSettingChange({
      homeFinalWidgetPreset: homeFinalWidgetDraft,
    });
    setHomeWidgetStatus('已儲存');
    emitActionToast({ kind: 'success', message: '首頁小組件類型已儲存' });
    window.setTimeout(() => setHomeWidgetStatus(''), 1200);
  }

  function applyHomePolaroidMessages() {
    onSettingChange({
      homePolaroidMessages: normalizePolaroidMessagesInput(
        homePolaroidMessagesDraft,
        settings.homePolaroidMessages,
      ),
    });
    setHomePolaroidStatus('已儲存');
    emitActionToast({ kind: 'success', message: '拍力得句子已儲存' });
    window.setTimeout(() => setHomePolaroidStatus(''), 1200);
  }

  function handleHomeWidgetIconUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      onSettingChange({ homeWidgetIconDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function handleDiaryCoverUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setDiaryCoverUrlDraft(reader.result);
      onSettingChange({ diaryCoverImageUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  async function runBackupAction(
    target: 'aboutMe' | 'aboutM',
    workingText: string,
    action: () => Promise<string> | string,
  ) {
    setBackupBusy(target);
    if (target === 'aboutMe') {
      setAboutMeBackupStatus(workingText);
    } else {
      setAboutMBackupStatus(workingText);
    }

    try {
      const result = await action();
      const text = typeof result === 'string' && result.trim() ? result : '操作完成';
      if (target === 'aboutMe') {
        setAboutMeBackupStatus(text);
      } else {
        setAboutMBackupStatus(text);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : '操作失敗';
      if (target === 'aboutMe') {
        setAboutMeBackupStatus(`失敗：${text}`);
      } else {
        setAboutMBackupStatus(`失敗：${text}`);
      }
    } finally {
      setBackupBusy(null);
    }
  }

  const previewFontFamily = useMemo(() => {
    const draftUrl = fontFileUrlDraft.trim();
    if (draftUrl) {
      return SETTINGS_PREVIEW_FONT_FAMILY;
    }

    if (settings.customFontFileUrl.trim()) {
      return APP_CUSTOM_FONT_FAMILY;
    }

    return "'Plus Jakarta Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  }, [
    settings.customFontFileUrl,
    fontFileUrlDraft,
  ]);

  const notificationLabel =
    notificationPermission === 'unsupported'
      ? '此瀏覽器不支援'
      : notificationPermission === 'granted'
        ? '已允許'
        : notificationPermission === 'denied'
          ? '已封鎖'
          : '尚未決定';

  const letterEntriesForSettings = useMemo(() => {
    const list = [...letters];
    list.sort((a, b) => {
      const ta = normalizeLetterTimestamp(a.writtenAt) ?? normalizeLetterTimestamp(a.importedAt) ?? 0;
      const tb = normalizeLetterTimestamp(b.writtenAt) ?? normalizeLetterTimestamp(b.importedAt) ?? 0;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name, 'zh-TW');
    });
    return list;
  }, [letters]);

  const diaryEntriesForSettings = useMemo(() => {
    const list = [...diaries];
    list.sort((a, b) => {
      const ta = normalizeLetterTimestamp(a.importedAt) ?? 0;
      const tb = normalizeLetterTimestamp(b.importedAt) ?? 0;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name, 'zh-TW');
    });
    return list;
  }, [diaries]);

  const activeFontSlots = getFontSlots(FONT_PRESET_KEY);
  const activeFontSlotNames = getFontSlotNames(FONT_PRESET_KEY);
  const activeFontPresetHasValue =
    fontPresetSelection !== null &&
    Boolean((activeFontSlots[fontPresetSelection] ?? '').trim() || (activeFontSlotNames[fontPresetSelection] ?? '').trim());
  const allFontTargetsChecked = FONT_TARGET_OPTIONS.every((item) => fontApplyTargets[item.key]);
  const usageTarget = FONT_TARGET_OPTIONS.find((item) => item.key === fontUsagePreviewTarget) ?? FONT_TARGET_OPTIONS[0];
  const usageTargetUrl = getAppliedFontUrlByTarget(fontUsagePreviewTarget);
  const usageMatchedPresetIndex = activeFontSlots.findIndex((value) => value.trim() === usageTargetUrl);
  const usageMatchedPresetName =
    usageMatchedPresetIndex >= 0
      ? getFontSlotName(
          activeFontSlots[usageMatchedPresetIndex] ?? '',
          usageMatchedPresetIndex,
          activeFontSlotNames[usageMatchedPresetIndex] ?? '',
        )
      : '';
  const usageSummary =
    !usageTargetUrl
      ? '空白（使用預設字體）'
      : usageMatchedPresetIndex >= 0
        ? `記憶 ${usageMatchedPresetIndex + 1} · ${usageMatchedPresetName}`
        : '外部字體（未存入字體預設）';

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-24">
      <header className="themed-header-panel rounded-2xl border p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">設定</p>
        <h1 className="mt-1 text-2xl text-stone-900">控制中心</h1>
      </header>

      <div className="space-y-2">
        <SettingPanel
          icon="📊"
          title="資料概況"
          subtitle="目前信件與月曆數量"
          isOpen={openPanel === 'overview'}
          onToggle={() => togglePanel('overview')}
        >
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <dt className="text-xs text-stone-500">可見信件</dt>
              <dd className="text-lg text-stone-900">{visibleEmailCount}</dd>
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <dt className="text-xs text-stone-500">信件總數</dt>
              <dd className="text-lg text-stone-900">{totalEmailCount}</dd>
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <dt className="text-xs text-stone-500">月曆月份數</dt>
              <dd className="text-lg text-stone-900">{monthCount}</dd>
            </div>
          </dl>
        </SettingPanel>

        <SettingPanel
          icon="🗃️"
          title="大備份"
          subtitle="關於我 / 關於M 分包匯入匯出"
          isOpen={openPanel === 'bigBackup'}
          onToggle={() => togglePanel('bigBackup')}
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleBackupGroup('aboutMe')}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-stone-800">關於我</span>
                  <span className="mt-0.5 block text-xs text-stone-500">包含：經期日記、打卡、Anni 日記、便利貼</span>
                </span>
                <span
                  className={`text-lg leading-none text-stone-500 transition-transform ${openBackupGroup === 'aboutMe' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {openBackupGroup === 'aboutMe' && (
                <div className="mt-3 space-y-2.5 border-t border-stone-200 pt-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        void runBackupAction('aboutMe', '關於我匯出中…', () => onExportAboutMeBackup());
                      }}
                      disabled={backupBusy !== null}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      完整匯出
                    </button>
                    <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-center text-xs text-stone-700">
                      匯入（合併）
                      <input
                        type="file"
                        multiple
                        accept=".json,application/json"
                        className="hidden"
                        disabled={backupBusy !== null}
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          if (files.length) {
                            void runBackupAction('aboutMe', '關於我匯入中（合併）…', () =>
                              onImportAboutMeBackup(files, 'merge'),
                            );
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <label className="cursor-pointer rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-center text-xs text-rose-700">
                      匯入（覆蓋）
                      <input
                        type="file"
                        multiple
                        accept=".json,application/json"
                        className="hidden"
                        disabled={backupBusy !== null}
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          if (files.length) {
                            void runBackupAction('aboutMe', '關於我匯入中（覆蓋）…', () =>
                              onImportAboutMeBackup(files, 'overwrite'),
                            );
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>
                  {aboutMeBackupStatus && <p className="text-xs text-stone-600">{aboutMeBackupStatus}</p>}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleBackupGroup('aboutM')}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-stone-800">關於M</span>
                  <span className="mt-0.5 block text-xs text-stone-500">分包：mDiary / letters / chatLogs / inbox / soulmate / other（含 metadata）</span>
                </span>
                <span
                  className={`text-lg leading-none text-stone-500 transition-transform ${openBackupGroup === 'aboutM' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {openBackupGroup === 'aboutM' && (
                <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        void runBackupAction('aboutM', '關於M匯出中…', () => onExportAboutMBackup());
                      }}
                      disabled={backupBusy !== null}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      完整匯出
                    </button>
                    <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-center text-xs text-stone-700">
                      匯入（合併）
                      <input
                        type="file"
                        multiple
                        accept=".json,application/json"
                        className="hidden"
                        disabled={backupBusy !== null}
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          if (files.length) {
                            void runBackupAction('aboutM', '關於M匯入中（合併）…', () =>
                              onImportAboutMBackup(files, 'merge'),
                            );
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <label className="cursor-pointer rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-center text-xs text-rose-700">
                      匯入（覆蓋）
                      <input
                        type="file"
                        multiple
                        accept=".json,application/json"
                        className="hidden"
                        disabled={backupBusy !== null}
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          if (files.length) {
                            void runBackupAction('aboutM', '關於M匯入中（覆蓋）…', () =>
                              onImportAboutMBackup(files, 'overwrite'),
                            );
                          }
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="space-y-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2.5">
                    <p className="text-xs text-stone-500">分包匯出 / 匯入（適合大檔案分批）</p>
                    <div className="space-y-2">
                      {ABOUT_M_PART_FIELDS.map((field) => (
                        <div key={field.key} className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-stone-700">{field.label}</p>
                            <p className="text-[11px] text-stone-400">{field.hint}</p>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void runBackupAction('aboutM', `關於M・${field.label}匯出中…`, () =>
                                  onExportAboutMBackupPart(field.key),
                                );
                              }}
                              disabled={backupBusy !== null}
                              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-center text-[11px] text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              匯出
                            </button>
                            <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-2 py-1.5 text-center text-[11px] text-stone-700">
                              合併
                              <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                disabled={backupBusy !== null}
                                onChange={(event) => {
                                  const files = event.target.files ? Array.from(event.target.files) : [];
                                  if (files.length) {
                                    void runBackupAction('aboutM', `關於M・${field.label}匯入中（合併）…`, () =>
                                      onImportAboutMBackupPart(field.key, files, 'merge'),
                                    );
                                  }
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                            <label className="cursor-pointer rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-center text-[11px] text-rose-700">
                              覆蓋
                              <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                disabled={backupBusy !== null}
                                onChange={(event) => {
                                  const files = event.target.files ? Array.from(event.target.files) : [];
                                  if (files.length) {
                                    void runBackupAction('aboutM', `關於M・${field.label}匯入中（覆蓋）…`, () =>
                                      onImportAboutMBackupPart(field.key, files, 'overwrite'),
                                    );
                                  }
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {aboutMBackupStatus && <p className="text-xs text-stone-600">{aboutMBackupStatus}</p>}
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs text-stone-500">
              <p>完整匯入請一次選同一包的全部 JSON（包含 manifest 索引檔）。</p>
              <p>分包匯出/匯入可單獨處理 mDiary / letters / chatLogs / inbox / soulmate / other。</p>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🎨"
          title="外觀"
          subtitle="主題色、字體比例與日曆外觀"
          isOpen={openPanel === 'appearance'}
          onToggle={() => togglePanel('appearance')}
        >
          <div className="space-y-3">
            <SettingSubgroup
              title="色彩與字體比例"
              subtitle="主題色、首頁文字、泡泡色、縮放"
              isOpen={openAppearanceGroup === 'colorScale'}
              onToggle={() => toggleAppearanceGroup('colorScale')}
            >
              <label className="block space-y-2">
                <span>自訂主題色（分頁與自訂月曆色）</span>
                <input
                  type="color"
                  value={settings.themeMonthColor}
                  onChange={(event) => onSettingChange({ themeMonthColor: event.target.value })}
                  className="h-10 w-full rounded-md border border-stone-300"
                />
              </label>

              <label className="block space-y-2">
                <span>首頁字體顏色</span>
                <input
                  type="color"
                  value={settings.globalTextColor}
                  onChange={(event) => onSettingChange({ globalTextColor: event.target.value })}
                  className="h-10 w-full rounded-md border border-stone-300"
                />
              </label>

              <label className="block space-y-2">
                <span>未解鎖泡泡色</span>
                <input
                  type="color"
                  value={settings.lockedBubbleColor}
                  onChange={(event) => onSettingChange({ lockedBubbleColor: event.target.value })}
                  className="h-10 w-full rounded-md border border-stone-300"
                />
              </label>

              <label className="block space-y-2">
                <span>月曆底下氣泡文字色</span>
                <input
                  type="color"
                  value={settings.calendarHoverBubbleTextColor}
                  onChange={(event) => onSettingChange({ calendarHoverBubbleTextColor: event.target.value })}
                  className="h-10 w-full rounded-md border border-stone-300"
                />
              </label>

              <label className="block space-y-2">
                <span>字體大小：{settings.fontScale.toFixed(2)}x</span>
                <input
                  type="range"
                  min={0.9}
                  max={1.25}
                  step={0.05}
                  value={settings.fontScale}
                  onChange={(event) => onSettingChange({ fontScale: Number(event.target.value) })}
                  className="w-full"
                />
              </label>
            </SettingSubgroup>

            <SettingSubgroup
              title="月曆立體外觀"
              subtitle="圓角、陰影、深度"
              isOpen={openAppearanceGroup === 'calendar'}
              onToggle={() => toggleAppearanceGroup('calendar')}
            >
              <label className="block space-y-1">
                <span className="flex items-center justify-between">
                  <span>圓角</span>
                  <span className="text-xs text-stone-500">{settings.calendarCellRadius}px</span>
                </span>
                <input
                  type="range"
                  min={8}
                  max={28}
                  step={1}
                  value={settings.calendarCellRadius}
                  onChange={(event) => onSettingChange({ calendarCellRadius: Number(event.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex items-center justify-between">
                  <span>陰影強度</span>
                  <span className="text-xs text-stone-500">{settings.calendarCellShadow}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.calendarCellShadow}
                  onChange={(event) => onSettingChange({ calendarCellShadow: Number(event.target.value) })}
                  className="w-full"
                />
              </label>
              <label className="block space-y-1">
                <span className="flex items-center justify-between">
                  <span>立體感</span>
                  <span className="text-xs text-stone-500">{settings.calendarCellDepth}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.calendarCellDepth}
                  onChange={(event) => onSettingChange({ calendarCellDepth: Number(event.target.value) })}
                  className="w-full"
                />
              </label>
            </SettingSubgroup>

            <SettingSubgroup
              title="透明小人輪換池"
              subtitle="I池/II池/全部 + 一鍵輪換"
              isOpen={openAppearanceGroup === 'chibi'}
              onToggle={() => toggleAppearanceGroup('chibi')}
            >
              <p className="text-xs text-stone-500">
                已上傳 {chibiPoolInfo.allCount} 張，目前模式「
                {settings.chibiPoolMode === 'i' ? 'I池' : settings.chibiPoolMode === 'ii' ? 'II池' : '全部'}
                」，啟用池 {chibiPoolInfo.activeCount} 張。
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ chibiPoolMode: 'i' });
                    setChibiPoolStatus('已切換到 I池');
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    settings.chibiPoolMode === 'i'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  I池
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ chibiPoolMode: 'ii' });
                    setChibiPoolStatus('已切換到 II池');
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    settings.chibiPoolMode === 'ii'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  II池
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ chibiPoolMode: 'all' });
                    setChibiPoolStatus('已切換到 全部');
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    settings.chibiPoolMode === 'all'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  全部
                </button>
              </div>
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs text-stone-600">
                  <span>啟用池大小</span>
                  <span>{settings.chibiPoolMode === 'all' ? '全部啟用' : `${settings.chibiPoolSize} 張`}</span>
                </span>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={settings.chibiPoolSize}
                  disabled={settings.chibiPoolMode === 'all'}
                  onChange={(event) => {
                    onSettingChange({ chibiPoolSize: Number(event.target.value) });
                    setChibiPoolStatus('已更新啟用池大小');
                  }}
                  className="w-full disabled:cursor-not-allowed disabled:opacity-40"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={settings.chibiPoolMode === 'all'}
                  onClick={() => {
                    onReshuffleChibiPool(settings.chibiPoolMode);
                    setChibiPoolStatus(
                      settings.chibiPoolMode === 'i' ? '已重新抽換 I池' : '已重新抽換 II池',
                    );
                  }}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  一鍵輪換目前池
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onReshuffleChibiPool('i');
                    setChibiPoolStatus('已重新抽換 I池');
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  輪換 I池
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onReshuffleChibiPool('ii');
                    setChibiPoolStatus('已重新抽換 II池');
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  輪換 II池
                </button>
              </div>
              {chibiPoolStatus && <p className="text-xs text-stone-600">{chibiPoolStatus}</p>}
              <p className="text-xs text-stone-500">
                I/II 會各自從 `public/chibi-pool-i`、`public/chibi-pool-ii` 抽取；若該池資料夾是空的，會回退到
                `public/chibi`。支援透明 PNG / WebP / AVIF。
              </p>
            </SettingSubgroup>

            <SettingSubgroup
              title="美化設定備份"
              subtitle="匯入 / 匯出外觀 JSON"
              isOpen={openAppearanceGroup === 'preset'}
              onToggle={() => toggleAppearanceGroup('preset')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportAppearancePreset}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
                >
                  匯出美化 JSON
                </button>
                <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                  匯入美化 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void importAppearancePreset(file);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              {appearancePresetStatus && <p className="text-xs text-stone-600">{appearancePresetStatus}</p>}
            </SettingSubgroup>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🖼️"
          title="背景樣式"
          subtitle="漸層 / 圖片 / 動態桌布與特效"
          isOpen={openPanel === 'wallpaper'}
          onToggle={() => togglePanel('wallpaper')}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSettingChange({ backgroundMode: 'gradient' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  settings.backgroundMode === 'gradient'
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-700'
                }`}
              >
                漸層背景
              </button>
              <button
                type="button"
                onClick={() => onSettingChange({ backgroundMode: 'image' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  settings.backgroundMode === 'image'
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-700'
                }`}
              >
                圖片背景
              </button>
              <button
                type="button"
                onClick={() => onSettingChange({ backgroundMode: 'dynamic' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  settings.backgroundMode === 'dynamic'
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-700'
                }`}
              >
                動態背景
              </button>
            </div>

            {settings.backgroundMode === 'gradient' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">漸層起始色</span>
                  <input
                    type="color"
                    value={settings.backgroundGradientStart}
                    onChange={(event) => onSettingChange({ backgroundGradientStart: event.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">漸層結束色</span>
                  <input
                    type="color"
                    value={settings.backgroundGradientEnd}
                    onChange={(event) => onSettingChange({ backgroundGradientEnd: event.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>
              </div>
            )}

            {settings.backgroundMode === 'image' && (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">背景圖片網址</span>
                  <input
                    type="url"
                    value={backgroundImageUrlDraft}
                    onChange={(event) => setBackgroundImageUrlDraft(event.target.value)}
                    placeholder="https://example.com/background.jpg"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSettingChange({ backgroundImageUrl: backgroundImageUrlDraft.trim() });
                      emitActionToast({ kind: 'success', message: '背景圖片已套用' });
                    }}
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
                  >
                    套用圖片網址
                  </button>
                  <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                    上傳背景圖
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        handleBackgroundImageUpload(event.target.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>圖片遮罩深度</span>
                    <span>{settings.backgroundImageOverlay}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={settings.backgroundImageOverlay}
                    onChange={(event) => onSettingChange({ backgroundImageOverlay: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>
            )}

            {settings.backgroundMode === 'dynamic' && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-white/70 px-3 py-3">
                <p className="text-xs text-stone-500">首頁桌布（動態模式專用，9 種全動態）</p>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>動態桌布</span>
                    <span className="text-[11px] text-stone-500">目前：{activeHomeDynamicOption.label}</span>
                  </span>
                  <select
                    value={homeDynamicWallpaperDraft}
                    onChange={(event) =>
                      setHomeDynamicWallpaperDraft(event.target.value as AppSettings['homeDynamicWallpaperPreset'])
                    }
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                  >
                    {HOME_DYNAMIC_WALLPAPER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-500">說明</p>
                  <p className="mt-1 text-xs text-stone-700">{selectedHomeDynamicOption.hint}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ homeDynamicWallpaperPreset: homeDynamicWallpaperDraft });
                    emitActionToast({ kind: 'success', message: `已套用：${selectedHomeDynamicOption.label}` });
                  }}
                  disabled={!isHomeDynamicWallpaperDirty}
                  className={`rounded-lg px-3 py-2 text-xs transition ${
                    isHomeDynamicWallpaperDirty
                      ? 'bg-stone-900 text-white hover:bg-stone-700'
                      : 'cursor-not-allowed bg-stone-300 text-stone-500'
                  }`}
                >
                  {isHomeDynamicWallpaperDirty ? `套用：${selectedHomeDynamicOption.label}` : '已套用'}
                </button>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>特效樣式</span>
                    <span className="text-[11px] text-stone-500">目前：{activeHomeDynamicEffectOption.label}</span>
                  </span>
                  <select
                    value={homeDynamicEffectDraft}
                    onChange={(event) =>
                      setHomeDynamicEffectDraft(event.target.value as AppSettings['homeWallpaperEffectPreset'])
                    }
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                  >
                    {HOME_DYNAMIC_EFFECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-500">特效說明</p>
                  <p className="mt-1 text-xs text-stone-700">{selectedHomeDynamicEffectOption.hint}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ homeWallpaperEffectPreset: homeDynamicEffectDraft });
                    emitActionToast({ kind: 'success', message: `特效已套用：${selectedHomeDynamicEffectOption.label}` });
                  }}
                  disabled={!isHomeDynamicEffectDirty}
                  className={`rounded-lg px-3 py-2 text-xs transition ${
                    isHomeDynamicEffectDirty
                      ? 'bg-stone-900 text-white hover:bg-stone-700'
                      : 'cursor-not-allowed bg-stone-300 text-stone-500'
                  }`}
                >
                  {isHomeDynamicEffectDirty ? `套用特效：${selectedHomeDynamicEffectOption.label}` : '特效已套用'}
                </button>

                <label className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                  <span className="text-xs text-stone-700">特效總開關</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.homeDynamicEffectsEnabled}
                    onClick={() => onSettingChange({ homeDynamicEffectsEnabled: !settings.homeDynamicEffectsEnabled })}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      settings.homeDynamicEffectsEnabled
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-300 text-stone-700'
                    }`}
                  >
                    {settings.homeDynamicEffectsEnabled ? '開' : '關'}
                  </button>
                </label>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>強度</span>
                    <span>{Math.round(settings.homeDynamicIntensity)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.homeDynamicIntensity}
                    onChange={(event) => onSettingChange({ homeDynamicIntensity: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>速度</span>
                    <span>{Math.round(settings.homeDynamicSpeed)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.homeDynamicSpeed}
                    onChange={(event) => onSettingChange({ homeDynamicSpeed: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>粒子量</span>
                    <span>{Math.round(settings.homeDynamicParticleAmount)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.homeDynamicParticleAmount}
                    onChange={(event) => onSettingChange({ homeDynamicParticleAmount: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>
            )}
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🔤"
          title="字體中心"
          subtitle="整站／情書／治癒篝火（含心情星球、留光）／日記／家 的字體集中管理"
          isOpen={openPanel === 'fontCenter'}
          onToggle={() => togglePanel('fontCenter')}
        >
          <div className="space-y-3">
            <SettingSubgroup
              title="字體預設管理"
              subtitle="上傳來源、預覽、保存到字體預設"
              isOpen={openFontCenterGroup === 'preset'}
              onToggle={() => toggleFontCenterGroup('preset')}
            >
              <label className="block space-y-1">
                <span className="text-xs text-stone-600">選擇或切換預設</span>
                <select
                  value={fontPresetSelection === null ? 'blank' : String(fontPresetSelection)}
                  onChange={(event) => {
                    selectFontPreset(parseFontPresetSelection(event.target.value));
                  }}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  <option value="blank">空白（預設字體）</option>
                  {FONT_PRESET_INDICES.map((index) => (
                    <option key={`font-preset-${index}`} value={index}>
                      記憶 {index + 1} · {getFontSlotName(activeFontSlots[index] ?? '', index, activeFontSlotNames[index] ?? '')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-stone-600">預設名稱</span>
                <input
                  type="text"
                  value={getFontSlotLabelDraft(FONT_PRESET_KEY)}
                  onChange={(event) => setFontSlotLabelDraft(FONT_PRESET_KEY, event.target.value)}
                  placeholder="例如：溫柔手寫-手機版"
                  disabled={fontPresetSelection === null}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-stone-600">字體檔網址（ttf / otf / woff / woff2）</span>
                <input
                  type="url"
                  value={getFontDraftValue(FONT_PRESET_KEY)}
                  onChange={(event) => setFontDraftValue(FONT_PRESET_KEY, event.target.value)}
                  placeholder="https://example.com/custom.ttf"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-stone-600">或直接上傳字體檔</span>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                  onChange={(event) => {
                    handleScopedFontFileUpload(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs"
                />
              </label>
              <div className="rounded-lg border border-dashed border-stone-300 bg-white px-3 py-2">
                <p className="text-xs text-stone-500">即時預覽</p>
                <p
                  className="mt-1 text-base text-stone-800"
                  style={{ fontFamily: `${previewFontFamily}, 'Plus Jakarta Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` }}
                >
                  老婆，我在這裡。Hello 12345
                </p>
                <p
                  className="mt-1 text-sm text-stone-700"
                  style={{ fontFamily: `${previewFontFamily}, 'Plus Jakarta Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` }}
                >
                  這是字體預覽效果。
                </p>
              </div>
              <p className="text-xs text-stone-500">
                若是跨網域字體檔，來源需允許 CORS，否則手機瀏覽器可能顯示成預設字體。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCurrentFontPreset}
                  disabled={fontPresetSelection === null}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white disabled:opacity-40"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCurrentFontPreset}
                  disabled={fontPresetSelection === null || !activeFontPresetHasValue}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 disabled:opacity-40"
                >
                  刪除
                </button>
              </div>
            </SettingSubgroup>

            <SettingSubgroup
              title="字體套用範圍"
              subtitle="勾選頁面後，選擇要套用的字體預設"
              isOpen={openFontCenterGroup === 'scope'}
              onToggle={() => toggleFontCenterGroup('scope')}
            >
              <label className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={allFontTargetsChecked}
                  onChange={(event) => setAllFontApplyTargets(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-stone-300 accent-stone-700"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-stone-800">全部套用</span>
                  <span className="block text-xs text-stone-500">一次更新整站、情書、治癒篝火（含心情星球/留光）、日記、家頁、總攬、M&apos;s memo</span>
                </span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {FONT_TARGET_OPTIONS.map((target) => (
                  <label
                    key={`font-target-${target.key}`}
                    className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={fontApplyTargets[target.key]}
                      onChange={() => toggleFontApplyTarget(target.key)}
                      className="mt-1 h-4 w-4 rounded border-stone-300 accent-stone-700"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-stone-800">{target.label}</span>
                      <span className="block text-xs text-stone-500">{target.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-stone-600">套用哪個字體預設</span>
                <select
                  value={fontScopePresetSelection === null ? 'blank' : String(fontScopePresetSelection)}
                  onChange={(event) => setFontScopePresetSelection(parseFontPresetSelection(event.target.value))}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  <option value="blank">空白（還原預設字體）</option>
                  {FONT_PRESET_INDICES.map((index) => (
                    <option key={`font-scope-preset-${index}`} value={index}>
                      記憶 {index + 1} · {getFontSlotName(activeFontSlots[index] ?? '', index, activeFontSlotNames[index] ?? '')}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={applyFontToCheckedTargets}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
                >
                  保存並套用
                </button>
                <button
                  type="button"
                  onClick={restoreFontScopeDraft}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  還原目前設定
                </button>
              </div>
              <p className="text-xs text-stone-500">先在上方保存字體預設，再在這裡選要套到哪裡。</p>
            </SettingSubgroup>

            <SettingSubgroup
              title="當前套用檢視"
              subtitle="純預覽：目前每個範圍正在用哪個字體"
              isOpen={openFontCenterGroup === 'usage'}
              onToggle={() => toggleFontCenterGroup('usage')}
            >
              <label className="block space-y-1">
                <span className="text-xs text-stone-600">查看範圍</span>
                <select
                  value={fontUsagePreviewTarget}
                  onChange={(event) => setFontUsagePreviewTarget(event.target.value as FontApplyTargetKey)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  {FONT_TARGET_OPTIONS.map((option) => (
                    <option key={`font-usage-${option.key}`} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-stone-800">{usageTarget.label}</p>
                  <span className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] text-stone-700">
                    {usageSummary}
                  </span>
                </div>
                <p className="text-xs text-stone-500">{usageTarget.hint}</p>
                <p className="break-all rounded-md border border-stone-200 bg-white px-2.5 py-2 font-mono text-[11px] text-stone-600">
                  {usageTargetUrl || '（目前為預設字體，沒有字體網址）'}
                </p>
              </div>
            </SettingSubgroup>

            <SettingSubgroup
              title="字級中心"
              subtitle="統一常用區塊：標題 / 頁籤 / 篩選籤條 / 提示小字 / 對話聯絡人"
              isOpen={openFontCenterGroup === 'size'}
              onToggle={() => toggleFontCenterGroup('size')}
            >
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-stone-800">全域縮放</span>
                  <span className="text-xs text-stone-500">{settings.fontScale.toFixed(2)}x</span>
                </div>
                <p className="text-[11px] text-stone-500">整體 UI 文字比例（含番茄鐘/塔羅/便利貼/家等未細分區塊）</p>
                <input
                  type="range"
                  min={0.9}
                  max={1.25}
                  step={0.05}
                  value={settings.fontScale}
                  onChange={(event) => onSettingChange({ fontScale: Number(event.target.value) })}
                  className="w-full accent-stone-700"
                />
              </label>

              <div className="space-y-3">
                {UI_SIZE_CONTROLS.map((control) => (
                  <label key={`ui-size-${control.key}`} className="block space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-stone-800">{control.label}</span>
                      <span className="text-xs text-stone-500">{settings[control.key]}px</span>
                    </div>
                    <p className="text-[11px] text-stone-500">{control.hint}</p>
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={settings[control.key]}
                      onChange={(event) =>
                        onSettingChange({
                          [control.key]: Number(event.target.value),
                        } as Partial<AppSettings>)
                      }
                      className="w-full accent-stone-700"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onSettingChange({
                      fontScale: DEFAULT_SETTINGS.fontScale,
                      uiHeaderTitleSize: DEFAULT_SETTINGS.uiHeaderTitleSize,
                      uiTabLabelSize: DEFAULT_SETTINGS.uiTabLabelSize,
                      uiFilterPillSize: DEFAULT_SETTINGS.uiFilterPillSize,
                      uiHintTextSize: DEFAULT_SETTINGS.uiHintTextSize,
                      chatContactNameSize: DEFAULT_SETTINGS.chatContactNameSize,
                      chatContactSubtitleSize: DEFAULT_SETTINGS.chatContactSubtitleSize,
                    })
                  }
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  還原這區預設
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-[11px] text-stone-600">
                  目前已接入：信箱（標題）、願望頁（標題/頁籤/籤條/提示字）、M日記（標題/頁籤/籤條/提示字）、Anni日記（標題/頁籤）、經期（標題/頁籤）、便利貼（標題）、留言月曆（月份標題）、番茄鐘（標題）、塔羅（標題）、家頁（首頁標題）、年度信件（標題）、對話首頁聯絡人名稱/副標。
                </p>
              </div>
            </SettingSubgroup>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🏠"
          title="首頁與信箱"
          subtitle="首頁卡片文案 · 信箱標題"
          isOpen={openPanel === 'home'}
          onToggle={() => togglePanel('home')}
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">首頁卡片</p>

              <label className="block space-y-1">
                <span className="text-xs text-stone-600">標題</span>
                <input
                  type="text"
                  value={homeWidgetTitleDraft}
                  onChange={(e) => { setHomeWidgetTitleDraft(e.target.value); setHomeTextStatus(''); }}
                  placeholder="Memorial"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-stone-600">標籤（留空就不顯示）</span>
                <input
                  type="text"
                  value={homeWidgetBadgeDraft}
                  onChange={(e) => { setHomeWidgetBadgeDraft(e.target.value); setHomeTextStatus(''); }}
                  placeholder="ACTIVE"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-stone-600">小語（留空就不顯示）</span>
                <input
                  type="text"
                  value={homeWidgetSubtitleDraft}
                  onChange={(e) => { setHomeWidgetSubtitleDraft(e.target.value); setHomeTextStatus(''); }}
                  placeholder="在這裡等妳，慢慢把日子收好。"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="space-y-2">
                <p className="text-xs text-stone-600">小圖（點首頁也可以換）</p>
                <div className="flex items-center gap-2">
                  <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {settings.homeWidgetIconDataUrl.trim() ? (
                      <img src={settings.homeWidgetIconDataUrl} alt="預覽" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl">♡</span>
                    )}
                  </div>
                  <label className="cursor-pointer rounded-lg bg-stone-900 px-3 py-2 text-xs text-white">
                    上傳小圖
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        handleHomeWidgetIconUpload(event.target.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {settings.homeWidgetIconDataUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => onSettingChange({ homeWidgetIconDataUrl: '' })}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">信箱標題</p>
              <input
                type="text"
                value={inboxTitleDraft}
                onChange={(e) => { setInboxTitleDraft(e.target.value); setHomeTextStatus(''); }}
                placeholder="Memorial Mailroom"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">想你的第 N 天起始日</p>
              <input
                type="date"
                value={memorialStartDateDraft}
                onChange={(e) => { setMemorialStartDateDraft(e.target.value); setHomeTextStatus(''); }}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
              <p className="text-xs text-stone-500">留空會顯示未設定（N 先顯示 1）。</p>
            </div>

            <button
              type="button"
              onClick={applyHomeTextSettings}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm text-white transition active:opacity-80"
            >
              儲存
            </button>
            {homeTextStatus && <p className="text-xs text-stone-500">{homeTextStatus}</p>}
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🧩"
          title="首頁小組件"
          subtitle="唱片機位子的插件選擇"
          isOpen={openPanel === 'homeWidget'}
          onToggle={() => togglePanel('homeWidget')}
        >
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">唱片機位子要放的組件</p>
              <label className="block space-y-1">
                <span className="text-xs text-stone-600">組件類型</span>
                <select
                  value={homeFinalWidgetDraft}
                  onChange={(event) => {
                    setHomeFinalWidgetDraft(event.target.value as AppSettings['homeFinalWidgetPreset']);
                    setHomeWidgetStatus('');
                    setHomePolaroidStatus('');
                  }}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {HOME_FINAL_WIDGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-stone-500">
                {HOME_FINAL_WIDGET_OPTIONS.find((option) => option.value === homeFinalWidgetDraft)?.hint ?? ''}
              </p>
            </div>

            {homeFinalWidgetDraft === 'polaroid' && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                <label className="block space-y-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-600">拍力得句子（每行一句）</span>
                    <button
                      type="button"
                      onClick={applyHomePolaroidMessages}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-sm text-stone-700 transition hover:bg-stone-100 active:scale-95"
                      aria-label="儲存拍力得句子"
                      title="儲存拍力得句子"
                    >
                      <span aria-hidden="true">💾</span>
                    </button>
                  </span>
                  <textarea
                    value={homePolaroidMessagesDraft}
                    onChange={(event) => {
                      setHomePolaroidMessagesDraft(event.target.value);
                      setHomePolaroidStatus('');
                    }}
                    rows={6}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    placeholder={'今天也辛苦啦！\n想妳的第 N 天\n不准熬夜寫 Code！'}
                  />
                </label>
                <p className="text-xs text-stone-500">可以改句子；留空會自動改回預設句子，顯示時會逐句輪換。</p>
                {homePolaroidStatus && <p className="text-xs text-stone-500">{homePolaroidStatus}</p>}
              </div>
            )}

            <button
              type="button"
              onClick={applyHomeWidgetSettings}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm text-white transition active:opacity-80"
            >
              儲存組件類型
            </button>
            {homeWidgetStatus && <p className="text-xs text-stone-500">{homeWidgetStatus}</p>}
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🏷️"
          title="入口名稱"
          subtitle="底部分頁與首頁入口可自訂"
          isOpen={openPanel === 'labels'}
          onToggle={() => togglePanel('labels')}
        >
          <div className="space-y-3">
            {APP_LABEL_FIELDS.map((field) => (
              <label key={field.key} className="block space-y-1">
                <span className="text-xs text-stone-600">{field.label}</span>
                <input
                  type="text"
                  value={labelDrafts[field.key]}
                  onChange={(event) => setLabelDraft(field.key, event.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            ))}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveAppLabels}
                className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
              >
                儲存名稱
              </button>
              <button
                type="button"
                onClick={restoreSavedAppLabels}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
              >
                還原草稿
              </button>
            </div>
            {labelStatus && <p className="text-xs text-stone-600">{labelStatus}</p>}
            <p className="text-xs text-stone-500">留空會套用預設名稱。</p>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🧩"
          title="自訂圖標"
          subtitle="底部分頁與首頁入口圖示（可用圖片網址）"
          isOpen={openPanel === 'tabIcons'}
          onToggle={() => togglePanel('tabIcons')}
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-600">圖示顯示模式</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ tabIconDisplayMode: 'framed' });
                    setTabIconStatus('已切換為：卡片框');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    settings.tabIconDisplayMode === 'framed'
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  卡片框
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ tabIconDisplayMode: 'full' });
                    setTabIconStatus('已切換為：滿版');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs ${
                    settings.tabIconDisplayMode === 'full'
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  滿版
                </button>
              </div>
            </div>

            {TAB_ICON_LABELS.map((tab) => {
              const iconUrl = tabIconDrafts[tab.key];
              return (
                <label key={tab.key} className="block space-y-1">
                  <span className="text-xs text-stone-600">{tab.label} 圖示網址</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-lg">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt=""
                          className={`${
                            settings.tabIconDisplayMode === 'full'
                              ? 'h-8 w-8 rounded-lg object-cover'
                              : 'h-6 w-6 rounded-md object-cover'
                          }`}
                        />
                      ) : (
                        TAB_ICON_FALLBACK[tab.key]
                      )}
                    </span>
                    <input
                      type="url"
                      value={iconUrl}
                      onChange={(event) => setTabIconDraft(tab.key, event.target.value)}
                      placeholder="https://example.com/icon.png"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
                    />
                    <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs text-stone-700">
                      上傳
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          handleTabIconUpload(tab.key, event.target.files?.[0] ?? null);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {iconUrl && (
                      <button
                        type="button"
                        onClick={() => setTabIconDraft(tab.key, '')}
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs text-stone-700"
                      >
                        清除
                      </button>
                    )}
                  </div>
                </label>
              );
            })}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveTabIcons}
                className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
              >
                儲存圖標設定
              </button>
              <button
                type="button"
                onClick={restoreSavedTabIcons}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
              >
                還原草稿
              </button>
            </div>
            {tabIconStatus && <p className="text-xs text-stone-600">{tabIconStatus}</p>}
            <p className="text-xs text-stone-500">
              留空就用預設圖示。可貼網址或直接上傳圖片（會存成本機 data URL）。
            </p>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🔔"
          title="通知與操作"
          subtitle="首頁桌面滑動、通知權限"
          isOpen={openPanel === 'notification'}
          onToggle={() => togglePanel('notification')}
        >
          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <span>啟用首頁左右滑桌面</span>
              <input
                type="checkbox"
                checked={settings.swipeEnabled}
                onChange={(event) => onSettingChange({ swipeEnabled: event.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <span>啟用解鎖通知</span>
              <input
                type="checkbox"
                checked={settings.localNotificationsEnabled}
                onChange={(event) => onSettingChange({ localNotificationsEnabled: event.target.checked })}
              />
            </label>
            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p>通知權限：{notificationLabel}</p>
              <button
                type="button"
                onClick={onRequestNotificationPermission}
                disabled={notificationPermission === 'unsupported' || notificationPermission === 'granted'}
                className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                申請通知權限
              </button>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="📥"
          title="本機匯入"
          subtitle="EML 與月曆 JSON"
          isOpen={openPanel === 'imports'}
          onToggle={() => togglePanel('imports')}
        >
          <div className="space-y-3">
            <label className="block space-y-2">
              <span>匯入 EML 信件</span>
              <input
                type="file"
                multiple
                accept=".eml,message/rfc822,text/plain"
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  if (files.length) {
                    onImportEmlFiles(files);
                  }
                  event.currentTarget.value = '';
                }}
                className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2"
              />
            </label>
            <label className="block space-y-2">
              <span>匯入月曆 JSON</span>
              <input
                type="file"
                multiple
                accept=".json,application/json"
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  if (files.length) {
                    onImportCalendarFiles(files);
                  }
                  event.currentTarget.value = '';
                }}
                className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2"
              />
            </label>

            {importStatus.kind !== 'idle' && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs ${
                  importStatus.kind === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : importStatus.kind === 'success'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-stone-300 bg-stone-100 text-stone-700'
                }`}
              >
                {importStatus.message}
              </p>
            )}
          </div>
        </SettingPanel>

        <SettingPanel
          icon="💬"
          title="Hover 語氣"
          subtitle="語氣權重與重抽"
          isOpen={openPanel === 'hover'}
          onToggle={() => togglePanel('hover')}
        >
          <div className="space-y-3">
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              {[
                { key: 'clingy', label: '黏人語氣' },
                { key: 'confession', label: '認真表白' },
                { key: 'calm', label: '冷靜守候' },
                { key: 'remorse', label: '破防懺悔' },
                { key: 'general', label: '通用語句' },
              ].map((tone) => (
                <label key={tone.key} className="block space-y-1">
                  <span className="flex items-center justify-between">
                    <span>{tone.label}</span>
                    <span className="text-xs text-stone-500">
                      權重 {settings.hoverToneWeights[tone.key as keyof typeof settings.hoverToneWeights]}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={settings.hoverToneWeights[tone.key as keyof typeof settings.hoverToneWeights]}
                    onChange={(event) =>
                      onHoverToneWeightChange(
                        tone.key as 'clingy' | 'confession' | 'calm' | 'remorse' | 'general',
                        Number(event.target.value),
                      )
                    }
                    className="w-full"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={onReshuffleHoverPhrases}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
            >
              重新隨機全部日期語氣
            </button>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🃏"
          title="塔羅"
          subtitle="閱覽室入口圖片 · 名稱字色與字級"
          isOpen={openPanel === 'tarot'}
          onToggle={() => togglePanel('tarot')}
        >
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-stone-500">閱覽室入口圖片 URL</span>
              <input
                type="url"
                value={tarotGalleryUrlDraft}
                onChange={(e) => setTarotGalleryUrlDraft(e.target.value)}
                placeholder="https://files.catbox.moe/..."
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            {tarotGalleryUrlDraft && (
              <img
                src={tarotGalleryUrlDraft}
                alt="預覽"
                className="h-24 w-full rounded-lg object-cover border border-stone-200"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                onSettingChange({ tarotGalleryImageUrl: tarotGalleryUrlDraft.trim() });
                emitActionToast({ kind: 'success', message: '塔羅入口圖片已套用' });
              }}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm text-white transition active:opacity-80"
            >
              套用
            </button>
            <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <label className="flex items-center justify-between gap-3 text-xs text-stone-600">
                <span>牌名顏色</span>
                <input
                  type="color"
                  value={settings.tarotNameColor}
                  onChange={(event) => onSettingChange({ tarotNameColor: event.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-stone-300 bg-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-stone-600">
                <span>牌名字級：{settings.tarotNameScale.toFixed(2)}x</span>
                <input
                  type="range"
                  min={0.8}
                  max={2}
                  step={0.05}
                  value={settings.tarotNameScale}
                  onChange={(event) => onSettingChange({ tarotNameScale: Number(event.target.value) })}
                  className="w-full"
                />
              </label>
            </div>
            <p className="text-xs text-stone-400">會套用在塔羅首頁牌名、閱覽室清單牌名、翻牌內容標題。</p>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="💌"
          title="情書"
          subtitle="模式 · 匯入"
          isOpen={openPanel === 'letters'}
          onToggle={() => togglePanel('letters')}
        >
          <div className="space-y-4">
            {/* Count */}
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-xs text-stone-500">已匯入情書</p>
              <p className="mt-0.5 truncate text-sm text-stone-800">{letterCount} 封</p>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-xs font-medium text-stone-600">情書頁模式</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSettingChange({ letterUiMode: 'classic' })}
                  className={`rounded-xl border px-3 py-2 text-xs transition active:opacity-80 ${
                    settings.letterUiMode === 'classic'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  經典（A/B/C）
                </button>
                <button
                  type="button"
                  onClick={() => onSettingChange({ letterUiMode: 'preview' })}
                  className={`rounded-xl border px-3 py-2 text-xs transition active:opacity-80 ${
                    settings.letterUiMode === 'preview'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  手札（I/II）
                </button>
              </div>
            </div>

            {/* File import */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-stone-600">匯入情書檔案</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入檔案
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.json,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportLetterFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入資料夾
                  <input
                    type="file"
                    // @ts-expect-error webkitdirectory is non-standard
                    webkitdirectory=""
                    multiple
                    accept=".txt,.md,.json,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportLetterFolderFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-stone-400">iPhone 通常不支援資料夾匯入，建議用「匯入檔案」。</p>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-600">已匯入清單（可單封刪除）</p>
                <span className="text-[11px] text-stone-500">{letterEntriesForSettings.length} 封</span>
              </div>
              {letterEntriesForSettings.length ? (
                <div className="max-h-44 overflow-y-auto rounded-md border border-stone-200 bg-white">
                  {letterEntriesForSettings.map((letter, index) => (
                    <div
                      key={`${letter.name}-${index}`}
                      className="flex items-center gap-2 px-2.5 py-2"
                      style={{
                        borderTop: index === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-stone-800">{stripLetterExtension(letter.name)}</p>
                        <p className="mt-0.5 text-[11px] text-stone-500">{formatLetterDateForList(letter)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteLetter(letter.name)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 transition active:opacity-80"
                        title={`刪除 ${letter.name}`}
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-400">目前沒有情書資料。</p>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={onClearAllLetters}
                disabled={!letterCount}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm text-rose-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空所有情書
              </button>
              <p className="mt-2 text-xs text-stone-400">情書儲存在本機，不會上傳到伺服器。</p>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="📓"
          title="日記"
          subtitle="封面 · 匯入"
          isOpen={openPanel === 'diary'}
          onToggle={() => togglePanel('diary')}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-xs text-stone-500">已匯入日記</p>
              <p className="mt-0.5 truncate text-sm text-stone-800">{diaryCount} 篇</p>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">日記封面</p>
              <input
                type="url"
                value={diaryCoverUrlDraft}
                onChange={(event) => setDiaryCoverUrlDraft(event.target.value)}
                placeholder="https://example.com/cover.jpg"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSettingChange({ diaryCoverImageUrl: diaryCoverUrlDraft.trim() });
                    emitActionToast({ kind: 'success', message: '日記封面已套用' });
                  }}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white"
                >
                  套用封面網址
                </button>
                <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                  上傳封面
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      handleDiaryCoverUpload(event.target.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setDiaryCoverUrlDraft('');
                    onSettingChange({ diaryCoverImageUrl: '' });
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                >
                  使用資料夾隨機封面
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSettingChange({ diaryCoverFitMode: 'cover' })}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    settings.diaryCoverFitMode === 'cover'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  滿版裁切
                </button>
                <button
                  type="button"
                  onClick={() => onSettingChange({ diaryCoverFitMode: 'contain' })}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    settings.diaryCoverFitMode === 'contain'
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700'
                  }`}
                >
                  完整顯示
                </button>
              </div>
              <p className="text-xs text-stone-400">若未設定網址，會嘗試用 `public/diary-covers/` 裡的圖片隨機顯示。</p>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-sm text-stone-800">匯入日記</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入檔案
                  <input
                    type="file"
                    multiple
                    accept=".txt,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportDiaryFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入資料夾
                  <input
                    type="file"
                    // @ts-expect-error webkitdirectory is non-standard
                    webkitdirectory=""
                    multiple
                    accept=".txt,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportDiaryFolderFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-stone-400">可放 txt / docx；同檔名會覆蓋舊版本。</p>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-600">已匯入清單（可單篇刪除）</p>
                <span className="text-[11px] text-stone-500">{diaryEntriesForSettings.length} 篇</span>
              </div>
              {diaryEntriesForSettings.length ? (
                <div className="max-h-44 overflow-y-auto rounded-md border border-stone-200 bg-white">
                  {diaryEntriesForSettings.map((entry, index) => (
                    <div
                      key={`${entry.name}-${index}`}
                      className="flex items-center gap-2 px-2.5 py-2"
                      style={{
                        borderTop: index === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-stone-800">{stripLetterExtension(entry.name)}</p>
                        <p className="mt-0.5 text-[11px] text-stone-500">{formatMDiaryDateForList(entry)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteDiary(entry.name)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 transition active:opacity-80"
                        title={`刪除 ${entry.name}`}
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-400">目前沒有日記資料。</p>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={onClearAllDiaries}
                disabled={!diaryCount}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm text-rose-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空所有日記
              </button>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🗨️"
          title="對話紀錄"
          subtitle="匯入 · 角色設定"
          isOpen={openPanel === 'chatLogs'}
          onToggle={() => togglePanel('chatLogs')}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <p className="text-xs text-stone-500">已匯入對話紀錄</p>
              <p className="mt-0.5 truncate text-sm text-stone-800">{chatLogCount} 份</p>
            </div>

            <SettingSubgroup
              title="泡泡外觀"
              subtitle="樣式、圓角、顏色"
              isOpen={openChatBubbleGroup}
              onToggle={() => setOpenChatBubbleGroup((current) => !current)}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatBubbleStyle: 'jelly' })}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      settings.chatBubbleStyle === 'jelly'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    QQ 果凍
                  </button>
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatBubbleStyle: 'imessage' })}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      settings.chatBubbleStyle === 'imessage'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    iMessage
                  </button>
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatBubbleStyle: 'imessageClassic' })}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      settings.chatBubbleStyle === 'imessageClassic'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    iMessage+
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>泡泡圓角（只影響對話紀錄）</span>
                    <span>{settings.chatBubbleRadius}px</span>
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={36}
                    step={1}
                    value={settings.chatBubbleRadius}
                    onChange={(e) => onSettingChange({ chatBubbleRadius: Number(e.target.value) })}
                    className="w-full accent-stone-800"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">我方底色（右側）</span>
                    <input
                      type="color"
                      value={settings.chatUserBubbleColor}
                      onChange={(e) => onSettingChange({ chatUserBubbleColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">對方底色（左側）</span>
                    <input
                      type="color"
                      value={settings.chatAiBubbleColor}
                      onChange={(e) => onSettingChange({ chatAiBubbleColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">我方邊框</span>
                    <input
                      type="color"
                      value={settings.chatUserBubbleBorderColor}
                      onChange={(e) => onSettingChange({ chatUserBubbleBorderColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">對方邊框</span>
                    <input
                      type="color"
                      value={settings.chatAiBubbleBorderColor}
                      onChange={(e) => onSettingChange({ chatAiBubbleBorderColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">我方文字</span>
                    <input
                      type="color"
                      value={settings.chatUserBubbleTextColor}
                      onChange={(e) => onSettingChange({ chatUserBubbleTextColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">對方文字</span>
                    <input
                      type="color"
                      value={settings.chatAiBubbleTextColor}
                      onChange={(e) => onSettingChange({ chatAiBubbleTextColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                </div>

                <p className="text-xs text-stone-500">iMessage / iMessage+ 會自動取消果凍亮面與抖動效果。</p>
              </div>
            </SettingSubgroup>

            <SettingSubgroup
              title="閱讀背景"
              subtitle="色票、圖片、透明度"
              isOpen={openChatBackgroundGroup}
              onToggle={() => setOpenChatBackgroundGroup((current) => !current)}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {CHAT_BACKGROUND_PRESETS.map((color) => {
                    const active = settings.chatBackgroundColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onSettingChange({ chatBackgroundColor: color })}
                        className={`h-7 w-7 rounded-full border transition active:scale-95 ${
                          active ? 'border-stone-900 ring-2 ring-stone-300' : 'border-stone-300'
                        }`}
                        style={{ background: color }}
                        aria-label={`背景色 ${color}`}
                        title={color}
                      />
                    );
                  })}
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">自訂底色</span>
                  <input
                    type="color"
                    value={settings.chatBackgroundColor}
                    onChange={(event) => onSettingChange({ chatBackgroundColor: event.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">背景圖片 URL</span>
                  <input
                    type="url"
                    value={chatBackgroundImageUrlDraft}
                    onChange={(event) => setChatBackgroundImageUrlDraft(event.target.value)}
                    placeholder="https://.../chat-bg.jpg"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatBackgroundImageUrl: chatBackgroundImageUrlDraft.trim() })}
                    className="rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                  >
                    套用圖片 URL
                  </button>
                  <label className="cursor-pointer rounded-xl border border-stone-300 bg-white py-2 text-center text-sm text-stone-700 transition active:opacity-80">
                    上傳圖片
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        handleChatBackgroundImageUpload(event.target.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>圖片遮罩</span>
                    <span>{settings.chatBackgroundOverlay}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={settings.chatBackgroundOverlay}
                    onChange={(event) => onSettingChange({ chatBackgroundOverlay: Number(event.target.value) })}
                    className="w-full accent-stone-800"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setChatBackgroundImageUrlDraft('');
                    onSettingChange({ chatBackgroundImageUrl: '', chatBackgroundOverlay: 0 });
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                >
                  移除背景圖片
                </button>
              </div>
            </SettingSubgroup>

            <div className="space-y-2">
              <p className="text-xs font-medium text-stone-600">匯入對話紀錄</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入檔案
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.json,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportChatLogFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80">
                  匯入資料夾
                  <input
                    type="file"
                    // @ts-expect-error webkitdirectory is non-standard
                    webkitdirectory=""
                    multiple
                    accept=".txt,.md,.json,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length) onImportChatLogFolderFiles(files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-stone-400">iPhone 通常不支援資料夾匯入，建議用「匯入檔案」。</p>
            </div>

            <div className="border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={onClearAllChatLogs}
                disabled={!chatLogCount}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm text-rose-700 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空所有對話紀錄
              </button>
              <p className="mt-2 text-xs text-stone-400">對話紀錄儲存在本機，不會上傳到伺服器。</p>
            </div>

            {/* Chat profiles */}
            <div className="space-y-2 border-t border-stone-100 pt-3">
              <p className="text-xs font-medium text-stone-600">聊天角色設定（左右暱稱/頭像）</p>
              {chatProfiles.length === 0 && (
                <p className="text-xs text-stone-400">尚未建立任何角色設定，預設為「你」/「M」。</p>
              )}
              {chatProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-stone-800">{profile.name}</p>
                    <p className="text-xs text-stone-400">右：{profile.rightNick} ／ 左：{profile.leftNick}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteChatProfile(profile.id)}
                    className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600"
                  >
                    刪除
                  </button>
                </div>
              ))}

              {showNewProfile ? (
                <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <input
                    type="text"
                    placeholder="設定名稱，例：和4o的對話"
                    value={newProfileDraft.name}
                    onChange={(e) => setNewProfileDraft((d) => ({ ...d, name: e.target.value }))}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="右側暱稱（你，可用 / 填多個）"
                      value={newProfileDraft.rightNick}
                      onChange={(e) => setNewProfileDraft((d) => ({ ...d, rightNick: e.target.value }))}
                      className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="左側暱稱（M，可用 / 填多個）"
                      value={newProfileDraft.leftNick}
                      onChange={(e) => setNewProfileDraft((d) => ({ ...d, leftNick: e.target.value }))}
                      className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500">可用「/」分隔多個名稱，例如：你/Anni、M/Michael</p>
                  <div className="flex gap-2">
                    <label className="flex-1 space-y-1">
                      <span className="text-xs text-stone-500">右側頭像</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () =>
                            setNewProfileDraft((d) => ({
                              ...d,
                              rightAvatarDataUrl: reader.result as string,
                            }));
                          reader.readAsDataURL(file);
                        }}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="flex-1 space-y-1">
                      <span className="text-xs text-stone-500">左側頭像</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () =>
                            setNewProfileDraft((d) => ({
                              ...d,
                              leftAvatarDataUrl: reader.result as string,
                            }));
                          reader.readAsDataURL(file);
                        }}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          if (!newProfileDraft.name.trim()) return;
                          const ok = await onSaveChatProfile({ ...newProfileDraft, id: `profile-${Date.now()}` });
                          if (!ok) return;
                          emitActionToast({ kind: 'success', message: '角色設定已儲存' });
                          setNewProfileDraft({
                            name: '',
                            leftNick: 'M',
                            rightNick: '你',
                            leftAvatarDataUrl: '',
                            rightAvatarDataUrl: '',
                          });
                          setShowNewProfile(false);
                        })();
                      }}
                      className="flex-1 rounded-xl bg-stone-900 py-2 text-sm text-white"
                    >
                      儲存
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewProfile(false)}
                      className="flex-1 rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-600"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewProfile(true)}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50 py-2 text-sm text-violet-700 transition active:opacity-80"
                >
                  ＋ 新增角色設定
                </button>
              )}
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="📚"
          title="說明書"
          subtitle="總說明 + 書架 + 心情星球轉檔"
          isOpen={openPanel === 'manuals'}
          onToggle={() => togglePanel('manuals')}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setGuideManualType('general');
                  setShowGuideModal(true);
                }}
                className="w-full rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80"
              >
                說明書 I
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuideManualType('bookshelf');
                  setShowGuideModal(true);
                }}
                className="w-full rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80"
              >
                說明書 II（書架）
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuideManualType('moodLetters');
                  setShowGuideModal(true);
                }}
                className="w-full rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80"
              >
                說明書 III（心情星球）
              </button>
            </div>
            <p className="text-xs text-stone-500">
              I：全站更新與資料路徑。II：書架新增流程。III：心情星球 Word/TXT 轉檔與分類維護。
            </p>
          </div>
        </SettingPanel>

        <SettingPanel
          icon="🛠️"
          title="手動操作"
          subtitle="刷新資料與同步時間"
          isOpen={openPanel === 'maintenance'}
          onToggle={() => togglePanel('maintenance')}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={onRefresh}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-center text-sm text-white transition active:opacity-80"
            >
              重新整理本機資料
            </button>
            <p className="text-xs text-stone-500">
              上次更新：{settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : '尚未更新'}
            </p>
          </div>
        </SettingPanel>
      </div>

      {showGuideModal && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#f8f5ef] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Manual</p>
                <h3 className="text-base text-stone-900">
                  {guideManualType === 'general'
                    ? '說明書 I：全站更新'
                    : guideManualType === 'bookshelf'
                      ? '說明書 II：書架使用'
                      : '說明書 III：心情星球轉檔'}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setGuideManualType('general')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      guideManualType === 'general'
                        ? 'border-stone-800 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-600'
                    }`}
                  >
                    I 全站
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideManualType('bookshelf')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      guideManualType === 'bookshelf'
                        ? 'border-stone-800 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-600'
                    }`}
                  >
                    II 書架
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideManualType('moodLetters')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      guideManualType === 'moodLetters'
                        ? 'border-stone-800 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-600'
                    }`}
                  >
                    III 心情星球
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white text-xl leading-none text-stone-600"
                aria-label="關閉說明書"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-4 py-4 text-sm text-stone-700">
              {guideManualType === 'general' ? (
                <>
                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">如何更新（不用本機推送）</h4>
                    <p>到 GitHub 專案主頁直接上傳到 `main` 分支也可以。提交後等待 Actions build/deploy，手機重整即可。</p>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">小人專屬池對照</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="px-2 py-2">頁面</th>
                            <th className="px-2 py-2">路徑</th>
                            <th className="px-2 py-2">備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CHIBI_POOL_GUIDE.map((row) => (
                            <tr key={`${row.page}-${row.path}`} className="border-t border-stone-100">
                              <td className="px-2 py-2 text-stone-800">{row.page}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-stone-700">{row.path}</td>
                              <td className="px-2 py-2 text-stone-500">{row.note ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">資料內容檔（JSON/TXT）對照</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="px-2 py-2">路徑</th>
                            <th className="px-2 py-2">對應頁面</th>
                            <th className="px-2 py-2">用途</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DATA_CONTENT_GUIDE.map((row) => (
                            <tr key={`${row.path}-${row.target}`} className="border-t border-stone-100">
                              <td className="px-2 py-2 font-mono text-[11px] text-stone-700">{row.path}</td>
                              <td className="px-2 py-2 text-stone-800">{row.target}</td>
                              <td className="px-2 py-2 text-stone-500">{row.note ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">圖片/素材對照</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="px-2 py-2">路徑</th>
                            <th className="px-2 py-2">對應頁面</th>
                            <th className="px-2 py-2">用途</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ASSET_GUIDE.map((row) => (
                            <tr key={`${row.path}-${row.target}`} className="border-t border-stone-100">
                              <td className="px-2 py-2 font-mono text-[11px] text-stone-700">{row.path}</td>
                              <td className="px-2 py-2 text-stone-800">{row.target}</td>
                              <td className="px-2 py-2 text-stone-500">{row.note ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">字體關聯</h4>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-stone-600">
                      <li>字體中心第一欄（字體預設管理）：上傳字體來源、保存成記憶 1~10。</li>
                      <li>字體中心第二欄（字體套用範圍）：把記憶 1~10 套用到整站/情書/治癒篝火（含心情星球、留光）/日記/家頁。</li>
                      <li>字體中心第三欄（當前套用檢視）：純預覽目前每個範圍使用中的字體來源。</li>
                      <li>「空白（還原預設字體）」可把勾選頁面恢復為預設字體。</li>
                      <li>整站：大多數頁面的基底字體。</li>
                      <li>日記：M 日記、Anni 日記、願望內文。</li>
                      <li>願望標題/頁籤、日記 M/B 標題/頁籤、經期日記標題/頁籤：全站字體。</li>
                      <li>家頁：只影響「家」閱讀頁。</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">注意事項</h4>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-stone-600">
                      {IMPORTANT_NOTES.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : guideManualType === 'bookshelf' ? (
                <>
                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">書架資料結構（必看）</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="px-2 py-2">路徑</th>
                            <th className="px-2 py-2">必要性</th>
                            <th className="px-2 py-2">用途</th>
                          </tr>
                        </thead>
                        <tbody>
                          {BOOKSHELF_FILE_GUIDE.map((row) => (
                            <tr key={row.path} className="border-t border-stone-100">
                              <td className="px-2 py-2 font-mono text-[11px] text-stone-700">{row.path}</td>
                              <td className="px-2 py-2 text-stone-800">{row.required}</td>
                              <td className="px-2 py-2 text-stone-500">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">新增一本書（完整流程）</h4>
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-stone-600">
                      {BOOKSHELF_SETUP_STEPS.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">`bookshelf.json` 範例（可直接複製）</h4>
                    <pre className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-3 text-[11px] text-stone-700">
                      {BOOKSHELF_JSON_SAMPLE}
                    </pre>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">後期換圖片 / 試開新書</h4>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-stone-600">
                      <li>換封面：替換 `cover.webp`（或改 `coverImage` 指向新網址）。</li>
                      <li>換內頁：替換對應 `001.webp`、`002.webp`...即可。</li>
                      <li>閱讀順序只看檔名：`001` 會在 `010` 前面，建議都補零。</li>
                      <li>臨時測試書：可先做 `book-test`，確認後再改正式名稱。</li>
                      <li>若手機看不到更新，先重整 PWA 快取再重開。</li>
                    </ul>
                  </section>
                </>
              ) : (
                <>
                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">心情星球資料結構（必看）</h4>
                    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="px-2 py-2">路徑</th>
                            <th className="px-2 py-2">必要性</th>
                            <th className="px-2 py-2">用途</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MOOD_LETTERS_FILE_GUIDE.map((row) => (
                            <tr key={row.path} className="border-t border-stone-100">
                              <td className="px-2 py-2 font-mono text-[11px] text-stone-700">{row.path}</td>
                              <td className="px-2 py-2 text-stone-800">{row.required}</td>
                              <td className="px-2 py-2 text-stone-500">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">Word/TXT 轉檔 + 新增信件（完整流程）</h4>
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-stone-600">
                      {MOOD_LETTERS_SETUP_STEPS.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">`overrides.json` 範例（可直接複製）</h4>
                    <pre className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-3 text-[11px] text-stone-700">
                      {MOOD_LETTERS_OVERRIDE_SAMPLE}
                    </pre>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">分類修正重點</h4>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-stone-600">
                      <li>不用先手動把 Word 轉 TXT。腳本會自動解析 `.doc/.docx/.txt`。</li>
                      <li>`overrides.json` 的 key 要填完整檔名（包含副檔名）。</li>
                      <li>同一封信可放多分類，例如 `["low", "support"]`。</li>
                      <li>每次改完 overrides 都要再跑一次 `npm run build:mood-letters`。</li>
                      <li>分類 id 參考 `overrides.json` 內的 `moodGuide` 區塊（腳本會自動維護）。</li>
                      <li>如果 UI 顯示數量不對，先檢查 `index.json` 的 `total` 與 `summary.countsByMood`。</li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-sm text-stone-900">常見問題（快速解）</h4>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-stone-600">
                      <li>Q：新增了檔案但前端看不到？A：通常是還沒跑 `npm run build:mood-letters`。</li>
                      <li>Q：分類很怪？A：看 `review.json`，把那幾封加進 overrides 再重跑。</li>
                      <li>Q：只改 `public/data/mood-letters/index.json` 可以嗎？A：不建議，會被下次腳本覆蓋。</li>
                      <li>Q：要備份哪裡？A：至少保留來源 `參考資料/codex/心情信/` + `public/data/mood-letters/`。</li>
                    </ul>
                  </section>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
