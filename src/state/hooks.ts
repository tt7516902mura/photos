import { useSyncExternalStore } from 'react';
import { history } from './editor';
import { ui, toast, type UiState } from './ui';
import { useStore } from './store';

export { toast, ui };

export const useUi = <S,>(selector: (s: UiState) => S): S => useStore(ui, selector);

/** 現在のドキュメント（変更のたびに新しい参照になる） */
export const useDoc = () =>
  useSyncExternalStore(
    history.subscribe,
    () => history.doc,
    () => history.doc,
  );

/** Undo/Redo/Dirty の状態 */
export const useHistoryFlags = () => {
  useSyncExternalStore(
    history.subscribe,
    () => history.version,
    () => history.version,
  );
  return { canUndo: history.canUndo, canRedo: history.canRedo, dirty: history.isDirty };
};
