import { useMemo, useState } from 'react';

import cardsData from '../data/tarot/cards.json';
import { seededShuffle, todayDateKey } from '../lib/tarotSeed';

// ─── Types ───────────────────────────────────────────────────────────────────

type TarotCard = (typeof cardsData)[number];
type CardPhase = 'image' | 'text' | 'bonusImage' | 'bonus';

const TAROT_IMAGE_MODULES = import.meta.glob('../../public/tarot/*.{png,PNG,jpg,jpeg,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const TAROT_IMAGE_LOOKUP = new Map<string, string>();
for (const [path, url] of Object.entries(TAROT_IMAGE_MODULES)) {
  const fileName = path.split('/').pop();
  if (!fileName) {
    continue;
  }

  const normalizedName = fileName.toLowerCase();
  TAROT_IMAGE_LOOKUP.set(normalizedName, url);

  const stem = normalizedName.replace(/\.[^.]+$/, '');
  if (!TAROT_IMAGE_LOOKUP.has(stem)) {
    TAROT_IMAGE_LOOKUP.set(stem, url);
  }
}

function resolveTarotImage(basePath: string, imageName: string | undefined) {
  if (!imageName) {
    return '';
  }

  const normalized = imageName.trim();
  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  return (
    TAROT_IMAGE_LOOKUP.get(lower) ??
    TAROT_IMAGE_LOOKUP.get(lower.replace(/\.[^.]+$/, '')) ??
    `${basePath}${normalized}`
  );
}

const SPREAD_POSITIONS = ['過去', '現在', '未來'] as const;
type SpreadPosition = (typeof SPREAD_POSITIONS)[number];

interface ModalState {
  card: TarotCard;
  position: SpreadPosition | '閱覽室';
  phase: CardPhase;
}

// ─── TarotPage ───────────────────────────────────────────────────────────────

export type TarotPageProps = {
  tarotGalleryImageUrl?: string;
  tarotNameColor?: string;
  tarotNameScale?: number;
};

export function TarotPage({ tarotGalleryImageUrl, tarotNameColor, tarotNameScale }: TarotPageProps) {
  const basePath = `${import.meta.env.BASE_URL}tarot/`;
  const today = todayDateKey();
  const safeNameColor = tarotNameColor?.trim() || '#374151';
  const safeNameScale =
    typeof tarotNameScale === 'number' && Number.isFinite(tarotNameScale)
      ? Math.min(2, Math.max(0.8, tarotNameScale))
      : 1;

  const dailySpread = useMemo(
    () => seededShuffle(cardsData as TarotCard[], today).slice(0, 3),
    [today],
  );

  const [modal, setModal] = useState<ModalState | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  function openCard(card: TarotCard, position: SpreadPosition | '閱覽室') {
    setModal({ card, position, phase: 'image' });
  }

  function advancePhase() {
    if (!modal) return;
    const { card, phase } = modal;
    if (phase === 'image') {
      setModal({ ...modal, phase: 'text' });
    } else if (phase === 'text' && card.bonusImage) {
      setModal({ ...modal, phase: 'bonusImage' });
    } else if (phase === 'text' && card.bonus) {
      setModal({ ...modal, phase: 'bonus' });
    } else if (phase === 'bonusImage') {
      setModal({ ...modal, phase: 'bonus' });
    } else {
      setModal({ ...modal, phase: 'image' });
    }
  }

  function flipBack() {
    if (!modal) return;
    setModal({ ...modal, phase: 'image' });
  }

  if (showGallery) {
    return (
      <TarotGallery
        basePath={basePath}
        onOpenCard={(card) => openCard(card, '閱覽室')}
        onBack={() => setShowGallery(false)}
        modal={modal}
        onAdvance={advancePhase}
        onFlipBack={flipBack}
        onCloseModal={() => setModal(null)}
        tarotNameColor={safeNameColor}
        tarotNameScale={safeNameScale}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="calendar-header-panel rounded-2xl border p-4 shadow-sm">
        <p className="uppercase tracking-[0.18em] text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
          Tarot
        </p>
        <h1 className="mt-1 text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
          今日牌陣
        </h1>
        <p className="mt-0.5 text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
          {today.replace(/-/g, ' · ')}
        </p>
      </header>

      {/* ── Daily 3-card spread ─────────────────────────────────────────── */}
      <div className="flex gap-3 px-1">
        {dailySpread.map((card, i) => (
          <button
            key={card.id}
            type="button"
            onClick={() => openCard(card, SPREAD_POSITIONS[i])}
            className="group flex flex-1 flex-col items-center gap-2"
          >
            {/* Thumbnail */}
            <div className="relative w-full overflow-hidden rounded-xl border border-stone-300/70 shadow-md transition-all duration-150 group-active:scale-95 group-active:shadow-sm">
              <img
                src={resolveTarotImage(basePath, card.image)}
                alt={`${card.name} tarot card`}
                className="h-auto w-full object-cover"
                loading="lazy"
              />
              {card.bonus && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] text-white shadow"
                  aria-label="此牌有另一面"
                >
                  ✦
                </span>
              )}
            </div>

            {/* Label */}
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-stone-400">
                {SPREAD_POSITIONS[i]}
              </p>
              <p
                className="font-medium leading-tight"
                style={{
                  color: safeNameColor,
                  fontSize: `${0.75 * safeNameScale}rem`,
                }}
              >
                {card.number}・{card.name}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Hint ────────────────────────────────────────────────────────── */}
      <p className="px-2 text-center text-[11px] text-stone-400">
        點擊牌卡翻牌 · 每日牌陣由日期決定 · 有 ✦ 的牌可再翻一面
      </p>

      {/* ── Gallery entry ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowGallery(true)}
        className="group relative w-full overflow-hidden rounded-2xl border border-stone-300/70 shadow-md transition-all duration-150 active:scale-95"
        style={{ minHeight: '120px' }}
      >
        {tarotGalleryImageUrl ? (
          <img
            src={tarotGalleryImageUrl}
            alt="進入卡牌閱覽室"
            className="h-full w-full object-cover"
            style={{ maxHeight: '200px' }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 bg-stone-100/90 py-8">
            <span className="text-3xl">🃏</span>
            <p className="text-sm text-stone-500">卡牌閱覽室</p>
            <p className="text-xs text-stone-400">點此瀏覽全部 22 張牌</p>
          </div>
        )}
        {tarotGalleryImageUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 opacity-0 transition-opacity group-active:opacity-100">
            <span className="text-2xl">🃏</span>
            <p className="text-sm font-medium text-white">進入閱覽室</p>
          </div>
        )}
      </button>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {modal && (
        <CardModal
          modal={modal}
          basePath={basePath}
          onAdvance={advancePhase}
          onFlipBack={flipBack}
          onClose={() => setModal(null)}
          tarotNameColor={safeNameColor}
          tarotNameScale={safeNameScale}
        />
      )}
    </div>
  );
}

// ─── TarotGallery ────────────────────────────────────────────────────────────

function TarotGallery({
  basePath,
  onOpenCard,
  onBack,
  modal,
  onAdvance,
  onFlipBack,
  onCloseModal,
  tarotNameColor,
  tarotNameScale,
}: {
  basePath: string;
  onOpenCard: (card: TarotCard) => void;
  onBack: () => void;
  modal: ModalState | null;
  onAdvance: () => void;
  onFlipBack: () => void;
  onCloseModal: () => void;
  tarotNameColor: string;
  tarotNameScale: number;
}) {
  const allCards = cardsData as TarotCard[];

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-6">
      {/* Header */}
      <header className="calendar-header-panel rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="grid h-8 w-8 place-items-center text-[26px] leading-none text-stone-500 transition active:scale-95"
            aria-label="返回"
            title="返回"
          >
            ‹
          </button>
          <div>
            <p className="uppercase tracking-[0.18em] text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
              Tarot Gallery
            </p>
            <h1 className="text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
              卡牌閱覽室
            </h1>
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-400">共 {allCards.length} 張 · 點任一張牌進入完整流程</p>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-3 px-1">
        {allCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpenCard(card)}
            className="group flex flex-col items-center gap-1.5"
          >
            <div className="relative w-full overflow-hidden rounded-xl border border-stone-300/70 shadow-sm transition-all duration-150 group-active:scale-95 group-active:shadow-sm">
              <img
                src={resolveTarotImage(basePath, card.image)}
                alt={card.name}
                className="h-auto w-full object-cover"
                loading="lazy"
              />
              {card.bonus && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] text-white shadow">
                  ✦
                </span>
              )}
            </div>
            <div className="text-center">
              <p
                className="font-medium"
                style={{
                  color: tarotNameColor,
                  fontSize: `${0.56 * tarotNameScale}rem`,
                }}
              >
                {card.number}
              </p>
              <p
                style={{
                  color: tarotNameColor,
                  fontSize: `${0.62 * tarotNameScale}rem`,
                }}
              >
                {card.name}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <CardModal
          modal={modal}
          basePath={basePath}
          onAdvance={onAdvance}
          onFlipBack={onFlipBack}
          onClose={onCloseModal}
          tarotNameColor={tarotNameColor}
          tarotNameScale={tarotNameScale}
        />
      )}
    </div>
  );
}

