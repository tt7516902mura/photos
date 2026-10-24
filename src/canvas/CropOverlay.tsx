import { useEffect, useRef, type RefObject } from 'react';
import { docToView, layerCorners, viewToDoc, type Pt, type View } from '../core/coords';
import { ellipseShape, FILL_RULE, rectShape } from '../core/mask';
import { isCropTool, type Shape, type Tool } from '../core/types';
import { selectedLayer } from '../state/actions';
import {
  crop,
  dragBegin,
  dragEnd,
  dragMove,
  lassoBegin,
  lassoEnd,
  lassoExtend,
  polyAdd,
  polyClose,
  polyHover,
  polyMove,
  resetCrop,
  type CropState,
} from '../state/crop';
import { history } from '../state/editor';
import { toast, ui, useUi } from '../state/hooks';

const ACCENT = '#f2a43a';

/** 画面座標で選択範囲のパスを作る（ビューは回転しないので楕円もそのまま描ける） */
function traceScreen(ctx: CanvasRenderingContext2D, s: Shape, v: View, closed = true) {
  ctx.beginPath();
  if (s.kind === 'ellipse') {
    const c = docToView(v, { x: s.cx, y: s.cy });
    ctx.ellipse(c.x, c.y, Math.abs(s.rx) * v.zoom, Math.abs(s.ry) * v.zoom, 0, 0, Math.PI * 2);
    return;
  }
  s.points.forEach((p, i) => {
    const q = docToView(v, p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  if (closed) ctx.closePath();
}

function strokeOutline(ctx: CanvasRenderingContext2D, dashed = true) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.lineWidth = 1.75;
  ctx.strokeStyle = '#14161c';
  ctx.setLineDash(dashed ? [7, 7] : []);
  ctx.stroke();
  ctx.restore();
}

export function drawOverlay(cv: HTMLCanvasElement, tool: Tool, v: View, c: CropState, touch: boolean) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!isCropTool(tool)) return;

  // 切り抜き対象レイヤーの外形
  const layer = selectedLayer();
  if (layer) {
    const q = layerCorners(layer).map((p) => docToView(v, p));
    ctx.save();
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
    ctx.restore();
  }

  // 範囲（ドラッグ中の矩形・楕円も含む）
  let shape: Shape | null = c.shape;
  if (!shape && c.drag) shape = tool === 'ellipse' ? ellipseShape(c.drag.a, c.drag.b) : rectShape(c.drag.a, c.drag.b);
  if (shape) {
    // 範囲の外側を暗くする＝「ここが残る」プレビュー
    ctx.fillStyle = 'rgba(8,10,14,0.58)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    traceScreen(ctx, shape, v);
    ctx.fill(FILL_RULE);
    ctx.restore();
    traceScreen(ctx, shape, v);
    strokeOutline(ctx);
  }

  // 描画途中
  if (c.phase === 'drawing' && c.points.length) {
    const pts = c.points.map((p) => docToView(v, p));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (tool === 'polygon' && c.hover) {
      const h = docToView(v, c.hover);
      ctx.lineTo(h.x, h.y);
    }
    strokeOutline(ctx, tool === 'lasso' ? false : true);
    if (tool === 'lasso' && pts.length > 2) {
      // 閉じる位置の目安
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.save();
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      ctx.restore();
    }
    if (tool === 'polygon') {
      const s = touch ? 15 : 11;
      pts.forEach((p, i) => {
        const r = i === 0 && pts.length >= 3 ? s * 0.75 : s * 0.5;
        ctx.beginPath();
        ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.fillStyle = i === 0 ? ACCENT : '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#14161c';
        ctx.stroke();
      });
    }
  }
}

export function CropOverlay({ host }: { host: RefObject<HTMLDivElement | null> }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const tool = useUi((s) => s.tool);
  const active = useRef<{ id: number; sx: number; sy: number; vertex: number; moved: boolean } | null>(null);
  const lastWarn = useRef(0);
  const touchy = useRef(false);

  // 再描画（ストア変更ごと）
  useEffect(() => {
    const redraw = () => {
      const cv = cvRef.current;
      if (cv) drawOverlay(cv, ui.get().tool, ui.get().view, crop.get(), touchy.current);
    };
    redraw();
    const unsubs = [ui.subscribe(redraw), crop.subscribe(redraw), history.subscribe(redraw)];
    return () => unsubs.forEach((u) => u());
  }, []);

  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toDoc = (e: { clientX: number; clientY: number }) => viewToDoc(ui.get().view, rel(e));

  function targetOk(): boolean {
    const l = selectedLayer();
    let msg = '';
    if (!l) msg = '先に切り抜くレイヤーを選択してください。「選択」ツールで画像をタップします。';
    else if (l.locked) msg = 'ロック中のレイヤーは切り抜けません。ロックを解除してください。';
    else if (!l.visible) msg = '非表示のレイヤーは切り抜けません。表示に切り替えてください。';
    if (!msg) return true;
    if (Date.now() - lastWarn.current > 2500) {
      lastWarn.current = Date.now();
      toast('info', msg);
    }
    return false;
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touchy.current = e.pointerType !== 'mouse';
    if (!targetOk()) return;
    const p = toDoc(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = ui.get().tool;
    let vertex = -1;
    if (t === 'polygon') {
      const s = crop.get();
      if (s.phase === 'pending') resetCrop();
      const v = ui.get().view;
      const pts = crop.get().points;
      const hit = touchy.current ? 20 : 12;
      const m = rel(e);
      let best = Infinity;
      pts.forEach((q, i) => {
        const d = Math.hypot(docToView(v, q).x - m.x, docToView(v, q).y - m.y);
        if (d < hit && d < best) {
          best = d;
          vertex = i;
        }
      });
    } else if (t === 'lasso') lassoBegin(p);
    else dragBegin(p);
    active.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vertex, moved: false };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    const t = ui.get().tool;
    if (!a || a.id !== e.pointerId) {
      if (t === 'polygon' && e.pointerType === 'mouse' && crop.get().phase === 'drawing') polyHover(toDoc(e));
      return;
    }
    if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > 8) a.moved = true;
    if (t === 'lasso') {
      if (crop.get().phase === 'drawing') {
        // コアレスイベントも拾って滑らかな線にする
        const evs = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[];
        (evs.length ? evs : [e.nativeEvent]).forEach((ev) => lassoExtend(toDoc(ev)));
      }
    } else if (t === 'rect' || t === 'ellipse') {
      if (crop.get().drag) dragMove(toDoc(e));
    } else if (t === 'polygon' && a.vertex >= 0 && a.moved) {
      polyMove(a.vertex, toDoc(e));
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    const t = ui.get().tool;
    if (t === 'lasso') {
      if (crop.get().phase === 'drawing' && !lassoEnd()) toast('info', '範囲が小さすぎます。もう少し大きく囲んでください。');
    } else if (t === 'rect' || t === 'ellipse') {
      if (crop.get().drag && !dragEnd(t)) toast('info', '範囲が小さすぎます。ドラッグで範囲を指定してください。');
    } else if (t === 'polygon' && !a.moved) {
      const pts = crop.get().points;
      if (a.vertex === 0 && pts.length >= 3) polyClose();
      else if (a.vertex < 0) polyAdd(toDoc(e));
    }
  };

  const onCancel = () => {
    active.current = null;
  };

  return (
    <canvas
      ref={cvRef}
      className="overlay"
      data-testid="overlay"
      style={{ pointerEvents: isCropTool(tool) ? 'auto' : 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onPointerLeave={() => crop.get().hover && polyHover(null)}
    />
  );
}
