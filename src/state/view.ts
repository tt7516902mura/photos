import { clamp, type View } from '../core/coords';
import { history } from './editor';
import { ui } from './ui';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

export function setView(v: View, fitted = false) {
  ui.set({ view: { zoom: clamp(v.zoom, MIN_ZOOM, MAX_ZOOM), panX: v.panX, panY: v.panY }, fitted });
}

export function computeFit(stageW: number, stageH: number, docW: number, docH: number, margin: number): View {
  const zoom = clamp(Math.min((stageW - margin * 2) / docW, (stageH - margin * 2) / docH), MIN_ZOOM, MAX_ZOOM);
  return { zoom, panX: (stageW - docW * zoom) / 2, panY: (stageH - docH * zoom) / 2 };
}

export function fitView() {
  const { stageW, stageH } = ui.get();
  if (stageW < 10 || stageH < 10) return;
  const d = history.doc;
  const margin = stageW < 600 ? 10 : 28;
  setView(computeFit(stageW, stageH, d.width, d.height, margin), true);
}

/** (cx, cy) はステージ座標。そこを動かさずに倍率を変える */
export function zoomAt(newZoom: number, cx: number, cy: number) {
  const { view } = ui.get();
  const z = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const k = z / view.zoom;
  setView({ zoom: z, panX: cx - (cx - view.panX) * k, panY: cy - (cy - view.panY) * k });
}

export function zoomBy(factor: number) {
  const { stageW, stageH, view } = ui.get();
  zoomAt(view.zoom * factor, stageW / 2, stageH / 2);
}

export function zoomActual() {
  zoomAt(1, ui.get().stageW / 2, ui.get().stageH / 2);
}

export function panBy(dx: number, dy: number) {
  const { view } = ui.get();
  setView({ ...view, panX: view.panX + dx, panY: view.panY + dy });
}
