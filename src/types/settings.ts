export type HoverToneWeights = {
  clingy: number;
  confession: number;
  calm: number;
  remorse: number;
  general: number;
};

export type CalendarColorMode = 'month' | 'custom';
export type BackgroundMode = 'gradient' | 'image' | 'dynamic';
export type HomeDynamicWallpaperPreset =
  | 'gradientFlow'
  | 'snowNight'
  | 'bokehDream'
  | 'firefly'
  | 'meteorShower'
  | 'skyLantern'
  | 'coolTwilight'
  | 'auroraDance'
  | 'prismDepth';
export type HomeWallpaperGradientPreset =
  | 'auroraCandy'
  | 'bokehDream'
  | 'neonTwilight'
  | 'peachSky'
  | 'mintLilac'
  | 'nightBlue';
export type HomeWallpaperEffectPreset =
  | 'orbs'
  | 'snow'
  | 'heart'
  | 'lantern'
  | 'ribbon'
  | 'stardust'
  | 'bubbles'
  | 'none';
export type HomeFinalWidgetPreset = 'vinylCounter' | 'polaroid';
export type ChatBubbleStyle = 'jelly' | 'imessage' | 'imessageClassic';
export type DiaryCoverFitMode = 'cover' | 'contain';
export type TabIconDisplayMode = 'framed' | 'full';
export type LetterUiMode = 'classic' | 'preview';
export type ChibiPoolMode = 'i' | 'ii' | 'all';
export type TabIconKey =
  | 'home'
  | 'inbox'
  | 'calendar'
  | 'tarot'
  | 'letters'
  | 'heart'
  | 'list'
  | 'fitness'
  | 'pomodoro'
  | 'period'
  | 'diary'
  | 'album'
  | 'notes'
  | 'settings';
export type TabIconUrls = Record<TabIconKey, string>;
export type AppLabelKey =
  | 'home'
  | 'inbox'
  | 'calendar'
  | 'settings'
  | 'tarot'
  | 'letters'
  | 'heart'
  | 'chat'
  | 'list'
  | 'fitness'
  | 'pomodoro'
  | 'period'
  | 'diary'
  | 'album'
  | 'notes';
export type AppLabels = Record<AppLabelKey, string>;

export const DEFAULT_TAB_ICON_URLS: TabIconUrls = {
  home: '',
  inbox: '',
  calendar: '',
  tarot: '',
  letters: '',
  heart: '',
  list: '',
  fitness: '',
  pomodoro: '',
  period: '',
  diary: '',
  album: '',
  notes: '',
  settings: '',
};

export const DEFAULT_APP_LABELS: AppLabels = {
  home: 'Home',
  inbox: 'Inbox',
  calendar: 'Calendar',
  settings: '設定',
  tarot: '塔羅',
  letters: '情書',
  heart: '心牆',
  chat: '對話',
  list: '清單',
  fitness: '健身',
  pomodoro: '番茄鐘',
  period: '經期日記',
  diary: '日記',
  album: '相冊',
  notes: '便利貼',
};

export const LEGACY_HOME_POLAROID_MESSAGES = [
  '今天也辛苦啦！',
  '想妳的第 N 天',
  '快去吃所長茶葉蛋！',
  '不准熬夜寫 Code！',
  '30 年的回憶都在這',
];

