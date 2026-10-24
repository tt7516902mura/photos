import { getAsset } from './assets';
import { renderDoc } from './render';
import { UserError, type Asset, type Doc } from './types';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export const FORMAT_INFO: Record<ExportFormat, { mime: string; ext: string; label: string }> = {
  png: { mime: 'image/png', ext: 'png', label: 'PNG（透明を保持）' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG（透明は背景色になります）' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
};

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new UserError('画像のエンコードに失敗しました。メモリ不足の可能性があります。'))),
        mime,
        quality,
      );
    } catch (e) {
      reject(e);
    }
  });
}

let webpSupport: Promise<boolean> | null = null;
/** ブラウザが WebP をエンコードできるか（非対応だと toBlob が PNG を返す） */
export function canEncodeWebP(): Promise<boolean> {
  webpSupport ??= (async () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const b = await canvasToBlob(c, 'image/webp', 0.8);
      return b.type === 'image/webp';
    } catch {
      return false;
    }
  })();
  return webpSupport;
}

export interface ExportOptions {
  format: ExportFormat;
  /** 0〜1（JPEG/WebP） */
  quality: number;
  /** JPEG の背景色 */
  background: string;
}

export async function exportDoc(doc: Doc, opts: ExportOptions): Promise<Blob> {
  if (!doc.layers.some((l) => l.visible)) {
    throw new UserError('表示中のレイヤーがありません。書き出す内容がありません。');
  }
  const info = FORMAT_INFO[opts.format];
  if (opts.format === 'webp' && !(await canEncodeWebP())) {
    throw new UserError('このブラウザは WebP の書き出しに対応していません。PNG か JPEG を選んでください。');
  }
  const flatten = opts.format === 'jpeg' ? opts.background : null;
  const canvas = renderDoc(doc, getAsset, { flattenColor: flatten });
  try {
    const blob = await canvasToBlob(canvas, info.mime, opts.format === 'png' ? undefined : opts.quality);
    if (blob.type !== info.mime) throw new UserError(`${info.ext.toUpperCase()} に変換できませんでした。別の形式を選んでください。`);
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** 保存時にアセットを Blob 化する（元ファイルがあればそのまま、切り抜き後は PNG） */
export async function ensureAssetBlob(a: Asset): Promise<Blob> {
  if (a.blob) return a.blob;
  const b = await canvasToBlob(a.canvas, 'image/png');
  a.blob = b;
  a.mime = 'image/png';
  return b;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // ダウンロード開始後に Blob URL を解放する
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const sanitizeFileName = (n: string) =>
  (n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 100) || 'composition');
