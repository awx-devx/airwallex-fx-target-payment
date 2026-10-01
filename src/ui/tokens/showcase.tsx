'use client';

import {
  favorable,
  formatCountdown,
  formatDelta,
  formatMoney,
  formatPair,
  formatPrice,
  PipNumber,
} from '@/ui/format';
import { D, decimalString } from '@/contracts/money';
import { useKitReducedMotion, useTimeFrozen } from '@/ui/motion/freeze';
import { useTickFlash, useTween } from '@/ui/motion/hooks';
import {
  BODY_CONTRAST,
  contrastRatio,
  formatContrast,
} from '@/ui/tokens/contrast';
import { dur1, dur2, dur3, easeInOut, easeOut } from '@/ui/tokens/motion';
import {
  BG_1,
  FG_1,
  SWATCHES,
  type Swatch,
  type SwatchKind,
} from '@/ui/tokens/swatches';
import type { Showcase } from '@/ui/showcase/types';
import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';

const GROUPS: { kind: SwatchKind; title: string }[] = [
  { kind: 'surface', title: 'Surfaces' },
  { kind: 'text', title: 'Text' },
  { kind: 'accent', title: 'Accent' },
  { kind: 'semantic', title: 'Semantic' },
];

const SPACES = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56];
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', 'pill'] as const;

const EUR_USD = { base: 'EUR', quote: 'USD' };
const JPY_USD = { base: 'JPY', quote: 'USD' };

export const tokensShowcase: Showcase = {
  id: 'foundations',
  group: 'tokens',
  title: 'Foundations',
  description: 'Colour, type, spacing, motion, and favourable semantics.',
  importPath: '@/ui/tokens/tokens.css',
  sections: [
    { id: 'colours', title: 'Colours', render: () => <Colours /> },
    { id: 'gradients', title: 'Gradients and glows', render: () => <Glows /> },
    { id: 'typography', title: 'Typography', render: () => <Typography /> },
    { id: 'spacing', title: 'Spacing and radius', render: () => <Spacing /> },
    { id: 'motion', title: 'Motion', render: () => <MotionSection /> },
    {
      id: 'favourable',
      title: 'Favourable semantics',
      render: () => <Favourable />,
    },
  ],
};

