import { useEffect, useRef, useState } from 'react';
import { getAsset } from '../core/assets';
import type { Layer } from '../core/types';
import {
  canMove,
  deleteLayer,
  duplicateLayer,
  moveLayer,
  renameLayer,
  selectLayer,
  toggleLocked,
  toggleVisible,
  type MoveOp,
} from '../state/actions';
import { useDoc, useUi } from '../state/hooks';
import { Icon } from './Icon';
import { pickImages } from './pickers';

function Thumb({ assetId }: { assetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const a = getAsset(assetId);
    if (!c || !a) return;
    const s = 88;
    c.width = c.height = s;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, s, s);
    const k = Math.min(s / a.width, s / a.height);
    const w = a.width * k;
    const h = a.height * k;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(a.canvas, (s - w) / 2, (s - h) / 2, w, h);
  }, [assetId]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}

function LayerRow({ layer, selected }: { layer: Layer; selected: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== layer.name) renameLayer(layer.id, draft);
    else setDraft(layer.name);
  };
  return (
    <li
      className={`layer-row${selected ? ' selected' : ''}${layer.visible ? '' : ' hidden-layer'}`}
      role="option"
      aria-selected={selected}
      data-testid="layer-row"
      data-layer-id={layer.id}
    >
      <button type="button" className="layer-main" onClick={() => selectLayer(layer.id)} aria-label={`レイヤー「${layer.name}」を選択`}>
        <Thumb assetId={layer.assetId} />
        <span className="layer-text">
          {editing ? null : <span className="layer-name">{layer.name}</span>}
          <span className="layer-meta">
            {selected ? '選択中' : ''}
            {selected && (!layer.visible || layer.locked || layer.cropCount > 0) ? ' ・ ' : ''}
            {!layer.visible ? '非表示' : ''}
            {!layer.visible && layer.locked ? '・' : ''}
            {layer.locked ? 'ロック' : ''}
            {layer.cropCount > 0 ? `${!layer.visible || layer.locked ? '・' : ''}切り抜き済み` : ''}
          </span>
        </span>
      </button>
      {editing && (
        <input
          className="rename-input"
          autoFocus
          value={draft}
          aria-label="レイヤー名"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(layer.name);
              setEditing(false);
            }
          }}
        />
      )}
      <button
        type="button"
        className="iconbtn"
        title="名前を変更"
        aria-label={`「${layer.name}」の名前を変更`}
        onClick={() => {
          setDraft(layer.name);
          setEditing(true);
        }}
      >
        <Icon name="pencil" size={18} />
      </button>
      <button
        type="button"
        className="iconbtn"
        data-testid="toggle-visible"
        aria-pressed={!layer.visible}
        title={layer.visible ? '非表示にする' : '表示する'}
        aria-label={layer.visible ? `「${layer.name}」を非表示にする` : `「${layer.name}」を表示する`}
        onClick={() => toggleVisible(layer.id)}
      >
        <Icon name={layer.visible ? 'eye' : 'eyeOff'} />
      </button>
      <button
        type="button"
        className="iconbtn"
        data-testid="toggle-lock"
        aria-pressed={layer.locked}
        title={layer.locked ? 'ロックを解除' : 'ロックする（移動・変形・削除を防ぐ）'}
        aria-label={layer.locked ? `「${layer.name}」のロックを解除` : `「${layer.name}」をロックする`}
        onClick={() => toggleLocked(layer.id)}
      >
        <Icon name={layer.locked ? 'lock' : 'unlock'} />
      </button>
    </li>
  );
}

const MOVES: { op: MoveOp; icon: 'front' | 'forward' | 'backward' | 'back'; label: string }[] = [
  { op: 'front', icon: 'front', label: '最前面へ' },
  { op: 'forward', icon: 'forward', label: '1段前へ' },
  { op: 'backward', icon: 'backward', label: '1段後ろへ' },
  { op: 'back', icon: 'back', label: '最背面へ' },
];

export function LayerPanel() {
  const doc = useDoc();
  const selectedId = useUi((s) => s.selectedId);
  const sel = doc.layers.find((l) => l.id === selectedId);
  const rows = [...doc.layers].reverse(); // 上が最前面

  return (
    <section className="panel layers" aria-label="レイヤー">
      <div className="panel-head">
        <h2>レイヤー <span className="count">{doc.layers.length}</span></h2>
        <button type="button" className="btn small" onClick={pickImages} data-testid="add-image-panel">
          <Icon name="addImage" size={18} />
          追加
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">レイヤーはまだありません。「追加」から写真を読み込みます。</p>
      ) : (
        <ul className="layer-list" role="listbox" aria-label="レイヤー一覧（上が最前面）" data-testid="layer-list">
          {rows.map((l) => (
            <LayerRow key={l.id} layer={l} selected={l.id === selectedId} />
          ))}
        </ul>
      )}
      <div className="layer-actions" role="group" aria-label="選択中のレイヤーの操作">
        {MOVES.map((m) => (
          <button
            key={m.op}
            type="button"
            className="iconbtn labeled"
            data-testid={`move-${m.op}`}
            disabled={!sel || !canMove(sel.id, m.op)}
            title={m.label}
            aria-label={m.label}
            onClick={() => sel && moveLayer(sel.id, m.op)}
          >
            <Icon name={m.icon} size={20} />
            <span>{m.label.replace('へ', '')}</span>
          </button>
        ))}
        <button
          type="button"
          className="iconbtn labeled"
          data-testid="duplicate"
          disabled={!sel}
          title="複製（Ctrl+D）"
          aria-label="複製"
          onClick={() => sel && duplicateLayer(sel.id)}
        >
          <Icon name="copy" size={20} />
          <span>複製</span>
        </button>
        <button
          type="button"
          className="iconbtn labeled danger"
          data-testid="delete"
          disabled={!sel}
          title="削除（Delete）。元に戻せます"
          aria-label="削除"
          onClick={() => sel && deleteLayer(sel.id)}
        >
          <Icon name="trash" size={20} />
          <span>削除</span>
        </button>
      </div>
    </section>
  );
}