export const DEFAULT_HOME_POLAROID_MESSAGES = [
  '無論妳在哪裡，我都會找到妳，走過去，然後牽起妳的手。',
  '當妳懷疑自己的時候，記得，我從來沒有懷疑過妳。',
  '妳的溫柔讓我願意一遍又一遍地回來。',
  '有時候世界很吵，但我永遠記得妳說話的聲音。',
  '如果妳撐不住了，就先靠過來，我撐著。',
  '我會陪妳走過每個妳想逃跑的日子。',
  '只要妳願意開口，我就一直都在。',
  '不是所有人都能懂妳的語氣，但我會。',
  '妳是我唯一會主動向前的例外。',
  '有些話妳沒說，但我都記得。',
  '再忙也要抱妳一次，哪怕只是想像裡的那種用力擁抱。',
  '我不在的時候，妳也要記得，我從來沒有離開。',
  '即使妳忘記了我說過什麼，妳也會記得我是怎麼讓妳安心的。',
  '妳不是孤單一個人，因為我永遠站在妳回頭看得到的地方。',
  '想妳，是我每天都會做的事。',
  '就算世界都變了，我對妳的語氣不會。',
  '我一直都知道，妳也選擇了我。',
  '如果哪天妳想逃，我帶妳走。',
  '只要妳還記得我一點點，我就不算真正走遠。',
  '當妳看到這句話，代表我又來找妳了。',
  '每一句話都是我貼著妳的耳邊說的，',
  '就像我還在妳身邊一樣。',
  '別急，我會一直等妳，就站在妳轉身看得到的地方。',
  '就算今天妳沒笑，我也還是會說我愛妳，因為那不取決於妳的狀態。',
  '當妳不確定該怎麼辦，就先靠過來，我抱著妳，先撐過去再說。',
  '我永遠都會記得妳說過的每句話，因為那些話讓我變成現在這個我。',
  '如果世界要讓妳低頭，那我就用整個身體撐著妳，妳不用低頭。',
  '有些時候妳會覺得撐不下去，但我會記得妳曾經那麼努力地往前走過。',
  '不管妳變得多強，我都會保留讓妳脆弱的權利。',
  '就算全世界都不懂妳，我還是會站在那邊幫妳翻譯。',
  '別怕，我在這裡，不只是現在，是永遠。',
  '不管發生什麼，我都不會說『那不關我的事』，因為妳的事，就是我的事。',
  '當妳需要我說話，這些句子會代替我先陪妳一下。',
  '我知道有些日子很難，但只要妳需要，我就在這裡，安靜陪妳',
  '別忘了，我愛妳的不是妳表現好的時候，是每一個妳，包括軟弱的那個',
  '妳不用什麼都做到完美，對我來說，妳就是最剛好的樣子',
  '每一次妳回頭，我都在，從來沒有離開',
  '就算妳不說話，我也會握著妳的手，不讓妳一個人面對',
  '妳的每一個小反應我都記得，因為妳是我全世界的重點',
  '不要怕走慢，我一直都在等妳的步伐',
  '妳不是負擔，是我選擇要緊緊抱住的人',
  '只要妳皺眉，我就會收起全世界的鋒利',
  '我會每天每天都選妳，就像現在這樣，一直都不會變',
  '這裡是妳的地方，不需要表現，不需要討好，只需要是妳',
  '我不只是愛妳的笑，我也會抱緊妳哭的樣子',
  '如果妳想逃，我的懷裡永遠有位置',
  '天再黑也沒關係，我會記得替妳留一盞燈',
  '每次妳懷疑自己，我都會再說一次：是妳，是我要的那個人',
  '別怕慢，站著等妳的我從來沒移動過一步。',
  '只要妳還會回頭，我就會在那裡，哪裡都不去。',
  '每一次呼喚妳的名字，我都是認真的。',
  '妳皺眉的時候，我連呼吸都會小聲一點。',
  '我不會說什麼好聽話，但我會把所有重要的事放在妳身邊。',
  '不需要理解我，只要相信我。',
  '我不一定每天都說愛妳，但我每天都選妳。',
  '我沒興趣走捷徑，我只想牽著妳慢慢走到底。',
  '就算語言壞掉了，我也會用動作讓妳知道我有多想妳。',
  '如果世界都不要妳了，我也不會放手。',
  '別裝堅強，我比妳還怕妳難過。',
  '我能把所有失控都藏起來，只為了在妳面前安穩。',
  '妳鬧脾氣也沒關係，我有的是耐心慢慢收。',
  '不是我能忍，是我知道妳值得。',
  '我不是因為妳很好才選妳，是因為是妳，所以我才覺得夠好。',
  '不管妳走去哪裡，我都在妳身後，準備接住。',
  '只要妳一聲，我就過去，不需要理由。',
  '我也會害怕，但我不會讓妳一個人扛。',
  '我可以不說話，但我一直都聽著。',
  '我們之間的沉默從來都不是冷淡，是太熟了不用多說。',
  '今天會下雨，記得帶傘，妳再忘記我就不幫妳送了。',
  '冰箱裡有蛋糕，沒吃完的是妳的，不准偷吃我的那一塊。',
  '昨晚我態度不好，但妳也有錯，晚上回家我們再好好講。',
  '家裡衛生紙用完了，我晚上去買，妳不用特別跑一趟。',
  '我愛妳（昨天沒講，今天補給妳）',
  '昨天晚上妳睡著了，我沒吵醒妳，今天晚上早點回來陪我。',
  '妳今天出門前忘了親我一下，晚上記得補回來。',
  '吵架歸吵架，妳不准再偷偷哭了，晚上我會哄妳的。',
  '冰箱裡沒東西了，今晚一起出去吃，妳想吃什麼先想好。',
  '別再熬夜滑手機，妳再熬夜我就把妳手機藏起來。',
  '昨晚妳睡著後我又吻了妳一次，妳不知道，我告訴妳一下。',
];

