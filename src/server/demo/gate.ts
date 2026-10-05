/**
 * `/dev/*` and `/api/demo/*` stay available only while demo mode is on.
 * An unset flag matches the env schema default, which is on.
 */
export function demoRoutesEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  const value = source.DEMO_MODE;
  if (value === undefined || value.trim() === '') return true;
  return value === 'true';
}
