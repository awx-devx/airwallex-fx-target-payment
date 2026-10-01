'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { MotionProvider } from '@/ui/motion/provider';
import { KIT_GROUPS, kitAnchor, showcases } from '@/ui/showcase';

const STORAGE_KEY = 'ui-kit-toolbar';
const WIDTHS = [1280, 1440, 1920] as const;
const SPEEDS = ['1', '10', '60'] as const;

type Density = 'compact' | 'comfortable';
type KitBg = '0' | '1';
type Width = (typeof WIDTHS)[number];
type MarketSpeed = (typeof SPEEDS)[number];

interface ToolbarState {
  density: Density;
  reducedMotion: boolean;
  freezeTime: boolean;
  background: KitBg;
  width: Width;
  marketSpeed: MarketSpeed;
}

const DEFAULT_TOOLBAR: ToolbarState = {
  density: 'compact',
  reducedMotion: false,
  freezeTime: false,
  background: '0',
  width: 1440,
  marketSpeed: '1',
};

function readToolbar(): ToolbarState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOOLBAR;
    const parsed = JSON.parse(raw) as Partial<ToolbarState>;
    return {
      density: parsed.density === 'comfortable' ? 'comfortable' : 'compact',
      reducedMotion: parsed.reducedMotion === true,
      freezeTime: parsed.freezeTime === true,
      background: parsed.background === '1' ? '1' : '0',
      width: WIDTHS.includes(parsed.width as Width)
        ? (parsed.width as Width)
        : 1440,
      marketSpeed: SPEEDS.includes(parsed.marketSpeed as MarketSpeed)
        ? (parsed.marketSpeed as MarketSpeed)
        : '1',
    };
  } catch {
    return DEFAULT_TOOLBAR;
  }
}

const listeners = new Set<() => void>();
let toolbarSnapshot: ToolbarState = DEFAULT_TOOLBAR;
let toolbarLoaded = false;

function loadToolbar(): ToolbarState {
  if (!toolbarLoaded) {
    toolbarSnapshot = readToolbar();
    toolbarLoaded = true;
  }
  return toolbarSnapshot;
}

