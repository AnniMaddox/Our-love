import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { emitActionToast } from '../lib/actionToast';
import type { ChatProfile } from '../lib/chatDB';
import type { StoredChatLog } from '../lib/chatLogDB';
import { splitNickAliases } from '../lib/chatProfileMatcher';
import type { AppSettings } from '../types/settings';

type ChatLogPageProps = {
  logs: StoredChatLog[];
  chatProfiles: ChatProfile[];
  settings: Pick<
    AppSettings,
    | 'chatBubbleStyle'
    | 'chatBubbleRadius'
    | 'chatUserBubbleColor'
    | 'chatUserBubbleBorderColor'
    | 'chatUserBubbleTextColor'
    | 'chatAiBubbleColor'
    | 'chatAiBubbleBorderColor'
    | 'chatAiBubbleTextColor'
    | 'chatAppMessagesIcon'
    | 'chatAppDiscoverIcon'
    | 'chatAppMeIcon'
    | 'chatAppShowLabels'
    | 'chatAppDefaultProfileId'
    | 'chatBackgroundColor'
    | 'chatBackgroundImageUrl'
    | 'chatBackgroundOverlay'
    | 'chatReadBgColor'
    | 'chatReadBgImageUrl'
    | 'chatReadBgOverlay'
    | 'chatNavBgColor'
    | 'chatBodyBgColor'
    | 'chatMsgFontSize'
    | 'chatMsgLineHeight'
    | 'chatNightMode'
    | 'chatContactNameSize'
  >;
  onSettingChange: (partial: Partial<AppSettings>) => void;
  onImportChatLogFiles: (files: File[]) => void;
  onImportChatLogFolderFiles: (files: File[]) => void;
  onClearAllChatLogs: () => void;
  onDeleteChatLog: (name: string) => void;
  onSaveChatProfile: (profile: ChatProfile) => Promise<boolean> | boolean;
  onDeleteChatProfile: (id: string) => void;
  onBindLogProfile?: (logName: string, profileId: string) => void;
  onExit?: () => void;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  time?: string;
};

type ChatHomeTab = 'messages' | 'discover' | 'me';
type MePanelKey = 'nav' | 'data' | 'defaultProfile' | 'bubble' | 'background' | 'navBar' | 'bodyBg' | 'profiles';
type ChatNavIconSettingKey = 'chatAppMessagesIcon' | 'chatAppDiscoverIcon' | 'chatAppMeIcon';

type ProfileDraft = Omit<ChatProfile, 'id'>;

// ===== Bookmark system =====

type Bookmark = {
  id: string;
  messageIndex: number;
  label: string;
  preview: string;
  createdAt: string;
};

function bookmarkStorageKey(logName: string) {
  return `chat-bookmarks-v1-${logName}`;
}

function loadBookmarks(logName: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(bookmarkStorageKey(logName));
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch {
    return [];
  }
}

function persistBookmarks(logName: string, marks: Bookmark[]) {
  localStorage.setItem(bookmarkStorageKey(logName), JSON.stringify(marks));
}

// ===== Utilities =====

function emptyProfileDraft(): ProfileDraft {
  return {
    name: '',
    leftNick: 'M',
    rightNick: '你',
    leftAvatarDataUrl: '',
    rightAvatarDataUrl: '',
  };
}

function normalizeSpeakerToken(value: string) {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapSpeakerToRole(
  speaker: string | undefined,
  rightAliases: string[],
  leftAliases: string[],
): 'user' | 'assistant' | null {
  if (!speaker) return null;
  const normalized = normalizeSpeakerToken(speaker);
  if (!normalized) return null;
  if (rightAliases.some((alias) => normalizeSpeakerToken(alias) === normalized)) return 'user';
  if (leftAliases.some((alias) => normalizeSpeakerToken(alias) === normalized)) return 'assistant';
  return null;
}

function extractMessageText(item: Record<string, unknown>) {
  const contentKeys = ['content', 'message', 'text', 'body'] as const;
  for (const key of contentKeys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractMessageTime(item: Record<string, unknown>) {
  const timeKeys = ['timestamp', 'time', 'datetime', 'date'] as const;
  for (const key of timeKeys) {
    const value = item[key];
    if (typeof value !== 'string') continue;
    const raw = value.trim();
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')} ${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    }
    return raw.replace('T', ' ').slice(0, 16);
  }
  return undefined;
}

function stripAliasPrefix(line: string, aliases: string[]) {
  for (const alias of aliases) {
    const match = line.match(new RegExp(`^${escapeRegExp(alias)}\\s*[：:]\\s*(.*)$`, 'i'));
    if (match) return (match[1] ?? '').trim();
  }
  return null;
}

function parseChatContent(text: string, profile: ChatProfile | null): ChatMessage[] {
  const leftAliases = splitNickAliases(profile?.leftNick, 'M');
  const rightAliases = splitNickAliases(profile?.rightNick, '你');

  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const msgs: ChatMessage[] = [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const content = extractMessageText(record);
        if (!content) continue;

        let role: 'user' | 'assistant' | null = null;
        const roleField = record.role;
        if (roleField === 'user' || roleField === 'assistant') {
          role = roleField;
        } else {
          const speaker =
            (typeof record.speaker === 'string' ? record.speaker : undefined) ??
            (typeof record.name === 'string' ? record.name : undefined) ??
            (typeof record.author === 'string' ? record.author : undefined) ??
            (typeof record.from === 'string' ? record.from : undefined);
          role = mapSpeakerToRole(speaker, rightAliases, leftAliases);
        }
        if (!role) continue;

        msgs.push({ role, content, time: extractMessageTime(record) });
      }
      if (msgs.length > 0) return msgs;
    } catch {
      // fall through to line mode
    }
  }

  const lines = text.split('\n');
  const msgs: ChatMessage[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent = '';
  let currentTime: string | undefined;

  function flush() {
    if (currentRole && currentContent.trim()) {
      msgs.push({ role: currentRole, content: currentContent.trim(), time: currentTime });
    }
    currentContent = '';
    currentTime = undefined;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const stampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?)\]/);
    if (stampMatch) {
      currentTime = stampMatch[1].replace('T', ' ').slice(0, 16);
      continue;
    }

    const roleTagMatch = line.match(/^【(user|assistant)】\s*(?:\[([^\]]+)\])?(.*)$/i);
    if (roleTagMatch) {
      flush();
      currentRole = roleTagMatch[1].toLowerCase() === 'user' ? 'user' : 'assistant';
      if (roleTagMatch[2]) {
        currentTime = roleTagMatch[2].replace('T', ' ').slice(0, 16);
      }
      const rest = (roleTagMatch[3] ?? '').trim();
      if (rest) currentContent = rest;
      continue;
    }

    const rightContent = stripAliasPrefix(line, rightAliases);
    if (rightContent !== null) {
      flush();
      currentRole = 'user';
      currentContent = rightContent;
      continue;
    }

    const leftContent = stripAliasPrefix(line, leftAliases);
    if (leftContent !== null) {
      flush();
      currentRole = 'assistant';
      currentContent = leftContent;
      continue;
    }

    const namedTagMatch = line.match(/^【([^】]+)】\s*(.*)$/);
    if (namedTagMatch) {
      const role = mapSpeakerToRole(namedTagMatch[1], rightAliases, leftAliases);
      if (role) {
        flush();
        currentRole = role;
        currentContent = (namedTagMatch[2] ?? '').trim();
      }
      continue;
    }

    if (currentContent) currentContent += '\n';
    currentContent += line;
  }

  flush();
  return msgs;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function displayLogName(fileName: string) {
  return fileName.replace(/\.(txt|md|docx|json)$/i, '');
}

