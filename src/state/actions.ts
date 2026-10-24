import { addAsset, getAsset } from '../core/assets';
import { cropAsset } from '../core/mask';
import { normalizeAngle } from '../core/coords';
import { uid } from '../core/ids';
import { decodeToCanvas, loadImageFile } from '../core/imageLoader';
import { packProject, PROJECT_EXT, unpackProject } from '../core/project';
import {
  downloadBlob,
  ensureAssetBlob,
  exportDoc,
  FORMAT_INFO,
  sanitizeFileName,
  type ExportOptions,
} from '../core/exporter';
import { LIMITS, UserError, isCropTool, type Background, type Doc, type Layer, type Tool } from '../core/types';
import { crop, resetCrop } from './crop';
import { DEFAULT_DOC, history, resetEditor } from './editor';
import { toast, ui } from './ui';
import { fitView } from './view';

// ---------- ユーティリティ ----------

const errText = (e: unknown) =>
  e instanceof UserError ? e.message : `予期しないエラーが発生しました：${(e as Error)?.message ?? e}`;

export async function withBusy<T>(message: string, fn: () => Promise<T>): Promise<T | undefined> {
  ui.set({ busy: message });
  // ブラウザにスピナーを描画させてから重い処理を始める
  await new Promise((r) => setTimeout(r, 30));
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast('error', errText(e));
    return undefined;
  } finally {
    ui.set({ busy: null });
  }
}

const findLayer = (id: string | null) => (id ? history.doc.layers.find((l) => l.id === id) : undefined);
export const selectedLayer = () => findLayer(ui.get().selectedId);

function withLayers(layers: Layer[]): Doc {
  return { ...history.doc, layers };
}

// ---------- 選択・ツール ----------

export function selectLayer(id: string | null) {
  if (ui.get().selectedId !== id) resetCrop();
  ui.set({ selectedId: id });
}

export function setTool(tool: Tool) {
  resetCrop();
  ui.set({ tool });
}

// ---------- 画像追加 ----------

export async function addFiles(files: File[]) {
  const list = files.filter(Boolean);
  if (!list.length) return;
  await withBusy(list.length > 1 ? `${list.length} 枚の画像を読み込み中…` : '画像を読み込み中…', async () => {
    const added: Layer[] = [];
    const errors: string[] = [];
    for (const f of list) {
      if (history.doc.layers.length + added.length >= LIMITS.maxLayers) {
        errors.push(`レイヤーは最大 ${LIMITS.maxLayers} 枚までです。`);
        break;
      }
      try {
        const asset = await loadImageFile(f);
        const d = history.doc;
        const scale = Math.min(1, (d.width * 0.9) / asset.width, (d.height * 0.9) / asset.height);
        added.push({
          id: uid(),
          name: asset.name,
          assetId: asset.id,
          cx: d.width / 2,
          cy: d.height / 2,
          width: asset.width * scale,
          height: asset.height * scale,
          angle: 0,
          opacity: 1,
          visible: true,
          locked: false,
          cropCount: 0,
        });
      } catch (e) {
        errors.push(errText(e));
      }
    }
    if (added.length) {
      history.commit(withLayers([...history.doc.layers, ...added]));
      ui.set({ selectedId: added[added.length - 1].id });
      toast('success', `${added.length} 枚の画像を追加しました。`);
    }
    // エラーはまとめて表示（アプリは止まらない）
    [...new Set(errors)].slice(0, 3).forEach((m) => toast('error', m));
  });
}

/** 画像ファイルまたはプロジェクトファイルの混在入力（ドロップ・貼り付け用） */
export async function handleIncomingFiles(files: File[]) {
  const proj = files.find((f) => f.name.toLowerCase().endsWith(PROJECT_EXT));
  if (proj) {
    requestOpenProject(proj);
    return;
  }
  await addFiles(files);
}

// ---------- レイヤー操作 ----------

export function updateLayer(id: string, patch: Partial<Layer>, mode: 'commit' | 'preview' = 'commit') {
  const layers = history.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
  const next = withLayers(layers);
  if (mode === 'preview') history.preview(next);
  else history.commit(next);
}

