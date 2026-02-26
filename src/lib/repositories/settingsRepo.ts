import { getDb } from '../db';

import type {
  AppLabels,
  AppSettings,
  BackgroundMode,
  CalendarColorMode,
  ChibiPoolMode,
  ChatBubbleStyle,
  DiaryCoverFitMode,
  HomeDynamicWallpaperPreset,
  HomeFinalWidgetPreset,
  HomeWallpaperEffectPreset,
  HomeWallpaperGradientPreset,
  LetterUiMode,
  TabIconDisplayMode,
  TabIconUrls,
} from '../../types/settings';
import { DEFAULT_SETTINGS, LEGACY_HOME_POLAROID_MESSAGES } from '../../types/settings';

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeChatNavIcon(value: unknown, fallback: string, legacy: string) {
  const normalized = normalizeString(value, fallback);
  // Migrate old default circle icons to the new emoji defaults.
  return normalized === legacy ? fallback : normalized;
}

function normalizeStringSlots(value: unknown, fallback: string[], length = fallback.length) {
  const input = Array.isArray(value) ? value : [];
  const normalized: string[] = [];
  for (let i = 0; i < length; i += 1) {
    normalized.push(typeof input[i] === 'string' ? input[i] : fallback[i] ?? '');
  }
  return normalized;
}

function normalizeHomePolaroidMessages(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length ? normalized : [...fallback];
}

function isSameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeCalendarColorMode(value: unknown, fallback: CalendarColorMode): CalendarColorMode {
  return value === 'custom' || value === 'month' ? value : fallback;
}

function normalizeBackgroundMode(value: unknown, fallback: BackgroundMode): BackgroundMode {
  return value === 'image' || value === 'gradient' || value === 'dynamic' ? value : fallback;
}

function normalizeHomeWallpaperGradientPreset(
  value: unknown,
  fallback: HomeWallpaperGradientPreset,
): HomeWallpaperGradientPreset {
  return value === 'auroraCandy' ||
    value === 'bokehDream' ||
    value === 'neonTwilight' ||
    value === 'peachSky' ||
    value === 'mintLilac' ||
    value === 'nightBlue'
    ? value
    : fallback;
}

function normalizeHomeWallpaperEffectPreset(
  value: unknown,
  fallback: HomeWallpaperEffectPreset,
): HomeWallpaperEffectPreset {
  if (value === 'firefly') return 'heart';
  return value === 'orbs' ||
    value === 'snow' ||
    value === 'heart' ||
    value === 'lantern' ||
    value === 'ribbon' ||
    value === 'stardust' ||
    value === 'bubbles' ||
    value === 'none'
    ? value
    : fallback;
}

function normalizeHomeDynamicWallpaperPreset(
  value: unknown,
  fallback: HomeDynamicWallpaperPreset,
): HomeDynamicWallpaperPreset {
  return value === 'gradientFlow' ||
    value === 'snowNight' ||
    value === 'bokehDream' ||
    value === 'firefly' ||
    value === 'meteorShower' ||
    value === 'skyLantern' ||
    value === 'coolTwilight' ||
    value === 'auroraDance' ||
    value === 'prismDepth'
    ? value
    : fallback;
}

function normalizeHomeFinalWidgetPreset(
  value: unknown,
  fallback: HomeFinalWidgetPreset,
): HomeFinalWidgetPreset {
  return value === 'vinylCounter' || value === 'polaroid' ? value : fallback;
}

function deriveLegacyHomeDynamicWallpaperPreset(
  gradientPreset: HomeWallpaperGradientPreset,
  effectPreset: HomeWallpaperEffectPreset,
): HomeDynamicWallpaperPreset {
  if (effectPreset === 'snow') return 'snowNight';
  if (effectPreset === 'heart') return 'skyLantern';
  if (effectPreset === 'lantern') return 'skyLantern';
  if (effectPreset === 'stardust') return 'meteorShower';
  if (gradientPreset === 'bokehDream') return 'bokehDream';
  if (gradientPreset === 'nightBlue') return 'meteorShower';
  if (gradientPreset === 'peachSky') return 'skyLantern';
  return 'gradientFlow';
}

function normalizeChatBubbleStyle(value: unknown, fallback: ChatBubbleStyle): ChatBubbleStyle {
  return value === 'jelly' || value === 'imessage' || value === 'imessageClassic' ? value : fallback;
}

function normalizeDiaryCoverFitMode(value: unknown, fallback: DiaryCoverFitMode): DiaryCoverFitMode {
  return value === 'cover' || value === 'contain' ? value : fallback;
}