// ─── CardModal ───────────────────────────────────────────────────────────────

function CardModal({
  modal,
  basePath,
  onAdvance,
  onFlipBack,
  onClose,
  tarotNameColor,
  tarotNameScale,
}: {
  modal: ModalState;
  basePath: string;
  onAdvance: () => void;
  onFlipBack: () => void;
  onClose: () => void;
  tarotNameColor: string;
  tarotNameScale: number;
}) {
  const { card, position, phase } = modal;

  const isFlipped = phase === 'text' || phase === 'bonus';
  const isBonus = phase === 'bonus';
  const isBonusImage = phase === 'bonusImage';

  // Front face: show bonusImage when revealing the other side
  const frontImage = isBonusImage && card.bonusImage ? card.bonusImage : card.image;
  // Back face mini-thumbnail and scrollable text
  const backImage = isBonus && card.bonusImage ? card.bonusImage : card.image;
  const backText = isBonus ? (card.bonus ?? '') : card.text;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── Close button (above card) ──────────────────────────────────── */}
      <div className="flex w-full max-w-sm flex-col gap-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/30 bg-white/20 px-3 py-1 text-sm text-white backdrop-blur"
          >
            ✕ 關閉
          </button>
        </div>

        {/* ── Flipping card ─────────────────────────────────────────────── */}
        <div
          className="tarot-card-container"
          style={{ perspective: '900px', height: '76dvh', maxHeight: '600px' }}
        >
          <div
            className="tarot-card-inner"
            style={{
              position: 'relative',
              height: '100%',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* ── FRONT FACE — card image only ─────────────────────────── */}
            <div
              className="tarot-face cursor-pointer overflow-hidden rounded-2xl shadow-2xl"
              style={{
                position: 'absolute',
                inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
              onClick={onAdvance}
            >
              <img
                src={resolveTarotImage(basePath, frontImage)}
                alt={card.name}
                className="h-full w-full object-contain"
              />
              {/* ✦ badge on normal front face */}
              {card.bonus && !isBonusImage && (
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/90 text-xs text-white shadow">
                  ✦
                </span>
              )}
              {/* Hint when showing the bonus image face */}
              {isBonusImage && (
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
                  點擊看牌義
                </span>
              )}
            </div>

            {/* ── BACK FACE — text content ─────────────────────────────── */}
            <div
              className={`tarot-face flex flex-col overflow-hidden rounded-2xl shadow-2xl ${
                isBonus ? 'bg-amber-50' : 'bg-[#fffaf2]'
              }`}
              style={{
                position: 'absolute',
                inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                transition: 'background-color 0.3s ease',
              }}
            >
              {/* Mini header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-stone-200/70 p-4">
                <img
                  src={resolveTarotImage(basePath, backImage)}
                  alt={card.name}
                  className="h-16 w-auto rounded-lg object-contain shadow"
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-stone-400">{position}</p>
                  <h2
                    className="truncate font-medium"
                    style={{
                      color: tarotNameColor,
                      fontSize: `${1 * tarotNameScale}rem`,
                    }}
                  >
                    {card.number}・{card.name}
                  </h2>
                  <p className="text-xs text-stone-500">{card.nameEn}</p>
                  {isBonus && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] text-white">
                      ✦ 另一面
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable text */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p
                  key={phase}
                  className="tarot-text-fade whitespace-pre-wrap text-sm leading-relaxed text-stone-800"
                >
                  {backText}
                </p>
              </div>

              {/* Action footer */}
              <div className="flex shrink-0 gap-2 border-t border-stone-200/70 p-3">
                {card.bonus && phase === 'text' && (
                  <button
                    type="button"
                    onClick={onAdvance}
                    className="flex-1 rounded-xl border border-amber-300 bg-amber-100 py-2 text-sm text-amber-800"
                  >
                    ✦ 另一面
                  </button>
                )}
                <button
                  type="button"
                  onClick={onFlipBack}
                  className="flex-1 rounded-xl border border-stone-300 bg-white/80 py-2 text-sm text-stone-600"
                >
                  翻回牌面
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
