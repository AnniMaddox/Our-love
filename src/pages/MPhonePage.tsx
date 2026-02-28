import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import './MPhonePage.css';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export type MPhoneLaunchTarget =
  | 'diary'
  | 'questionnaire'
  | 'memo'
  | 'murmur'
  | 'selfIntro'
  | 'letters'
  | 'album'
  | 'bookshelf'
  | 'tarot'
  | 'wishlist'
  | 'list'
  | 'fitness'
  | 'lettersAB'
  | 'archive'
  | 'lightPath'
  | 'healingCampfire'
  | 'moodLetters';

type MPhoneScreen = 'lock' | 'notif' | 'home';

type AppCfg = {
  label: string;
  icon: string;
  iconBg: string;
  dataPath?: string;
  staticTitle?: string;
  staticSub?: string;
  timeAgo?: string;
};

type IndexDoc = { title?: string; timeLabel?: string };
type IndexData = { docs: IndexDoc[] };
type SongEntry = { title: string };

export type MPhonePageProps = {
  onLaunchApp: (appId: MPhoneLaunchTarget) => void;
  onReturnToMyPhone: () => void;
  initialScreen?: 'lock' | 'home';
  appsOnMPhone?: string[]; // all slotIds currently on M's phone (= appsHiddenOnHome)
  mPhoneFontFamily?: string;
  mPhoneFontScale?: number;
};

// ═══════════════════════════════════════
// SETTINGS (localStorage)
// ═══════════════════════════════════════

type MPhoneSettings = {
  wallpaper: string;
  appIcons: Partial<Record<MPhoneLaunchTarget, string>>;
};

const MPHONE_SETTINGS_KEY = 'mphone-settings-v1';

function loadMPhoneSettings(): MPhoneSettings {
  try {
    const raw = localStorage.getItem(MPHONE_SETTINGS_KEY);
    if (raw) return { wallpaper: '', appIcons: {}, ...JSON.parse(raw) };
  } catch {}
  return { wallpaper: '', appIcons: {} };
}

