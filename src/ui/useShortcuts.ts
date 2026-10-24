import { useEffect } from 'react';
import { isCropTool } from '../core/types';
import {
  applyCrop,
  deleteLayer,
  duplicateLayer,
  moveLayer,
  openExportDialog,
  redo,
  saveProject,
  selectedLayer,
  setGeometry,
  setTool,
  undo,
} from '../state/actions';
import { crop, polyClose, polyUndo, resetCrop } from '../state/crop';
import { history } from '../state/editor';
import { ui } from '../state/ui';
import { fitView, zoomBy } from '../state/view';
import { pickProject } from './pickers';

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

const TOOL_KEYS: Record<string, Parameters<typeof setTool>[0]> = {
  v: 'select',
  h: 'hand',
  l: 'lasso',
  p: 'polygon',
  r: 'rect',
  e: 'ellipse',
};

/** グローバルショートカット。入力欄・ダイアログ表示中は反応しない。 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || typing(e.target) || ui.get().dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const tool = ui.get().tool;
      const layer = selectedLayer();

      if (mod) {
        if (e.altKey) return;
        let handled = true;
        if (key === 'z') (e.shiftKey ? redo : undo)();
        else if (key === 'y') redo();
        else if (key === 's') void saveProject();
        else if (key === 'o') pickProject();
        else if (key === 'e' && e.shiftKey) openExportDialog();
        else if (key === 'd' && layer) duplicateLayer(layer.id);
        else if (key === ']' && layer) moveLayer(layer.id, e.shiftKey ? 'front' : 'forward');
        else if (key === '[' && layer) moveLayer(layer.id, e.shiftKey ? 'back' : 'backward');
        else if (key === '0') fitView();
        else if (key === '=' || key === '+') zoomBy(1.25);
        else if (key === '-') zoomBy(1 / 1.25);
        else handled = false;
        if (handled) e.preventDefault();
        return;
      }
      if (e.altKey) return;

      const c = crop.get();
      if (e.key === 'Escape') {
        if (c.phase !== 'idle') resetCrop();
        else if (tool !== 'select') setTool('select');
        else ui.set({ selectedId: null });
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        if (isCropTool(tool)) {
          if (c.phase === 'pending') applyCrop();
          else if (tool === 'polygon' && c.phase === 'drawing') polyClose();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (tool === 'polygon' && (c.phase === 'drawing' || (c.phase === 'pending' && c.shape?.kind === 'poly'))) {
          polyUndo();
          e.preventDefault();
        } else if ((tool === 'select' || tool === 'hand') && layer) {
          deleteLayer(layer.id);
          e.preventDefault();
        }
        return;
      }
      if (TOOL_KEYS[key] && !e.shiftKey) {
        setTool(TOOL_KEYS[key]);
        return;
      }
      if (tool === 'select' && layer && !layer.locked && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (dx) setGeometry(layer.id, 'cx', layer.cx + dx);
        if (dy) setGeometry(layer.id, 'cy', layer.cy + dy);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (history.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
}
