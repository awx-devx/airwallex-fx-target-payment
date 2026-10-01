'use client';

import type { Role } from '@/contracts/bill';
import type { ChartRange } from '@/contracts/chart';
import type { ChartType } from '@/ui/chart/chart-header';
import type { BillFilter, BillSort } from '@/ui/patterns/bill-list-logic';
import { create } from 'zustand';

interface UiState {
  role: Role;
  setRole: (role: Role) => void;
  filter: BillFilter;
  setFilter: (filter: BillFilter) => void;
  sort: BillSort;
  setSort: (sort: BillSort) => void;
  grouped: boolean;
  setGrouped: (grouped: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  palette: boolean;
  setPalette: (open: boolean) => void;
  shortcuts: boolean;
  setShortcuts: (open: boolean) => void;
  upload: boolean;
  setUpload: (open: boolean) => void;
  noticesOpen: boolean;
  setNoticesOpen: (open: boolean) => void;
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  ticketOpen: boolean;
  setTicketOpen: (open: boolean) => void;
  demoOpen: boolean;
  setDemoOpen: (open: boolean) => void;
  marketSpeed: '1' | '10' | '60';
  setMarketSpeed: (speed: '1' | '10' | '60') => void;
  warp: '1' | '60' | '1440';
  setWarp: (warp: '1' | '60' | '1440') => void;
}

export const useUiStore = create<UiState>((set) => ({
  role: 'approver',
  setRole: (role) => set({ role }),
  filter: 'all',
  setFilter: (filter) => set({ filter }),
  sort: 'deadline',
  setSort: (sort) => set({ sort }),
  grouped: false,
  setGrouped: (grouped) => set({ grouped }),
  query: '',
  setQuery: (query) => set({ query }),
  range: 'TO_DUE',
  setRange: (range) => set({ range }),
  chartType: 'area',
  setChartType: (chartType) => set({ chartType }),
  palette: false,
  setPalette: (palette) => set({ palette }),
  shortcuts: false,
  setShortcuts: (shortcuts) => set({ shortcuts }),
  upload: false,
  setUpload: (upload) => set({ upload }),
  noticesOpen: false,
  setNoticesOpen: (noticesOpen) => set({ noticesOpen }),
  listOpen: false,
  setListOpen: (listOpen) => set({ listOpen }),
  ticketOpen: false,
  setTicketOpen: (ticketOpen) => set({ ticketOpen }),
  demoOpen: false,
  setDemoOpen: (demoOpen) => set({ demoOpen }),
  marketSpeed: '1',
  setMarketSpeed: (marketSpeed) => set({ marketSpeed }),
  warp: '1',
  setWarp: (warp) => set({ warp }),
}));