function normalizeTabIconDisplayMode(value: unknown, fallback: TabIconDisplayMode): TabIconDisplayMode {
  return value === 'full' || value === 'framed' ? value : fallback;
}

function normalizeLetterUiMode(value: unknown, fallback: LetterUiMode): LetterUiMode {
  return value === 'preview' || value === 'classic' ? value : fallback;
}

function normalizeChibiPoolMode(value: unknown, fallback: ChibiPoolMode): ChibiPoolMode {
  if (value === 'a' || value === 'i') {
    return 'i';
  }
  if (value === 'b' || value === 'ii') {
    return 'ii';
  }
  return value === 'all' ? 'all' : fallback;
}

function normalizeTabIconUrls(value: unknown, fallback: TabIconUrls): TabIconUrls {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<TabIconUrls>;
  return {
    home: normalizeString(input.home, fallback.home),
    inbox: normalizeString(input.inbox, fallback.inbox),
    calendar: normalizeString(input.calendar, fallback.calendar),
    tarot: normalizeString(input.tarot, fallback.tarot),
    letters: normalizeString(input.letters, fallback.letters),
    heart: normalizeString(input.heart, fallback.heart),
    list: normalizeString(input.list, fallback.list),
    fitness: normalizeString(input.fitness, fallback.fitness),
    pomodoro: normalizeString(input.pomodoro, fallback.pomodoro),
    period: normalizeString(input.period, fallback.period),
    diary: normalizeString(input.diary, fallback.diary),
    album: normalizeString(input.album, fallback.album),
    notes: normalizeString(input.notes, fallback.notes),
    settings: normalizeString(input.settings, fallback.settings),
  };
}

function normalizeAppLabels(value: unknown, fallback: AppLabels): AppLabels {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<AppLabels>;
  const normalizedNotes = normalizeString(input.notes, fallback.notes);
  return {
    home: normalizeString(input.home, fallback.home),
    inbox: normalizeString(input.inbox, fallback.inbox),
    calendar: normalizeString(input.calendar, fallback.calendar),
    settings: normalizeString(input.settings, fallback.settings),
    tarot: normalizeString(input.tarot, fallback.tarot),
    letters: normalizeString(input.letters, fallback.letters),
    heart: normalizeString(input.heart, fallback.heart),
    chat: normalizeString(input.chat, fallback.chat),
    list: normalizeString(input.list, fallback.list),
    fitness: normalizeString(input.fitness, fallback.fitness),
    pomodoro: normalizeString(input.pomodoro, fallback.pomodoro),
    period: normalizeString(input.period, fallback.period),
    diary: normalizeString(input.diary, fallback.diary),
    album: normalizeString(input.album, fallback.album),
    // Migrate legacy/default label variants to the new one unless user set a custom value.
    notes:
      normalizedNotes === '便條' || normalizedNotes === '心情日記'
        ? fallback.notes
        : normalizedNotes,
  };
}