/** 数値入力（X/Y/幅/高さ/角度）。縦横比固定が有効なら幅⇔高さを連動させる。 */
export function setGeometry(id: string, key: 'cx' | 'cy' | 'width' | 'height' | 'angle', value: number) {
  const l = findLayer(id);
  if (!l || l.locked || !Number.isFinite(value)) return;
  const patch: Partial<Layer> = {};
  if (key === 'angle') patch.angle = normalizeAngle(value);
  else if (key === 'cx' || key === 'cy') patch[key] = Math.max(-1e5, Math.min(1e5, value));
  else {
    const v = Math.max(1, Math.min(1e5, value));
    patch[key] = v;
    if (ui.get().lockAspect) {
      const ratio = l.width / l.height;
      if (key === 'width') patch.height = Math.max(1, v / ratio);
      else patch.width = Math.max(1, v * ratio);
    }
  }
  updateLayer(id, patch);
}

export function renameLayer(id: string, name: string) {
  const n = name.trim().slice(0, 100);
  if (!n) return;
  updateLayer(id, { name: n });
}

export const toggleVisible = (id: string) => {
  const l = findLayer(id);
  if (l) updateLayer(id, { visible: !l.visible });
};
export const toggleLocked = (id: string) => {
  const l = findLayer(id);
  if (l) updateLayer(id, { locked: !l.locked });
};

export function deleteLayer(id: string) {
  const l = findLayer(id);
  if (!l) return;
  if (l.locked) return toast('info', 'ロック中のレイヤーは削除できません。先にロックを解除してください。');
  history.commit(withLayers(history.doc.layers.filter((x) => x.id !== id)));
  ui.set({ selectedId: null });
  toast('info', `「${l.name}」を削除しました（元に戻せます）。`);
}

export function duplicateLayer(id: string) {
  const layers = history.doc.layers;
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  if (layers.length >= LIMITS.maxLayers) return toast('error', `レイヤーは最大 ${LIMITS.maxLayers} 枚までです。`);
  const src = layers[i];
  const copy: Layer = { ...src, id: uid(), name: `${src.name} のコピー`, cx: src.cx + 24, cy: src.cy + 24, locked: false };
  const next = [...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)];
  history.commit(withLayers(next));
  ui.set({ selectedId: copy.id });
}

export type MoveOp = 'front' | 'forward' | 'backward' | 'back';
export function moveLayer(id: string, op: MoveOp) {
  const layers = [...history.doc.layers];
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const [l] = layers.splice(i, 1);
  const j = op === 'front' ? layers.length : op === 'back' ? 0 : op === 'forward' ? i + 1 : i - 1;
  layers.splice(Math.max(0, Math.min(layers.length, j)), 0, l);
  history.commit(withLayers(layers));
}

export const canMove = (id: string, op: MoveOp) => {
  const layers = history.doc.layers;
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return false;
  return op === 'front' || op === 'forward' ? i < layers.length - 1 : i > 0;
};

// ---------- Undo / Redo ----------

export function undo() {
  if (history.undo()) resetCrop();
}
export function redo() {
  if (history.redo()) resetCrop();
}

// ---------- 切り抜き ----------

export function applyCrop(): boolean {
  const { shape } = crop.get();
  const layer = selectedLayer();
  if (!shape) return false;
  if (!layer) {
    toast('info', '切り抜くレイヤーを選択してください。');
    return false;
  }
  if (layer.locked) {
    toast('info', 'ロック中のレイヤーは切り抜けません。ロックを解除してください。');
    return false;
  }
  if (!layer.visible) {
    toast('info', '非表示のレイヤーは切り抜けません。表示に切り替えてください。');
    return false;
  }
  const asset = getAsset(layer.assetId);
  if (!asset) return false;
  try {
    const res = cropAsset(asset.canvas, layer, shape);
    const newAsset = addAsset({
      id: uid(),
      name: asset.name,
      width: res.canvas.width,
      height: res.canvas.height,
      canvas: res.canvas,
      blob: null,
      mime: 'image/png',
      cropped: true,
    });
    updateLayer(layer.id, { assetId: newAsset.id, ...res.geometry, cropCount: layer.cropCount + 1 });
    resetCrop();
    toast('success', '選択範囲の外側を透明にしました。');
    return true;
  } catch (e) {
    console.error(e);
    toast('error', errText(e));
    return false;
  }
}

