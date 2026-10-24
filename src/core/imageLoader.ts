import { addAsset } from './assets';
import { uid } from './ids';
import { LIMITS, UserError, type Asset } from './types';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** 拡張子や file.type に頼らず、先頭バイトで形式を判定する（スマホでは type が空のことがある） */
export async function sniffImageType(blob: Blob): Promise<ImageMime | null> {
  const buf = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === 'RIFF' &&
    String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export async function decodeToCanvas(blob: Blob, label: string): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new UserError(`「${label}」を読み込めませんでした。ファイルが壊れている可能性があります。`);
  }
  try {
    const { width, height } = bmp;
    if (width < 1 || height < 1) throw new UserError(`「${label}」の画像サイズが不正です。`);
    if (width > LIMITS.maxImageSide || height > LIMITS.maxImageSide || width * height > LIMITS.maxImagePixels) {
      throw new UserError(
        `「${label}」は大きすぎます（${width}×${height}px）。長辺${LIMITS.maxImageSide}px・${Math.round(
          LIMITS.maxImagePixels / 1e6,
        )}メガピクセル以内の画像を使ってください。`,
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UserError(`「${label}」を表示するメモリを確保できませんでした。`);
    ctx.drawImage(bmp, 0, 0);
    return canvas;
  } finally {
    bmp.close();
  }
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || '画像';

/** 画像ファイルを読み込み、アセットとして登録する（外部通信なし） */
export async function loadImageFile(file: File): Promise<Asset> {
  const mime = await sniffImageType(file);
  if (!mime) {
    throw new UserError(`「${file.name}」は対応していない形式です。JPEG・PNG・WebP の画像を選んでください。`);
  }
  const canvas = await decodeToCanvas(file, file.name);
  return addAsset({
    id: uid(),
    name: baseName(file.name),
    width: canvas.width,
    height: canvas.height,
    canvas,
    blob: file,
    mime,
    cropped: false,
  });
}
