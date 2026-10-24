import { uid } from './ids';
import { LIMITS, UserError, type Asset, type Background, type Doc, type Layer } from './types';

/**
 * プロジェクトファイル (.photo-project) のバイナリ形式 v1
 *
 *   offset 0  : "PHCPROJ\0"            (8 bytes, マジック)
 *   offset 8  : uint32 LE version      (= 1)
 *   offset 12 : uint32 LE manifestLen
 *   offset 16 : manifest (UTF-8 JSON)
 *   以降      : 各アセットの画像データ（PNG/JPEG/WebP）を連結。manifest.assets[i].offset は
 *               「データ領域先頭からの相対位置」。
 *
 * Base64 を使わず Blob を連結するので、大きな画像でも余分なメモリコピーが少ない。
 * 画像データを同梱するため、プロジェクトファイル単体で再編集できる。切り抜き済みの画素は
 * アルファ付き PNG として保存される。
 */
export const PROJECT_MAGIC = 'PHCPROJ\0';
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.photo-project';
const MAX_MANIFEST = 32 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

interface ManifestAsset {
  id: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  cropped: boolean;
  offset: number;
  length: number;
}
interface Manifest {
  format: 'photo-composer-project';
  version: number;
  savedAt: string;
  canvas: { width: number; height: number; background: Background };
  layers: Layer[];
  assets: ManifestAsset[];
}

