'use client';

import { useState } from 'react';
import { Button } from '@/ui/primitives/button';
import { Dialog } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import { Kbd } from '@/ui/primitives/kbd';

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
}

export function CommandList({
  items,
  query,
  onQueryChange,
  onPick,
}: {
  items: readonly CommandItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onPick?: (item: CommandItem) => void;
}) {
  const needle = query.trim().toLowerCase();
  const matched = items.filter((item) => item.label.toLowerCase().includes(needle));
  const groups = [...new Set(matched.map((item) => item.group))];
  return (
    <div className="space-y-2">
      <Input
        aria-label="Command"
        placeholder="Jump to a bill, upload, or approve"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {groups.map((group) => (
        <div key={group}>
          <p className="text-xs text-fg-3">{group}</p>
          <ul>
            {matched
              .filter((item) => item.group === group)
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick?.(item)}
                    className="flex w-full items-center justify-between py-1 text-left hover:text-orange-300"
                  >
                    <span>{item.label}</span>
                    {item.hint ? <span className="text-xs text-fg-3">{item.hint}</span> : null}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {matched.length === 0 ? <p className="text-fg-3">No matches.</p> : null}
    </div>
  );
}

export function CommandPalette({
  items,
  open,
  onOpenChange,
  onPick,
}: {
  items: readonly CommandItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick?: (item: CommandItem) => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump, upload, or approve"
      trigger={
        <Button variant="secondary" iconRight={<Kbd>⌘K</Kbd>}>
          Commands
        </Button>
      }
    >
      <CommandList items={items} query={query} onQueryChange={setQuery} onPick={onPick} />
    </Dialog>
  );
}
