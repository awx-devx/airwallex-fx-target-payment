'use client';

import { useTimeFrozen } from '@/ui/motion/freeze';
import { dur2, easeOut } from '@/ui/tokens/motion';
import { motion, useReducedMotion } from 'motion/react';

/** Vertical digit roll. Snaps when motion is reduced or time is frozen. */
export function Odometer({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const frozen = useTimeFrozen();
  const snap = Boolean(reduced) || frozen;
  const marks = markPips(value);
  return (
    <span className={className ? `num inline-flex items-end ${className}` : 'num inline-flex items-end'}>
      {marks.map((mark, index) =>
        /\d/.test(mark.char) ? (
          <Digit key={index} digit={mark.char} pip={mark.pip} snap={snap} />
        ) : (
          <span key={index} className={mark.pip ? 'num-pip' : 'num-head'}>
            {mark.char}
          </span>
        ),
      )}
    </span>
  );
}

function Digit({
  digit,
  pip,
  snap,
}: {
  digit: string;
  pip: boolean;
  snap: boolean;
}) {
  const offset = Number(digit);
  return (
    <span className={`inline-block h-[1em] overflow-hidden ${pip ? 'num-pip' : 'num-head'}`}>
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: `-${offset}em` }}
        transition={snap ? { duration: 0 } : { duration: dur2, ease: easeOut }}
      >
        {'0123456789'.split('').map((item) => (
          <span key={item} className="block h-[1em] leading-none">
            {item}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function markPips(text: string): Array<{ char: string; pip: boolean }> {
  const chars = [...text];
  const pip = chars.map(() => false);
  let found = 0;
  for (let index = chars.length - 1; index >= 0 && found < 2; index -= 1) {
    if (/\d/.test(chars[index] ?? '')) {
      pip[index] = true;
      found += 1;
    }
  }
  return chars.map((char, index) => ({ char, pip: pip[index] ?? false }));
}
