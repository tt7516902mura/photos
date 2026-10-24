import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canEncodeWebP, FORMAT_INFO, type ExportFormat } from '../core/exporter';
import { LIMITS, UserError } from '../core/types';
import { closeDialog, exportImage, setCanvasSettings } from '../state/actions';
import { history } from '../state/editor';
import { useDoc, useUi } from '../state/hooks';
import { ui } from '../state/ui';
import { Icon } from './Icon';

function Modal({ title, children, onClose, testId }: { title: string; children: ReactNode; onClose: () => void; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button.primary, button');
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'Tab' && ref.current) {
          const f = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select')];
          if (!f.length) return;
          const i = f.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
          else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
        }
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} data-testid={testId}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" aria-label="閉じる" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ExportDialog() {
  const doc = useDoc();
  const projectName = useUi((s) => s.projectName);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [bg, setBg] = useState(doc.background.type === 'color' ? doc.background.color : '#ffffff');
  const [name, setName] = useState(projectName === '無題' ? 'composition' : projectName);
  const [webp, setWebp] = useState<boolean | null>(null);
  useEffect(() => void canEncodeWebP().then(setWebp), []);

  const run = async () => {
    const ok = await exportImage({ format, quality: quality / 100, background: bg }, name);
    if (ok) closeDialog();
  };
  return (
    <Modal title="画像として書き出す" onClose={closeDialog} testId="export-dialog">
      <div className="modal-body">
        <fieldset className="seg" role="radiogroup" aria-label="形式">
          {(['png', 'jpeg', 'webp'] as ExportFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              disabled={f === 'webp' && webp === false}
              data-testid={`fmt-${f}`}
              className="seg-btn"
              onClick={() => setFormat(f)}
            >
              {f === 'jpeg' ? 'JPEG' : f.toUpperCase()}
              {f === 'webp' && webp === false ? '（非対応）' : ''}
            </button>
          ))}
        </fieldset>
        <p className="note">{FORMAT_INFO[format].label}</p>
        {format === 'jpeg' && (
          <>
            <p className="note warn">JPEG は透明を保持できません。透明な部分は下の背景色で塗りつぶされます。透明を残すには PNG を選んでください。</p>
            <label className="field wide inline">
              <span className="field-label">背景色</span>
              <input type="color" value={bg} data-testid="export-bg" onChange={(e) => setBg(e.target.value)} aria-label="JPEGの背景色" />
              <button type="button" className="btn small" onClick={() => setBg('#ffffff')}>白</button>
              <button type="button" className="btn small" onClick={() => setBg('#000000')}>黒</button>
            </label>
          </>
        )}
        {format !== 'png' && (
          <div className="field wide">
            <span className="field-label">画質</span>
            <div className="slider-row">
              <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="画質" />
              <output>{quality}</output>
            </div>
          </div>
        )}
        <label className="field wide">
          <span className="field-label">ファイル名</span>
          <span className="field-input">
            <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} data-testid="export-name" />
            <span className="unit">.{FORMAT_INFO[format].ext}</span>
          </span>
        </label>
        <p className="note">
          出力サイズ：{doc.width} × {doc.height} px（キャンバスの実サイズ。画面の拡大率には影響されません）。非表示レイヤーは含まれません。
        </p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={closeDialog}>キャンセル</button>
        <button type="button" className="btn primary" data-testid="export-run" onClick={run}>
          <Icon name="export" size={18} />書き出す
        </button>
      </div>
    </Modal>
  );
}

const PRESETS: [string, number, number][] = [
  ['正方形 1080', 1080, 1080],
  ['横長 1920×1080', 1920, 1080],
  ['縦長 1080×1920', 1080, 1920],
  ['4:3 2048×1536', 2048, 1536],
  ['A4 縦 2480×3508', 2480, 3508],
];