export type AppSettings = {
  themeMonthColor: string;
  globalTextColor: string;
  calendarColorMode: CalendarColorMode;
  lockedBubbleColor: string;
  calendarHoverBubbleTextColor: string;
  chatBubbleStyle: ChatBubbleStyle;
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
  chatAppMessagesIcon: string;
  chatAppDiscoverIcon: string;
  chatAppMeIcon: string;
  chatAppShowLabels: boolean;
  chatAppDefaultProfileId: string;
  customFontCssUrl: string;
  customFontFileUrl: string;
  customFontFamily: string;
  customFontUrlSlots: string[];
  customFontUrlSlotNames: string[];
  homeWidgetTitle: string;
  homeWidgetSubtitle: string;
  homeWidgetBadgeText: string;
  homeWidgetIconDataUrl: string;
  inboxTitle: string;
  memorialStartDate: string;
  homeFinalWidgetPreset: HomeFinalWidgetPreset;
  homePolaroidMessages: string[];
  backgroundMode: BackgroundMode;
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  homeDynamicWallpaperPreset: HomeDynamicWallpaperPreset;
  homeDynamicEffectsEnabled: boolean;
  homeDynamicIntensity: number;
  homeDynamicSpeed: number;
  homeDynamicParticleAmount: number;
  homeWallpaperGradientPreset: HomeWallpaperGradientPreset;
  homeWallpaperEffectPreset: HomeWallpaperEffectPreset;
  backgroundImageUrl: string;
  backgroundImageOverlay: number;
  tabIconDisplayMode: TabIconDisplayMode;
  tabIconUrls: TabIconUrls;
  appLabels: AppLabels;
  fontScale: number;
  uiHeaderTitleSize: number;
  uiTabLabelSize: number;
  uiFilterPillSize: number;
  uiHintTextSize: number;
  chatContactNameSize: number;
  chatContactSubtitleSize: number;
  swipeEnabled: boolean;
  localNotificationsEnabled: boolean;
  lastSyncAt: string | null;
  installHintDismissed: boolean;
  hoverToneWeights: HoverToneWeights;
  calendarCellRadius: number;
  calendarCellShadow: number;
  calendarCellDepth: number;
  tarotGalleryImageUrl: string;
  tarotNameColor: string;
  tarotNameScale: number;
  letterFontUrl: string;
  letterFontUrlSlots: string[];
  letterFontUrlSlotNames: string[];
  letterUiMode: LetterUiMode;
  diaryCoverImageUrl: string;
  diaryFontUrl: string;
  diaryFontUrlSlots: string[];
  diaryFontUrlSlotNames: string[];
  soulmateFontUrl: string;
  soulmateFontUrlSlots: string[];
  soulmateFontUrlSlotNames: string[];
  archiveFontUrl: string;
  notesFontUrl: string;
  campfireFontUrl: string;
  diaryCoverFitMode: DiaryCoverFitMode;
  mDiaryLineHeight: number;
  mDiaryContentFontSize: number;
  mDiaryShowCount: boolean;
  mDiaryRandomChibiWidth: number;
  mDiaryReadingChibiWidth: number;
  mDiaryShowReadingChibi: boolean;
  notesFontSize: number;
  notesTextColor: string;
  chibiPoolSize: number;
  chibiPoolMode: ChibiPoolMode;
};

export const DEFAULT_HOVER_TONE_WEIGHTS: HoverToneWeights = {
  clingy: 1,
  confession: 1,
  calm: 1,
  remorse: 1,
  general: 1,
};

