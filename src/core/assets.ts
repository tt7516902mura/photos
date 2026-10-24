import type { Asset } from './types';

/** アセット（ピクセルデータ）のレジストリ。履歴からの参照が無くなったものは gc で解放する。 */
const registry = new Map<string, Asset>();

export const addAsset = (a: Asset) => {
  registry.set(a.id, a);
  return a;
};
export const getAsset = (id: string): Asset | undefined => registry.get(id);
export const hasAsset = (id: string) => registry.has(id);
export const assetBytes = (a: Asset) => a.width * a.height * 4;

export function gcAssets(used: Set<string>): number {
  let removed = 0;
  for (const [id, a] of registry) {
    if (!used.has(id)) {
      // キャンバスのメモリを早めに手放す
      a.canvas.width = 0;
      a.canvas.height = 0;
      registry.delete(id);
      removed++;
    }
  }
  return removed;
}

export const assetCount = () => registry.size;
export const clearAssets = () => gcAssets(new Set());
