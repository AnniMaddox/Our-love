import type { ReactNode } from 'react';

type SettingsAccordionProps = {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  bodyClassName?: string;
  chevronClassName?: string;
};

function joinClass(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ');
}

export function SettingsAccordion({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
  className,
  headerClassName,
  titleClassName,
  subtitleClassName,
  bodyClassName,
  chevronClassName,
}: SettingsAccordionProps) {
  return (
    <section className={className}>
      <button
        type="button"
        onClick={onToggle}
        className={joinClass(
          'flex w-full items-center justify-between gap-2 text-left',
          headerClassName,
        )}
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <p className={joinClass('text-sm text-stone-800', titleClassName)}>{title}</p>
          {subtitle ? (
            <p className={joinClass('mt-0.5 text-xs text-stone-500', subtitleClassName)}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <span className={joinClass('text-base text-stone-500 transition-transform', isOpen ? 'rotate-180' : '', chevronClassName)}>
          ▾
        </span>
      </button>
      {isOpen ? <div className={bodyClassName ?? 'mt-3'}>{children}</div> : null}
    </section>
  );
}