function writeToolbar(next: ToolbarState) {
  toolbarSnapshot = next;
  toolbarLoaded = true;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function subscribeToolbar(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function KitShell() {
  const toolbar = useSyncExternalStore(
    subscribeToolbar,
    loadToolbar,
    () => DEFAULT_TOOLBAR,
  );
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      KIT_GROUPS.map((group) => {
        const items = showcases.filter((showcase) => {
          if (showcase.group !== group.id) return false;
          if (!needle) return true;
          const haystack = [
            showcase.title,
            showcase.description,
            ...showcase.sections.map((section) => section.title),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(needle);
        });
        const groupMatches =
          !needle || group.title.toLowerCase().includes(needle);
        return { group, items, shown: groupMatches || items.length > 0 };
      }).filter((entry) => entry.shown),
    [needle],
  );

  function patch(next: Partial<ToolbarState>) {
    writeToolbar({ ...toolbar, ...next });
  }

  return (
    <MotionProvider reducedMotion={toolbar.reducedMotion ? 'always' : 'user'}>
      <div
        className="flex h-dvh flex-col overflow-clip bg-bg-0 text-fg-1"
        data-density={toolbar.density}
        data-reduced-motion={toolbar.reducedMotion ? 'true' : 'false'}
        data-freeze-time={toolbar.freezeTime ? 'true' : 'false'}
        data-kit-bg={toolbar.background}
        data-market-speed={toolbar.marketSpeed}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-line-1 px-4 py-3">
          <div className="mr-2">
            <p className="text-[11px] font-medium tracking-[0.06em] text-fg-3 uppercase">
              Dev
            </p>
            <h1 className="text-sm font-medium">UI kit</h1>
          </div>
          <Segment
            label="Density"
            value={toolbar.density}
            options={[
              ['compact', 'Compact'],
              ['comfortable', 'Comfortable'],
            ]}
            onChange={(density) => patch({ density })}
          />
          <Toggle
            label="Reduced motion"
            pressed={toolbar.reducedMotion}
            onClick={() => patch({ reducedMotion: !toolbar.reducedMotion })}
          />
          <Toggle
            label="Freeze time"
            pressed={toolbar.freezeTime}
            onClick={() => patch({ freezeTime: !toolbar.freezeTime })}
          />
          <Segment
            label="Background"
            value={toolbar.background}
            options={[
              ['0', 'bg-0'],
              ['1', 'bg-1'],
            ]}
            onChange={(background) => patch({ background })}
          />
          <Segment
            label="Market speed"
            value={toolbar.marketSpeed}
            options={[
              ['1', '1×'],
              ['10', '10×'],
              ['60', '60×'],
            ]}
            onChange={(marketSpeed) => patch({ marketSpeed })}
          />
          <Segment
            label="Width"
            value={String(toolbar.width)}
            options={WIDTHS.map((width) => [String(width), String(width)])}
            onChange={(width) => patch({ width: Number(width) as Width })}
          />
        </header>
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Sections"
            className="min-h-0 w-60 shrink-0 overflow-auto overscroll-contain border-r border-line-1 p-3"
          >
            <label className="block">
              <span className="sr-only">Search sections</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sections"
                className="mb-3 w-full rounded-sm border border-line-2 bg-bg-2 px-2 text-fg-1 outline-none placeholder:text-fg-4 focus:shadow-[var(--glow-sm)]"
                style={{ height: 'var(--input-h)' }}
              />
            </label>
            <ul className="space-y-3">
              {visible.map(({ group, items }) => (
                <li key={group.id}>
                  <a
                    href={`#${kitAnchor(group.id)}`}
                    className="text-sm font-medium text-fg-1 hover:text-orange-300"
                  >
                    {group.title}
                  </a>
                  {items.length > 0 ? (
                    <ul className="mt-1 space-y-1 pl-3">
                      {items.map((showcase) => (
                        <li key={showcase.id}>
                          <a
                            href={`#${kitAnchor(group.id, showcase.id)}`}
                            className="text-fg-2 hover:text-fg-1"
                          >
                            {showcase.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
          <main className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-6">
            <div
              className="w-full border border-line-1"
              data-kit-stage
              style={{
                maxWidth: toolbar.width,
                background:
                  toolbar.background === '1' ? 'var(--bg-1)' : 'var(--bg-0)',
                boxShadow: 'var(--shadow-panel)',
              }}
            >
              {visible.map(({ group, items }) => (
                <section
                  key={group.id}
                  id={kitAnchor(group.id)}
                  data-kit-anchor={kitAnchor(group.id)}
                  className="border-b border-line-1 px-6 py-8"
                >
                  <h2 className="text-lg font-medium">{group.title}</h2>
                  <p className="mt-1 text-fg-2">{group.description}</p>
                  {items.length === 0 ? (
                    <p className="mt-6 text-fg-3">
                      No components in this section yet.
                    </p>
                  ) : (
                    <div className="mt-6 space-y-8">
                      {items.map((showcase) => (
                        <article
                          key={showcase.id}
                          id={kitAnchor(showcase.group, showcase.id)}
                          data-kit-anchor={kitAnchor(
                            showcase.group,
                            showcase.id,
                          )}
                        >
                          <h3 className="font-medium">{showcase.title}</h3>
                          {showcase.importPath ? (
                            <p className="font-mono text-fg-3">
                              {showcase.importPath}
                            </p>
                          ) : null}
                          {showcase.description ? (
                            <p className="mt-1 text-fg-2">
                              {showcase.description}
                            </p>
                          ) : null}
                          <div className="mt-4 space-y-4">
                            {showcase.sections.map((section) => (
                              <div
                                key={section.id}
                                id={kitAnchor(showcase.group, section.id)}
                              >
                                <h4 className="text-fg-2">{section.title}</h4>
                                <div className="mt-2">{section.render()}</div>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>
    </MotionProvider>
  );
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-medium tracking-[0.06em] text-fg-3 uppercase">
        {label}
      </span>
      <div className="flex overflow-hidden rounded-sm border border-line-2">
        {options.map(([option, text]) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={
                selected
                  ? 'bg-bg-3 px-2 text-fg-1'
                  : 'bg-bg-1 px-2 text-fg-2 hover:text-fg-1'
              }
              style={{ height: 'var(--input-h)' }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      onClick={onClick}
      className="flex items-center gap-2 rounded-sm border border-line-2 bg-bg-1 px-2 text-fg-2"
      style={{ height: 'var(--input-h)' }}
    >
      <span
        aria-hidden
        className={
          pressed
            ? 'h-2 w-2 rounded-full bg-orange-500'
            : 'h-2 w-2 rounded-full bg-fg-4'
        }
      />
      {label}
    </button>
  );
}
