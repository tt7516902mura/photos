import { Canvas, FabricImage, type FabricObject } from 'fabric';
import { getAsset } from '../core/assets';
import { normalizeAngle, type Pt, type View } from '../core/coords';
import type { Doc, Layer, Tool } from '../core/types';
import { abortStroke } from '../state/crop';
import { history } from '../state/editor';
import { selectLayer } from '../state/actions';
import { ui } from '../state/ui';
import { fitView, panBy, zoomAt } from '../state/view';

const ACCENT = '#f2a43a';

type LayerImage = FabricImage & { layerId?: string };

/**
 * Fabric.js のキャンバスを管理するコントローラ。
 *
 * 単一の真実のソースは history（ドキュメント）と ui（選択・ツール・ビュー）。
 * Fabric のオブジェクトはそれらから同期される「表示・操作用の写し」で、
 * ユーザー操作の結果は必ず history に書き戻す（ドラッグ中は preview、終了時に 1 履歴として commit）。
 * 画面の拡大率・パンは viewportTransform だけで表現し、レイヤーの座標は常にドキュメント座標。
 */
export class StageController {
  readonly canvas: Canvas;
  private objs = new Map<string, LayerImage>();
  private objAsset = new Map<string, string>();
  private syncing = false;
  private ignoreEvents = false;
  private liveId: string | null = null;
  private resizeObs: ResizeObserver;
  private unsubs: (() => void)[] = [];
  private checker: CanvasPattern | null = null;
  private checkerDpr = 0;

  // ジェスチャー
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private passedToFabric = new Set<number>();
  private swallow = new Set<number>();
  private gesture: { lastDist: number; lastMid: Pt } | null = null;
  private panning: { id: number; x: number; y: number } | null = null;
  private synthetic = false;
  private spaceDown = false;
  private coarse = false;

  constructor(
    el: HTMLCanvasElement,
    private host: HTMLElement,
  ) {
    this.canvas = new Canvas(el, {
      enablePointerEvents: true,
      selection: false,
      preserveObjectStacking: true,
      renderOnAddRemove: false,
      stopContextMenu: true,
      fireRightClick: false,
      width: Math.max(10, host.clientWidth),
      height: Math.max(10, host.clientHeight),
      uniformScaling: true,
    });
    const wrap = this.canvas.wrapperEl;
    wrap.style.position = 'absolute';
    wrap.style.inset = '0';

    this.canvas.on('before:render', ({ ctx }) => this.drawBackdrop(ctx as CanvasRenderingContext2D));
    this.canvas.on('after:render', ({ ctx }) => this.drawArtboardFrame(ctx as CanvasRenderingContext2D));
    this.canvas.on('selection:created', (e) => this.onFabricSelection(e.selected?.[0]));
    this.canvas.on('selection:updated', (e) => this.onFabricSelection(e.selected?.[0]));
    this.canvas.on('selection:cleared', () => this.onFabricSelection(undefined));
    for (const ev of ['object:moving', 'object:scaling', 'object:rotating'] as const) {
      this.canvas.on(ev, (e) => this.onLive(e.target as LayerImage));
    }
    this.canvas.on('object:modified', (e) => this.onModified(e.target as LayerImage));

    // ビュー操作（ホイール・パン・ピンチ）
    host.addEventListener('pointerdown', this.onDown, { capture: true });
    window.addEventListener('pointermove', this.onMove, { capture: true });
    window.addEventListener('pointerup', this.onUp, { capture: true });
    window.addEventListener('pointercancel', this.onUp, { capture: true });
    host.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);

