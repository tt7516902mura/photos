import type { Layer, Pt } from './types';
export type { Pt } from './types';

/**
 * 座標変換を一元化するモジュール。
 *
 *  - 画面座標 (view)  : ステージ要素左上を原点とする CSS px
 *  - ドキュメント座標 (doc): キャンバス（書き出し画像）左上を原点とする px
 *  - アセット座標 (asset): 元画像ピクセル（左上原点）
 *
 * 画面↔ドキュメントは {zoom, panX, panY}、ドキュメント↔アセットはレイヤーの
 * 中心・サイズ・角度から求めるアフィン行列で変換する。
 */

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

/** [a, b, c, d, e, f] : x' = a·x + c·y + e,  y' = b·x + d·y + f */
export type Mat = [number, number, number, number, number, number];

export const viewToDoc = (v: View, p: Pt): Pt => ({
  x: (p.x - v.panX) / v.zoom,
  y: (p.y - v.panY) / v.zoom,
});

export const docToView = (v: View, p: Pt): Pt => ({
  x: p.x * v.zoom + v.panX,
  y: p.y * v.zoom + v.panY,
});

export const apply = (m: Mat, p: Pt): Pt => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

/** multiply(A, B) = A·B（B を先に適用） */
export const multiply = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];

export const invert = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('特異行列です');
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
};

export const translation = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

/** アセット座標 → ドキュメント座標。描画（書き出し・プレビュー）と切り抜きで同じ行列を使う。 */
export function assetToDocMatrix(
  layer: Pick<Layer, 'cx' | 'cy' | 'width' | 'height' | 'angle'>,
  pw: number,
  ph: number,
): Mat {
  const sx = layer.width / pw;
  const sy = layer.height / ph;
  const th = (layer.angle * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return [a, b, c, d, layer.cx - (a * pw) / 2 - (c * ph) / 2, layer.cy - (b * pw) / 2 - (d * ph) / 2];
}

export const docToAssetMatrix = (
  layer: Pick<Layer, 'cx' | 'cy' | 'width' | 'height' | 'angle'>,
  pw: number,
  ph: number,
): Mat => invert(assetToDocMatrix(layer, pw, ph));

/** レイヤー外形の 4 頂点（ドキュメント座標, 左上から時計回り） */
export function layerCorners(layer: Pick<Layer, 'cx' | 'cy' | 'width' | 'height' | 'angle'>): Pt[] {
  const m = assetToDocMatrix(layer, layer.width, layer.height);
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: layer.width, y: 0 }),
    apply(m, { x: layer.width, y: layer.height }),
    apply(m, { x: 0, y: layer.height }),
  ];
}

export const normalizeAngle = (deg: number): number => {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Math.round(a * 1e6) / 1e6;
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
