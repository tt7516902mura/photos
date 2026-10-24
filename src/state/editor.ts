import { clearAssets, getAsset } from '../core/assets';
import { uid } from '../core/ids';
import { HistoryStore } from './history';
import { LIMITS, type Doc } from '../core/types';
import { resetCrop } from './crop';
import { ui } from './ui';

export const DEFAULT_DOC: Doc = { width: 1920, height: 1080, background: { type: 'transparent' }, layers: [] };

export const history = new HistoryStore({ ...DEFAULT_DOC, layers: [] });

export const currentDoc = () => history.doc;
export { getAsset, uid, LIMITS };

// 選択中のレイヤーが履歴操作などで消えたら選択を外す。編集状態も整合させる。
history.subscribe(() => {
  const id = ui.get().selectedId;
  if (id && !history.doc.layers.some((l) => l.id === id)) ui.set({ selectedId: null });
});

export function resetEditor(doc: Doc) {
  resetCrop();
  history.reset(doc);
  ui.set({ selectedId: null, tool: 'select', fitted: true });
}

export function disposeAll() {
  clearAssets();
}
