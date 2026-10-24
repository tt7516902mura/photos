import {
  ellipseShape,
  rectShape,
  shapeIsDegenerate,
} from '../core/mask';
import type { Pt, Shape } from '../core/types';
import { createStore } from './store';
import { ui } from './ui';

/** 切り抜き範囲の作成状態（座標はドキュメント座標） */
export interface CropState {
  phase: 'idle' | 'drawing' | 'pending';
  /** 投げ縄の軌跡 / 多角形の頂点 */
  points: Pt[];
  /** 矩形・楕円のドラッグ */
  drag: { a: Pt; b: Pt } | null;
  /** 多角形のラバーバンド用ポインタ位置 */
  hover: Pt | null;
  /** 確定した（適用前の）選択範囲 */
  shape: Shape | null;
}

const IDLE: CropState = { phase: 'idle', points: [], drag: null, hover: null, shape: null };
export const crop = createStore<CropState>({ ...IDLE });

export const resetCrop = () => crop.set({ ...IDLE });

/** 画面上 6px 未満の選択は無効にする */
const minSize = () => 6 / ui.get().view.zoom;

export const lassoBegin = (p: Pt) => crop.set({ phase: 'drawing', points: [p], drag: null, hover: null, shape: null });
export function lassoExtend(p: Pt) {
  const { points } = crop.get();
  const last = points[points.length - 1];
  if (!last) return;
  const d = 1.5 / ui.get().view.zoom;
  if (Math.hypot(p.x - last.x, p.y - last.y) < d) return;
  crop.set({ points: [...points, p] });
}
/** 始点と終点が離れていても、そのまま直線で閉じる（パスは常に閉じて扱う） */
export function lassoEnd(): boolean {
  const { points } = crop.get();
  const shape: Shape = { kind: 'poly', points };
  if (points.length < 3 || shapeIsDegenerate(shape, minSize())) {
    resetCrop();
    return false;
  }
  crop.set({ phase: 'pending', shape, points: [] });
  return true;
}

export function polyAdd(p: Pt) {
  const s = crop.get();
  crop.set({ phase: 'drawing', points: [...s.points, p], shape: null });
}
export function polyUndo() {
  const s = crop.get();
  if (s.phase === 'pending' && s.shape?.kind === 'poly') {
    // 確定済みなら頂点編集に戻す
    crop.set({ phase: 'drawing', points: s.shape.points.slice(0, -1), shape: null });
    return;
  }
  const pts = s.points.slice(0, -1);
  crop.set(pts.length ? { points: pts } : { ...IDLE });
}
export const polyMove = (idx: number, p: Pt) =>
  crop.set((s) => ({ points: s.points.map((q, i) => (i === idx ? p : q)) }));
export const polyHover = (p: Pt | null) => crop.set({ hover: p });
export function polyClose(): boolean {
  const { points } = crop.get();
  const shape: Shape = { kind: 'poly', points };
  if (points.length < 3 || shapeIsDegenerate(shape, minSize())) return false;
  crop.set({ phase: 'pending', shape, points: [], hover: null });
  return true;
}

export const dragBegin = (p: Pt) => crop.set({ phase: 'drawing', drag: { a: p, b: p }, points: [], shape: null });
export const dragMove = (p: Pt) => crop.set((s) => (s.drag ? { drag: { a: s.drag.a, b: p } } : {}));
export function dragEnd(kind: 'rect' | 'ellipse'): boolean {
  const { drag } = crop.get();
  if (!drag) return false;
  const shape = kind === 'rect' ? rectShape(drag.a, drag.b) : ellipseShape(drag.a, drag.b);
  if (shapeIsDegenerate(shape, minSize())) {
    resetCrop();
    return false;
  }
  crop.set({ phase: 'pending', shape, drag: null });
  return true;
}

/** 描画途中のストロークだけを破棄する（マルチタッチ開始時など）。確定済みの範囲は残す。 */
export function abortStroke() {
  const s = crop.get();
  if (s.phase === 'drawing' && (s.drag || ui.get().tool === 'lasso')) resetCrop();
}
