import { Kbd } from '@/ui/primitives/kbd';

export function ShortcutHint({
  keys,
  label,
}: {
  keys: readonly string[];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 border border-line-2 bg-bg-2 px-3 py-1.5">
      <Kbd size="xs">{[...keys]}</Kbd>
      <span className="text-fg-2">{label}</span>
    </span>
  );
}
