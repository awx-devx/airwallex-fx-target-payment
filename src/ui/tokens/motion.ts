/**
 * Motion's JS API can't read CSS variables, so these mirror the tokens in
 * tokens.css (`--ease-*`, `--dur-*`). Change both together.
 */

export const easeOut = [0.16, 1, 0.3, 1] as [number, number, number, number];
export const easeInOut = [0.65, 0, 0.35, 1] as [number, number, number, number];

/** Seconds. */
export const dur1 = 0.12;
export const dur2 = 0.2;
export const dur3 = 0.32;
export const durTick = 0.6;
export const durTween = 0.3;
