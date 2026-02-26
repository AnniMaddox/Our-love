import { useState } from 'react';

type TabItem = {
  id: string;
  label: string;
  icon: string;
  iconUrl?: string;
};

type BottomTabsProps = {
  tabs: TabItem[];
  activeIndex: number;
  iconDisplayMode: 'framed' | 'full';
  onSelect: (index: number) => void;
};

export function BottomTabs({ tabs, activeIndex, iconDisplayMode, onSelect }: BottomTabsProps) {
  const [failedIconIds, setFailedIconIds] = useState<Record<string, boolean>>({});

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto w-full max-w-xl rounded-[2.25rem] border border-white/45 bg-white/25 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.14)] backdrop-blur">
        <ul className="grid w-full gap-3" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((tab, index) => {
            const active = index === activeIndex;

            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-label={tab.label}
                  title={tab.label}
                  className={`flex w-full items-center justify-center rounded-3xl px-3 py-3 transition ${
                    active ? 'tab-active' : 'tab-idle bg-transparent text-stone-700/80'
                  }`}
                >
                  {tab.iconUrl && !failedIconIds[tab.id] ? (
                    <img
                      src={tab.iconUrl}
                      alt=""
                      className={`${
                        iconDisplayMode === 'full' ? 'h-11 w-11 rounded-xl object-cover' : 'h-9 w-9 rounded-lg object-cover'
                      }`}
                      loading="lazy"
                      onError={() =>
                        setFailedIconIds((current) => ({
                          ...current,
                          [tab.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <span className="text-3xl leading-none" aria-hidden="true">
                      {tab.icon}
                    </span>
                  )}
                  <span className="sr-only">{tab.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
