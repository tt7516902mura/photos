export interface Pt {
  x: number;
  y: number;
}

export type Background = { type: 'transparent' } | { type: 'color'; color: string };

/** 1 枚の画像レイヤー。座標は「ドキュメント（キャンバス）座標」で、位置は回転の中心。 */
export interface Layer {
  id: string;
  name: string;
  assetId: string;
  /** 中心 X / Y（ドキュメント座標, px） */
  cx: number;
  cy: number;
  /** 表示サイズ（回転前, ドキュメント px） */
  width: number;
  height: number;
  /** 時計回りの角度（度） */
  angle: number;
  /** 0〜1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** これまでに適用した切り抜き回数 */
  cropCount: number;
}

export interface Doc {
  width: number;
  height: number;
  background: Background;
  /** 先頭が最背面、末尾が最前面 */
  layers: Layer[];
}

/** 元画像（または切り抜き後）のピクセルデータ */
export interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  /** エンコード済みデータ（元ファイル、または保存時に PNG 化したもの） */
  blob: Blob | null;
  mime: string;
  cropped: boolean;
}

export type Tool = 'select' | 'hand' | 'lasso' | 'polygon' | 'rect' | 'ellipse';

export const CROP_TOOLS: Tool[] = ['lasso', 'polygon', 'rect', 'ellipse'];
export const isCropTool = (t: Tool) => CROP_TOOLS.includes(t);

/** 切り抜き範囲（ドキュメント座標） */
export type Shape =
  | { kind: 'poly'; points: Pt[] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export const LIMITS = {
  maxCanvasSide: 8192,
  maxCanvasPixels: 40_000_000,
  maxImagePixels: 64_000_000,
  maxImageSide: 16384,
  maxLayers: 200,
  historyLimit: 100,
  historyBytes: 600 * 1024 * 1024,
  maxProjectBytes: 2 * 1024 * 1024 * 1024,
} as const;

/** ユーザーに表示できる日本語メッセージを持つエラー */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
