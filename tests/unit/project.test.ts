import { describe, expect, it } from 'vitest';
import { packProject, parseProject, unpackProject } from '../../src/core/project';
import type { Asset, Doc } from '../../src/core/types';

const fakeCanvas = (w: number, h: number) => ({ width: w, height: h }) as unknown as HTMLCanvasElement;
const png = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'image/png' });

function sample() {
  const a1: Asset = { id: 'A1', name: 'one', width: 4, height: 3, canvas: fakeCanvas(4, 3), blob: png(10), mime: 'image/png', cropped: false };
  const a2: Asset = { id: 'A2', name: 'two', width: 2, height: 2, canvas: fakeCanvas(2, 2), blob: png(25), mime: 'image/png', cropped: true };
  const doc: Doc = {
    width: 800,
    height: 600,
    background: { type: 'color', color: '#112233' },
    layers: [
      { id: 'L1', name: 'bottom', assetId: 'A1', cx: 100, cy: 120, width: 40, height: 30, angle: 15, opacity: 0.5, visible: true, locked: false, cropCount: 0 },
      { id: 'L2', name: 'top', assetId: 'A2', cx: 300, cy: 220, width: 20, height: 20, angle: -90, opacity: 1, visible: false, locked: true, cropCount: 2 },
    ],
  };
  const map = new Map([a1, a2].map((a) => [a.id, a]));
  return { doc, get: (id: string) => map.get(id), ensure: async (a: Asset) => a.blob! };
}

describe('project file format', () => {
  it('round-trips layers, order, transforms, flags, cropCount and images', async () => {
    const { doc, get, ensure } = sample();
    const file = await packProject(doc, get, ensure);
    const { doc: out, assets } = await unpackProject(file, async (blob, _l) => {
      // 画像データがそのまま同梱されている
      return blob.size === 10 ? fakeCanvas(4, 3) : fakeCanvas(2, 2);
    });
    expect(out.width).toBe(800);
    expect(out.background).toEqual({ type: 'color', color: '#112233' });
    expect(out.layers.map((l) => l.name)).toEqual(['bottom', 'top']);
    expect(out.layers[0]).toMatchObject({ cx: 100, cy: 120, width: 40, height: 30, angle: 15, opacity: 0.5 });
    expect(out.layers[1]).toMatchObject({ visible: false, locked: true, cropCount: 2, angle: -90 });
    expect(assets).toHaveLength(2);
    expect(assets[1].cropped).toBe(true);
    // 参照が新 ID に付け替えられている
    expect(out.layers[0].assetId).toBe(assets[0].id);
    expect(out.layers[1].assetId).toBe(assets[1].id);
    expect(assets[1].blob!.size).toBe(25);
  });

  it('rejects files that are not projects', async () => {
    await expect(parseProject(new Blob(['hello world this is not a project']))).rejects.toThrow(/プロジェクト/);
    await expect(parseProject(new Blob([]))).rejects.toThrow();
  });

  it('rejects unknown future versions', async () => {
    const { doc, get, ensure } = sample();
    const bytes = new Uint8Array(await (await packProject(doc, get, ensure)).arrayBuffer());
    new DataView(bytes.buffer).setUint32(8, 99, true);
    await expect(parseProject(new Blob([bytes]))).rejects.toThrow(/バージョン/);
  });

  it('rejects truncated files and bogus manifest lengths', async () => {
    const { doc, get, ensure } = sample();
    const bytes = new Uint8Array(await (await packProject(doc, get, ensure)).arrayBuffer());
    await expect(parseProject(new Blob([bytes.slice(0, bytes.length - 5)]))).rejects.toThrow();
    const bad = bytes.slice();
    new DataView(bad.buffer).setUint32(12, 0x7fffffff, true);
    await expect(parseProject(new Blob([bad]))).rejects.toThrow();
  });

  it('rejects layers pointing at missing assets', async () => {
    const { doc, get, ensure } = sample();
    doc.layers[0].assetId = 'A1';
    const file = await packProject(doc, get, ensure);
    const text = await file.text();
    // manifest 内の assetId を壊す（長さを変えない）
    const broken = new Blob([text.replace('"assetId":"A2"', '"assetId":"ZZ"')]);
    await expect(parseProject(broken)).rejects.toThrow();
  });

  it('rejects declared/decoded size mismatch', async () => {
    const { doc, get, ensure } = sample();
    const file = await packProject(doc, get, ensure);
    await expect(unpackProject(file, async () => fakeCanvas(9, 9))).rejects.toThrow(/サイズ/);
  });
});
