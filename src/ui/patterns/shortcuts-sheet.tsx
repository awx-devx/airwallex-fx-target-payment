import { Kbd } from '@/ui/primitives/kbd';

const SHORTCUTS = [
  ['J / K', 'Next / previous bill'],
  ['P', 'Pause or resume'],
  ['⌘K', 'Command palette'],
  ['?', 'This sheet'],
  ['U', 'Upload bills'],
] as const;

export function ShortcutsSheet() {
  return (
    <div className="max-w-sm space-y-2 rounded-md border border-line-1 bg-bg-1 p-4">
      <p className="font-medium">Shortcuts</p>
      <ul className="space-y-1">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={keys} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="text-fg-2">{label}</span>
            <Kbd>{keys}</Kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
