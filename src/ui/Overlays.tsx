import { dismissToast } from '../state/ui';
import { useDoc, useUi } from '../state/hooks';
import { Icon } from './Icon';
import { pickImages, pickProject } from './pickers';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} data-testid={`toast-${t.kind}`}>
          <span className="toast-icon" aria-hidden="true">
            {t.kind === 'error' ? '！' : t.kind === 'success' ? '✓' : 'i'}
          </span>
          <span className="toast-text">{t.text}</span>
          <button type="button" className="iconbtn small" aria-label="閉じる" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function BusyOverlay() {
  const busy = useUi((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy" role="status" aria-live="assertive" data-testid="busy">
      <div className="busy-card">
        <span className="spinner" aria-hidden="true" />
        <span>{busy}</span>
      </div>
    </div>
  );
}

export function EmptyState() {
  const doc = useDoc();
  if (doc.layers.length > 0) return null;
  return (
    <div className="empty-state" data-testid="empty-state">
      <div className="empty-card">
        <Icon name="addImage" size={44} />
        <h2>写真を追加して合成を始めましょう</h2>
        <button type="button" className="btn primary big" data-testid="add-image-empty" onClick={pickImages}>
          <Icon name="addImage" size={22} />
          画像を追加
        </button>
        <p>
          ここに画像をドラッグ＆ドロップしても追加できます（JPEG・PNG・WebP、複数可）。
          <br />
          画像はこの端末のブラウザ内だけで処理され、外部には送信されません。
        </p>
        <button type="button" className="btn link" onClick={pickProject}>
          保存したプロジェクトを開く
        </button>
      </div>
    </div>
  );
}

export function DropOverlay() {
  const over = useUi((s) => s.dragOver);
  if (!over) return null;
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div>
        <Icon name="addImage" size={48} />
        <p>ここにドロップして追加</p>
      </div>
    </div>
  );
}
