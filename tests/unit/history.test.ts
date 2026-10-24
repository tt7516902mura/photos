import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../../src/state/history';
import type { Doc, Layer } from '../../src/core/types';

const layer = (id: string, over: Partial<Layer> = {}): Layer => ({
  id,
  name: id,
  assetId: 'a-' + id,
  cx: 0,
  cy: 0,
  width: 10,
  height: 10,
  angle: 0,
  opacity: 1,
  visible: true,
  locked: false,
  cropCount: 0,
  ...over,
});
const doc = (layers: Layer[] = []): Doc => ({ width: 100, height: 100, background: { type: 'transparent' }, layers });

describe('HistoryStore', () => {
  it('undo/redo on empty history does not throw', () => {
    const h = new HistoryStore(doc());
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it('commit / undo / redo', () => {
    const h = new HistoryStore(doc());
    h.commit(doc([layer('a')]));
    h.commit(doc([layer('a'), layer('b')]));
    expect(h.doc.layers.length).toBe(2);
    h.undo();
    expect(h.doc.layers.length).toBe(1);
    h.redo();
    expect(h.doc.layers.length).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it('coalesces a continuous drag into one entry', () => {
    const h = new HistoryStore(doc([layer('a')]));
    for (let x = 1; x <= 50; x++) h.preview(doc([layer('a', { cx: x })]));
    h.commitPreview();
    expect(h.undoDepth).toBe(1);
    h.undo();
    expect(h.doc.layers[0].cx).toBe(0);
  });

  it('commit with no net change adds no entry', () => {
    const h = new HistoryStore(doc([layer('a')]));
    h.preview(doc([layer('a', { cx: 5 })]));
    h.preview(doc([layer('a', { cx: 0 })]));
    h.commitPreview();
    expect(h.undoDepth).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('new commit clears redo stack', () => {
    const h = new HistoryStore(doc());
    h.commit(doc([layer('a')]));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.commit(doc([layer('z')]));
    expect(h.canRedo).toBe(false);
  });

  it('tracks dirty state against the saved document', () => {
    const h = new HistoryStore(doc());
    expect(h.isDirty).toBe(false);
    h.commit(doc([layer('a')]));
    expect(h.isDirty).toBe(true);
    h.markSaved();
    expect(h.isDirty).toBe(false);
    h.commit(doc([layer('a'), layer('b')]));
    h.undo();
    expect(h.isDirty).toBe(false);
  });

  it('undo during a preview just cancels the preview', () => {
    const h = new HistoryStore(doc([layer('a')]));
    h.preview(doc([layer('a', { opacity: 0.3 })]));
    h.undo();
    expect(h.doc.layers[0].opacity).toBe(1);
    expect(h.undoDepth).toBe(0);
  });
});