function saveMPhoneSettings(s: MPhoneSettings): void {
  try { localStorage.setItem(MPHONE_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════

const WALLPAPER_PHOTOS = [
  'M-022','M-037','M-041','M-042','M-045','M-046','M-048',
  'M-052','M-053','M-054','M-055','M-056','M-057','M-058','M-059','M-060','M-061',
  'M-065','M-066','M-071','M-073','M-078','M-079','M-084','M-085',
] as const;

const WALLPAPER_CYCLE_DAYS = 3;

const APP_CFG: Record<MPhoneLaunchTarget, AppCfg> = {
  diary:          { label: 'M日記',    icon: '記', iconBg: 'linear-gradient(145deg,#ff9f0a,#e8550a)',  dataPath: 'data/m-diary/index.json',      timeAgo: '剛剛'  },
  questionnaire:  { label: '問卷',     icon: '問', iconBg: 'linear-gradient(145deg,#5e5ce6,#3634a3)',  dataPath: 'data/questionnaire/index.json',timeAgo: '昨天'  },
  memo:           { label: "M's memo", icon: '備', iconBg: 'linear-gradient(145deg,#ffd60a,#ffb800)',  dataPath: 'data/memo/index.json',         timeAgo: '今天'  },
  murmur:         { label: '碎碎念',   icon: '碎', iconBg: 'linear-gradient(145deg,#32aae0,#1a72c0)',  dataPath: 'data/murmur/index.json',       timeAgo: '2天前' },
  selfIntro:      { label: '自我介紹', icon: '介', iconBg: 'linear-gradient(145deg,#c9a66b,#9e7a3c)',  dataPath: 'data/self-intro/index.json',   timeAgo: '本週'  },
  letters:        { label: '情書',     icon: '情', iconBg: 'linear-gradient(145deg,#ff6b9d,#c44d6e)',  staticTitle: '有新的情書等著你',           staticSub: '情書', timeAgo: '今天' },
  album:          { label: '相冊',     icon: '相', iconBg: 'linear-gradient(145deg,#30d158,#25a244)',  staticTitle: '翻一翻我們的照片',           staticSub: '相冊', timeAgo: '上週' },
  bookshelf:      { label: '書架',     icon: '書', iconBg: 'linear-gradient(145deg,#bf5af2,#9b3bc4)',  staticTitle: '書架上還有故事',             staticSub: '書單', timeAgo: '本月' },
  tarot:          { label: '塔羅',     icon: '牌', iconBg: 'linear-gradient(145deg,#2c2c3e,#1a1a2e)',  staticTitle: '今天的牌陣等著你翻開',       staticSub: '塔羅牌',timeAgo: '今天' },
  // Transferable apps from Anni's home
  wishlist:       { label: '願望',     icon: '🌠', iconBg: 'linear-gradient(145deg,#ff6b9d,#c44d6e)',  staticTitle: '許下心願',                  staticSub: '願望', timeAgo: '今天' },
  list:           { label: '清單',     icon: '🎴', iconBg: 'linear-gradient(145deg,#5e5ce6,#3634a3)',  staticTitle: '查看清單',                  staticSub: '清單', timeAgo: '今天' },
  fitness:        { label: '健身',     icon: '🏋️', iconBg: 'linear-gradient(145deg,#30d158,#25a244)',  staticTitle: '今天動起來',                staticSub: '健身', timeAgo: '今天' },
  lettersAB:      { label: '年度信件', icon: '📜', iconBg: 'linear-gradient(145deg,#c9a66b,#9e7a3c)',  staticTitle: '翻開我們的故事',            staticSub: '年度信件', timeAgo: '上週' },
  archive:        { label: '總攬',     icon: '🗂', iconBg: 'linear-gradient(145deg,#2c2c3e,#1a1a2e)',  staticTitle: '所有記憶都在這裡',          staticSub: '總攬', timeAgo: '本月' },
  lightPath:      { label: '留光',     icon: '✨', iconBg: 'linear-gradient(145deg,#32aae0,#1a72c0)',  staticTitle: '留光給妳的路',              staticSub: '留光', timeAgo: '今天' },
  healingCampfire:{ label: '篝火',     icon: '🔥', iconBg: 'linear-gradient(145deg,#bf5af2,#9b3bc4)',  staticTitle: '溫暖的篝火',               staticSub: '治癒篝火', timeAgo: '今天' },
  moodLetters:    { label: '心情星球', icon: '🫧', iconBg: 'linear-gradient(145deg,#ffd60a,#ffb800)',  staticTitle: '今天的心情',               staticSub: '心情星球', timeAgo: '今天' },
};

// slotId (from Anni home) → MPhoneLaunchTarget
const SLOT_TO_LAUNCH: Partial<Record<string, MPhoneLaunchTarget>> = {
  // M default apps
  'diary':            'diary',
  'questionnaire':    'questionnaire',
  'memo':             'memo',
  'murmur':           'murmur',
  'self-intro':       'selfIntro',
  'letters':          'letters',
  'album':            'album',
  'bookshelf':        'bookshelf',
  'tarot':            'tarot',
  // Anni's home apps
  'wishlist':         'wishlist',
  'list':             'list',
  'fitness':          'fitness',
  'letters-ab':       'lettersAB',
  'archive':          'archive',
  'light-path':       'lightPath',
  'healing-campfire': 'healingCampfire',
  'mood-letters':     'moodLetters',
};

// Ordered lists for layout and notifications
const M_DEFAULT_NOTIF_ORDER: MPhoneLaunchTarget[] = [
  'diary','questionnaire','memo','murmur','selfIntro','letters','album','bookshelf','tarot',
];
const ANNI_APP_ORDER: MPhoneLaunchTarget[] = [
  'wishlist','list','fitness','lettersAB','archive','lightPath','healingCampfire','moodLetters',
];

const PAGE1_APPS: MPhoneLaunchTarget[] = ['questionnaire','murmur','selfIntro','album'];
const PAGE2_APPS: MPhoneLaunchTarget[] = ['bookshelf','tarot'];
const DOCK_APPS: MPhoneLaunchTarget[] = ['diary','letters','memo'];

const APP_SEEDS: Partial<Record<MPhoneLaunchTarget, number>> = {
  diary: 7, questionnaire: 13, memo: 31, murmur: 53, selfIntro: 79,
};

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════

function getWallpaperUrl(baseUrl: string): string {
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  const idx = Math.floor(daysSinceEpoch / WALLPAPER_CYCLE_DAYS) % WALLPAPER_PHOTOS.length;
  return `${baseUrl}photos/album04/${WALLPAPER_PHOTOS[idx]}.webp`;
}

function getDailyTitle(docs: IndexDoc[], appSeed: number): string {
  if (!docs.length) return '';
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + appSeed;
  const entry = docs[Math.abs(seed) % docs.length];
  return entry?.title ?? entry?.timeLabel ?? '';
}

function getDailySong(songs: SongEntry[]): string {
  if (!songs.length) return '';
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + 97;
  return songs[Math.abs(seed) % songs.length]?.title ?? '';
}

function fmtTime(date: Date): string {
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function fmtDate(date: Date): string {
  const WEEK = ['日','一','二','三','四','五','六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 週${WEEK[date.getDay()]}`;
}

function screenState(target: MPhoneScreen, current: MPhoneScreen): string {
  if (target === current) return 's-active';
  const ORDER: Record<MPhoneScreen, number> = { lock: 0, notif: 1, home: 2 };
  return ORDER[target] < ORDER[current] ? 's-exit-up' : 's-enter-below';
}

const TIME_AGO_POOL = [
  '剛剛','1分鐘前','5分鐘前','10分鐘前',
  '今天','今天早上','今天下午','今天晚上',
  '昨天','昨天早上','昨天晚上',
  '2天前','3天前','本週','上週','本月',
];

function getDailyTimeAgo(seed: number): string {
  const d = new Date();
  const daySeed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + seed;
  return TIME_AGO_POOL[Math.abs(daySeed) % TIME_AGO_POOL.length];
}

function parseSong(raw: string): { title: string; artist: string } {
  const parts = raw.split(' - ');
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
  return { artist: '', title: raw };
}

// ═══════════════════════════════════════
// STATUS BAR
// ═══════════════════════════════════════

function MPhoneStatusBar({ now, hideTime = false }: { now: Date; hideTime?: boolean }) {
  return (
    <div className="mphone-status-bar">
      <div className="mphone-sb-left">
        {!hideTime && <span className="mphone-sb-time">{fmtTime(now)}</span>}
      </div>
      <div className="mphone-sb-right">
        <div className="mphone-sb-signal">
          <span /><span /><span /><span />
        </div>
        <svg className="mphone-sb-wifi" viewBox="0 0 16 12" fill="none" aria-hidden="true">
          <path d="M8 9.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" fill="rgba(255,255,255,0.9)" />
          <path d="M4.8 7.2a4.5 4.5 0 0 1 6.4 0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M1.8 4.4a8.4 8.4 0 0 1 12.4 0" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
        <div className="mphone-sb-battery">
          <div className="mphone-sb-battery-fill" />
          <div className="mphone-sb-battery-cap" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOCK SCREEN MUSIC CARD (iOS-style)
// ═══════════════════════════════════════

function LockMusicCard({ song }: { song: string }) {
  const { title, artist } = parseSong(song);
  return (
    <div className="mphone-lock-music mphone-glass">
      <div className="mphone-lock-music-row1">
        <div className="mphone-lock-music-texts">
          <div className="mphone-lock-music-title">{title || '—'}</div>
          {artist && <div className="mphone-lock-music-artist">{artist}</div>}
        </div>
        <button type="button" className="mphone-lock-music-playbtn" tabIndex={-1} aria-label="播放">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
      <div className="mphone-lock-music-progress-wrap">
        <div className="mphone-lock-music-bar">
          <div className="mphone-lock-music-fill" />
          <div className="mphone-lock-music-thumb" />
        </div>
        <div className="mphone-lock-music-times">
          <span>0:07</span>
          <span>-3:04</span>
        </div>
      </div>
      <div className="mphone-lock-music-controls">
        {/* ☆ favourite */}
        <button type="button" className="mphone-lock-music-ctrl mphone-lock-music-ctrl--side" aria-label="收藏" tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        {/* ⏮ prev */}
        <button type="button" className="mphone-lock-music-ctrl" aria-label="上一首" tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>
        {/* ⏸ pause */}
        <button type="button" className="mphone-lock-music-ctrl mphone-lock-music-ctrl--play" aria-label="暫停" tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" aria-hidden="true">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>
        {/* ⏭ next */}
        <button type="button" className="mphone-lock-music-ctrl" aria-label="下一首" tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
            <path d="M6 18 14.5 12 6 6v12zm8.5-6v6h2V6h-2v6z" />
          </svg>
        </button>
        {/* AirPlay */}
        <button type="button" className="mphone-lock-music-ctrl mphone-lock-music-ctrl--side" aria-label="AirPlay" tabIndex={-1}>
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
            <polygon points="12 15 17 21 7 21 12 15" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// HOME SCREEN CLOCK (same style as lock screen — big text on wallpaper, no box)
// ═══════════════════════════════════════

function HomeClockWidget({ now }: { now: Date }) {
  return (
    <div className="mphone-home-clock">
      <div className="mphone-home-clock-date">{fmtDate(now)}</div>
      <div className="mphone-home-clock-time">{fmtTime(now)}</div>
    </div>
  );
}

// ═══════════════════════════════════════
// MUSIC WIDGET (home page 2)
// ═══════════════════════════════════════

function MusicWidget({ song }: { song: string }) {
  const { title, artist } = parseSong(song);
  return (
    <div className="mphone-music-widget mphone-glass">
      <div className="mphone-music-info">
        <div className="mphone-music-app">音樂</div>
        <div className="mphone-music-title">{title || '—'}</div>
        {artist && <div className="mphone-music-artist">{artist}</div>}
      </div>
      <button type="button" className="mphone-music-play" aria-label="播放" tabIndex={-1}>
        <svg viewBox="0 0 24 24" fill="white" width="20" height="20" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════
// APP ICON BUTTON
// ═══════════════════════════════════════

function AppIconBtn({
  appId,
  onLaunch,
  dockSize = false,
  customIconUrl,
}: {
  appId: MPhoneLaunchTarget;
  onLaunch: (id: MPhoneLaunchTarget) => void;
  dockSize?: boolean;
  customIconUrl?: string;
}) {
  const cfg = APP_CFG[appId];
  const iconStyle = customIconUrl
    ? { backgroundImage: `url('${customIconUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: cfg.iconBg };
  return (
    <button
      type="button"
      className={`mphone-app-item${dockSize ? ' mphone-dock-item' : ''}`}
      onClick={() => onLaunch(appId)}
      aria-label={cfg.label}
    >
      <div className="mphone-app-icon" style={iconStyle}>
        {!customIconUrl && <span>{cfg.icon}</span>}
      </div>
      {!dockSize && <span className="mphone-app-label">{cfg.label}</span>}
    </button>
  );
}

// ═══════════════════════════════════════
// M PHONE SETTINGS VIEW
// ═══════════════════════════════════════

function MPhoneSettingsView({
  settings,
  wallpaperDraft,
  iconDrafts,
  currentApps,
  onWallpaperDraftChange,
  onWallpaperApply,
  onWallpaperUpload,
  onWallpaperClear,
  onIconDraftChange,
  onIconApply,
  onIconUpload,
  onIconClear,
  onClose,
}: {
  settings: MPhoneSettings;
  wallpaperDraft: string;
  iconDrafts: Partial<Record<MPhoneLaunchTarget, string>>;
  currentApps: MPhoneLaunchTarget[]; // apps currently on M's phone (for icon settings)
  onWallpaperDraftChange: (v: string) => void;
  onWallpaperApply: () => void;
  onWallpaperUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWallpaperClear: () => void;
  onIconDraftChange: (appId: MPhoneLaunchTarget, v: string) => void;
  onIconApply: (appId: MPhoneLaunchTarget) => void;
  onIconUpload: (appId: MPhoneLaunchTarget, e: React.ChangeEvent<HTMLInputElement>) => void;
  onIconClear: (appId: MPhoneLaunchTarget) => void;
  onClose: () => void;
}) {
  return (
    <div className="mphone-settings-overlay" onClick={onClose}>
      <div className="mphone-settings-sheet" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="mphone-settings-header">
          <div className="mphone-settings-title">M 的設定</div>
          <button type="button" className="mphone-settings-close" onClick={onClose} aria-label="關閉">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="mphone-settings-scroll">

          {/* ── Wallpaper ── */}
          <div className="mphone-settings-section">
            <div className="mphone-settings-section-title">桌布</div>

            <div className="mphone-settings-row">
              <input
                type="text"
                className="mphone-settings-input"
                placeholder="貼上圖片網址..."
                value={wallpaperDraft}
                onChange={(e) => onWallpaperDraftChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onWallpaperApply(); }}
              />
              <button
                type="button"
                className="mphone-settings-btn"
                onClick={onWallpaperApply}
              >
                套用
              </button>
            </div>

            <label className="mphone-settings-upload-label">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onWallpaperUpload}
              />
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              上傳圖片
            </label>

            {settings.wallpaper && (
              <button type="button" className="mphone-settings-clear-btn" onClick={onWallpaperClear}>
                清除自訂桌布
              </button>
            )}
          </div>

          {/* ── App icons ── */}
          <div className="mphone-settings-section">
            <div className="mphone-settings-section-title">App 圖示</div>

            {currentApps.map((appId) => {
              const cfg = APP_CFG[appId];
              const customIcon = settings.appIcons[appId];
              const iconStyle = customIcon
                ? { backgroundImage: `url('${customIcon}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: cfg.iconBg };
              return (
                <div key={appId} className="mphone-settings-icon-row">
                  <div className="mphone-settings-icon-preview" style={iconStyle}>
                    {!customIcon && <span>{cfg.icon}</span>}
                  </div>
                  <div className="mphone-settings-icon-info">
                    <div className="mphone-settings-icon-name">{cfg.label}</div>
                    <div className="mphone-settings-icon-inputs">
                      <input
                        type="text"
                        className="mphone-settings-input mphone-settings-input--sm"
                        placeholder="貼上圖片網址..."
                        value={iconDrafts[appId] ?? ''}
                        onChange={(e) => onIconDraftChange(appId, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onIconApply(appId); }}
                      />
                      <button
                        type="button"
                        className="mphone-settings-btn mphone-settings-btn--sm"
                        onClick={() => onIconApply(appId)}
                      >
                        套用
                      </button>
                      <label className="mphone-settings-upload-label mphone-settings-upload-label--sm">
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => onIconUpload(appId, e)}
                        />
                        上傳
                      </label>
                      {customIcon && (
                        <button
                          type="button"
                          className="mphone-settings-clear-btn mphone-settings-clear-btn--sm"
                          onClick={() => onIconClear(appId)}
                        >
                          清除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export function MPhonePage({ onLaunchApp, onReturnToMyPhone, initialScreen, appsOnMPhone, mPhoneFontFamily, mPhoneFontScale }: MPhonePageProps) {
  const [now, setNow] = useState(() => new Date());
  const [screen, setScreen] = useState<MPhoneScreen>(initialScreen ?? 'lock');
  const [homePageIdx, setHomePageIdx] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notifTitles, setNotifTitles] = useState<Partial<Record<MPhoneLaunchTarget, string>>>({});
  const [dailySong, setDailySong] = useState('');

  // Settings state
  const [mPhoneSettings, setMPhoneSettings] = useState<MPhoneSettings>(() => loadMPhoneSettings());
  const [wallpaperDraft, setWallpaperDraft] = useState('');
  const [iconDrafts, setIconDrafts] = useState<Partial<Record<MPhoneLaunchTarget, string>>>({});

  // Daily time labels — stable seed per app position (covers all 17 apps)
  const dailyTimeAgo = useMemo(() => {
    const allApps = [...M_DEFAULT_NOTIF_ORDER, ...ANNI_APP_ORDER];
    const result: Partial<Record<MPhoneLaunchTarget, string>> = {};
    allApps.forEach((appId, i) => {
      result[appId] = getDailyTimeAgo(i * 17 + 41);
    });
    return result;
  }, []);

  // Set of all apps currently on M's phone (derived from appsOnMPhone slotIds)
  const mPhoneAppSet = useMemo(() => {
    const result = new Set<MPhoneLaunchTarget>();
    (appsOnMPhone ?? []).forEach((slotId) => {
      const target = SLOT_TO_LAUNCH[slotId];
      if (target) result.add(target);
    });
    return result;
  }, [appsOnMPhone]);

  // Dynamic layouts
  const visiblePage1 = useMemo(() => PAGE1_APPS.filter((id) => mPhoneAppSet.has(id)), [mPhoneAppSet]);
  const visiblePage2 = useMemo(() => PAGE2_APPS.filter((id) => mPhoneAppSet.has(id)), [mPhoneAppSet]);
  const visibleDock  = useMemo(() => DOCK_APPS.filter((id) => mPhoneAppSet.has(id)), [mPhoneAppSet]);

  // Anni apps currently on M's phone (go on page 2 after M-defaults)
  const transferredFromAnni = useMemo<MPhoneLaunchTarget[]>(
    () => ANNI_APP_ORDER.filter((id) => mPhoneAppSet.has(id)),
    [mPhoneAppSet],
  );

  // Dynamic notification order: M defaults first, then Anni apps
  const dynamicNotifOrder = useMemo<MPhoneLaunchTarget[]>(
    () => [
      ...M_DEFAULT_NOTIF_ORDER.filter((id) => mPhoneAppSet.has(id)),
      ...ANNI_APP_ORDER.filter((id) => mPhoneAppSet.has(id)),
    ],
    [mPhoneAppSet],
  );

  const lockTouchStartY = useRef(0);
  const notifTouchStartY = useRef(0);
  const notifScrollTopAtStart = useRef(0);
  const notifScrollTopRef = useRef(0);
  const homePagerRef = useRef<HTMLDivElement>(null);
  const baseUrl = import.meta.env.BASE_URL as string;

  const wallpaperUrl = useMemo(
    () => mPhoneSettings.wallpaper || getWallpaperUrl(baseUrl),
    [baseUrl, mPhoneSettings.wallpaper],
  );

  // ── Clock tick ──
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load notification titles (date-seeded, stable per day) ──
  useEffect(() => {
    (Object.keys(APP_SEEDS) as MPhoneLaunchTarget[]).forEach((appId) => {
      const cfg = APP_CFG[appId];
      if (!cfg.dataPath) return;
      fetch(`${baseUrl}${cfg.dataPath}`)
        .then((r) => r.json())
        .then((data: IndexData) => {
          const title = getDailyTitle(data.docs, APP_SEEDS[appId] ?? 0);
          if (title) setNotifTitles((prev) => ({ ...prev, [appId]: title }));
        })
        .catch(() => {});
    });
  }, [baseUrl]);

  // ── Load daily song ──
  useEffect(() => {
    fetch(`${baseUrl}data/songs.json`)
      .then((r) => r.json())
      .then((songs: SongEntry[]) => setDailySong(getDailySong(songs)))
      .catch(() => {});
  }, [baseUrl]);

  // ── Home pager scroll tracking ──
  useEffect(() => {
    const node = homePagerRef.current;
    if (!node) return;
    const onScroll = () => {
      const w = node.clientWidth;
      if (w) setHomePageIdx(Math.round(node.scrollLeft / w));
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  // ── Navigation ──
  const goToNotif = useCallback(() => setScreen('notif'), []);
  const goToLock  = useCallback(() => setScreen('lock'),  []);
  const goToHome  = useCallback(() => setScreen('home'),  []);

  // Lock: swipe UP → notification center
  const handleLockTouchStart = useCallback((e: React.TouchEvent) => {
    lockTouchStartY.current = e.touches[0].clientY;
  }, []);
  const handleLockTouchEnd = useCallback((e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - lockTouchStartY.current;
    if (delta < -50) goToNotif();
  }, [goToNotif]);

  // Notif: swipe DOWN at top → back to lock
  const handleNotifTouchStart = useCallback((e: React.TouchEvent) => {
    notifTouchStartY.current = e.touches[0].clientY;
    notifScrollTopAtStart.current = notifScrollTopRef.current;
  }, []);
  const handleNotifTouchEnd = useCallback((e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - notifTouchStartY.current;
    if (delta > 50 && notifScrollTopAtStart.current <= 0) goToLock();
  }, [goToLock]);

  const handleLaunchApp = useCallback((appId: MPhoneLaunchTarget) => {
    onLaunchApp(appId);
  }, [onLaunchApp]);

  const handleReturnRequest = useCallback(() => setShowConfirm(true), []);
  const handleReturnCancel  = useCallback(() => setShowConfirm(false), []);
  const handleReturnConfirm = useCallback(() => {
    setShowConfirm(false);
    onReturnToMyPhone();
  }, [onReturnToMyPhone]);

  // ── Settings handlers ──
  const updateSettings = useCallback((patch: Partial<MPhoneSettings>) => {
    setMPhoneSettings((prev) => {
      const next = { ...prev, ...patch };
      saveMPhoneSettings(next);
      return next;
    });
  }, []);

  const handleWallpaperApply = useCallback(() => {
    if (wallpaperDraft.trim()) {
      updateSettings({ wallpaper: wallpaperDraft.trim() });
      setWallpaperDraft('');
    }
  }, [wallpaperDraft, updateSettings]);

  const handleWallpaperUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') updateSettings({ wallpaper: reader.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [updateSettings]);

  const handleWallpaperClear = useCallback(() => {
    updateSettings({ wallpaper: '' });
  }, [updateSettings]);

  const handleIconDraftChange = useCallback((appId: MPhoneLaunchTarget, v: string) => {
    setIconDrafts((prev) => ({ ...prev, [appId]: v }));
  }, []);

  const handleIconApply = useCallback((appId: MPhoneLaunchTarget) => {
    const url = iconDrafts[appId]?.trim();
    if (url) {
      updateSettings({ appIcons: { ...mPhoneSettings.appIcons, [appId]: url } });
      setIconDrafts((prev) => ({ ...prev, [appId]: '' }));
    }
  }, [iconDrafts, mPhoneSettings.appIcons, updateSettings]);

  const handleIconUpload = useCallback((appId: MPhoneLaunchTarget, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateSettings({ appIcons: { ...mPhoneSettings.appIcons, [appId]: reader.result } });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [mPhoneSettings.appIcons, updateSettings]);

  const handleIconClear = useCallback((appId: MPhoneLaunchTarget) => {
    const next = { ...mPhoneSettings.appIcons };
    delete next[appId];
    updateSettings({ appIcons: next });
  }, [mPhoneSettings.appIcons, updateSettings]);

  const timeStr = fmtTime(now);
  const dateStr = fmtDate(now);

  return (
    <div
      className="mphone-root"
      style={{
        ...(mPhoneFontFamily ? { '--mphone-font': `'${mPhoneFontFamily}', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif` } : {}),
        ...(mPhoneFontScale != null && mPhoneFontScale !== 1 ? { '--mphone-font-scale': String(mPhoneFontScale) } : {}),
      } as CSSProperties}
    >

      {/* Wallpaper */}
      <div className="mphone-wallpaper" style={{ backgroundImage: `url('${wallpaperUrl}')` }} aria-hidden="true" />
      <div className="mphone-wallpaper-overlay" aria-hidden="true" />

      {/* Dynamic Island */}
      <div className="mphone-dynamic-island" aria-hidden="true" />

      {/* ══════════════ LOCK SCREEN ══════════════ */}
      <div
        className={`mphone-screen mphone-lock ${screenState('lock', screen)}`}
        onTouchStart={handleLockTouchStart}
        onTouchEnd={handleLockTouchEnd}
      >
        {/* Status bar — no time (big clock is the only clock) */}
        <MPhoneStatusBar now={now} hideTime />

        {/* Clock + music — date/time at top, music pushed to bottom */}
        <div className="mphone-lock-body">
          <div className="mphone-lock-hero">
            <div className="mphone-lock-date">{dateStr}</div>
            <div className="mphone-lock-time">{timeStr}</div>
          </div>
          <div className="mphone-lock-spacer" />
          {dailySong && <LockMusicCard song={dailySong} />}
        </div>

        {/* Bottom hint + indicator */}
        <div className="mphone-lock-footer">
          <div className="mphone-lock-swipe-hint" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
              <path d="M10 5v10M5 10l5 5 5-5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>向下滑動查看通知</span>
          </div>
          <div className="mphone-home-indicator" />
        </div>
      </div>

      {/* ══════════════ NOTIFICATION CENTER ══════════════ */}
      <div
        className={`mphone-screen mphone-notif ${screenState('notif', screen)}`}
        onTouchStart={handleNotifTouchStart}
        onTouchEnd={handleNotifTouchEnd}
      >
        <MPhoneStatusBar now={now} />

        <div className="mphone-notif-header">
          <div className="mphone-notif-title">通知中心</div>
          <button
            type="button"
            className="mphone-notif-close"
            onClick={goToLock}
            aria-label="關閉通知中心"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable notification list */}
        <div
          className="mphone-notif-scroll"
          onScroll={(e) => { notifScrollTopRef.current = e.currentTarget.scrollTop; }}
        >
          {dynamicNotifOrder.map((appId) => {
            const cfg = APP_CFG[appId];
            const title = notifTitles[appId] ?? cfg.staticTitle ?? '...';
            const sub   = cfg.staticSub ?? cfg.label;
            const customIcon = mPhoneSettings.appIcons[appId];
            return (
              <button
                key={appId}
                type="button"
                className="mphone-notif-card mphone-glass"
                onClick={() => handleLaunchApp(appId)}
              >
                <div
                  className="mphone-notif-ico"
                  style={customIcon
                    ? { backgroundImage: `url('${customIcon}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: cfg.iconBg }
                  }
                >
                  {!customIcon && cfg.icon}
                </div>
                <div className="mphone-notif-body">
                  <div className="mphone-notif-app">{cfg.label}</div>
                  <div className="mphone-notif-title">{title}</div>
                  <div className="mphone-notif-sub">{sub}</div>
                </div>
                <div className="mphone-notif-when">{dailyTimeAgo[appId] ?? cfg.timeAgo ?? '今天'}</div>
              </button>
            );
          })}
        </div>

        {/* Bottom: house button only — tap to go home */}
        <div className="mphone-notif-bottom">
          <button
            type="button"
            className="mphone-notif-home-btn"
            onClick={goToHome}
            aria-label="前往桌面"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
              <path
                d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H15v-5h-6v5H4a1 1 0 0 1-1-1V9.5z"
                fill="rgba(255,255,255,0.88)"
              />
            </svg>
          </button>
          <div className="mphone-home-indicator" />
        </div>
      </div>

      {/* ══════════════ HOME SCREEN ══════════════ */}
      <div className={`mphone-screen mphone-home ${screenState('home', screen)}`}>
        <MPhoneStatusBar now={now} />

        <div ref={homePagerRef} className="mphone-home-pager">

          {/* ── Page 1: Big clock + M default apps (filtered) ── */}
          <section className="mphone-home-page">
            <HomeClockWidget now={now} />
            <div className="mphone-app-grid">
              {visiblePage1.map((appId) => (
                <AppIconBtn
                  key={appId}
                  appId={appId}
                  onLaunch={handleLaunchApp}
                  customIconUrl={mPhoneSettings.appIcons[appId]}
                />
              ))}
            </div>
          </section>

          {/* ── Page 2: Music + remaining M defaults + Anni transferred + Anni's Phone ── */}
          <section className="mphone-home-page">
            <MusicWidget song={dailySong} />
            <div className="mphone-app-grid">
              {visiblePage2.map((appId) => (
                <AppIconBtn
                  key={appId}
                  appId={appId}
                  onLaunch={handleLaunchApp}
                  customIconUrl={mPhoneSettings.appIcons[appId]}
                />
              ))}
              {transferredFromAnni.map((appId) => (
                <AppIconBtn
                  key={appId}
                  appId={appId}
                  onLaunch={handleLaunchApp}
                  customIconUrl={mPhoneSettings.appIcons[appId]}
                />
              ))}
              <button
                type="button"
                className="mphone-app-item"
                onClick={handleReturnRequest}
                aria-label="Anni's Phone"
              >
                <div className="mphone-app-icon mphone-annisphone-icon">
                  <span>A</span>
                </div>
                <span className="mphone-app-label">Anni's Phone</span>
              </button>
            </div>
          </section>

        </div>

        <div className="mphone-page-dots" aria-hidden="true">
          {[0, 1].map((i) => (
            <span key={i} className={`mphone-page-dot${i === homePageIdx ? ' is-active' : ''}`} />
          ))}
        </div>

        <div className="mphone-dock-wrap">
          <div className="mphone-dock">
            {visibleDock.map((appId) => (
              <AppIconBtn
                key={appId}
                appId={appId}
                onLaunch={handleLaunchApp}
                dockSize
                customIconUrl={mPhoneSettings.appIcons[appId]}
              />
            ))}
            <button
              type="button"
              className="mphone-app-item mphone-dock-item"
              aria-label="設定"
              onClick={() => setShowSettings(true)}
            >
              <div className="mphone-app-icon" style={{ background: 'linear-gradient(145deg,#636366,#48484a)' }}>
                <span>⚙</span>
              </div>
            </button>
          </div>
        </div>

        <div className="mphone-home-indicator" />
      </div>

      {/* ══════════════ CONFIRM OVERLAY ══════════════ */}
      {showConfirm && (
        <div
          className="mphone-confirm-overlay"
          onClick={handleReturnCancel}
          role="dialog"
          aria-modal="true"
        >
          <div className="mphone-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="mphone-confirm-title">離開 M 的手機？</p>
            <p className="mphone-confirm-sub">切換回 Anni's Phone</p>
            <div className="mphone-confirm-actions">
              <button type="button" className="mphone-confirm-cancel" onClick={handleReturnCancel}>取消</button>
              <button type="button" className="mphone-confirm-ok" onClick={handleReturnConfirm}>確定</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ SETTINGS OVERLAY ══════════════ */}
      {showSettings && (
        <MPhoneSettingsView
          settings={mPhoneSettings}
          wallpaperDraft={wallpaperDraft}
          iconDrafts={iconDrafts}
          currentApps={dynamicNotifOrder}
          onWallpaperDraftChange={setWallpaperDraft}
          onWallpaperApply={handleWallpaperApply}
          onWallpaperUpload={handleWallpaperUpload}
          onWallpaperClear={handleWallpaperClear}
          onIconDraftChange={handleIconDraftChange}
          onIconApply={handleIconApply}
          onIconUpload={handleIconUpload}
          onIconClear={handleIconClear}
          onClose={() => setShowSettings(false)}
        />
      )}

    </div>
  );
}
