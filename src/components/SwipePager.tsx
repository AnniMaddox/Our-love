import { useEffect, useRef, useState } from 'react';

type SwipePagerProps = {
  activeIndex: number;
  onIndexChange: (index: number) => void;
  swipeEnabled: boolean;
  pages: Array<{
    id: string;
    node: React.ReactNode;
  }>;
};

export function SwipePager({ activeIndex, onIndexChange, swipeEnabled, pages }: SwipePagerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const fromScrollRef = useRef(false);
  const releaseProgrammaticRef = useRef<number | null>(null);
  const [visitedPageIndexes, setVisitedPageIndexes] = useState<Set<number>>(() => new Set([activeIndex]));

  useEffect(() => {
    setVisitedPageIndexes((prev) => {
      if (prev.has(activeIndex)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(activeIndex);
      return next;
    });
  }, [activeIndex]);

  useEffect(() => {
    if (fromScrollRef.current) {
      fromScrollRef.current = false;
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const pageWidth = node.clientWidth;
    if (!pageWidth) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    const targetLeft = activeIndex * pageWidth;
    if (Math.abs(node.scrollLeft - targetLeft) <= 1) {
      return;
    }

    isProgrammaticScrollRef.current = true;

    if (releaseProgrammaticRef.current !== null) {
      window.cancelAnimationFrame(releaseProgrammaticRef.current);
      releaseProgrammaticRef.current = null;
    }

    node.scrollTo({
      left: targetLeft,
    });

    releaseProgrammaticRef.current = window.requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
      releaseProgrammaticRef.current = null;
    });
  }, [activeIndex]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) {
        return;
      }

      const pageWidth = node.clientWidth;
      if (!pageWidth) {
        return;
      }

      const next = Math.round(node.scrollLeft / pageWidth);
      if (next !== activeIndex && next >= 0 && next < pages.length) {
        fromScrollRef.current = true;
        onIndexChange(next);
      }
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);

      if (releaseProgrammaticRef.current !== null) {
        window.cancelAnimationFrame(releaseProgrammaticRef.current);
        releaseProgrammaticRef.current = null;
      }
    };
  }, [activeIndex, onIndexChange, pages.length]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      style={{
        scrollBehavior: 'auto',
        touchAction: swipeEnabled ? 'pan-x pan-y' : 'pan-y',
        overflowX: swipeEnabled ? 'auto' : 'hidden',
      }}
    >
      <div className="flex h-full w-full">
        {pages.map((page, pageIndex) => (
          <section
            key={page.id}
            className={`h-full w-full shrink-0 snap-center ${
              page.id === 'home' ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 pb-28 pt-4'
            }`}
          >
            {visitedPageIndexes.has(pageIndex) ? (
              page.node
            ) : (
              <div className="h-full w-full" aria-hidden="true" />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
