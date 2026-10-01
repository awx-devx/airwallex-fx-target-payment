'use client';

import { useEffect, useRef, useState } from 'react';

type Line = {
  top: number;
  left: number;
  width: number;
  height: number;
  on: boolean;
};

const HIDE_MS = 700;

/**
 * Overlay scroll indicator. Native bars are hidden in globals.css; this draws
 * a 1px orange rule on the scrolling pane and fades it once scrolling stops.
 */
export function ScrollLine() {
  const [line, setLine] = useState<Line | null>(null);
  const hideTimer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<HTMLElement | null>(null);
  const last = useRef(new WeakMap<HTMLElement, { top: number; left: number }>());

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function place(el: HTMLElement) {
      if (el.closest('[data-radix-scroll-area-viewport]')) return;

      const prev = last.current.get(el);
      const top = el.scrollTop;
      const left = el.scrollLeft;
      last.current.set(el, { top, left });

      const overflowY = el.scrollHeight - el.clientHeight > 1;
      const overflowX = el.scrollWidth - el.clientWidth > 1;
      if (!overflowY && !overflowX) {
        setLine(null);
        return;
      }

      const dy = prev ? Math.abs(top - prev.top) : overflowY ? 1 : 0;
      const dx = prev ? Math.abs(left - prev.left) : overflowX ? 1 : 0;
      const vertical = overflowY && dy >= dx;
      const rect = el.getBoundingClientRect();

      let next: Line;
      if (vertical) {
        const track = el.clientHeight;
        const thumb = Math.max(16, (el.clientHeight / el.scrollHeight) * track);
        const max = el.scrollHeight - el.clientHeight;
        const travel = Math.max(0, track - thumb);
        next = {
          top: rect.top + (max === 0 ? 0 : (top / max) * travel),
          left: rect.right - 1,
          width: 1,
          height: thumb,
          on: true,
        };
      } else {
        const track = el.clientWidth;
        const thumb = Math.max(16, (el.clientWidth / el.scrollWidth) * track);
        const max = el.scrollWidth - el.clientWidth;
        const travel = Math.max(0, track - thumb);
        next = {
          top: rect.bottom - 1,
          left: rect.left + (max === 0 ? 0 : (left / max) * travel),
          width: thumb,
          height: 1,
          on: true,
        };
      }

      setLine(next);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setLine((current) => (current ? { ...current, on: false } : current));
      }, reduced ? 0 : HIDE_MS);
    }

    function onScroll(event: Event) {
      const target = event.target;
      const el =
        target instanceof Document ? (document.scrollingElement as HTMLElement | null) : target;
      if (!(el instanceof HTMLElement)) return;
      pending.current = el;
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        const node = pending.current;
        pending.current = null;
        if (node) place(node);
      });
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!line) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-70 bg-orange-500"
      style={{
        top: line.top,
        left: line.left,
        width: line.width,
        height: line.height,
        opacity: line.on ? 1 : 0,
        transition: line.on ? 'none' : 'opacity 300ms linear',
      }}
    />
  );
}