function Colours() {
  return (
    <div className="space-y-6">
      <p className="max-w-xl text-fg-2">
        Text and accent colours are measured on{' '}
        <span className="num">--bg-1</span>. Surfaces show{' '}
        <span className="num">--fg-1</span> on that fill. Body text needs{' '}
        {BODY_CONTRAST}:1. <span className="num">--fg-3</span> and{' '}
        <span className="num">--fg-4</span> are for labels and disabled text.
      </p>
      {GROUPS.map((group) => (
        <div key={group.kind}>
          <h5 className="label">{group.title}</h5>
          <div className="mt-3 flex flex-wrap gap-3">
            {SWATCHES.filter((swatch) => swatch.kind === group.kind).map(
              (swatch) => (
                <SwatchCard key={swatch.name} swatch={swatch} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SwatchCard({ swatch }: { swatch: Swatch }) {
  const ratio = contrastFor(swatch);
  return (
    <div className="w-40 overflow-hidden rounded-md border border-line-1 bg-bg-2">
      <div
        className="h-12 border-b border-line-1"
        style={{ background: swatch.value }}
      />
      <div className="space-y-1 px-2 py-2">
        <p className="num text-fg-1">{swatch.name}</p>
        <p className="font-mono break-all whitespace-normal text-fg-3">
          {swatch.value}
        </p>
        {ratio ? (
          <p
            className={
              ratio.passes
                ? 'font-mono whitespace-normal text-fg-2'
                : 'font-mono whitespace-normal text-warn'
            }
          >
            {ratio.label}
          </p>
        ) : (
          <p className="font-mono whitespace-normal text-fg-4">
            no opaque ratio
          </p>
        )}
      </div>
    </div>
  );
}

function contrastFor(
  swatch: Swatch,
): { label: string; passes: boolean } | null {
  if (!swatch.value.startsWith('#')) return null;
  const ratio =
    swatch.kind === 'surface'
      ? contrastRatio(FG_1, swatch.value)
      : contrastRatio(swatch.value, BG_1);
  const subject = swatch.kind === 'surface' ? 'fg-1 on fill' : 'on bg-1';
  return {
    label: `${formatContrast(ratio)} ${subject}`,
    passes: ratio >= BODY_CONTRAST,
  };
}

function Glows() {
  const [pulse, setPulse] = useState(false);
  const frozen = useTimeFrozen();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <GradientSample
          name="--grad-accent"
          style={{ background: 'var(--grad-accent)' }}
        />
        <GradientSample
          name="--grad-border"
          style={{ background: 'var(--grad-border)' }}
        />
        <GradientSample
          name="--grad-ambient"
          style={{
            background: 'var(--bg-1)',
            backgroundImage: 'var(--grad-ambient)',
          }}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <GlowCard className="glow-sm" name="--glow-sm" />
        <GlowCard className="glow-md" name="--glow-md" />
        <GlowCard className="glow-lg" name="--glow-lg" />
        <GlowCard className="glow-up" name="--glow-up" />
        <GlowCard className="glow-warn" name="--glow-warn" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={pulse}
          onClick={() => {
            if (!frozen) setPulse((on) => !on);
          }}
          className="rounded-sm border border-line-2 bg-bg-2 px-3 text-fg-1"
          style={{ height: 'var(--input-h)' }}
        >
          Pulse
        </button>
        <GlowCard
          className={pulse ? 'glow-pulse' : 'glow-sm'}
          name="WATCHING · subtle"
        />
        <GlowCard
          className={pulse ? 'glow-pulse-strong' : 'glow-lg'}
          name="TARGET_HIT · strong"
        />
      </div>
    </div>
  );
}

function GradientSample({
  name,
  style,
}: {
  name: string;
  style: CSSProperties;
}) {
  return (
    <div className="w-48 overflow-hidden rounded-md border border-line-1">
      <div className="h-16" style={style} />
      <p className="num px-2 py-2 text-fg-2">{name}</p>
    </div>
  );
}

function GlowCard({ className, name }: { className: string; name: string }) {
  return (
    <div
      className={`w-40 rounded-md border border-line-1 bg-bg-1 px-3 py-4 ${className}`}
    >
      <p className="num text-fg-2">{name}</p>
    </div>
  );
}

function Typography() {
  const eur = formatPrice(EUR_USD, '1.08412');
  const jpy = formatPrice(JPY_USD, '0.0067', { inverted: true });
  return (
    <div className="space-y-5">
      <div>
        <p className="label">Label</p>
        <p className="mt-2 max-w-md">
          UI copy is Inter at 13/18, with cv11 and ss01. Secondary text sits in
          fg-2.
        </p>
      </div>
      <div>
        <p className="label">Display</p>
        <p className="display mt-2">32 / 36</p>
        <p className="display-lg mt-2">44 / 48</p>
      </div>
      <div>
        <p className="label">Numbers</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-6">
          <figure>
            <PipNumber value={eur} className="text-lg" />
            <figcaption className="mt-1 text-fg-3">
              {formatPair(EUR_USD)} · 5 dp
            </figcaption>
          </figure>
          <figure>
            <PipNumber value={jpy} className="text-lg" />
            <figcaption className="mt-1 text-fg-3">
              {formatPair(JPY_USD, { inverted: true })} · 3 dp
            </figcaption>
          </figure>
          <figure>
            <p className="num">{formatMoney('EUR', '250000')}</p>
            <figcaption className="mt-1 text-fg-3">2 dp</figcaption>
          </figure>
          <figure>
            <p className="num">{formatMoney('JPY', '1500')}</p>
            <figcaption className="mt-1 text-fg-3">0 dp</figcaption>
          </figure>
          <figure>
            <p className="num">{formatMoney('KES', '100.4')}</p>
            <figcaption className="mt-1 text-fg-3">KES payout 0 dp</figcaption>
          </figure>
          <figure>
            <p className="num">{formatMoney('BHD', '1.2344')}</p>
            <figcaption className="mt-1 text-fg-3">3 dp</figcaption>
          </figure>
          <figure>
            <p className="num">{formatCountdown(1799)}</p>
            <figcaption className="mt-1 text-fg-3">countdown</figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}

function Spacing() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        {SPACES.map((space) => (
          <div key={space} className="text-center">
            <div
              className="rounded-xs bg-orange-500"
              style={{ width: `var(--space-${space})`, height: 24 }}
            />
            <p className="num mt-1 text-fg-3">{space}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {RADII.map((radius) => (
          <div key={radius} className="text-center">
            <div
              className="h-12 w-16 border border-line-2 bg-bg-2"
              style={{ borderRadius: `var(--r-${radius})` }}
            />
            <p className="num mt-1 text-fg-3">{radius}</p>
          </div>
        ))}
      </div>
      <p className="text-fg-2">
        Compact rows are 36 px and inputs 32 px. Comfortable, from the toolbar,
        is 44 and 40. Set with <span className="num">data-density</span>.
      </p>
    </div>
  );
}

function MotionSection() {
  const frozen = useTimeFrozen();
  const reduced = useKitReducedMotion();
  return (
    <div className="space-y-4">
      <p className="text-fg-2">
        Reduced motion {reduced ? 'on' : 'off'} · Time{' '}
        {frozen ? 'frozen' : 'running'}. The toolbar switches force both. Under
        either, pulses, flashes, and tweens snap.
      </p>
      <div className="flex flex-wrap gap-3">
        <Slide label="dur-1 · ease-out" duration={dur1} ease={easeOut} />
        <Slide label="dur-2 · ease-out" duration={dur2} ease={easeOut} />
        <Slide label="dur-3 · ease-in-out" duration={dur3} ease={easeInOut} />
      </div>
      <TickDemo />
      <TweenDemo />
    </div>
  );
}

function Slide({
  label,
  duration,
  ease,
}: {
  label: string;
  duration: number;
  ease: [number, number, number, number];
}) {
  const frozen = useTimeFrozen();
  const reduced = useKitReducedMotion();
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (frozen || reduced) return;
        setOn((value) => !value);
      }}
      className="rounded-md border border-line-2 bg-bg-2 px-3 py-2 text-left"
    >
      <span className="relative block h-6 w-24 overflow-hidden rounded-sm bg-bg-0">
        <motion.span
          className="absolute top-1 left-1 h-4 w-4 rounded-xs bg-orange-500"
          animate={{ x: on ? 64 : 0 }}
          transition={{ duration, ease }}
        />
      </span>
      <span className="num mt-2 block text-fg-2">{label}</span>
    </button>
  );
}

function TickDemo() {
  const frozen = useTimeFrozen();
  const reduced = useKitReducedMotion();
  const [price, setPrice] = useState('1.08412');
  const flash = useTickFlash(price);
  const blocked = frozen || reduced;

  function set(next: string) {
    if (!blocked) setPrice(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative rounded-md border border-line-1 px-3 py-2">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-md"
          style={{
            backgroundColor: flash.backgroundColor,
            opacity: flash.opacity,
          }}
        />
        <PipNumber value={formatPrice(EUR_USD, price)} />
      </div>
      <DemoButton label="Price down" onClick={() => set('1.08000')} />
      <DemoButton label="Price up" onClick={() => set('1.09000')} />
    </div>
  );
}

function TweenDemo() {
  const frozen = useTimeFrozen();
  const reduced = useKitReducedMotion();
  const [target, setTarget] = useState('1030.00');
  const display = useTween(target);
  const blocked = frozen || reduced;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="num rounded-md border border-line-1 px-3 py-2">
        {formatMoney('USD', display, { signed: true })}
      </p>
      <DemoButton
        label="Savings up"
        onClick={() => {
          if (!blocked) setTarget('2480.00');
        }}
      />
      <DemoButton
        label="Savings down"
        onClick={() => {
          if (!blocked) setTarget('-420.00');
        }}
      />
    </div>
  );
}

function DemoButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm border border-line-2 bg-bg-2 px-3 text-fg-1"
      style={{ height: 'var(--input-h)' }}
    >
      {label}
    </button>
  );
}

function Favourable() {
  const fell = decimalString(D('1.08000').minus(D('1.08412')));
  const rose = decimalString(D('1.09000').minus(D('1.08412')));
  const jpyFell = decimalString(D('0.00650').minus(D('0.00670')));
  return (
    <div className="space-y-3">
      <p className="max-w-xl text-fg-2">
        A lower canonical price is favourable. Colour comes from{' '}
        <span className="num">favorable(delta)</span> on that price change,
        including when the inverted quote moves the other way.
      </p>
      <div className="overflow-hidden rounded-md border border-line-1">
        <Row
          title="EUR/USD fell"
          value={formatDelta(fell, { pair: EUR_USD })}
          delta={fell}
          note="cheaper bill"
        />
        <Row
          title="EUR/USD rose"
          value={formatDelta(rose, { pair: EUR_USD })}
          delta={rose}
          note="dearer bill"
        />
        <Row
          title={`${formatPair(JPY_USD, { inverted: true })} display rose`}
          value={`${formatPrice(JPY_USD, '0.00670', { inverted: true })} → ${formatPrice(JPY_USD, '0.00650', { inverted: true })}`}
          delta={jpyFell}
          note="canonical JPY/USD fell, so this is still favourable"
        />
        <Row
          title="Savings when EUR/USD fell"
          value={formatMoney('USD', '1030', { signed: true })}
          delta={fell}
          note="the money is positive; the colour still follows the price delta"
        />
      </div>
    </div>
  );
}

function Row({
  title,
  value,
  delta,
  note,
}: {
  title: string;
  value: string;
  delta: string;
  note: string;
}) {
  const direction = favorable(delta);
  const color =
    direction === 'favorable'
      ? 'text-up'
      : direction === 'adverse'
        ? 'text-down'
        : 'text-fg-2';
  return (
    <div className="grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-3 border-b border-line-1 px-3 py-3 last:border-b-0">
      <p>{title}</p>
      <p>
        <span className={`num ${color}`}>{value}</span>
        <span className="mt-1 block text-fg-3">{note}</span>
      </p>
    </div>
  );
}
