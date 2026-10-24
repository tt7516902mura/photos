import { assetBytes, gcAssets, getAsset } from '../core/assets';
import { LIMITS, type Doc } from '../core/types';

/**
 * ドキュメントのスナップショット履歴。
 * スナップショットはレイヤーのメタデータ（小さい）だけを持ち、ピクセルは assetId で参照する。
 * したがって履歴ごとに画像を複製せず、参照されなくなったアセットだけを解放する。
 *
 *  - preview(): ドラッグ中などの連続変更。履歴には積まず、commitPreview() で 1 エントリにまとめる。
 *  - commit(): 1 操作 = 1 履歴。
 */
export class HistoryStore {
  private present: Doc;
  private past: Doc[] = [];
  private future: Doc[] = [];
  private previewBase: Doc | null = null;
  private savedDoc: Doc;
  private listeners = new Set<() => void>();
  /** 変更のたびに増える（React の再描画判定用） */
  version = 0;

  constructor(initial: Doc) {
    this.present = initial;
    this.savedDoc = initial;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get doc(): Doc {
    return this.present;
  }
  get canUndo() {
    return this.past.length > 0 || this.previewBase !== null;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get isDirty() {
    return this.present !== this.savedDoc;
  }
  get undoDepth() {
    return this.past.length;
  }
  get redoDepth() {
    return this.future.length;
  }

  markSaved() {
    this.savedDoc = this.present;
    this.emit();
  }

  /** 新しいプロジェクトとして履歴ごと置き換える */
  reset(doc: Doc) {
    this.present = doc;
    this.savedDoc = doc;
    this.past = [];
    this.future = [];
    this.previewBase = null;
    this.collect();
    this.emit();
  }

  commit(next: Doc) {
    const base = this.previewBase ?? this.present;
    this.previewBase = null;
    if (docEquals(base, next)) {
      // 変更なし。プレビューで present が動いていた場合は元に戻す
      this.present = base;
      this.emit();
      return;
    }
    this.past.push(base);
    this.future = [];
    this.present = next;
    this.trim();
    this.collect();
    this.emit();
  }

  preview(next: Doc) {
    if (!this.previewBase) this.previewBase = this.present;
    this.present = next;
    this.emit();
  }

  /** プレビュー中の状態を 1 つの履歴として確定する */
  commitPreview() {
    if (!this.previewBase) return;
    this.commit(this.present);
  }

  cancelPreview() {
    if (!this.previewBase) return;
    this.present = this.previewBase;
    this.previewBase = null;
    this.emit();
  }

  undo(): boolean {
    if (this.previewBase) {
      this.cancelPreview();
      return true;
    }
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(this.present);
    this.present = prev;
    this.emit();
    return true;
  }

  redo(): boolean {
    if (this.previewBase) this.cancelPreview();
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.present);
    this.present = next;
    this.emit();
    return true;
  }

  private referencedAssets(): Set<string> {
    const used = new Set<string>();
    const add = (d: Doc | null) => d?.layers.forEach((l) => used.add(l.assetId));
    add(this.present);
    add(this.previewBase);
    this.past.forEach(add);
    this.future.forEach(add);
    return used;
  }

  /** 履歴の本数・メモリ使用量の上限を超えた古いエントリを捨てる */
  private trim() {
    while (this.past.length > LIMIT_COUNT()) this.past.shift();
    while (this.past.length > 1 && this.bytes() > LIMITS.historyBytes) this.past.shift();
  }

  private bytes(): number {
    let sum = 0;
    for (const id of this.referencedAssets()) {
      const a = getAsset(id);
      if (a) sum += assetBytes(a);
    }
    return sum;
  }

  private collect() {
    gcAssets(this.referencedAssets());
  }
}

const LIMIT_COUNT = () => LIMITS.historyLimit;

export function docEquals(a: Doc, b: Doc): boolean {
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height) return false;
  if (JSON.stringify(a.background) !== JSON.stringify(b.background)) return false;
  if (a.layers.length !== b.layers.length) return false;
  for (let i = 0; i < a.layers.length; i++) {
    const x = a.layers[i] as any;
    const y = b.layers[i] as any;
    for (const k in x) if (x[k] !== y[k]) return false;
  }
  return true;
}
