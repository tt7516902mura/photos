import type { View } from '../core/coords';
import type { Tool } from '../core/types';
import { createStore } from './store';

export interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

export type DialogState =
  | null
  | { type: 'export' }
  | { type: 'canvas' }
  | { type: 'help' }
  | {
      type: 'confirm';
      title: string;
      message: string;
      buttons: { label: string; kind?: 'primary' | 'danger' | 'default'; run: () => void | Promise<void> }[];
    };

export interface UiState {
  tool: Tool;
  selectedId: string | null;
  view: View;
  /** ステージ（キャンバス表示領域）のサイズ CSS px */
  stageW: number;
  stageH: number;
  lockAspect: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  sheet: null | 'layers' | 'props';
  menuOpen: boolean;
  dialog: DialogState;
  busy: string | null;
  toasts: Toast[];
  projectName: string;
  dragOver: boolean;
  /** 現在ズームが「全体表示」のまま追従しているか */
  fitted: boolean;
}

export const ui = createStore<UiState>({
  tool: 'select',
  selectedId: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  stageW: 0,
  stageH: 0,
  lockAspect: true,
  leftOpen: true,
  rightOpen: typeof window !== 'undefined' ? window.innerWidth >= 1100 || window.innerWidth > window.innerHeight : true,
  sheet: null,
  menuOpen: false,
  dialog: null,
  busy: null,
  toasts: [],
  projectName: '無題',
  dragOver: false,
  fitted: true,
});

let toastSeq = 1;
export function toast(kind: Toast['kind'], text: string) {
  const id = toastSeq++;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 4000);
}
export const dismissToast = (id: number) => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