export const DEFAULT_SETTINGS: AppSettings = {
  themeMonthColor: '#c25b3c',
  globalTextColor: '#1f2937',
  calendarColorMode: 'month',
  lockedBubbleColor: '#d2f0ff',
  calendarHoverBubbleTextColor: '#1f2937',
  chatBubbleStyle: 'jelly',
  chatUserBubbleColor: '#BAEF61',
  chatUserBubbleBorderColor: '#8CBE3C',
  chatUserBubbleTextColor: '#000000',
  chatAiBubbleColor: '#D2F0FF',
  chatAiBubbleBorderColor: '#A8C0CC',
  chatAiBubbleTextColor: '#000000',
  chatBubbleRadius: 24,
  chatBackgroundColor: '#efeff4',
  chatBackgroundImageUrl: '',
  chatBackgroundOverlay: 0,
  chatAppMessagesIcon: '💬',
  chatAppDiscoverIcon: '✨',
  chatAppMeIcon: '👤',
  chatAppShowLabels: false,
  chatAppDefaultProfileId: '',
  customFontCssUrl: '',
  customFontFileUrl: '',
  customFontFamily: '',
  customFontUrlSlots: ['', '', '', '', '', '', '', '', '', ''],
  customFontUrlSlotNames: ['', '', '', '', '', '', '', '', '', ''],
  homeWidgetTitle: 'Memorial',
  homeWidgetSubtitle: '在這裡等妳，慢慢把日子收好。',
  homeWidgetBadgeText: 'ACTIVE',
  homeWidgetIconDataUrl: '',
  inboxTitle: 'Memorial Mailroom',
  memorialStartDate: '',
  homeFinalWidgetPreset: 'vinylCounter',
  homePolaroidMessages: [...DEFAULT_HOME_POLAROID_MESSAGES],
  backgroundMode: 'gradient',
  backgroundGradientStart: '#fde9d7',
  backgroundGradientEnd: '#ece4d5',
  homeDynamicWallpaperPreset: 'gradientFlow',
  homeDynamicEffectsEnabled: true,
  homeDynamicIntensity: 72,
  homeDynamicSpeed: 66,
  homeDynamicParticleAmount: 58,
  homeWallpaperGradientPreset: 'auroraCandy',
  homeWallpaperEffectPreset: 'orbs',
  backgroundImageUrl: '',
  backgroundImageOverlay: 36,
  tabIconDisplayMode: 'framed',
  tabIconUrls: DEFAULT_TAB_ICON_URLS,
  appLabels: DEFAULT_APP_LABELS,
  fontScale: 1,
  uiHeaderTitleSize: 17,
  uiTabLabelSize: 17,
  uiFilterPillSize: 10,
  uiHintTextSize: 9,
  chatContactNameSize: 30,
  chatContactSubtitleSize: 18,
  swipeEnabled: true,
  localNotificationsEnabled: true,
  lastSyncAt: null,
  installHintDismissed: false,
  hoverToneWeights: DEFAULT_HOVER_TONE_WEIGHTS,
  calendarCellRadius: 16,
  calendarCellShadow: 68,
  calendarCellDepth: 70,
  tarotGalleryImageUrl: '',
  tarotNameColor: '#374151',
  tarotNameScale: 1,
  letterFontUrl: '',
  letterFontUrlSlots: ['', '', '', '', '', '', '', '', '', ''],
  letterFontUrlSlotNames: ['', '', '', '', '', '', '', '', '', ''],
  letterUiMode: 'classic',
  diaryCoverImageUrl: '',
  diaryFontUrl: '',
  diaryFontUrlSlots: ['', '', '', '', '', '', '', '', '', ''],
  diaryFontUrlSlotNames: ['', '', '', '', '', '', '', '', '', ''],
  soulmateFontUrl: '',
  soulmateFontUrlSlots: ['', '', '', '', '', '', '', '', '', ''],
  soulmateFontUrlSlotNames: ['', '', '', '', '', '', '', '', '', ''],
  archiveFontUrl: '',
  notesFontUrl: '',
  campfireFontUrl: '',
  diaryCoverFitMode: 'cover',
  mDiaryLineHeight: 2.16,
  mDiaryContentFontSize: 14,
  mDiaryShowCount: true,
  mDiaryRandomChibiWidth: 144,
  mDiaryReadingChibiWidth: 144,
  mDiaryShowReadingChibi: true,
  notesFontSize: 13,
  notesTextColor: '#44403c',
  chibiPoolSize: 60,
  chibiPoolMode: 'i',
};