    this.unsubs.push(history.subscribe(() => this.syncAll()));
    this.unsubs.push(ui.subscribe(() => this.syncAll()));
    this.resize();
    this.syncAll();
  }

  dispose() {
    this.unsubs.forEach((u) => u());
    this.resizeObs.disconnect();
    this.host.removeEventListener('pointerdown', this.onDown, { capture: true });
    window.removeEventListener('pointermove', this.onMove, { capture: true });
    window.removeEventListener('pointerup', this.onUp, { capture: true });
    window.removeEventListener('pointercancel', this.onUp, { capture: true });
    this.host.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    void this.canvas.dispose();
  }

  // ---------- リサイズ・ビュー ----------

  private resize() {
    const w = Math.max(10, Math.round(this.host.clientWidth));
    const h = Math.max(10, Math.round(this.host.clientHeight));
    if (w !== this.canvas.getWidth() || h !== this.canvas.getHeight()) {
      this.canvas.setDimensions({ width: w, height: h });
    }
    const s = ui.get();
    if (s.stageW !== w || s.stageH !== h) {
      ui.set({ stageW: w, stageH: h });
      if (s.fitted) fitView();
    }
    this.canvas.requestRenderAll();
  }

  private lastView: View | null = null;
  private applyView(v: View) {
    if (this.lastView && this.lastView.zoom === v.zoom && this.lastView.panX === v.panX && this.lastView.panY === v.panY) return;
    this.lastView = v;
    this.canvas.setViewportTransform([v.zoom, 0, 0, v.zoom, v.panX, v.panY]);
    // ズームが変わったらコントロール座標を更新
    this.objs.forEach((o) => o.setCoords());
  }

  // ---------- ドキュメント → Fabric の同期 ----------

  private objectDefaults() {
    return {
      originX: 'center' as const,
      originY: 'center' as const,
      objectCaching: false,
      lockScalingFlip: true,
      lockSkewingX: true,
      lockSkewingY: true,
      cornerStyle: 'circle' as const,
      cornerColor: '#ffffff',
      cornerStrokeColor: ACCENT,
      transparentCorners: false,
      borderColor: ACCENT,
      borderScaleFactor: 2,
      padding: 0,
      ...this.cornerSizes(),
    };
  }
  private cornerSizes() {
    return { cornerSize: this.coarse ? 26 : 13, touchCornerSize: 44 };
  }

  syncAll() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const s = ui.get();
      this.applyView(s.view);
      this.applyTool(s.tool);
      this.syncDoc(history.doc, s.selectedId, s.tool, s.lockAspect);
    } finally {
      this.syncing = false;
    }
    this.canvas.requestRenderAll();
  }

  private applyTool(tool: Tool) {
    const c = this.canvas;
    c.skipTargetFind = tool !== 'select';
    c.defaultCursor = tool === 'hand' ? (this.panning ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : 'crosshair';
    c.hoverCursor = tool === 'select' ? 'move' : c.defaultCursor;
    this.host.dataset.tool = tool;
  }

  private syncDoc(doc: Doc, selectedId: string | null, tool: Tool, lockAspect: boolean) {
    const c = this.canvas;
    const alive = new Set(doc.layers.map((l) => l.id));
    for (const [id, o] of this.objs) {
      if (!alive.has(id)) {
        c.remove(o);
        this.objs.delete(id);
        this.objAsset.delete(id);
      }
    }
    doc.layers.forEach((layer, index) => {
      const asset = getAsset(layer.assetId);
      if (!asset) return;
      let o = this.objs.get(layer.id);
      if (!o) {
        o = new FabricImage(asset.canvas, this.objectDefaults()) as LayerImage;
        o.layerId = layer.id;
        this.objs.set(layer.id, o);
        this.objAsset.set(layer.id, layer.assetId);
        c.add(o);
      } else if (this.objAsset.get(layer.id) !== layer.assetId) {
        o.setElement(asset.canvas);
        this.objAsset.set(layer.id, layer.assetId);
      }
      if (this.liveId !== layer.id) this.applyLayer(o, layer, asset.width, asset.height);
      o.set({ cornerSize: this.cornerSizes().cornerSize });
      o.setControlsVisibility({ ml: !lockAspect, mr: !lockAspect, mt: !lockAspect, mb: !lockAspect });
      if (c.getObjects()[index] !== o) c.moveObjectTo(o, index);
    });

    const sel = selectedId ? this.objs.get(selectedId) : undefined;
    const want = tool === 'select' && sel && sel.visible ? sel : undefined;
    if (c.getActiveObject() !== want) {
      if (want) c.setActiveObject(want);
      else c.discardActiveObject();
    }
  }

  private applyLayer(o: LayerImage, l: Layer, pw: number, ph: number) {
    o.set({
      left: l.cx,
      top: l.cy,
      scaleX: l.width / pw,
      scaleY: l.height / ph,
      angle: l.angle,
      opacity: l.opacity,
      visible: l.visible,
      lockMovementX: l.locked,
      lockMovementY: l.locked,
      lockRotation: l.locked,
      lockScalingX: l.locked,
      lockScalingY: l.locked,
      hasControls: !l.locked,
      hoverCursor: l.locked ? 'not-allowed' : undefined,
    });
    o.setCoords();
  }

  // ---------- Fabric → ドキュメント ----------

  private onFabricSelection(o?: FabricObject) {
    if (this.syncing || this.ignoreEvents) return;
    if (ui.get().tool !== 'select') return;
    selectLayer((o as LayerImage | undefined)?.layerId ?? null);
  }

  private readObject(o: LayerImage): Partial<Layer> {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      cx: r(o.left),
      cy: r(o.top),
      width: Math.max(1, r(o.width * o.scaleX)),
      height: Math.max(1, r(o.height * o.scaleY)),
      angle: normalizeAngle(o.angle),
    };
  }

  private patchLayer(id: string, patch: Partial<Layer>): Doc {
    const d = history.doc;
    return { ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
  }

  private onLive(o: LayerImage) {
    if (this.ignoreEvents || !o?.layerId) return;
    this.liveId = o.layerId;
    history.preview(this.patchLayer(o.layerId, this.readObject(o)));
  }

  private onModified(o: LayerImage) {
    if (this.ignoreEvents || !o?.layerId) return;
    const id = o.layerId;
    this.liveId = null;
    history.commit(this.patchLayer(id, this.readObject(o)));
  }

  // ---------- ホイール・キーボード ----------

  private rel(e: { clientX: number; clientY: number }): Pt {
    const r = this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.rel(e);
    const { view } = ui.get();
    if (e.ctrlKey || e.metaKey) {
      // トラックパッドのピンチ（ctrlKey 付き）や Ctrl+ホイール → カーソル位置を中心にズーム
      zoomAt(view.zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01)), p.x, p.y);
    } else {
      const k = e.deltaMode === 1 ? 16 : 1;
      panBy(-(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k, -(e.shiftKey ? 0 : e.deltaY) * k);
    }
  };

  private isTyping(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    if (e.type === 'keydown') {
      if (this.isTyping(e.target) || (e.target as HTMLElement)?.tagName === 'BUTTON') return;
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.host.dataset.space = '1';
      }
      e.preventDefault();
    } else {
      this.spaceDown = false;
      delete this.host.dataset.space;
    }
  };
  private onBlur = () => {
    this.spaceDown = false;
    delete this.host.dataset.space;
  };

  // ---------- ポインタ（パン・ピンチ） ----------

  private touchCount() {
    let n = 0;
    this.pointers.forEach((p) => p.type === 'touch' && n++);
    return n;
  }

  private onDown = (e: PointerEvent) => {
    if (this.synthetic) return;
    const coarse = e.pointerType !== 'mouse';
    if (coarse !== this.coarse) {
      this.coarse = coarse;
      this.objs.forEach((o) => o.set(this.cornerSizes()));
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (e.pointerType === 'touch' && this.touchCount() >= 2) {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!this.gesture) this.beginGesture();
      return;
    }
    const tool = ui.get().tool;
    if (tool === 'hand' || this.spaceDown || e.button === 1) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.host.dataset.panning = '1';
      this.applyTool(tool);
      this.canvas.requestRenderAll();
      return;
    }
    this.passedToFabric.add(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (this.synthetic) return;
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (this.gesture) {
      e.stopImmediatePropagation();
      if (p?.type === 'touch') this.updateGesture();
      return;
    }
    if (this.swallow.has(e.pointerId)) {
      e.stopImmediatePropagation();
      return;
    }
    if (this.panning && this.panning.id === e.pointerId) {
      e.stopImmediatePropagation();
      panBy(e.clientX - this.panning.x, e.clientY - this.panning.y);
      this.panning.x = e.clientX;
      this.panning.y = e.clientY;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.synthetic) return;
    this.pointers.delete(e.pointerId);
    this.passedToFabric.delete(e.pointerId);
    if (this.gesture) {
      e.stopImmediatePropagation();
      if (this.touchCount() < 2) {
        this.gesture = null;
        // 残った指が次の操作（オブジェクトのドラッグなど）を始めないよう、離すまで無視する
        this.pointers.forEach((p, id) => p.type === 'touch' && this.swallow.add(id));
      }
      return;
    }
    if (this.swallow.delete(e.pointerId)) {
      e.stopImmediatePropagation();
      return;
    }
    if (this.panning && this.panning.id === e.pointerId) {
      e.stopImmediatePropagation();
      this.panning = null;
      delete this.host.dataset.panning;
      this.applyTool(ui.get().tool);
      this.canvas.requestRenderAll();
    }
  };

  private touches(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    this.pointers.forEach((p) => p.type === 'touch' && out.push(this.rel({ clientX: p.x, clientY: p.y })));
    return out;
  }

  private beginGesture() {
    // 1 本目の指で始まっていた操作（オブジェクトの移動・投げ縄など）を破棄する
    abortStroke();
    this.cancelFabricInteraction();
    const t = this.touches();
    if (t.length < 2) return;
    this.gesture = { lastDist: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1, lastMid: { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 } };
  }

  private updateGesture() {
    const g = this.gesture;
    const t = this.touches();
    if (!g || t.length < 2) return;
    const dist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
    const mid = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
    zoomAt(ui.get().view.zoom * (dist / g.lastDist), mid.x, mid.y);
    panBy(mid.x - g.lastMid.x, mid.y - g.lastMid.y);
    g.lastDist = dist;
    g.lastMid = mid;
  }

  /** Fabric が進行中のドラッグ/リサイズを終了させ、変更は履歴に残さず元に戻す */
  private cancelFabricInteraction() {
    const ids = [...this.passedToFabric];
    this.passedToFabric.clear();
    if (!ids.length) return;
    this.ignoreEvents = true;
    this.synthetic = true;
    try {
      for (const id of ids) {
        const p = this.pointers.get(id);
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: id,
            pointerType: 'touch',
            isPrimary: true,
            bubbles: true,
            clientX: p?.x ?? 0,
            clientY: p?.y ?? 0,
          }),
        );
      }
    } finally {
      this.synthetic = false;
      this.ignoreEvents = false;
    }
    history.cancelPreview();
    this.liveId = null;
    // 履歴の状態に Fabric のオブジェクトを戻す
    this.objAsset.clear();
    this.syncAll();
  }

  // ---------- 背景・アートボード描画 ----------

  private getChecker(ctx: CanvasRenderingContext2D) {
    const dpr = this.canvas.getRetinaScaling();
    if (this.checker && this.checkerDpr === dpr) return this.checker;
    const cell = 10;
    const t = document.createElement('canvas');
    t.width = t.height = Math.round(cell * 2 * dpr);
    const x = t.getContext('2d')!;
    x.fillStyle = '#d9dce1';
    x.fillRect(0, 0, t.width, t.height);
    x.fillStyle = '#b9bdc6';
    const c = t.width / 2;
    x.fillRect(0, 0, c, c);
    x.fillRect(c, c, c, c);
    const pat = ctx.createPattern(t, 'repeat')!;
    pat.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr));
    this.checker = pat;
    this.checkerDpr = dpr;
    return pat;
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D) {
    const { view } = ui.get();
    const d = history.doc;
    const x = view.panX;
    const y = view.panY;
    const w = d.width * view.zoom;
    const h = d.height * view.zoom;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    if (d.background.type === 'color') {
      ctx.fillStyle = d.background.color;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.translate(x, y);
      ctx.fillStyle = this.getChecker(ctx);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private drawArtboardFrame(ctx: CanvasRenderingContext2D) {
    const { view } = ui.get();
    const d = history.doc;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(20,22,28,0.85)';
    ctx.strokeRect(view.panX - 0.5, view.panY - 0.5, d.width * view.zoom + 1, d.height * view.zoom + 1);
    ctx.restore();
  }
}
