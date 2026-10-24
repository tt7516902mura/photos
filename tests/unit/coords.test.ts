import { describe, expect, it } from 'vitest';
import {
  apply,
  assetToDocMatrix,
  docToAssetMatrix,
  docToView,
  invert,
  layerCorners,
  multiply,
  normalizeAngle,
  viewToDoc,
} from '../../src/core/coords';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('view <-> doc', () => {
  it('round-trips at any zoom/pan', () => {
    for (const zoom of [0.05, 0.5, 1, 3.7, 16]) {
      const v = { zoom, panX: 123.4, panY: -56.7 };
      const p = { x: 321.5, y: 88.25 };
      const back = viewToDoc(v, docToView(v, p));
      close(back.x, p.x);
      close(back.y, p.y);
    }
  });
});

describe('asset <-> doc', () => {
  const layer = { cx: 500, cy: 300, width: 400, height: 200, angle: 30 };
  it('maps asset centre to layer centre', () => {
    const m = assetToDocMatrix(layer, 2000, 1000);
    const c = apply(m, { x: 1000, y: 500 });
    close(c.x, 500);
    close(c.y, 300);
  });
  it('inverse is exact', () => {
    const m = assetToDocMatrix(layer, 2000, 1000);
    const inv = docToAssetMatrix(layer, 2000, 1000);
    const p = apply(inv, apply(m, { x: 123, y: 456 }));
    close(p.x, 123);
    close(p.y, 456);
    const id = multiply(m, invert(m));
    close(id[0], 1);
    close(id[3], 1);
    close(id[4], 0);
  });
  it('rotates clockwise (y down) and scales', () => {
    const l = { cx: 0, cy: 0, width: 100, height: 100, angle: 90 };
    // asset point (right-centre) -> after 90deg clockwise lands bottom-centre
    const p = apply(assetToDocMatrix(l, 100, 100), { x: 100, y: 50 });
    close(p.x, 0);
    close(p.y, 50);
  });
  it('layer corners of unrotated layer', () => {
    const c = layerCorners({ cx: 100, cy: 50, width: 40, height: 20, angle: 0 });
    close(c[0].x, 80);
    close(c[0].y, 40);
    close(c[2].x, 120);
    close(c[2].y, 60);
  });
  it('zoom does not change asset coordinates of a doc point', () => {
    // 選択範囲の docs 座標 → アセット座標はビューに依存しない
    const docPt = { x: 410, y: 280 };
    const results = [0.25, 1, 4].map((zoom) => {
      const v = { zoom, panX: 17, panY: 9 };
      const screen = docToView(v, docPt);
      const d = viewToDoc(v, screen);
      return apply(docToAssetMatrix(layer, 2000, 1000), d);
    });
    close(results[0].x, results[1].x);
    close(results[1].y, results[2].y);
  });
});

describe('normalizeAngle', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(180)).toBe(180);
  });
});
