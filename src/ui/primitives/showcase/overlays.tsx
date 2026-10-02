'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogPreview, Drawer, DrawerPreview } from '@/ui/primitives/dialog';
import { Input } from '@/ui/primitives/input';
import {
  Menu,
  MenuItem,
  MenuPreview,
  MenuPreviewItem,
  MenuSeparator,
  MenuSub,
} from '@/ui/primitives/menu';
import { Popover, PopoverPanel } from '@/ui/primitives/popover';
import { Tooltip, TooltipCard } from '@/ui/primitives/tooltip';
import { Cell, Matrix } from '@/ui/primitives/showcase/frame';

function LiveDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Pay now"
      description="Pays this bill at the current rate."
      trigger={<Button>Open dialog</Button>}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Pay now</Button>
        </>
      }
    >
      <Input aria-label="Note" placeholder="Note for the audit log" />
    </Dialog>
  );
}

function LiveDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title="Bill detail"
      trigger={<Button variant="secondary">Open drawer</Button>}
    >
      <p className="text-fg-2">The sheet traps focus the same way a dialog does.</p>
    </Drawer>
  );
}

const scrollCopy = Array.from({ length: 8 }, (_, index) => `Clause ${index + 1}. The vendor is paid in full.`);

export const overlayShowcases: Showcase[] = [
  {
    id: 'tooltip',
    group: 'primitives',
    title: 'Tooltip',
    importPath: '@/ui/primitives/tooltip',
    description: 'Live tips open on hover and focus. The cards below are the resting look.',
    sections: [
      {
        id: 'tooltip-matrix',
        title: 'Text, rich, delay',
        render: () => (
          <div className="space-y-4">
            <Matrix>
              <Tooltip content="Copied the quote id">
                <Button variant="secondary" size="sm">
                  Hover
                </Button>
              </Tooltip>
              <Tooltip title="Target hit" content="Price is through 1.07500." delay={0}>
                <Button variant="ghost" size="sm">
                  Instant
                </Button>
              </Tooltip>
            </Matrix>
            <Matrix>
              <Cell label="text">
                <TooltipCard content="Copied the quote id" />
              </Cell>
              <Cell label="rich">
                <TooltipCard title="Target hit" content="Price is through 1.07500." />
              </Cell>
            </Matrix>
          </div>
        ),
      },
    ],
  },
  {
    id: 'popover',
    group: 'primitives',
    title: 'Popover',
    importPath: '@/ui/primitives/popover',
    sections: [
      {
        id: 'popover-matrix',
        title: 'With arrow and without',
        render: () => (
          <div className="space-y-4">
            <Popover
              trigger={<Button variant="secondary">Open popover</Button>}
              arrow
            >
              <p className="font-medium">Buffer</p>
              <p className="text-fg-2">12 bps under the target.</p>
            </Popover>
            <Matrix>
              <Cell label="arrow">
                <PopoverPanel>
                  <p className="font-medium">Buffer</p>
                  <p className="text-fg-2">12 bps under the target.</p>
                </PopoverPanel>
              </Cell>
              <Cell label="no arrow">
                <PopoverPanel arrow={false}>
                  <p>Plain panel.</p>
                </PopoverPanel>
              </Cell>
            </Matrix>
          </div>
        ),
      },
    ],
  },
  {
    id: 'menu',
    group: 'primitives',
    title: 'DropdownMenu',
    importPath: '@/ui/primitives/menu',
    sections: [
      {
        id: 'menu-matrix',
        title: 'Items, icons, shortcuts, submenu',
        render: () => (
          <div className="flex flex-wrap items-start gap-6">
            <Menu trigger={<Button variant="secondary">Open menu</Button>}>
              <MenuItem icon={<Pencil strokeWidth={1.5} className="size-3.5" />} shortcut="E">
                Edit
              </MenuItem>
              <MenuItem icon={<Copy strokeWidth={1.5} className="size-3.5" />}>Duplicate</MenuItem>
              <MenuSeparator />
              <MenuSub label="Move to">
                <MenuItem>Watching</MenuItem>
                <MenuItem>Paused</MenuItem>
              </MenuSub>
              <MenuSeparator />
              <MenuItem
                destructive
                icon={<Trash2 strokeWidth={1.5} className="size-3.5" />}
              >
                Delete
              </MenuItem>
            </Menu>
            <MenuPreview>
              <MenuPreviewItem
                icon={<Pencil strokeWidth={1.5} className="size-3.5" />}
                shortcut="E"
              >
                Edit
              </MenuPreviewItem>
              <MenuPreviewItem icon={<Copy strokeWidth={1.5} className="size-3.5" />}>
                Duplicate
              </MenuPreviewItem>
              <div className="my-1 h-px bg-line-2" />
              <MenuPreviewItem>Move to</MenuPreviewItem>
              <div className="my-1 h-px bg-line-2" />
              <MenuPreviewItem
                destructive
                icon={<Trash2 strokeWidth={1.5} className="size-3.5" />}
              >
                Delete
              </MenuPreviewItem>
            </MenuPreview>
            <MenuPreview>
              <MenuPreviewItem>Watching</MenuPreviewItem>
              <MenuPreviewItem>Paused</MenuPreviewItem>
            </MenuPreview>
          </div>
        ),
      },
    ],
  },
  {
    id: 'dialog',
    group: 'primitives',
    title: 'Dialog',
    importPath: '@/ui/primitives/dialog',
    description: 'Closed by default. The panels are the open look, including glow and danger.',
    sections: [
      {
        id: 'dialog-matrix',
        title: 'Tones, sizes, footer, scrolling body',
        render: () => (
          <div className="space-y-4">
            <Matrix>
              <LiveDialog />
              <LiveDrawer />
            </Matrix>
            <div className="grid gap-4 lg:grid-cols-3">
              <Cell label="default sm">
                <DialogPreview size="sm" title="Rename" description="Bills keep their history.">
                  <Input aria-label="Name" defaultValue="Helios GmbH" />
                </DialogPreview>
              </Cell>
              <Cell label="glow md">
                <DialogPreview
                  tone="glow"
                  title="Target hit"
                  description="EUR/USD is through 1.07500."
                >
                  <p>Paying at 1.07480.</p>
                </DialogPreview>
              </Cell>
              <Cell label="danger lg">
                <DialogPreview
                  tone="danger"
                  size="lg"
                  title="Cancel payment?"
                  description="This cannot be undone after the cutoff."
                  footer={
                    <>
                      <Button variant="ghost">Keep</Button>
                      <Button variant="danger">Cancel payment</Button>
                    </>
                  }
                >
                  <p>The standing instruction will not run.</p>
                </DialogPreview>
              </Cell>
            </div>
            <Cell label="scrolling body" className="max-w-md">
              <DialogPreview title="Terms" scroll>
                {scrollCopy.map((line) => (
                  <p key={line} className="mb-2">
                    {line}
                  </p>
                ))}
              </DialogPreview>
            </Cell>
          </div>
        ),
      },
    ],
  },
  {
    id: 'drawer',
    group: 'primitives',
    title: 'Drawer',
    importPath: '@/ui/primitives/dialog',
    sections: [
      {
        id: 'drawer-matrix',
        title: 'Right and bottom',
        render: () => (
          <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
            <Cell label="right md">
              <DrawerPreview title="Detail">
                <p className="text-fg-2">Vendor and method.</p>
              </DrawerPreview>
            </Cell>
            <Cell label="right lg">
              <DrawerPreview size="lg" title="Activity">
                <p className="text-fg-2">Armed, then watching.</p>
              </DrawerPreview>
            </Cell>
            <Cell label="bottom">
              <DrawerPreview side="bottom" title="Filters">
                <p className="text-fg-2">Currency, state, deadline.</p>
              </DrawerPreview>
            </Cell>
          </div>
        ),
      },
    ],
  },
];
