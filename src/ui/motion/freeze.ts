'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-freeze-time', 'data-reduced-motion'],
  });
  return () => observer.disconnect();
}

function flag(name: 'data-freeze-time' | 'data-reduced-motion'): boolean {
  return document.querySelector(`[${name}="true"]`) !== null;
}

/** True while the kit toolbar's freeze-time switch is on. */
export function useTimeFrozen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => flag('data-freeze-time'),
    () => false,
  );
}

/** True while the kit toolbar's reduced-motion switch is on. */
export function useKitReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => flag('data-reduced-motion'),
    () => false,
  );
}