function CanvasDialog() {
  const doc = history.doc;
  const projectName = useUi((s) => s.projectName);
  const [w, setW] = useState(String(doc.width));
  const [h, setH] = useState(String(doc.height));
  const [transparent, setTransparent] = useState(doc.background.type === 'transparent');
  const [color, setColor] = useState(doc.background.type === 'color' ? doc.background.color : '#ffffff');
  const [name, setName] = useState(projectName);
  const [err, setErr] = useState('');

  const apply = () => {
    try {
      setCanvasSettings(Number(w), Number(h), transparent ? { type: 'transparent' } : { type: 'color', color });
      ui.set({ projectName: name.trim() || '無題' });
      closeDialog();
    } catch (e) {
      setErr(e instanceof UserError ? e.message : String(e));
    }
  };
  return (
    <Modal title="キャンバスの設定" onClose={closeDialog} testId="canvas-dialog">
      <div className="modal-body">
        <div className="field-grid">
          <label className="field">
            <span className="field-label">幅</span>
            <span className="field-input">
              <input type="number" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} data-testid="canvas-w" />
              <span className="unit">px</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">高さ</span>
            <span className="field-input">
              <input type="number" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} data-testid="canvas-h" />
              <span className="unit">px</span>
            </span>
          </label>
        </div>
        <div className="chips" role="group" aria-label="サイズのプリセット">
          {PRESETS.map(([label, pw, ph]) => (
            <button key={label} type="button" className="btn small" onClick={() => (setW(String(pw)), setH(String(ph)))}>
              {label}
            </button>
          ))}
        </div>
        <fieldset className="seg" role="radiogroup" aria-label="背景">
          <button type="button" role="radio" aria-checked={transparent} className="seg-btn" data-testid="bg-transparent" onClick={() => setTransparent(true)}>透明</button>
          <button type="button" role="radio" aria-checked={!transparent} className="seg-btn" data-testid="bg-color" onClick={() => setTransparent(false)}>単色</button>
        </fieldset>
        {!transparent && (
          <label className="field wide inline">
            <span className="field-label">背景色</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="背景色" />
          </label>
        )}
        <label className="field wide">
          <span className="field-label">プロジェクト名</span>
          <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="note">
          書き出し画像の実サイズになります（最大 {LIMITS.maxCanvasSide}px・{LIMITS.maxCanvasPixels / 1e6} メガピクセル）。サイズを変えても、レイヤーの位置とサイズはそのままです。
        </p>
        {err && <p className="note error" role="alert">{err}</p>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={closeDialog}>キャンセル</button>
        <button type="button" className="btn primary" data-testid="canvas-apply" onClick={apply}>適用</button>
      </div>
    </Modal>
  );
}

function HelpDialog() {
  return (
    <Modal title="使い方" onClose={closeDialog} testId="help-dialog">
      <div className="modal-body help">
        <h3>基本</h3>
        <ul>
          <li>「画像追加」またはドラッグ＆ドロップ、貼り付け（Ctrl+V）で写真をレイヤーとして追加します。</li>
          <li>「選択」ツールで画像をタップすると、移動・拡大縮小・回転のハンドルが出ます。数値でも指定できます。</li>
          <li>切り抜きは、対象レイヤーを選んでから「投げ縄／多角形／四角形／楕円」を使い、「適用」で範囲の外側が透明になります。</li>
          <li>操作は「元に戻す／やり直し」で取り消せます。削除も戻せます。</li>
        </ul>
        <h3>表示の操作</h3>
        <ul>
          <li>タッチ：2 本指のピンチで拡大縮小、2 本指のドラッグで移動。</li>
          <li>マウス：Ctrl+ホイールで拡大縮小、ホイールで移動、Space+ドラッグまたは中ボタンのドラッグで移動。</li>
          <li>「手のひら」ツールでも画面を動かせます。「全体」で全体表示に戻ります。</li>
        </ul>
        <h3>ショートカット</h3>
        <table className="keys">
          <tbody>
            {[
              ['Ctrl/Cmd + Z', '元に戻す'],
              ['Ctrl/Cmd + Shift + Z（Ctrl+Y）', 'やり直し'],
              ['Delete / Backspace', '選択レイヤーを削除'],
              ['Esc', '切り抜きの取り消し／ツール解除'],
              ['Enter', '多角形を確定／切り抜きを適用'],
              ['Backspace（多角形）', '直前の頂点を削除'],
              ['V / H / L / P / R / E', '選択／手のひら／投げ縄／多角形／四角形／楕円'],
              ['矢印キー（Shift で 10px）', '選択レイヤーを移動'],
              ['Ctrl/Cmd + D', 'レイヤーを複製'],
              ['Ctrl/Cmd + ] / [（Shift で最前面・最背面）', 'レイヤー順を変更'],
              ['Ctrl/Cmd + S / O', 'プロジェクトを保存／開く'],
              ['Ctrl/Cmd + Shift + E', '書き出し'],
              ['Ctrl/Cmd + 0 / + / -', '全体表示／拡大／縮小'],
            ].map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>プライバシー</h3>
        <p>画像・プロジェクトはブラウザ内だけで処理し、サーバーへ送信・保存しません。自動保存もしないので、必要なときに「保存」でファイルに残してください。</p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn primary" onClick={closeDialog}>閉じる</button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  if (d.type === 'export') return <ExportDialog />;
  if (d.type === 'canvas') return <CanvasDialog />;
  if (d.type === 'help') return <HelpDialog />;
  return (
    <Modal title={d.title} onClose={closeDialog} testId="confirm-dialog">
      <div className="modal-body">
        <p>{d.message}</p>
      </div>
      <div className="modal-foot stack">
        {d.buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            className={`btn${b.kind === 'primary' ? ' primary' : ''}${b.kind === 'danger' ? ' danger-btn' : ''}`}
            onClick={() => {
              closeDialog();
              void b.run();
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
