import { useEffect, useState } from 'react';
import { renameLayer, setGeometry, updateLayer } from '../state/actions';
import { history } from '../state/editor';
import { useDoc, useUi } from '../state/hooks';
import { ui } from '../state/ui';
import { Icon } from './Icon';

function NumField({
  label,
  value,
  onCommit,
  unit,
  disabled,
  testId,
  min,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  unit?: string;
  disabled?: boolean;
  testId: string;
  min?: number;
}) {
  const fmt = (v: number) => String(Math.round(v * 100) / 100);
  const [draft, setDraft] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setDraft(fmt(value));
  }, [value, focus]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min)) onCommit(n);
    else setDraft(fmt(value));
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={draft}
          disabled={disabled}
          data-testid={testId}
          onFocus={(e) => {
            setFocus(true);
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocus(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setDraft(fmt(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function PropsPanel() {
  const doc = useDoc();
  const selectedId = useUi((s) => s.selectedId);
  const lockAspect = useUi((s) => s.lockAspect);
  const layer = doc.layers.find((l) => l.id === selectedId);
  const [name, setName] = useState('');
  useEffect(() => setName(layer?.name ?? ''), [layer?.id, layer?.name]);

  if (!layer) {
    return (
      <section className="panel props" aria-label="プロパティ">
        <div className="panel-head">
          <h2>プロパティ</h2>
        </div>
        <p className="empty-note">レイヤーを選ぶと、位置・サイズ・角度・不透明度を数値で編集できます。</p>
      </section>
    );
  }
  const dis = layer.locked;
  const pct = Math.round(layer.opacity * 100);
  return (
    <section className="panel props" aria-label="プロパティ">
      <div className="panel-head">
        <h2>プロパティ</h2>
        {dis && (
          <span className="tag">
            <Icon name="lock" size={14} /> ロック中
          </span>
        )}
      </div>
      <label className="field wide">
        <span className="field-label">名前</span>
        <input
          type="text"
          value={name}
          maxLength={100}
          data-testid="prop-name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? name !== layer.name && renameLayer(layer.id, name) : setName(layer.name))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <div className="field-grid">
        <NumField label="中心 X" unit="px" value={layer.cx} disabled={dis} testId="prop-x" onCommit={(v) => setGeometry(layer.id, 'cx', v)} />
        <NumField label="中心 Y" unit="px" value={layer.cy} disabled={dis} testId="prop-y" onCommit={(v) => setGeometry(layer.id, 'cy', v)} />
        <NumField label="幅" unit="px" min={1} value={layer.width} disabled={dis} testId="prop-w" onCommit={(v) => setGeometry(layer.id, 'width', v)} />
        <NumField label="高さ" unit="px" min={1} value={layer.height} disabled={dis} testId="prop-h" onCommit={(v) => setGeometry(layer.id, 'height', v)} />
        <NumField label="角度" unit="°" value={layer.angle} disabled={dis} testId="prop-angle" onCommit={(v) => setGeometry(layer.id, 'angle', v)} />
        <button
          type="button"
          className="btn toggle"
          aria-pressed={lockAspect}
          data-testid="lock-aspect"
          title="幅と高さを連動して変更します（ハンドル操作の四隅も縦横比を保ちます）"
          onClick={() => ui.set({ lockAspect: !lockAspect })}
        >
          <Icon name={lockAspect ? 'link' : 'linkOff'} size={18} />
          縦横比固定：{lockAspect ? 'オン' : 'オフ'}
        </button>
      </div>
      <div className="field wide">
        <span className="field-label">不透明度</span>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            data-testid="prop-opacity"
            aria-label="不透明度"
            onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) / 100 }, 'preview')}
            onPointerUp={() => history.commitPreview()}
            onKeyUp={() => history.commitPreview()}
            onBlur={() => history.commitPreview()}
          />
          <output>{pct}%</output>
        </div>
      </div>
    </section>
  );
}