// ---------- キャンバス設定 ----------

export function setCanvasSettings(width: number, height: number, background: Background) {
  const w = Math.round(width);
  const h = Math.round(height);
  if (
    !(w >= 16 && h >= 16) ||
    w > LIMITS.maxCanvasSide ||
    h > LIMITS.maxCanvasSide ||
    w * h > LIMITS.maxCanvasPixels
  ) {
    throw new UserError(
      `キャンバスは 16〜${LIMITS.maxCanvasSide}px（面積 ${LIMITS.maxCanvasPixels / 1e6} メガピクセル以内）で指定してください。`,
    );
  }
  const sizeChanged = w !== history.doc.width || h !== history.doc.height;
  history.commit({ ...history.doc, width: w, height: h, background });
  if (sizeChanged) fitView();
}

// ---------- プロジェクト ----------

function guardUnsaved(action: () => void | Promise<void>, title: string) {
  if (!history.isDirty) {
    void action();
    return;
  }
  ui.set({
    dialog: {
      type: 'confirm',
      title,
      message: '保存されていない変更があります。このまま進むと変更内容は失われます。',
      buttons: [
        { label: 'キャンセル', run: () => {} },
        {
          label: '保存してから続ける',
          kind: 'primary',
          run: async () => {
            if (await saveProject()) await action();
          },
        },
        { label: '破棄して続ける', kind: 'danger', run: action },
      ],
    },
  });
}

export function requestNewProject() {
  guardUnsaved(() => {
    resetEditor({ ...DEFAULT_DOC, layers: [] });
    ui.set({ projectName: '無題' });
    fitView();
  }, '新規プロジェクト');
}

export function requestOpenProject(file: File) {
  guardUnsaved(() => openProject(file), 'プロジェクトを開く');
}

export async function openProject(file: File) {
  await withBusy('プロジェクトを読み込み中…', async () => {
    const { doc, assets } = await unpackProject(file, decodeToCanvas);
    assets.forEach(addAsset);
    resetEditor(doc);
    ui.set({ projectName: file.name.replace(/\.photo-project$/i, '') || '無題' });
    fitView();
    toast('success', 'プロジェクトを開きました。');
  });
}

export async function saveProject(): Promise<boolean> {
  const ok = await withBusy('プロジェクトを保存中…', async () => {
    const blob = await packProject(history.doc, getAsset, ensureAssetBlob);
    const stem = ui.get().projectName === '無題' ? 'project' : ui.get().projectName;
    downloadBlob(blob, `${sanitizeFileName(stem)}${PROJECT_EXT}`);
    history.markSaved();
    toast('success', 'プロジェクトを保存しました（画像データを含む 1 ファイルです）。');
    return true;
  });
  return ok === true;
}

// ---------- 書き出し ----------

export async function exportImage(opts: ExportOptions, baseName: string): Promise<boolean> {
  const ok = await withBusy('画像を書き出し中…', async () => {
    const blob = await exportDoc(history.doc, opts);
    downloadBlob(blob, `${sanitizeFileName(baseName)}.${FORMAT_INFO[opts.format].ext}`);
    toast('success', `${FORMAT_INFO[opts.format].ext.toUpperCase()} を書き出しました。`);
    return true;
  });
  return ok === true;
}

export function openExportDialog() {
  if (!history.doc.layers.some((l) => l.visible)) {
    toast('info', '書き出す画像がありません。先に画像を追加してください。');
    return;
  }
  ui.set({ dialog: { type: 'export' } });
}

export const closeDialog = () => ui.set({ dialog: null });

export { isCropTool };
