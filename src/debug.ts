import { docToView } from './core/coords';
import { getAsset } from './core/assets';
import { history } from './state/editor';
import { ui } from './state/ui';

/**
 * 自動テスト用の読み取り専用フック。URL に ?debug を付けたときだけ有効。
 * ドキュメントの状態と座標変換を返すだけで、画像データの送信や書き換えは行わない。
 */
export function installDebugHook() {
  if (!new URLSearchParams(location.search).has('debug')) return;
  (window as any).__pc = {
    doc: () => JSON.parse(JSON.stringify(history.doc)),
    ui: () => {
      const s = ui.get();
      return { tool: s.tool, selectedId: s.selectedId, view: s.view, stageW: s.stageW, stageH: s.stageH, lockAspect: s.lockAspect };
    },
    history: () => ({ canUndo: history.canUndo, canRedo: history.canRedo, dirty: history.isDirty, depth: history.undoDepth }),
    /** ドキュメント座標 → ブラウザ clientX/Y */
    docToClient: (x: number, y: number) => {
      const r = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
      const p = docToView(ui.get().view, { x, y });
      return { x: r.left + p.x, y: r.top + p.y };
    },
    assetInfo: (assetId: string) => {
      const a = getAsset(assetId);
      return a ? { width: a.width, height: a.height, cropped: a.cropped } : null;
    },
  };
}