function primaryAlias(value: string | undefined, fallback: string) {
  const aliases = splitNickAliases(value, fallback);
  return aliases[0] ?? fallback;
}

// ===== Night mode theme =====

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darkenHex(hex: string, amount = 0.45): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    const d = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
    return `#${[d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return hex;
  }
}

type ChatTheme = {
  night: boolean;
  bg: string;
  barBg: string;
  barBorder: string;
  titleColor: string;
  subtitleColor: string;
  btnBg: string;
  btnBorder: string;
  btnColor: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  dividerColor: string;
  listItemHover: string;
  dateLabelColor: string;
  floatBtnBg: string;
  floatBtnBorder: string;
  floatBtnColor: string;
  drawerBg: string;
  drawerBorder: string;
  drawerTitleColor: string;
  drawerSubColor: string;
  drawerDivider: string;
  bubbleVarStyle: CSSProperties;
};

function buildTheme(
  night: boolean,
  settings: Pick<
    AppSettings,
    | 'chatBackgroundColor'
    | 'chatBackgroundImageUrl'
    | 'chatBackgroundOverlay'
    | 'chatUserBubbleColor'
    | 'chatUserBubbleBorderColor'
    | 'chatAiBubbleColor'
    | 'chatAiBubbleBorderColor'
  >,
): ChatTheme {
  if (night) {
    return {
      night: true,
      bg: '#1c1c1e',
      barBg: '#1c1c1e',
      barBorder: 'rgba(255,255,255,0.1)',
      titleColor: '#f2f2f7',
      subtitleColor: '#8e8e93',
      btnBg: '#2c2c2e',
      btnBorder: 'rgba(255,255,255,0.12)',
      btnColor: '#ebebf5',
      inputBg: '#2c2c2e',
      inputBorder: 'rgba(255,255,255,0.12)',
      inputText: '#f2f2f7',
      dividerColor: 'rgba(255,255,255,0.08)',
      listItemHover: 'rgba(255,255,255,0.06)',
      dateLabelColor: 'rgba(255,255,255,0.35)',
      floatBtnBg: '#2c2c2e',
      floatBtnBorder: 'rgba(255,255,255,0.12)',
      floatBtnColor: '#ebebf5',
      drawerBg: '#2c2c2e',
      drawerBorder: 'rgba(255,255,255,0.08)',
      drawerTitleColor: '#f2f2f7',
      drawerSubColor: '#8e8e93',
      drawerDivider: 'rgba(255,255,255,0.07)',
      bubbleVarStyle: {
        '--user-bubble-bg': darkenHex(settings.chatUserBubbleColor),
        '--user-bubble-border': darkenHex(settings.chatUserBubbleBorderColor, 0.35),
        '--ai-bubble-bg': darkenHex(settings.chatAiBubbleColor),
        '--ai-bubble-border': darkenHex(settings.chatAiBubbleBorderColor, 0.35),
      } as CSSProperties,
    };
  }
  const bg = settings.chatBackgroundColor || '#efeff4';
  return {
    night: false,
    bg,
    barBg: bg,
    barBorder: 'rgba(0,0,0,0.1)',
    titleColor: '#1c1c1e',
    subtitleColor: '#6b7280',
    btnBg: 'rgba(255,255,255,0.85)',
    btnBorder: 'rgba(0,0,0,0.12)',
    btnColor: '#374151',
    inputBg: 'rgba(255,255,255,0.85)',
    inputBorder: 'rgba(0,0,0,0.14)',
    inputText: '#374151',
    dividerColor: 'rgba(0,0,0,0.07)',
    listItemHover: 'rgba(0,0,0,0.04)',
    dateLabelColor: 'rgba(0,0,0,0.35)',
    floatBtnBg: 'rgba(255,255,255,0.92)',
    floatBtnBorder: 'rgba(0,0,0,0.1)',
    floatBtnColor: '#374151',
    drawerBg: '#ffffff',
    drawerBorder: 'rgba(0,0,0,0.06)',
    drawerTitleColor: '#1c1c1e',
    drawerSubColor: '#6b7280',
    drawerDivider: 'rgba(0,0,0,0.06)',
    bubbleVarStyle: {},
  };
}

const CHAT_BACKGROUND_PRESETS = ['#efeff4', '#f6f1e7', '#eaf1f6', '#f4e9ef', '#eef3e6'] as const;

function buildChatBackgroundStyle(bgColor: string, imageUrl: string, overlay: number): CSSProperties {
  const url = imageUrl.trim();
  if (!url) {
    return { backgroundColor: bgColor };
  }

  const overlayAlpha = Math.max(0, Math.min(0.9, overlay / 100));
  return {
    backgroundColor: bgColor,
    backgroundImage: `linear-gradient(rgba(255,255,255,${overlayAlpha}), rgba(255,255,255,${overlayAlpha})), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

function resolveIcon(value: string, fallback: string) {
  const icon = value.trim();
  return icon || fallback;
}

function isImageIcon(value: string) {
  const icon = value.trim();
  if (!icon) return false;
  return (
    icon.startsWith('data:image/') ||
    icon.startsWith('http://') ||
    icon.startsWith('https://') ||
    icon.startsWith('/') ||
    icon.startsWith('./') ||
    icon.startsWith('../') ||
    /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(icon)
  );
}

function IconPreview({
  icon,
  fallback,
  imageClassName = 'h-6 w-6',
  textClassName = 'text-2xl leading-none',
}: {
  icon: string;
  fallback: string;
  imageClassName?: string;
  textClassName?: string;
}) {
  const resolved = resolveIcon(icon, fallback);
  if (isImageIcon(resolved)) {
    return <img src={resolved} alt="" className={`${imageClassName} object-contain`} />;
  }
  return <span className={textClassName}>{resolved}</span>;
}

