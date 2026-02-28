import { type ReactNode, useRef, useState } from 'react';

/* ── IOSSettingsGroup ── */
export function IOSSettingsGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      {label && (
        <p className="mb-1.5 px-5 text-[13px] uppercase tracking-wide text-[#8e8e93]">
          {label}
        </p>
      )}
      <div className="overflow-hidden rounded-[14px] bg-[#1c1c1e]">{children}</div>
    </div>
  );
}

/* ── IOSSettingsRow ── */
export function IOSSettingsRow({
  icon,
  iconBg,
  iconUrl,
  label,
  detail,
  onTap,
  last = false,
}: {
  icon: string;
  iconBg: string;
  iconUrl?: string;
  label: string;
  detail?: string;
  onTap: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex w-full items-center gap-3 px-4 py-[11px] text-left active:bg-white/5"
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden text-[15px] ${iconUrl ? 'h-[60px] w-[60px]' : 'h-[30px] w-[30px]'}`}
        style={{ background: iconUrl ? 'transparent' : iconBg, borderRadius: iconUrl ? '50%' : '7px' }}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-[16px] text-white">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          {detail && (
            <span className="text-[15px] text-[#8e8e93]">{detail}</span>
          )}
          <span className="text-[18px] leading-none text-[#48484a]">›</span>
        </span>
      </span>
      {!last && (
        <span
          className="absolute bottom-0 right-0 h-px bg-[#38383a]"
          style={{ left: '58px' }}
        />
      )}
    </button>
  );
}

/* ── IOSProfileCard ── */
export function IOSProfileCard({
  photoUrl,
  name,
  subtitle,
  onPhotoChange,
  onNameChange,
  children,
}: {
  photoUrl: string;
  name: string;
  subtitle?: string;
  onPhotoChange: (dataUrl: string) => void;
  onNameChange: (name: string) => void;
  children?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        onPhotoChange(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function commitName() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onNameChange(trimmed);
    else setDraft(name);
  }

  return (
    <div className="mb-6 overflow-hidden rounded-[14px] bg-[#1c1c1e] px-4 py-5">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-full bg-[#38383a]"
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl text-[#8e8e93]">
              👤
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />

        {/* Name + subtitle */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              className="w-full rounded bg-[#2c2c2e] px-2 py-1 text-[20px] font-semibold text-white outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
              className="block truncate text-[20px] font-semibold text-white"
            >
              {name}
            </button>
          )}
          {subtitle && (
            <p className="mt-0.5 truncate text-[13px] text-[#8e8e93]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Chevron */}
        <span className="text-[20px] leading-none text-[#48484a]">›</span>
      </div>
      {children && (
        <div className="-mx-4 mt-3 border-t border-[#38383a] pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── IOSSubPageHeader ── */
export function IOSSubPageHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-black/80 px-4 py-3 backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2c2c2e] text-white active:opacity-60"
      >
        <span className="text-[20px] leading-none" style={{ transform: 'translateY(-1px)' }}>‹</span>
      </button>
      <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-white">
        {title}
      </h1>
    </div>
  );
}
