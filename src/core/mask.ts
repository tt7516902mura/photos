import { apply, assetToDocMatrix, docToAssetMatrix, multiply, translation, type Mat } from './coords';
import { UserError, type Layer, type Pt, type Shape } from './types';

/**
 * 自己交差した投げ縄・多角形の塗りつぶし規則。
 * 'nonzero'（非ゼロ巻き数）: 線で囲まれた領域は、ループが重なっても全て選択範囲になる。
 * プレビュー表示と実際の切り抜きで同じ規則を使うので、見えている範囲＝切り抜かれる範囲。
 */
export const FILL_RULE: CanvasFillRule = 'nonzero';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 現在の変換行列の下で選択範囲のパスを作る（塗り・線は呼び出し側） */
export function traceShape(ctx: Ctx, s: Shape) {
  ctx.beginPath();
  if (s.kind === 'poly') {
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  } else {
    ctx.ellipse(s.cx, s.cy, Math.abs(s.rx), Math.abs(s.ry), 0, 0, Math.PI * 2);
  }
}

/** パス上の点列（境界ボックス計算用） */
export function shapeOutline(s: Shape, segments = 256): Pt[] {
  if (s.kind === 'poly') return s.points;
  const pts: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: s.cx + s.rx * Math.cos(t), y: s.cy + s.ry * Math.sin(t) });
  }
  return pts;
}

export const rectShape = (a: Pt, b: Pt): Shape => ({
  kind: 'poly',
  points: [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
  ],
});

export const ellipseShape = (a: Pt, b: Pt): Shape => ({
  kind: 'ellipse',
  cx: (a.x + b.x) / 2,
  cy: (a.y + b.y) / 2,
  rx: Math.abs(b.x - a.x) / 2,
  ry: Math.abs(b.y - a.y) / 2,
});

/** 面積（ほぼ 0 のものは選択範囲として扱わない） */
export function shapeIsDegenerate(s: Shape, minSize: number): boolean {
  if (s.kind === 'ellipse') return s.rx * 2 < minSize || s.ry * 2 < minSize;
  if (s.points.length < 3) return true;
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  return Math.max(...xs) - Math.min(...xs) < minSize || Math.max(...ys) - Math.min(...ys) < minSize;
}

export interface CropResult {
  canvas: HTMLCanvasElement;
  /** 新しいレイヤー形状（位置・サイズ・角度は見た目が変わらないように計算済み） */
  geometry: Pick<Layer, 'cx' | 'cy' | 'width' | 'height' | 'angle'>;
  /** 元アセット内で切り出した矩形（ピクセル） */
  rect: { x: number; y: number; w: number; h: number };
}

/**
 * アルファマスクによる切り抜き。
 *  1. 選択範囲をアセット座標へ変換し、画像と重なる最小の矩形に切り詰める
 *  2. 元画像をそのまま（リサンプリングなし）新キャンバスにコピー
 *  3. destination-in で選択範囲のパスを塗り、範囲外のアルファを 0 にする
 * 元画像の透明度は保持される（アルファは掛け算）。範囲の縁はアンチエイリアスされる。
 */
export function cropAsset(
  src: HTMLCanvasElement,
  layer: Layer,
  shape: Shape,
  createCanvas: (w: number, h: number) => HTMLCanvasElement = defaultCreateCanvas,
): CropResult {
  const pw = src.width;
  const ph = src.height;
  const toDoc: Mat = assetToDocMatrix(layer, pw, ph);
  const toAsset: Mat = docToAssetMatrix(layer, pw, ph);

  const pts = shapeOutline(shape).map((p) => apply(toAsset, p));
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = Math.max(0, Math.floor(minX) - 1);
  const y0 = Math.max(0, Math.floor(minY) - 1);
  const x1 = Math.min(pw, Math.ceil(maxX) + 1);
  const y1 = Math.min(ph, Math.ceil(maxY) + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w >= 1 && h >= 1)) throw new UserError('選択範囲がレイヤーの画像と重なっていません。');

  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  if (!ctx) throw new UserError('切り抜き用のキャンバスを作れませんでした（メモリ不足の可能性があります）。');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, w, h);

  ctx.globalCompositeOperation = 'destination-in';
  const m = multiply(translation(-x0, -y0), toAsset);
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  traceShape(ctx, shape);
  ctx.fillStyle = '#000';
  ctx.fill(FILL_RULE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  const center = apply(toDoc, { x: x0 + w / 2, y: y0 + h / 2 });
  return {
    canvas: out,
    rect: { x: x0, y: y0, w, h },
    geometry: {
      cx: center.x,
      cy: center.y,
      width: (w * layer.width) / pw,
      height: (h * layer.height) / ph,
      angle: layer.angle,
    },
  };
}

function defaultCreateCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
