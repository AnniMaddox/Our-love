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
type MePanelKey = 'nav' | 'data' | 'defaultProfile' | 'bubble' | 'background' | 'profiles';
type ChatNavIconSettingKey = 'chatAppMessagesIcon' | 'chatAppDiscoverIcon' | 'chatAppMeIcon';

type ProfileDraft = Omit<ChatProfile, 'id'>;

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

const CHAT_BACKGROUND_PRESETS = ['#efeff4', '#f6f1e7', '#eaf1f6', '#f4e9ef', '#eef3e6'] as const;

function buildChatBackgroundStyle(settings: Pick<AppSettings, 'chatBackgroundColor' | 'chatBackgroundImageUrl' | 'chatBackgroundOverlay'>): CSSProperties {
  const imageUrl = settings.chatBackgroundImageUrl.trim();
  if (!imageUrl) {
    return { backgroundColor: settings.chatBackgroundColor };
  }

  const overlayAlpha = Math.max(0, Math.min(0.9, settings.chatBackgroundOverlay / 100));
  return {
    backgroundColor: settings.chatBackgroundColor,
    backgroundImage: `linear-gradient(rgba(255,255,255,${overlayAlpha}), rgba(255,255,255,${overlayAlpha})), url("${imageUrl}")`,
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
  const [chatBackgroundImageDraft, setChatBackgroundImageDraft] = useState(settings.chatBackgroundImageUrl);

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
    setChatBackgroundImageDraft(settings.chatBackgroundImageUrl);
  }, [settings.chatBackgroundImageUrl]);

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
  const chatBackgroundStyle = useMemo(
    () => buildChatBackgroundStyle(settings),
    [settings.chatBackgroundColor, settings.chatBackgroundImageUrl, settings.chatBackgroundOverlay],
  );

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

  function uploadChatBackgroundImage(file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setChatBackgroundImageDraft(dataUrl);
      onSettingChange({ chatBackgroundImageUrl: dataUrl });
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
        backgroundStyle={chatBackgroundStyle}
        onBack={() => setSelectedLogName('')}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden" style={chatBackgroundStyle}>
      <header className="shrink-0 border-b border-stone-200/70 bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="h-9 w-9 rounded-full border border-stone-300 bg-white text-xl leading-none text-stone-700 transition active:scale-95"
              aria-label="返回"
              title="返回"
            >
              ‹
            </button>
          ) : (
            <span className="h-9 w-9" />
          )}
          <h1 className="font-normal tracking-wide text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
            {activeTab === 'messages' ? '消息' : activeTab === 'discover' ? '發現' : '我'}
          </h1>
          <button
            type="button"
            onClick={openRandomLog}
            disabled={!logs.length}
            className="h-9 w-9 rounded-full border border-stone-300 bg-white text-xl leading-none text-stone-700 transition active:scale-95 disabled:opacity-40"
            aria-label="隨機打開"
            title="隨機打開"
          >
            ＋
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'messages' && (
          <div className="space-y-3 px-3 py-3">
            <button
              type="button"
              onClick={openRandomLog}
              disabled={!logs.length}
              className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-40"
            >
              {contactAvatar ? (
                <img
                  src={contactAvatar}
                  alt=""
                  className="h-16 w-16 rounded-2xl border border-stone-200 object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-stone-200 bg-stone-100 text-2xl text-stone-500">
                  💬
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-stone-900"
                  style={{ fontSize: 'var(--chat-contact-title-size, 30px)', lineHeight: 1.1 }}
                >
                  {contactName}
                </p>
                <p
                  className="mt-1 text-stone-500"
                  style={{ fontSize: 'var(--chat-contact-subtitle-size, 18px)', lineHeight: 1.2 }}
                >
                  {contactSubtitle}
                </p>
              </div>
              <span className="text-2xl text-stone-400">›</span>
            </button>

            {!logs.length && (
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500 shadow-sm">
                請先到「我」分頁匯入對話紀錄
              </div>
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
              subtitle="色票、圖片、透明度"
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
                    value={chatBackgroundImageDraft}
                    onChange={(event) => setChatBackgroundImageDraft(event.target.value)}
                    placeholder="https://.../chat-bg.jpg"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettingChange({ chatBackgroundImageUrl: chatBackgroundImageDraft.trim() })}
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
                        uploadChatBackgroundImage(event.target.files?.[0]);
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
                    setChatBackgroundImageDraft('');
                    onSettingChange({ chatBackgroundImageUrl: '', chatBackgroundOverlay: 0 });
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm text-stone-700 transition active:scale-[0.99]"
                >
                  移除背景圖片
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

      <nav className="shrink-0 border-t border-stone-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition ${
              activeTab === 'messages' ? 'text-black' : 'text-stone-400'
            } ${showNavLabels ? 'gap-1 text-xs' : 'gap-0 text-base'}`}
            aria-label="消息"
          >
            <IconPreview
              icon={settings.chatAppMessagesIcon}
              fallback="💬"
              imageClassName="h-6 w-6"
              textClassName="text-2xl leading-none"
            />
            {showNavLabels && <span>消息</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition ${
              activeTab === 'discover' ? 'text-black' : 'text-stone-400'
            } ${showNavLabels ? 'gap-1 text-xs' : 'gap-0 text-base'}`}
            aria-label="發現"
          >
            <IconPreview
              icon={settings.chatAppDiscoverIcon}
              fallback="✨"
              imageClassName="h-6 w-6"
              textClassName="text-2xl leading-none"
            />
            {showNavLabels && <span>發現</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('me')}
            className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition ${
              activeTab === 'me' ? 'text-black' : 'text-stone-400'
            } ${showNavLabels ? 'gap-1 text-xs' : 'gap-0 text-base'}`}
            aria-label="我"
          >
            <IconPreview
              icon={settings.chatAppMeIcon}
              fallback="👤"
              imageClassName="h-6 w-6"
              textClassName="text-2xl leading-none"
            />
            {showNavLabels && <span>我</span>}
          </button>
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
  onBack,
  onExit,
}: {
  log: StoredChatLog;
  chatProfiles: ChatProfile[];
  selectedProfileId: string;
  selectedProfile: ChatProfile | null;
  onSelectProfile: (id: string) => void;
  backgroundStyle: CSSProperties;
  onBack: () => void;
  onExit?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayName = displayLogName(log.name);
  const messages = useMemo(() => parseChatContent(log.content, selectedProfile), [log.content, selectedProfile]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight });
  }, [log.name, selectedProfileId]);

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden" style={backgroundStyle}>
      <div className="shrink-0 border-b border-stone-200 bg-white px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 rounded-full border border-stone-300 bg-white text-xl leading-none text-stone-700 transition active:scale-95"
            aria-label="返回"
            title="返回"
          >
            ‹
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-stone-700">{displayName}</p>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="h-9 w-9 rounded-full border border-stone-300 bg-white text-xl leading-none text-stone-700 transition active:scale-95"
              aria-label="離開"
              title="離開"
            >
              ×
            </button>
          ) : (
            <span className="h-9 w-9" />
          )}
        </div>
      </div>

      <div ref={scrollRef} id="chat-messages" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length > 0 ? (
          <ChatBubbles messages={messages} profile={selectedProfile} />
        ) : (
          <p className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-sm text-stone-500">
            無法解析為聊天格式，以下是原文：
            <span className="mt-2 block whitespace-pre-wrap rounded-xl border border-stone-200 bg-white p-3 text-left text-xs text-stone-700">
              {log.content}
            </span>
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-200 bg-white px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center text-[1.55rem] text-stone-700" aria-hidden="true">
            ✉
          </span>
          <div className="relative min-w-0 flex-1">
            {chatProfiles.length > 0 ? (
              <>
                <select
                  value={selectedProfileId}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  className="h-11 w-full appearance-none rounded-full border border-stone-300 bg-stone-50 pl-4 pr-8 text-base text-stone-700"
                >
                  <option value="">角色預設（點我切換）</option>
                  {chatProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.rightNick} / {p.leftNick}）
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">▾</span>
              </>
            ) : (
              <div className="h-11 rounded-full border border-stone-300 bg-stone-50 px-4 text-base leading-[2.75rem] text-stone-400">
                尚未建立角色設定
              </div>
            )}
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center text-[1.8rem] leading-none text-stone-700" aria-hidden="true">
            +
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatBubbles({ messages, profile }: { messages: ChatMessage[]; profile: ChatProfile | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((msg, i) => {
        const isUser = msg.role === 'user';
        const avatarUrl = isUser ? profile?.rightAvatarDataUrl : profile?.leftAvatarDataUrl;

        const dateDivider =
          msg.time && (i === 0 || messages[i - 1]?.time?.slice(0, 10) !== msg.time.slice(0, 10))
            ? msg.time.slice(0, 10)
            : null;

        return (
          <div key={`${i}-${msg.time ?? ''}`}>
            {dateDivider && <div className="my-3 text-center text-[11px] text-stone-400">{dateDivider}</div>}

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
                <div className={`message-bubble ${isUser ? 'user' : 'ai'}`}>
                  <div className="content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </div>
                </div>
                {msg.time && <p className="px-1 text-[10px] text-stone-400">{msg.time.slice(11, 16)}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
