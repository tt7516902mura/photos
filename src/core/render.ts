import { assetToDocMatrix } from './coords';
import { LIMITS, UserError, type Asset, type Doc } from './types';

export interface RenderOptions {
  /** 指定すると背景をこの色で塗りつぶす（JPEG など透明を持てない形式用）。null なら Doc の背景設定に従う。 */
  flattenColor?: string | null;
}

/** 書き出し用レンダリング。画面のズーム・パンには一切依存しない（ドキュメント実寸）。選択枠やハンドルは含まない。 */
export function renderDoc(
  doc: Doc,
  getAsset: (id: string) => Asset | undefined,
  opts: RenderOptions = {},
): HTMLCanvasElement {
  if (
    doc.width > LIMITS.maxCanvasSide ||
    doc.height > LIMITS.maxCanvasSide ||
    doc.width * doc.height > LIMITS.maxCanvasPixels
  ) {
    throw new UserError('キャンバスが大きすぎて書き出せません。キャンバスサイズを小さくしてください。');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(doc.width);
  canvas.height = Math.round(doc.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UserError('書き出し用のキャンバスを作れませんでした（メモリ不足の可能性があります）。');

  const bg = opts.flattenColor ?? (doc.background.type === 'color' ? doc.background.color : null);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const asset = getAsset(layer.assetId);
    if (!asset) continue;
    const m = assetToDocMatrix(layer, asset.width, asset.height);
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(asset.canvas, 0, 0);
    ctx.restore();
  }
  return canvas;
}
