import { create } from 'zustand';

const KEY = 'kr.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  /** Scan shown in the progress drawer (null = closed). */
  scanDrawerId: string | null;
  /** Time machine: view data "as of" this scan (null = latest). */
  asOfScanId: string | null;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  openScanDrawer: (scanId: string | null) => void;
  setAsOfScanId: (scanId: string | null) => void;
}

export const useUi = create<UiState>((set, get) => ({
  sidebarCollapsed: readCollapsed(),
  mobileNavOpen: false,
  commandOpen: false,
  scanDrawerId: null,
  asOfScanId: null,
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    set({ sidebarCollapsed: next });
  },
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  openScanDrawer: (scanDrawerId) => set({ scanDrawerId }),
  setAsOfScanId: (asOfScanId) => set({ asOfScanId }),
}));