export async function packProject(
  doc: Doc,
  getAsset: (id: string) => Asset | undefined,
  ensureBlob: (a: Asset) => Promise<Blob>,
): Promise<Blob> {
  const used = [...new Set(doc.layers.map((l) => l.assetId))];
  const blobs: Blob[] = [];
  const assets: ManifestAsset[] = [];
  let offset = 0;
  for (const id of used) {
    const a = getAsset(id);
    if (!a) throw new UserError('画像データが見つからないため保存できません。');
    const blob = await ensureBlob(a);
    assets.push({
      id: a.id,
      name: a.name,
      mime: blob.type || a.mime,
      width: a.width,
      height: a.height,
      cropped: a.cropped,
      offset,
      length: blob.size,
    });
    blobs.push(blob);
    offset += blob.size;
  }
  const manifest: Manifest = {
    format: 'photo-composer-project',
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    canvas: { width: doc.width, height: doc.height, background: doc.background },
    layers: doc.layers,
    assets,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const head = new ArrayBuffer(16);
  const dv = new DataView(head);
  for (let i = 0; i < 8; i++) dv.setUint8(i, PROJECT_MAGIC.charCodeAt(i));
  dv.setUint32(8, PROJECT_VERSION, true);
  dv.setUint32(12, json.length, true);
  return new Blob([head, json, ...blobs], { type: 'application/octet-stream' });
}

const bad = (msg: string) => new UserError(`プロジェクトファイルを開けません。${msg}`);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

export interface ParsedProject {
  doc: Doc;
  assets: ManifestAsset[];
  slice: (a: ManifestAsset) => Blob;
}

/** ヘッダ・バージョン・サイズ・内容を検証して manifest を取り出す（画像のデコードはしない） */
export async function parseProject(file: Blob): Promise<ParsedProject> {
  if (file.size < 16) throw bad('ファイルが小さすぎます。');
  if (file.size > LIMITS.maxProjectBytes) throw bad('ファイルが大きすぎます。');
  const head = new DataView(await file.slice(0, 16).arrayBuffer());
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(head.getUint8(i));
  if (magic !== PROJECT_MAGIC) throw bad('このアプリのプロジェクトファイルではありません。');
  const version = head.getUint32(8, true);
  if (version < 1 || version > PROJECT_VERSION) {
    throw bad(`未対応のバージョンです（v${version}）。アプリを更新してください。`);
  }
  const mlen = head.getUint32(12, true);
  if (mlen < 2 || mlen > MAX_MANIFEST || 16 + mlen > file.size) throw bad('ファイルの構造が壊れています。');

  let m: any;
  try {
    m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(16, 16 + mlen).arrayBuffer()));
  } catch {
    throw bad('管理情報を読み取れません。');
  }
  if (!m || m.format !== 'photo-composer-project' || !Array.isArray(m.layers) || !Array.isArray(m.assets)) {
    throw bad('管理情報の形式が正しくありません。');
  }
  const dataStart = 16 + mlen;
  const dataLen = file.size - dataStart;

  const c = m.canvas;
  if (
    !c ||
    !isNum(c.width) ||
    !isNum(c.height) ||
    c.width < 1 ||
    c.height < 1 ||
    c.width > LIMITS.maxCanvasSide ||
    c.height > LIMITS.maxCanvasSide ||
    c.width * c.height > LIMITS.maxCanvasPixels
  )
    throw bad('キャンバスサイズが不正です。');
  let background: Background = { type: 'transparent' };
  if (c.background?.type === 'color') {
    if (!isStr(c.background.color) || !/^#[0-9a-fA-F]{6}$/.test(c.background.color)) throw bad('背景色が不正です。');
    background = { type: 'color', color: c.background.color };
  }

  if (m.assets.length > 500 || m.layers.length > LIMITS.maxLayers) throw bad('レイヤー数または画像数が多すぎます。');
  const assets: ManifestAsset[] = [];
  const ids = new Set<string>();
  for (const a of m.assets) {
    if (
      !a ||
      !isStr(a.id) ||
      !a.id ||
      ids.has(a.id) ||
      !isNum(a.width) ||
      !isNum(a.height) ||
      !Number.isInteger(a.width) ||
      !Number.isInteger(a.height) ||
      a.width < 1 ||
      a.height < 1 ||
      a.width > LIMITS.maxImageSide ||
      a.height > LIMITS.maxImageSide ||
      a.width * a.height > LIMITS.maxImagePixels ||
      !isNum(a.offset) ||
      !isNum(a.length) ||
      a.offset < 0 ||
      a.length < 1 ||
      a.offset + a.length > dataLen ||
      !ALLOWED_MIME.has(a.mime)
    )
      throw bad('画像データの情報が壊れています。');
    ids.add(a.id);
    assets.push({
      id: a.id,
      name: isStr(a.name) ? a.name.slice(0, 200) : '画像',
      mime: a.mime,
      width: a.width,
      height: a.height,
      cropped: !!a.cropped,
      offset: a.offset,
      length: a.length,
    });
  }

  const layers: Layer[] = [];
  const lids = new Set<string>();
  for (const l of m.layers) {
    if (
      !l ||
      !isStr(l.id) ||
      !l.id ||
      lids.has(l.id) ||
      !isStr(l.assetId) ||
      !ids.has(l.assetId) ||
      !isNum(l.cx) ||
      !isNum(l.cy) ||
      !isNum(l.width) ||
      !isNum(l.height) ||
      !isNum(l.angle) ||
      !isNum(l.opacity) ||
      !(l.width > 0) ||
      !(l.height > 0) ||
      Math.abs(l.cx) > 1e6 ||
      Math.abs(l.cy) > 1e6 ||
      l.width > 1e6 ||
      l.height > 1e6
    )
      throw bad('レイヤー情報が壊れています。');
    lids.add(l.id);
    layers.push({
      id: l.id,
      name: isStr(l.name) ? l.name.slice(0, 200) : 'レイヤー',
      assetId: l.assetId,
      cx: l.cx,
      cy: l.cy,
      width: l.width,
      height: l.height,
      angle: l.angle,
      opacity: Math.min(1, Math.max(0, l.opacity)),
      visible: l.visible !== false,
      locked: l.locked === true,
      cropCount: isNum(l.cropCount) ? Math.max(0, Math.floor(l.cropCount)) : 0,
    });
  }

  return {
    doc: { width: Math.round(c.width), height: Math.round(c.height), background, layers },
    assets,
    slice: (a) => file.slice(dataStart + a.offset, dataStart + a.offset + a.length, a.mime),
  };
}

/**
 * プロジェクトを読み込む。アセット ID は衝突を避けるため新規採番し、レイヤー参照も付け替える。
 * decode は画像デコード（テストで差し替え可能）。
 */
export async function unpackProject(
  file: Blob,
  decode: (blob: Blob, label: string) => Promise<HTMLCanvasElement>,
): Promise<{ doc: Doc; assets: Asset[] }> {
  const parsed = await parseProject(file);
  const idMap = new Map<string, string>();
  const assets: Asset[] = [];
  for (const a of parsed.assets) {
    const blob = parsed.slice(a);
    const canvas = await decode(blob, a.name);
    if (canvas.width !== a.width || canvas.height !== a.height) {
      throw bad(`画像「${a.name}」のサイズが管理情報と一致しません。`);
    }
    const id = uid();
    idMap.set(a.id, id);
    assets.push({ id, name: a.name, width: a.width, height: a.height, canvas, blob, mime: a.mime, cropped: a.cropped });
  }
  const layers = parsed.doc.layers.map((l) => ({ ...l, assetId: idMap.get(l.assetId)! }));
  return { doc: { ...parsed.doc, layers }, assets };
}
