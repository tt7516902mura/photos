import { isCropTool } from '../core/types';
import { applyCrop, selectedLayer, setTool } from '../state/actions';
import { crop, polyClose, polyUndo, resetCrop } from '../state/crop';
import { useDoc, useUi } from '../state/hooks';
import { useStore } from '../state/store';
import { Icon } from './Icon';

/** 切り抜き中に画面上へ出す操作バー（タッチだけでも確定・戻る・キャンセルが行える） */
export function CropBar() {
  const tool = useUi((s) => s.tool);
  useUi((s) => s.selectedId);
  useDoc();
  const c = useStore(crop, (s) => s);
  if (!isCropTool(tool)) return null;
  const layer = selectedLayer();
  const poly = tool === 'polygon';

  let hint: string;
  if (!layer) hint = '先に「選択」ツールで切り抜くレイヤーを選んでください';
  else if (layer.locked) hint = 'ロック中のレイヤーは切り抜けません';
  else if (c.phase === 'pending') hint = '明るい部分が残ります。「適用」で外側が透明になります';
  else if (poly) hint = c.points.length ? `頂点 ${c.points.length} 個：タップで追加／最初の点（橙）か「確定」で閉じる` : 'タップして頂点を追加します';
  else if (tool === 'lasso') hint = '指やマウスでなぞって囲みます（離すと自動で閉じます）';
  else hint = 'ドラッグして範囲を指定します';

  return (
    <div className="cropbar" role="toolbar" aria-label="切り抜き操作" data-testid="cropbar">
      <p className="cropbar-hint" role="status">{hint}</p>
      <div className="cropbar-buttons">
        {poly && c.phase === 'drawing' && (
          <>
            <button type="button" className="btn" data-testid="crop-back" disabled={!c.points.length} onClick={polyUndo} title="直前の頂点を削除（Backspace）">
              <Icon name="back1" size={18} />戻る
            </button>
            <button type="button" className="btn" data-testid="crop-close" disabled={c.points.length < 3} onClick={() => polyClose()} title="範囲を閉じる（Enter）">
              <Icon name="check" size={18} />確定
            </button>
          </>
        )}
        {poly && c.phase === 'pending' && (
          <button type="button" className="btn" data-testid="crop-back" onClick={polyUndo} title="頂点の編集に戻る（Backspace）">
            <Icon name="back1" size={18} />戻る
          </button>
        )}
        {c.phase === 'pending' && (
          <button type="button" className="btn primary" data-testid="crop-apply" onClick={() => applyCrop()} title="選択範囲の外側を透明にする（Enter）">
            <Icon name="check" size={18} />適用
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-testid="crop-cancel"
          onClick={() => (c.phase === 'idle' ? setTool('select') : resetCrop())}
          title={c.phase === 'idle' ? '選択ツールに戻る（Esc）' : '選択範囲を破棄（Esc）'}
        >
          <Icon name="x" size={18} />{c.phase === 'idle' ? '終了' : 'キャンセル'}
        </button>
      </div>
    </div>
  );
}