export async function getSettings() {
  const db = await getDb();
  const row = await db.get('settings', 'app');

  const persisted = (row?.value ?? {}) as Partial<AppSettings>;
  const normalizedLegacyGradientPreset = normalizeHomeWallpaperGradientPreset(
    persisted.homeWallpaperGradientPreset,
    DEFAULT_SETTINGS.homeWallpaperGradientPreset,
  );
  const normalizedLegacyEffectPreset = normalizeHomeWallpaperEffectPreset(
    persisted.homeWallpaperEffectPreset,
    DEFAULT_SETTINGS.homeWallpaperEffectPreset,
  );
  const normalizedHomePolaroidMessages = normalizeHomePolaroidMessages(
    persisted.homePolaroidMessages,
    DEFAULT_SETTINGS.homePolaroidMessages,
  );
  const migratedHomePolaroidMessages = isSameStringArray(
    normalizedHomePolaroidMessages,
    LEGACY_HOME_POLAROID_MESSAGES,
  )
    ? [...DEFAULT_SETTINGS.homePolaroidMessages]
    : normalizedHomePolaroidMessages;

  return {
    ...DEFAULT_SETTINGS,
    ...persisted,
    globalTextColor: normalizeString(persisted.globalTextColor, DEFAULT_SETTINGS.globalTextColor),
    calendarColorMode: normalizeCalendarColorMode(
      persisted.calendarColorMode,
      DEFAULT_SETTINGS.calendarColorMode,
    ),
    chatBubbleStyle: normalizeChatBubbleStyle(
      persisted.chatBubbleStyle,
      DEFAULT_SETTINGS.chatBubbleStyle,
    ),
    tabIconUrls: normalizeTabIconUrls(persisted.tabIconUrls, DEFAULT_SETTINGS.tabIconUrls),
    appLabels: normalizeAppLabels(persisted.appLabels, DEFAULT_SETTINGS.appLabels),
    hoverToneWeights: {
      ...DEFAULT_SETTINGS.hoverToneWeights,
      ...(persisted.hoverToneWeights ?? {}),
    },
    calendarCellRadius: clampNumber(
      persisted.calendarCellRadius,
      8,
      28,
      DEFAULT_SETTINGS.calendarCellRadius,
    ),
    calendarCellShadow: clampNumber(
      persisted.calendarCellShadow,
      0,
      100,
      DEFAULT_SETTINGS.calendarCellShadow,
    ),
    calendarCellDepth: clampNumber(
      persisted.calendarCellDepth,
      0,
      100,
      DEFAULT_SETTINGS.calendarCellDepth,
    ),
    customFontCssUrl: normalizeString(persisted.customFontCssUrl, DEFAULT_SETTINGS.customFontCssUrl),
    customFontFileUrl: normalizeString(persisted.customFontFileUrl, DEFAULT_SETTINGS.customFontFileUrl),
    customFontFamily: normalizeString(persisted.customFontFamily, DEFAULT_SETTINGS.customFontFamily),
    customFontUrlSlots: normalizeStringSlots(persisted.customFontUrlSlots, DEFAULT_SETTINGS.customFontUrlSlots),
    customFontUrlSlotNames: normalizeStringSlots(
      persisted.customFontUrlSlotNames,
      DEFAULT_SETTINGS.customFontUrlSlotNames,
    ),
    chatUserBubbleColor: normalizeString(persisted.chatUserBubbleColor, DEFAULT_SETTINGS.chatUserBubbleColor),
    chatUserBubbleBorderColor: normalizeString(persisted.chatUserBubbleBorderColor, DEFAULT_SETTINGS.chatUserBubbleBorderColor),
    chatUserBubbleTextColor: normalizeString(persisted.chatUserBubbleTextColor, DEFAULT_SETTINGS.chatUserBubbleTextColor),
    chatAiBubbleColor: normalizeString(persisted.chatAiBubbleColor, DEFAULT_SETTINGS.chatAiBubbleColor),
    chatAiBubbleBorderColor: normalizeString(persisted.chatAiBubbleBorderColor, DEFAULT_SETTINGS.chatAiBubbleBorderColor),
    chatAiBubbleTextColor: normalizeString(persisted.chatAiBubbleTextColor, DEFAULT_SETTINGS.chatAiBubbleTextColor),
    chatBubbleRadius: clampNumber(
      persisted.chatBubbleRadius,
      10,
      36,
      DEFAULT_SETTINGS.chatBubbleRadius,
    ),
    chatBackgroundColor: normalizeString(persisted.chatBackgroundColor, DEFAULT_SETTINGS.chatBackgroundColor),
    chatBackgroundImageUrl: normalizeString(persisted.chatBackgroundImageUrl, DEFAULT_SETTINGS.chatBackgroundImageUrl),
    chatBackgroundOverlay: clampNumber(
      persisted.chatBackgroundOverlay,
      0,
      90,
      DEFAULT_SETTINGS.chatBackgroundOverlay,
    ),
    chatAppMessagesIcon: normalizeChatNavIcon(
      persisted.chatAppMessagesIcon,
      DEFAULT_SETTINGS.chatAppMessagesIcon,
      '◉',
    ),
    chatAppDiscoverIcon: normalizeChatNavIcon(
      persisted.chatAppDiscoverIcon,
      DEFAULT_SETTINGS.chatAppDiscoverIcon,
      '◎',
    ),
    chatAppMeIcon: normalizeChatNavIcon(
      persisted.chatAppMeIcon,
      DEFAULT_SETTINGS.chatAppMeIcon,
      '◯',
    ),
    chatAppShowLabels: normalizeBoolean(persisted.chatAppShowLabels, DEFAULT_SETTINGS.chatAppShowLabels),
    chatAppDefaultProfileId: normalizeString(persisted.chatAppDefaultProfileId, DEFAULT_SETTINGS.chatAppDefaultProfileId),
    calendarHoverBubbleTextColor: normalizeString(
      persisted.calendarHoverBubbleTextColor,
      DEFAULT_SETTINGS.calendarHoverBubbleTextColor,
    ),
    homeWidgetTitle: normalizeString(persisted.homeWidgetTitle, DEFAULT_SETTINGS.homeWidgetTitle),
    homeWidgetSubtitle: normalizeString(persisted.homeWidgetSubtitle, DEFAULT_SETTINGS.homeWidgetSubtitle),
    homeWidgetBadgeText: normalizeString(persisted.homeWidgetBadgeText, DEFAULT_SETTINGS.homeWidgetBadgeText),
    homeWidgetIconDataUrl: normalizeString(persisted.homeWidgetIconDataUrl, DEFAULT_SETTINGS.homeWidgetIconDataUrl),
    inboxTitle: normalizeString(persisted.inboxTitle, DEFAULT_SETTINGS.inboxTitle),
    memorialStartDate: normalizeString(persisted.memorialStartDate, DEFAULT_SETTINGS.memorialStartDate),
    homeFinalWidgetPreset: normalizeHomeFinalWidgetPreset(
      persisted.homeFinalWidgetPreset,
      DEFAULT_SETTINGS.homeFinalWidgetPreset,
    ),
    homePolaroidMessages: migratedHomePolaroidMessages,
    tarotGalleryImageUrl: normalizeString(persisted.tarotGalleryImageUrl, DEFAULT_SETTINGS.tarotGalleryImageUrl),
    tarotNameColor: normalizeString(persisted.tarotNameColor, DEFAULT_SETTINGS.tarotNameColor),
    tarotNameScale: clampNumber(persisted.tarotNameScale, 0.8, 2, DEFAULT_SETTINGS.tarotNameScale),
    letterFontUrl: normalizeString(persisted.letterFontUrl, DEFAULT_SETTINGS.letterFontUrl),
    letterFontUrlSlots: normalizeStringSlots(persisted.letterFontUrlSlots, DEFAULT_SETTINGS.letterFontUrlSlots),
    letterFontUrlSlotNames: normalizeStringSlots(
      persisted.letterFontUrlSlotNames,
      DEFAULT_SETTINGS.letterFontUrlSlotNames,
    ),
    letterUiMode: normalizeLetterUiMode(persisted.letterUiMode, DEFAULT_SETTINGS.letterUiMode),
    diaryCoverImageUrl: normalizeString(persisted.diaryCoverImageUrl, DEFAULT_SETTINGS.diaryCoverImageUrl),
    diaryFontUrl: normalizeString(persisted.diaryFontUrl, DEFAULT_SETTINGS.diaryFontUrl),
    diaryFontUrlSlots: normalizeStringSlots(persisted.diaryFontUrlSlots, DEFAULT_SETTINGS.diaryFontUrlSlots),
    diaryFontUrlSlotNames: normalizeStringSlots(
      persisted.diaryFontUrlSlotNames,
      DEFAULT_SETTINGS.diaryFontUrlSlotNames,
    ),
    soulmateFontUrl: normalizeString(persisted.soulmateFontUrl, DEFAULT_SETTINGS.soulmateFontUrl),
    soulmateFontUrlSlots: normalizeStringSlots(persisted.soulmateFontUrlSlots, DEFAULT_SETTINGS.soulmateFontUrlSlots),
    soulmateFontUrlSlotNames: normalizeStringSlots(
      persisted.soulmateFontUrlSlotNames,
      DEFAULT_SETTINGS.soulmateFontUrlSlotNames,
    ),
    archiveFontUrl: normalizeString(persisted.archiveFontUrl, DEFAULT_SETTINGS.archiveFontUrl),
    notesFontUrl: normalizeString(persisted.notesFontUrl, DEFAULT_SETTINGS.notesFontUrl),
    campfireFontUrl: normalizeString(persisted.campfireFontUrl, DEFAULT_SETTINGS.campfireFontUrl),
    diaryCoverFitMode: normalizeDiaryCoverFitMode(
      persisted.diaryCoverFitMode,
      DEFAULT_SETTINGS.diaryCoverFitMode,
    ),
    backgroundMode: normalizeBackgroundMode(persisted.backgroundMode, DEFAULT_SETTINGS.backgroundMode),
    backgroundGradientStart: normalizeString(persisted.backgroundGradientStart, DEFAULT_SETTINGS.backgroundGradientStart),
    backgroundGradientEnd: normalizeString(persisted.backgroundGradientEnd, DEFAULT_SETTINGS.backgroundGradientEnd),
    homeDynamicWallpaperPreset: normalizeHomeDynamicWallpaperPreset(
      persisted.homeDynamicWallpaperPreset,
      deriveLegacyHomeDynamicWallpaperPreset(normalizedLegacyGradientPreset, normalizedLegacyEffectPreset),
    ),
    homeDynamicEffectsEnabled: normalizeBoolean(
      persisted.homeDynamicEffectsEnabled,
      DEFAULT_SETTINGS.homeDynamicEffectsEnabled,
    ),
    homeDynamicIntensity: clampNumber(
      persisted.homeDynamicIntensity,
      0,
      100,
      DEFAULT_SETTINGS.homeDynamicIntensity,
    ),
    homeDynamicSpeed: clampNumber(
      persisted.homeDynamicSpeed,
      0,
      100,
      DEFAULT_SETTINGS.homeDynamicSpeed,
    ),
    homeDynamicParticleAmount: clampNumber(
      persisted.homeDynamicParticleAmount,
      0,
      100,
      DEFAULT_SETTINGS.homeDynamicParticleAmount,
    ),
    homeWallpaperGradientPreset: normalizedLegacyGradientPreset,
    homeWallpaperEffectPreset: normalizedLegacyEffectPreset,
    backgroundImageUrl: normalizeString(persisted.backgroundImageUrl, DEFAULT_SETTINGS.backgroundImageUrl),
    tabIconDisplayMode: normalizeTabIconDisplayMode(
      persisted.tabIconDisplayMode,
      DEFAULT_SETTINGS.tabIconDisplayMode,
    ),
    backgroundImageOverlay: clampNumber(
      persisted.backgroundImageOverlay,
      0,
      90,
      DEFAULT_SETTINGS.backgroundImageOverlay,
    ),
    uiHeaderTitleSize: clampNumber(
      persisted.uiHeaderTitleSize,
      14,
      24,
      DEFAULT_SETTINGS.uiHeaderTitleSize,
    ),
    uiTabLabelSize: clampNumber(
      persisted.uiTabLabelSize,
      6,
      24,
      DEFAULT_SETTINGS.uiTabLabelSize,
    ),
    uiFilterPillSize: clampNumber(
      persisted.uiFilterPillSize,
      9,
      16,
      DEFAULT_SETTINGS.uiFilterPillSize,
    ),
    uiHintTextSize: clampNumber(
      persisted.uiHintTextSize,
      8,
      14,
      DEFAULT_SETTINGS.uiHintTextSize,
    ),
    chatContactNameSize: clampNumber(
      persisted.chatContactNameSize,
      12,
      38,
      DEFAULT_SETTINGS.chatContactNameSize,
    ),
    chatContactSubtitleSize: clampNumber(
      persisted.chatContactSubtitleSize,
      12,
      24,
      DEFAULT_SETTINGS.chatContactSubtitleSize,
    ),
    notesFontSize: clampNumber(persisted.notesFontSize, 11, 17, DEFAULT_SETTINGS.notesFontSize),
    notesTextColor: normalizeString(persisted.notesTextColor, DEFAULT_SETTINGS.notesTextColor),
    chibiPoolSize: clampNumber(persisted.chibiPoolSize, 20, 200, DEFAULT_SETTINGS.chibiPoolSize),
    chibiPoolMode: normalizeChibiPoolMode(persisted.chibiPoolMode, DEFAULT_SETTINGS.chibiPoolMode),
    mDiaryLineHeight: clampNumber(persisted.mDiaryLineHeight, 1.5, 2.8, DEFAULT_SETTINGS.mDiaryLineHeight),
    mDiaryContentFontSize: clampNumber(
      persisted.mDiaryContentFontSize,
      12,
      22,
      DEFAULT_SETTINGS.mDiaryContentFontSize,
    ),
    mDiaryShowCount: normalizeBoolean(persisted.mDiaryShowCount, DEFAULT_SETTINGS.mDiaryShowCount),
    mDiaryRandomChibiWidth: clampNumber(
      persisted.mDiaryRandomChibiWidth,
      104,
      196,
      DEFAULT_SETTINGS.mDiaryRandomChibiWidth,
    ),
    mDiaryReadingChibiWidth: clampNumber(
      persisted.mDiaryReadingChibiWidth,
      104,
      196,
      DEFAULT_SETTINGS.mDiaryReadingChibiWidth,
    ),
    mDiaryShowReadingChibi: normalizeBoolean(
      persisted.mDiaryShowReadingChibi,
      DEFAULT_SETTINGS.mDiaryShowReadingChibi,
    ),
  };
}

export async function saveSettings(partial: Partial<AppSettings>) {
  const db = await getDb();
  const current = await getSettings();
  const next = {
    ...current,
    ...partial,
  } satisfies AppSettings;

  await db.put('settings', {
    key: 'app',
    value: next,
  });

  return next;
}