function MePanel({
  panelKey,
  openPanel,
  onToggle,
  title,
  subtitle,
  children,
}: {
  panelKey: MePanelKey;
  openPanel: MePanelKey | null;
  onToggle: (panel: MePanelKey) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const isOpen = openPanel === panelKey;
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(panelKey)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-800">{title}</p>
          <p className="truncate text-xs text-stone-500">{subtitle}</p>
        </div>
        <span
          className={`text-xl leading-none text-stone-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {isOpen && <div className="border-t border-stone-200 p-4">{children}</div>}
    </section>
  );
}

export function ChatLogPage({
  logs,
  chatProfiles,
  settings,
  onSettingChange,
  onImportChatLogFiles,
  onImportChatLogFolderFiles,
  onClearAllChatLogs,
  onDeleteChatLog,
  onSaveChatProfile,
  onDeleteChatProfile,
  onBindLogProfile,
  onExit,
}: ChatLogPageProps) {
  const [selectedLogName, setSelectedLogName] = useState<string>('');
  const [selectedLogProfileId, setSelectedLogProfileId] = useState<string>('');
  const [defaultProfileId, setDefaultProfileId] = useState<string>(settings.chatAppDefaultProfileId);
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState<ChatHomeTab>('messages');
  const [openMePanel, setOpenMePanel] = useState<MePanelKey | null>('data');
  const [chatReadBgImageDraft, setChatReadBgImageDraft] = useState(settings.chatReadBgImageUrl);

  const [showNewProfileEditor, setShowNewProfileEditor] = useState(false);
  const [newProfileDraft, setNewProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [editingProfileId, setEditingProfileId] = useState('');
  const [editingProfileDraft, setEditingProfileDraft] = useState<ProfileDraft | null>(null);

  const selectedLog = useMemo(
    () => logs.find((log) => log.name === selectedLogName) ?? null,
    [logs, selectedLogName],
  );

  const filteredLogs = useMemo(() => {
    const keyword = normalizeSearchText(searchInput);
    if (!keyword) return logs;
    return logs.filter((log) => normalizeSearchText(log.name).includes(keyword));
  }, [logs, searchInput]);

  const defaultProfile = useMemo(
    () => chatProfiles.find((profile) => profile.id === defaultProfileId) ?? chatProfiles[0] ?? null,
    [chatProfiles, defaultProfileId],
  );

  const selectedLogProfile = useMemo(
    () => chatProfiles.find((profile) => profile.id === selectedLogProfileId) ?? defaultProfile,
    [chatProfiles, selectedLogProfileId, defaultProfile],
  );

  useEffect(() => {
    setDefaultProfileId(settings.chatAppDefaultProfileId);
  }, [settings.chatAppDefaultProfileId]);

  useEffect(() => {
    setChatReadBgImageDraft(settings.chatReadBgImageUrl);
  }, [settings.chatReadBgImageUrl]);

  useEffect(() => {
    if (selectedLog) {
      setSelectedLogProfileId(selectedLog.profileId ?? defaultProfileId);
      return;
    }
    setSelectedLogProfileId('');
  }, [selectedLog?.name, selectedLog?.profileId, defaultProfileId]);

  useEffect(() => {
    if (!defaultProfileId) {
      return;
    }
    const exists = chatProfiles.some((profile) => profile.id === defaultProfileId);
    if (exists) {
      return;
    }
    setDefaultProfileId('');
    onSettingChange({ chatAppDefaultProfileId: '' });
  }, [chatProfiles, defaultProfileId, onSettingChange]);

  useEffect(() => {
    if (!editingProfileId) {
      return;
    }
    const nextProfile = chatProfiles.find((profile) => profile.id === editingProfileId);
    if (!nextProfile) {
      setEditingProfileId('');
      setEditingProfileDraft(null);
      return;
    }
    setEditingProfileDraft({
      name: nextProfile.name,
      leftNick: nextProfile.leftNick,
      rightNick: nextProfile.rightNick,
      leftAvatarDataUrl: nextProfile.leftAvatarDataUrl,
      rightAvatarDataUrl: nextProfile.rightAvatarDataUrl,
    });
  }, [chatProfiles, editingProfileId]);

  const openLog = useCallback((logName: string) => {
    setSelectedLogName(logName);
  }, []);

  const openRandomLog = useCallback(() => {
    if (!logs.length) return;
    const pick = logs[Math.floor(Math.random() * logs.length)];
    setSelectedLogName(pick.name);
  }, [logs]);

  const showNavLabels = settings.chatAppShowLabels;

  const contactName = primaryAlias(defaultProfile?.leftNick, 'Michael');
  const contactSubtitle = defaultProfile ? `${primaryAlias(defaultProfile.rightNick, '你')} ♡` : '🥺 ❤️';
  const contactAvatar = defaultProfile?.leftAvatarDataUrl || defaultProfile?.rightAvatarDataUrl;
  const night = settings.chatNightMode;

  const theme = useMemo(
    () => buildTheme(night, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [night, settings.chatBackgroundColor, settings.chatUserBubbleColor, settings.chatUserBubbleBorderColor, settings.chatAiBubbleColor, settings.chatAiBubbleBorderColor],
  );

  const navBg = night ? theme.barBg : (settings.chatNavBgColor || theme.barBg);
  const bodyBg = night ? theme.barBg : (settings.chatBodyBgColor || theme.barBg);

  const chatReadViewBgStyle = useMemo((): CSSProperties => {
    if (night) return { backgroundColor: theme.bg };
    return buildChatBackgroundStyle(settings.chatReadBgColor, settings.chatReadBgImageUrl, settings.chatReadBgOverlay);
  }, [night, theme.bg, settings.chatReadBgColor, settings.chatReadBgImageUrl, settings.chatReadBgOverlay]);

  function updateDefaultProfile(profileId: string) {
    setDefaultProfileId(profileId);
    onSettingChange({ chatAppDefaultProfileId: profileId });
  }

  function updateNavIcon(field: ChatNavIconSettingKey, value: string) {
    onSettingChange({ [field]: value } as Pick<AppSettings, ChatNavIconSettingKey>);
  }

  function uploadNavIcon(field: ChatNavIconSettingKey, file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      updateNavIcon(field, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function uploadChatReadBgImage(file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setChatReadBgImageDraft(dataUrl);
      onSettingChange({ chatReadBgImageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  function toggleMePanel(nextPanel: MePanelKey) {
    setOpenMePanel((prev) => (prev === nextPanel ? null : nextPanel));
  }

  function applyImageToDraft(
    target: 'leftAvatarDataUrl' | 'rightAvatarDataUrl',
    file: File | null | undefined,
    setDraft: (updater: (prev: ProfileDraft) => ProfileDraft) => void,
  ) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setDraft((prev) => ({
        ...prev,
        [target]: dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  }

  async function saveNewProfile() {
    if (!newProfileDraft.name.trim()) return;
    const ok = await onSaveChatProfile({
      ...newProfileDraft,
      id: `profile-${Date.now()}`,
    });
    if (!ok) return;
    setShowNewProfileEditor(false);
    setNewProfileDraft(emptyProfileDraft());
    emitActionToast({ kind: 'success', message: '角色設定已儲存' });
  }

  async function saveEditingProfile() {
    if (!editingProfileId || !editingProfileDraft || !editingProfileDraft.name.trim()) return;
    const ok = await onSaveChatProfile({
      ...editingProfileDraft,
      id: editingProfileId,
    });
    if (!ok) return;
    setEditingProfileId('');
    setEditingProfileDraft(null);
    emitActionToast({ kind: 'success', message: '角色設定已儲存' });
  }

  if (selectedLog) {
    return (
      <ChatReadView
        log={selectedLog}
        chatProfiles={chatProfiles}
        selectedProfileId={selectedLogProfileId}
        selectedProfile={selectedLogProfile}
        onSelectProfile={(profileId) => {
          setSelectedLogProfileId(profileId);
          onBindLogProfile?.(selectedLog.name, profileId);
        }}
        backgroundStyle={chatReadViewBgStyle}
        theme={theme}
        chatReadBgColor={settings.chatReadBgColor}
        chatReadBgImageUrl={settings.chatReadBgImageUrl}
        chatReadBgOverlay={settings.chatReadBgOverlay}
        onChatReadBgChange={onSettingChange}
        chatMsgFontSize={settings.chatMsgFontSize}
        chatMsgLineHeight={settings.chatMsgLineHeight}
        chatNavBgColor={settings.chatNavBgColor}
        onBack={() => setSelectedLogName('')}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden" style={{ backgroundColor: theme.barBg }}>
      <header
        className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        style={{ backgroundColor: navBg, borderBottom: `1px solid ${theme.barBorder}` }}
      >
        <div className="flex items-center justify-between gap-3">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="h-9 w-9 rounded-full text-xl leading-none transition active:scale-95"
              style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
              aria-label="返回"
              title="返回"
            >
              <span style={{ transform: 'translateY(-1px)', display: 'block' }}>‹</span>
            </button>
          ) : (
            <span className="h-9 w-9" />
          )}
          <h1 className="font-normal tracking-wide" style={{ fontSize: 'var(--ui-header-title-size, 17px)', color: theme.titleColor }}>
            {activeTab === 'messages' ? '消息' : activeTab === 'discover' ? '發現' : '我'}
          </h1>
          {/* 月亮切換 + 隨機打開 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSettingChange({ chatNightMode: !night })}
              className="h-9 w-9 rounded-full text-lg leading-none transition active:scale-95"
              style={{ background: night ? '#3a3a3c' : theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: night ? '#ffd60a' : theme.btnColor }}
              aria-label={night ? '切換日間模式' : '切換夜間模式'}
              title={night ? '日間模式' : '夜間模式'}
            >
              {night ? '☀' : '☽'}
            </button>
            <button
              type="button"
              onClick={openRandomLog}
              disabled={!logs.length}
              className="h-9 w-9 rounded-full text-xl leading-none transition active:scale-95 disabled:opacity-40"
              style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
              aria-label="隨機打開"
              title="隨機打開"
            >
              ＋
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: bodyBg }}>
        {activeTab === 'messages' && (
          <div style={{ backgroundColor: bodyBg }}>
            {/* 聯絡人列表 — 扁平微信風格 */}
            <button
              type="button"
              onClick={openRandomLog}
              disabled={!logs.length}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:opacity-40"
              style={{ backgroundColor: 'transparent' }}
            >
              {contactAvatar ? (
                <img src={contactAvatar} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div
                  className="grid h-14 w-14 place-items-center rounded-xl text-2xl"
                  style={{ backgroundColor: theme.btnBg, color: theme.subtitleColor }}
                >
                  💬
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate"
                  style={{ fontSize: 'var(--chat-contact-title-size, 15px)', lineHeight: 1.3, color: theme.titleColor }}
                >
                  {contactName}
                </p>
                <p
                  className="mt-0.5 truncate"
                  style={{ fontSize: 'var(--chat-contact-subtitle-size, 14px)', lineHeight: 1.3, color: theme.subtitleColor }}
                >
                  {contactSubtitle}
                </p>
              </div>
              <span style={{ color: theme.subtitleColor }} className="text-lg">›</span>
            </button>
            <div className="mx-4 h-px" style={{ backgroundColor: theme.dividerColor }} />

            {!logs.length && (
              <p className="px-4 py-8 text-center text-sm" style={{ color: theme.subtitleColor }}>
                請先到「我」分頁匯入對話紀錄
              </p>
            )}
          </div>
        )}

        {activeTab === 'discover' && (
          <div className="space-y-3 px-3 py-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜尋檔名"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500"
              />
            </div>

	          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
	            <ul className="divide-y divide-stone-100">
	              {filteredLogs.map((log) => (
	                <li key={log.name}>
	                  <div className="flex items-center gap-2 px-3 py-2">
	                    <button
	                      type="button"
	                      onClick={() => openLog(log.name)}
	                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition active:bg-stone-100"
	                    >
	                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{displayLogName(log.name)}</span>
	                      <span className="text-xs text-stone-400">›</span>
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => {
	                        const ok = window.confirm(`要刪除這份對話紀錄嗎？\n\n${displayLogName(log.name)}`);
	                        if (!ok) return;
	                        onDeleteChatLog(log.name);
	                      }}
	                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-sm text-rose-600 transition active:scale-95"
	                      aria-label={`刪除 ${displayLogName(log.name)}`}
	                      title="刪除"
	                    >
	                      ✕
	                    </button>
	                  </div>
	                </li>
	              ))}
	            </ul>
              {!filteredLogs.length && (
                <p className="px-4 py-6 text-center text-sm text-stone-400">沒有符合的紀錄</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'me' && (
          <div className="space-y-3 px-3 py-3">
            <MePanel
              panelKey="nav"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="底部分頁圖示"
              subtitle="可輸入符號 / 貼圖片網址 / 直接上傳圖片"
            >
              <div className="space-y-2">
                {[
                  { label: '消息', field: 'chatAppMessagesIcon' as const, value: settings.chatAppMessagesIcon, fallback: '💬' },
                  { label: '發現', field: 'chatAppDiscoverIcon' as const, value: settings.chatAppDiscoverIcon, fallback: '✨' },
                  { label: '我', field: 'chatAppMeIcon' as const, value: settings.chatAppMeIcon, fallback: '👤' },
                ].map((item) => (
                  <div key={item.field} className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                    <p className="text-xs text-stone-600">{item.label}</p>
                    <div className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-300 bg-white">
                        <IconPreview icon={item.value} fallback={item.fallback} imageClassName="h-6 w-6" />
                      </div>
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => updateNavIcon(item.field, e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                        placeholder={item.fallback}
                      />
                      <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white text-sm text-stone-700 transition active:scale-95">
                        ⤴
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            uploadNavIcon(item.field, event.target.files?.[0]);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => updateNavIcon(item.field, '')}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-sm text-stone-700 transition active:scale-95"
                        aria-label="還原"
                        title="還原"
                      >
                        ↺
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <label className="mt-3 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <span>顯示文字</span>
                <input
                  type="checkbox"
                  checked={settings.chatAppShowLabels}
                  onChange={(e) => onSettingChange({ chatAppShowLabels: e.target.checked })}
                  className="h-4 w-4 accent-stone-900"
                />
              </label>

              <label className="mt-2 block space-y-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <span className="flex items-center justify-between text-xs text-stone-600">
                  <span>聯絡人名稱大小</span>
                  <span>{settings.chatContactNameSize}px</span>
                </span>
                <input
                  type="range"
                  min={11}
                  max={24}
                  step={1}
                  value={settings.chatContactNameSize}
                  onChange={(e) => onSettingChange({ chatContactNameSize: Number(e.target.value) })}
                  className="w-full accent-stone-800"
                />
              </label>
            </MePanel>

            <MePanel
              panelKey="data"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="對話資料"
              subtitle={`目前 ${logs.length} 份`}
            >
              <div className="mb-3 flex items-end justify-between gap-3">
                <p className="text-xs text-stone-500">支援 txt / md / json / docx</p>
                <button
                  type="button"
                  onClick={onClearAllChatLogs}
                  disabled={!logs.length}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 disabled:opacity-50"
                >
                  清空
                </button>
              </div>

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
            </MePanel>

            <MePanel
              panelKey="defaultProfile"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="預設角色"
              subtitle="消息頁頭像 / 名稱會跟隨這組"
            >
              <select
                value={defaultProfileId}
                onChange={(e) => updateDefaultProfile(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
              >
                <option value="">預設（你 / M）</option>
                {chatProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.rightNick} / {p.leftNick}）
                  </option>
                ))}
              </select>
            </MePanel>

            <MePanel
              panelKey="bubble"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="泡泡外觀"
              subtitle="樣式 / 圓角 / 顏色"
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
                    <span>泡泡圓角</span>
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
                    <span className="text-xs text-stone-600">我方底色</span>
                    <input
                      type="color"
                      value={settings.chatUserBubbleColor}
                      onChange={(e) => onSettingChange({ chatUserBubbleColor: e.target.value })}
                      className="h-10 w-full rounded-md border border-stone-300"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-stone-600">對方底色</span>
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
              </div>
            </MePanel>

            <MePanel
              panelKey="background"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="閱讀背景"
              subtitle="對話視窗專屬背景，不影響首頁"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {CHAT_BACKGROUND_PRESETS.map((color) => {
                    const active = settings.chatReadBgColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onSettingChange({ chatReadBgColor: color })}
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
                    value={settings.chatReadBgColor}
                    onChange={(event) => onSettingChange({ chatReadBgColor: event.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">背景圖片 URL</span>
                  <input
                    type="url"
                    value={chatReadBgImageDraft}
                    onChange={(event) => setChatReadBgImageDraft(event.target.value)}
                    placeholder="https://.../chat-bg.jpg"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatReadBgImageUrl: chatReadBgImageDraft.trim() })}
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
                        uploadChatReadBgImage(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="flex items-center justify-between text-xs text-stone-600">
                    <span>圖片遮罩</span>
                    <span>{settings.chatReadBgOverlay}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={settings.chatReadBgOverlay}
                    onChange={(event) => onSettingChange({ chatReadBgOverlay: Number(event.target.value) })}
                    className="w-full accent-stone-800"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setChatReadBgImageDraft('');
                    onSettingChange({ chatReadBgImageUrl: '', chatReadBgOverlay: 0 });
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                >
                  移除背景圖片
                </button>
              </div>
            </MePanel>

            <MePanel
              panelKey="navBar"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="導覽列底色"
              subtitle="頂部標題列和底部分頁列的背景色"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {CHAT_BACKGROUND_PRESETS.map((color) => {
                    const effective = settings.chatNavBgColor || theme.barBg;
                    const active = effective.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onSettingChange({ chatNavBgColor: color })}
                        className={`h-7 w-7 rounded-full border transition active:scale-95 ${active ? 'border-stone-900 ring-2 ring-stone-300' : 'border-stone-300'}`}
                        style={{ background: color }}
                        aria-label={`導覽列底色 ${color}`}
                        title={color}
                      />
                    );
                  })}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">自訂顏色</span>
                  <input
                    type="color"
                    value={settings.chatNavBgColor || theme.barBg}
                    onChange={(e) => onSettingChange({ chatNavBgColor: e.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onSettingChange({ chatNavBgColor: '' })}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                >
                  重設（跟隨主題色）
                </button>
              </div>
            </MePanel>

            <MePanel
              panelKey="bodyBg"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="頁籤內容底色"
              subtitle="消息、發現、我 等頁籤的背景色"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {CHAT_BACKGROUND_PRESETS.map((color) => {
                    const effective = settings.chatBodyBgColor || theme.barBg;
                    const active = effective.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onSettingChange({ chatBodyBgColor: color })}
                        className={`h-7 w-7 rounded-full border transition active:scale-95 ${active ? 'border-stone-900 ring-2 ring-stone-300' : 'border-stone-300'}`}
                        style={{ background: color }}
                        aria-label={`內容底色 ${color}`}
                        title={color}
                      />
                    );
                  })}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-stone-600">自訂顏色</span>
                  <input
                    type="color"
                    value={settings.chatBodyBgColor || theme.barBg}
                    onChange={(e) => onSettingChange({ chatBodyBgColor: e.target.value })}
                    className="h-10 w-full rounded-md border border-stone-300"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onSettingChange({ chatBodyBgColor: '' })}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                >
                  重設（跟隨主題色）
                </button>
              </div>
            </MePanel>

            <MePanel
              panelKey="profiles"
              openPanel={openMePanel}
              onToggle={toggleMePanel}
              title="聊天角色設定（洗角色名稱）"
              subtitle={`共 ${chatProfiles.length} 組`}
            >
              <div className="space-y-3">
                {chatProfiles.length === 0 && (
                  <p className="text-xs text-stone-400">尚未建立角色設定，預設為「你」/「M」。</p>
                )}

                <div className="space-y-2">
                  {chatProfiles.map((profile) => {
                    const isEditing = editingProfileId === profile.id && !!editingProfileDraft;
                    return (
                      <div key={profile.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                        {!isEditing ? (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-stone-800">{profile.name}</p>
                              <p className="text-xs text-stone-400">右：{profile.rightNick} ／ 左：{profile.leftNick}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProfileId(profile.id);
                                setEditingProfileDraft({
                                  name: profile.name,
                                  leftNick: profile.leftNick,
                                  rightNick: profile.rightNick,
                                  leftAvatarDataUrl: profile.leftAvatarDataUrl,
                                  rightAvatarDataUrl: profile.rightAvatarDataUrl,
                                });
                              }}
                              className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700"
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteChatProfile(profile.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600"
                            >
                              刪除
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingProfileDraft.name}
                              onChange={(e) =>
                                setEditingProfileDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                              }
                              placeholder="設定名稱"
                              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editingProfileDraft.rightNick}
                                onChange={(e) =>
                                  setEditingProfileDraft((prev) => (prev ? { ...prev, rightNick: e.target.value } : prev))
                                }
                                placeholder="右側暱稱（可 / 分隔）"
                                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                              />
                              <input
                                type="text"
                                value={editingProfileDraft.leftNick}
                                onChange={(e) =>
                                  setEditingProfileDraft((prev) => (prev ? { ...prev, leftNick: e.target.value } : prev))
                                }
                                placeholder="左側暱稱（可 / 分隔）"
                                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-xs text-stone-500">右側頭像</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    applyImageToDraft('rightAvatarDataUrl', e.target.files?.[0], (updater) =>
                                      setEditingProfileDraft((prev) => (prev ? updater(prev) : prev)),
                                    )
                                  }
                                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-stone-500">左側頭像</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    applyImageToDraft('leftAvatarDataUrl', e.target.files?.[0], (updater) =>
                                      setEditingProfileDraft((prev) => (prev ? updater(prev) : prev)),
                                    )
                                  }
                                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                                />
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void saveEditingProfile()}
                                className="flex-1 rounded-xl bg-stone-900 py-2 text-sm text-white"
                              >
                                儲存
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProfileId('');
                                  setEditingProfileDraft(null);
                                }}
                                className="flex-1 rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-600"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {showNewProfileEditor ? (
                  <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <input
                      type="text"
                      placeholder="設定名稱，例：和4o的對話"
                      value={newProfileDraft.name}
                      onChange={(e) => setNewProfileDraft((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="右側暱稱（可 / 分隔）"
                        value={newProfileDraft.rightNick}
                        onChange={(e) => setNewProfileDraft((prev) => ({ ...prev, rightNick: e.target.value }))}
                        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="左側暱稱（可 / 分隔）"
                        value={newProfileDraft.leftNick}
                        onChange={(e) => setNewProfileDraft((prev) => ({ ...prev, leftNick: e.target.value }))}
                        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-xs text-stone-500">右側頭像</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => applyImageToDraft('rightAvatarDataUrl', e.target.files?.[0], setNewProfileDraft)}
                          className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-stone-500">左側頭像</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => applyImageToDraft('leftAvatarDataUrl', e.target.files?.[0], setNewProfileDraft)}
                          className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveNewProfile()}
                        className="flex-1 rounded-xl bg-stone-900 py-2 text-sm text-white"
                      >
                        儲存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewProfileEditor(false);
                          setNewProfileDraft(emptyProfileDraft());
                        }}
                        className="flex-1 rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-600"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewProfileEditor(true)}
                    className="w-full rounded-xl border border-violet-200 bg-violet-50 py-2 text-sm text-violet-700"
                  >
                    ＋ 新增角色設定
                  </button>
                )}
              </div>
            </MePanel>
          </div>
        )}
      </main>

      <nav
        className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5"
        style={{ backgroundColor: navBg, borderTop: `1px solid ${theme.barBorder}` }}
      >
        <div className="grid grid-cols-3 gap-2">
          {([
            { tab: 'messages' as const, icon: settings.chatAppMessagesIcon, fallback: '💬', label: '消息' },
            { tab: 'discover' as const, icon: settings.chatAppDiscoverIcon, fallback: '✨', label: '發現' },
            { tab: 'me' as const, icon: settings.chatAppMeIcon, fallback: '👤', label: '我' },
          ] as const).map(({ tab, icon, fallback, label }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition ${showNavLabels ? 'gap-1 text-xs' : 'gap-0 text-base'}`}
                style={{ color: active ? theme.titleColor : theme.subtitleColor }}
                aria-label={label}
              >
                <IconPreview icon={icon} fallback={fallback} imageClassName="h-6 w-6" textClassName="text-2xl leading-none" />
                {showNavLabels && <span>{label}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ChatReadView({
  log,
  chatProfiles,
  selectedProfileId,
  selectedProfile,
  onSelectProfile,
  backgroundStyle,
  theme,
  chatReadBgColor,
  chatReadBgImageUrl,
  chatReadBgOverlay,
  onChatReadBgChange,
  chatMsgFontSize,
  chatMsgLineHeight,
  chatNavBgColor,
  onBack,
  onExit,
}: {
  log: StoredChatLog;
  chatProfiles: ChatProfile[];
  selectedProfileId: string;
  selectedProfile: ChatProfile | null;
  onSelectProfile: (id: string) => void;
  backgroundStyle: CSSProperties;
  theme: ChatTheme;
  chatReadBgColor: string;
  chatReadBgImageUrl: string;
  chatReadBgOverlay: number;
  onChatReadBgChange: (patch: Partial<AppSettings>) => void;
  chatMsgFontSize: number;
  chatMsgLineHeight: number;
  chatNavBgColor: string;
  onBack: () => void;
  onExit?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readNavBg = theme.night ? theme.barBg : (chatNavBgColor || theme.barBg);

  const [showFloating, setShowFloating] = useState(false);
  const [showBookmarkDrawer, setShowBookmarkDrawer] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(log.name));
  const [addingBookmark, setAddingBookmark] = useState<{ index: number; preview: string } | null>(null);
  const [bookmarkLabelDraft, setBookmarkLabelDraft] = useState('');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [bgImageDraft, setBgImageDraft] = useState(chatReadBgImageUrl);

  useEffect(() => {
    setBgImageDraft(chatReadBgImageUrl);
  }, [chatReadBgImageUrl]);

  function uploadReadBgImage(file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setBgImageDraft(dataUrl);
      onChatReadBgChange({ chatReadBgImageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  const displayName = displayLogName(log.name);
  const messages = useMemo(() => parseChatContent(log.content, selectedProfile), [log.content, selectedProfile]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight });
  }, [log.name, selectedProfileId]);

  useEffect(() => {
    setBookmarks(loadBookmarks(log.name));
  }, [log.name]);

  function scrollToTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToBottom() {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }

  function scrollToMessage(index: number) {
    const node = scrollRef.current;
    if (!node) return;
    const el = node.querySelector(`[data-msg-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function getTopVisibleMessageIndex(): number {
    const node = scrollRef.current;
    if (!node) return 0;
    const containerTop = node.getBoundingClientRect().top;
    const bubbles = node.querySelectorAll('[data-msg-index]');
    for (const bubble of bubbles) {
      const rect = bubble.getBoundingClientRect();
      if (rect.bottom > containerTop + 60) {
        return Number(bubble.getAttribute('data-msg-index') ?? '0');
      }
    }
    return 0;
  }

  function openAddBookmark(index: number, preview: string) {
    setAddingBookmark({ index, preview });
    setBookmarkLabelDraft('');
  }

  function handleAddBookmarkAtTop() {
    const index = getTopVisibleMessageIndex();
    const msg = messages[index];
    const preview = msg ? msg.content.slice(0, 50) : '';
    openAddBookmark(index, preview);
  }

  function confirmAddBookmark() {
    if (!addingBookmark) return;
    const label =
      bookmarkLabelDraft.trim() || addingBookmark.preview.slice(0, 20) || `書籤 ${bookmarks.length + 1}`;
    const newMark: Bookmark = {
      id: `bm-${Date.now()}`,
      messageIndex: addingBookmark.index,
      label,
      preview: addingBookmark.preview,
      createdAt: new Date().toISOString(),
    };
    const next = [...bookmarks, newMark];
    setBookmarks(next);
    persistBookmarks(log.name, next);
    setAddingBookmark(null);
    emitActionToast({ kind: 'success', message: '書籤已新增' });
  }

  function deleteBookmark(id: string) {
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next);
    persistBookmarks(log.name, next);
  }

  function handleBubblePressStart(index: number, preview: string) {
    longPressTimer.current = setTimeout(() => {
      openAddBookmark(index, preview);
    }, 500);
  }

  function handleBubblePressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden" style={backgroundStyle}>
      {/* Header */}
      <div
        className="shrink-0 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]"
        style={{ backgroundColor: readNavBg, borderBottom: `1px solid ${theme.barBorder}` }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 shrink-0 rounded-full text-xl leading-none transition active:scale-95"
            style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
            aria-label="返回"
          >
            <span style={{ transform: 'translateY(-1px)', display: 'block' }}>‹</span>
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-medium" style={{ color: theme.titleColor }}>
            {displayName}
          </p>
          <button
            type="button"
            onClick={() => setShowBgPicker(true)}
            className="shrink-0 text-lg leading-none"
            style={{ animation: 'chatHeartBounce 1.8s ease-in-out infinite' }}
            aria-label="閱讀設定"
            title="閱讀設定"
          >
            💗
          </button>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="h-9 w-9 shrink-0 rounded-full text-xl leading-none transition active:scale-95"
              style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
              aria-label="離開"
            >
              <span style={{ transform: 'translateY(-1px)', display: 'block' }}>×</span>
            </button>
          ) : (
            <span className="h-9 w-9 shrink-0" />
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} id="chat-messages" className="min-h-0 flex-1 overflow-y-auto px-3 py-3" style={theme.bubbleVarStyle}>
        {messages.length > 0 ? (
          <ChatBubbles
            messages={messages}
            profile={selectedProfile}
            dateLabelColor={theme.dateLabelColor}
            fontSize={chatMsgFontSize}
            lineHeight={chatMsgLineHeight}
            onPressStart={handleBubblePressStart}
            onPressEnd={handleBubblePressEnd}
          />
        ) : (
          <p
            className="rounded-2xl px-3 py-4 text-sm"
            style={{ border: `1px solid ${theme.barBorder}`, backgroundColor: theme.btnBg, color: theme.subtitleColor }}
          >
            無法解析為聊天格式，以下是原文：
            <span
              className="mt-2 block whitespace-pre-wrap rounded-xl p-3 text-left text-xs"
              style={{ border: `1px solid ${theme.barBorder}`, backgroundColor: theme.inputBg, color: theme.inputText }}
            >
              {log.content}
            </span>
          </p>
        )}
      </div>

      {/* Floating scroll buttons */}
      {showFloating && (
        <div className="pointer-events-none absolute bottom-24 right-4 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={scrollToTop}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full shadow-md transition active:scale-95"
            style={{ background: theme.floatBtnBg, border: `1px solid ${theme.floatBtnBorder}`, color: theme.floatBtnColor }}
            aria-label="回到頂部"
          >
            <ChevronUp />
          </button>
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full shadow-md transition active:scale-95"
            style={{ background: theme.floatBtnBg, border: `1px solid ${theme.floatBtnBorder}`, color: theme.floatBtnColor }}
            aria-label="回到底部"
          >
            <ChevronDown />
          </button>
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        style={{ backgroundColor: readNavBg, borderTop: `1px solid ${theme.barBorder}` }}
      >
        <div className="flex items-center gap-2">
          {/* + 加書籤 */}
          <button
            type="button"
            onClick={handleAddBookmarkAtTop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition active:scale-95"
            style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
            aria-label="新增書籤"
            title="新增書籤（當前位置）"
          >
            <span style={{ transform: 'translateY(-1px)', display: 'block' }}>+</span>
          </button>

          {/* 🔖 書籤清單 */}
          <button
            type="button"
            onClick={() => setShowBookmarkDrawer(true)}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition active:scale-95"
            style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}` }}
            aria-label="書籤清單"
          >
            🔖
            {bookmarks.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {bookmarks.length > 9 ? '9+' : bookmarks.length}
              </span>
            )}
          </button>

          {/* 角色切換 */}
          <div className="relative min-w-0 flex-1">
            {chatProfiles.length > 0 ? (
              <>
                <select
                  value={selectedProfileId}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  className="h-10 w-full appearance-none rounded-full pl-4 pr-8 text-sm"
                  style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.inputText }}
                >
                  <option value="">角色預設</option>
                  {chatProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.rightNick} / {p.leftNick}）
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: theme.subtitleColor }}>▾</span>
              </>
            ) : (
              <div className="h-10 rounded-full px-4 text-sm leading-10" style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.subtitleColor }}>
                尚未建立角色設定
              </div>
            )}
          </div>

          {/* ▶ 懸浮鈕開關（LINE 風格藍色圓鈕） */}
          <button
            type="button"
            onClick={() => setShowFloating((prev) => !prev)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 ${
              showFloating ? 'bg-blue-600' : 'bg-blue-500'
            }`}
            aria-label="快速導航開關"
          >
            <SendArrow />
          </button>
        </div>
      </div>

      {/* Bookmark drawer */}
      {showBookmarkDrawer && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBookmarkDrawer(false)} />
          <div className="relative z-10 flex max-h-[70%] flex-col rounded-t-3xl shadow-xl" style={{ background: theme.drawerBg }}>
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4" style={{ borderBottom: `1px solid ${theme.drawerDivider}` }}>
              <h2 className="text-base font-medium" style={{ color: theme.drawerTitleColor }}>書籤</h2>
              <button
                type="button"
                onClick={() => setShowBookmarkDrawer(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                style={{ background: theme.btnBg, color: theme.btnColor }}
              >
                <span style={{ transform: 'translateY(-1px)', display: 'block' }}>×</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {bookmarks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm" style={{ color: theme.drawerSubColor }}>
                  還沒有書籤
                  <br />
                  <span className="text-xs">長按訊息泡泡 或 點 + 可新增</span>
                </p>
              ) : (
                <ul>
                  {bookmarks.map((bm) => (
                    <li key={bm.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: `1px solid ${theme.drawerDivider}` }}>
                      <button
                        type="button"
                        onClick={() => {
                          scrollToMessage(bm.messageIndex);
                          setShowBookmarkDrawer(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm" style={{ color: theme.drawerTitleColor }}>{bm.label}</p>
                        <p className="mt-0.5 truncate text-xs" style={{ color: theme.drawerSubColor }}>{bm.preview}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBookmark(bm.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-xs text-rose-500"
                        aria-label="刪除書籤"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Background picker drawer */}
      {showBgPicker && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBgPicker(false)} />
          <div className="relative z-10 flex max-h-[80%] flex-col rounded-t-3xl shadow-xl" style={{ background: theme.drawerBg }}>
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4" style={{ borderBottom: `1px solid ${theme.drawerDivider}` }}>
              <h2 className="text-base font-medium" style={{ color: theme.drawerTitleColor }}>閱讀背景</h2>
              <button
                type="button"
                onClick={() => setShowBgPicker(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                style={{ background: theme.btnBg, color: theme.btnColor }}
              >
                <span style={{ transform: 'translateY(-1px)', display: 'block' }}>×</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="space-y-4">
                {/* ── 字體 ── */}
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: theme.drawerTitleColor }}>文字</p>
                  <label className="block space-y-1">
                    <span className="flex items-center justify-between text-xs" style={{ color: theme.drawerSubColor }}>
                      <span>字體大小</span>
                      <span>{chatMsgFontSize}px</span>
                    </span>
                    <input
                      type="range"
                      min={11}
                      max={22}
                      step={1}
                      value={chatMsgFontSize}
                      onChange={(e) => onChatReadBgChange({ chatMsgFontSize: Number(e.target.value) })}
                      className="w-full accent-rose-400"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="flex items-center justify-between text-xs" style={{ color: theme.drawerSubColor }}>
                      <span>行距</span>
                      <span>{chatMsgLineHeight.toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min={1.2}
                      max={2.4}
                      step={0.05}
                      value={chatMsgLineHeight}
                      onChange={(e) => onChatReadBgChange({ chatMsgLineHeight: Number(e.target.value) })}
                      className="w-full accent-rose-400"
                    />
                  </label>
                </div>

                <div className="h-px" style={{ background: theme.drawerDivider }} />

                {/* ── 背景 ── */}
                <div className="space-y-3">
                  <p className="text-xs font-medium" style={{ color: theme.drawerTitleColor }}>閱讀背景</p>

                  {/* Preset swatches */}
                  <div className="flex flex-wrap gap-2">
                    {CHAT_BACKGROUND_PRESETS.map((color) => {
                      const active = chatReadBgColor.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => onChatReadBgChange({ chatReadBgColor: color })}
                          className={`h-8 w-8 rounded-full border-2 transition active:scale-95 ${active ? 'border-rose-400 ring-2 ring-rose-200' : 'border-stone-300'}`}
                          style={{ background: color }}
                          aria-label={`背景色 ${color}`}
                          title={color}
                        />
                      );
                    })}
                  </div>

                  {/* Custom color */}
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: theme.drawerSubColor }}>自訂底色</span>
                    <input
                      type="color"
                      value={chatReadBgColor}
                      onChange={(e) => onChatReadBgChange({ chatReadBgColor: e.target.value })}
                      className="h-10 w-full rounded-md border"
                      style={{ borderColor: theme.drawerDivider }}
                    />
                  </label>

                  {/* Image URL */}
                  <label className="block space-y-1">
                    <span className="text-xs" style={{ color: theme.drawerSubColor }}>背景圖片 URL</span>
                    <input
                      type="url"
                      value={bgImageDraft}
                      onChange={(e) => setBgImageDraft(e.target.value)}
                      placeholder="https://.../bg.jpg"
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.inputText }}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onChatReadBgChange({ chatReadBgImageUrl: bgImageDraft.trim() })}
                      className="rounded-xl py-2.5 text-sm transition active:scale-[0.99]"
                      style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
                    >
                      套用 URL
                    </button>
                    <label className="flex cursor-pointer items-center justify-center rounded-xl py-2.5 text-sm transition active:opacity-80"
                      style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
                    >
                      從本機上傳
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          uploadReadBgImage(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {/* Overlay slider */}
                  {chatReadBgImageUrl && (
                    <label className="block space-y-1">
                      <span className="flex items-center justify-between text-xs" style={{ color: theme.drawerSubColor }}>
                        <span>圖片遮罩</span>
                        <span>{chatReadBgOverlay}%</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={90}
                        step={1}
                        value={chatReadBgOverlay}
                        onChange={(e) => onChatReadBgChange({ chatReadBgOverlay: Number(e.target.value) })}
                        className="w-full accent-rose-400"
                      />
                    </label>
                  )}

                  {/* Remove image */}
                  {chatReadBgImageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBgImageDraft('');
                        onChatReadBgChange({ chatReadBgImageUrl: '', chatReadBgOverlay: 0 });
                      }}
                      className="w-full rounded-xl py-2.5 text-sm text-rose-500 transition active:scale-[0.99]"
                      style={{ background: theme.btnBg, border: `1px solid ${theme.drawerDivider}` }}
                    >
                      移除背景圖片
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add bookmark dialog */}
      {addingBookmark && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddingBookmark(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl p-5 shadow-xl" style={{ background: theme.drawerBg }}>
            <h2 className="mb-1 text-base font-medium" style={{ color: theme.drawerTitleColor }}>新增書籤</h2>
            <p className="mb-3 truncate text-xs" style={{ color: theme.drawerSubColor }}>{addingBookmark.preview}</p>
            <input
              type="text"
              value={bookmarkLabelDraft}
              onChange={(e) => setBookmarkLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddBookmark();
                if (e.key === 'Escape') setAddingBookmark(null);
              }}
              placeholder="書籤名稱（可留空）"
              className="mb-3 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.inputText }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmAddBookmark}
                className="flex-1 rounded-xl py-2.5 text-sm text-white transition active:opacity-80"
                style={{ background: theme.night ? '#3a3a3c' : '#1c1c1e' }}
              >
                新增
              </button>
              <button
                type="button"
                onClick={() => setAddingBookmark(null)}
                className="flex-1 rounded-xl py-2.5 text-sm transition active:opacity-80"
                style={{ background: theme.btnBg, border: `1px solid ${theme.btnBorder}`, color: theme.btnColor }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronUp() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2.5,10.5 7.5,4.5 12.5,10.5" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2.5,4.5 7.5,10.5 12.5,4.5" />
    </svg>
  );
}

function SendArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function ChatBubbles({
  messages,
  profile,
  dateLabelColor,
  fontSize,
  lineHeight,
  onPressStart,
  onPressEnd,
}: {
  messages: ChatMessage[];
  profile: ChatProfile | null;
  dateLabelColor?: string;
  fontSize?: number;
  lineHeight?: number;
  onPressStart?: (index: number, preview: string) => void;
  onPressEnd?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((msg, i) => {
        const isUser = msg.role === 'user';
        const avatarUrl = isUser ? profile?.rightAvatarDataUrl : profile?.leftAvatarDataUrl;
        const preview = msg.content.slice(0, 50);

        const dateDivider =
          msg.time && (i === 0 || messages[i - 1]?.time?.slice(0, 10) !== msg.time.slice(0, 10))
            ? msg.time.slice(0, 10)
            : null;

        return (
          <div key={`${i}-${msg.time ?? ''}`} data-msg-index={i}>
            {dateDivider && <div className="my-3 text-center text-[11px]" style={dateLabelColor ? { color: dateLabelColor } : undefined}>{dateDivider}</div>}

            <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mb-4 shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-full text-xs font-medium text-white ${
                      isUser ? 'bg-emerald-400' : 'bg-sky-300'
                    }`}
                  >
                    {isUser ? (profile?.rightNick?.[0] ?? '你') : (profile?.leftNick?.[0] ?? 'M')}
                  </div>
                )}
              </div>

              <div className={`flex max-w-[75%] flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`message-bubble ${isUser ? 'user' : 'ai'}`}
                  onMouseDown={() => onPressStart?.(i, preview)}
                  onMouseUp={() => onPressEnd?.()}
                  onMouseLeave={() => onPressEnd?.()}
                  onTouchStart={() => onPressStart?.(i, preview)}
                  onTouchEnd={() => onPressEnd?.()}
                  onTouchCancel={() => onPressEnd?.()}
                >
                  <div className="content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: fontSize ? `${fontSize}px` : undefined, lineHeight: lineHeight ?? undefined }}>
                    {msg.content}
                  </div>
                </div>
                {msg.time && <p className="px-1 text-[10px]" style={dateLabelColor ? { color: dateLabelColor } : undefined}>{msg.time.slice(11, 16)}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
