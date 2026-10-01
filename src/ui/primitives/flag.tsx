const FLAGS: Record<string, string> = {
  AED: '🇦🇪',
  AUD: '🇦🇺',
  BHD: '🇧🇭',
  BRL: '🇧🇷',
  CAD: '🇨🇦',
  CHF: '🇨🇭',
  CNY: '🇨🇳',
  CZK: '🇨🇿',
  DKK: '🇩🇰',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  HKD: '🇭🇰',
  HUF: '🇭🇺',
  IDR: '🇮🇩',
  ILS: '🇮🇱',
  INR: '🇮🇳',
  JPY: '🇯🇵',
  KES: '🇰🇪',
  KRW: '🇰🇷',
  MXN: '🇲🇽',
  MYR: '🇲🇾',
  NOK: '🇳🇴',
  NZD: '🇳🇿',
  PHP: '🇵🇭',
  PLN: '🇵🇱',
  RON: '🇷🇴',
  SAR: '🇸🇦',
  SEK: '🇸🇪',
  SGD: '🇸🇬',
  THB: '🇹🇭',
  USD: '🇺🇸',
  VND: '🇻🇳',
  ZAR: '🇿🇦',
};

export function Flag({
  currency,
  size = 16,
}: {
  currency: string;
  size?: 16 | 20;
}) {
  const flag = FLAGS[currency];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-3 text-[10px] leading-none"
      style={{ width: size, height: size }}
    >
      {flag ?? currency.slice(0, 2)}
    </span>
  );
}
