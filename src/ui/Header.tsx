import { useEffect, useRef } from 'react';
import { openExportDialog, redo, requestNewProject, saveProject, undo } from '../state/actions';
import { useHistoryFlags, useUi } from '../state/hooks';
import { ui } from '../state/ui';
import { Icon, type IconName } from './Icon';
import { pickImages, pickProject } from './pickers';
import type { LayoutMode } from './useLayout';

function Btn({
  icon,
  label,
  onClick,
  disabled,
  title,
  primary,
  testId,
  iconOnlyNarrow,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
  testId?: string;
  iconOnlyNarrow?: boolean;
}) {
  return (
    <button
      type="button"
      className={`hbtn${primary ? ' primary' : ''}${iconOnlyNarrow ? ' narrow-hide-label' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      data-testid={testId}
    >
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

export function Header({ layout }: { layout: LayoutMode }) {
  const { canUndo, canRedo, dirty } = useHistoryFlags();
  const name = useUi((s) => s.projectName);
  const leftOpen = useUi((s) => s.leftOpen);
  const rightOpen = useUi((s) => s.rightOpen);
  const menuOpen = useUi((s) => s.menuOpen);
  const wide = layout === 'wide';

  return (
    <header className="header" data-testid="header">
      {!wide && (
        <Btn icon="menu" label="メニュー" testId="menu-btn" onClick={() => ui.set({ menuOpen: !menuOpen })} />
      )}
      <div className="brand" title={name}>
        <span className="logo" aria-hidden="true" />
        <span className="brand-text">
          <strong>写真合成</strong>
          <span className="proj">{name}{dirty ? ' ＊' : ''}</span>
        </span>
      </div>
      <div className="spacer" />
      {wide && (
        <>
          <Btn icon="newFile" label="新規" title="新規プロジェクト" testId="new-btn" onClick={requestNewProject} />
          <Btn icon="open" label="開く" title="プロジェクトを開く（Ctrl+O）" testId="open-btn" onClick={pickProject} />
          <Btn icon="save" label="保存" title="プロジェクトを保存（Ctrl+S）" testId="save-btn" onClick={() => void saveProject()} />
          <span className="sep" />
        </>
      )}
      <Btn icon="addImage" label="画像追加" title="画像を追加" testId="add-image" onClick={pickImages} primary={!wide} />
      <Btn icon="undo" label="元に戻す" title="元に戻す（Ctrl+Z）" testId="undo-btn" disabled={!canUndo} onClick={undo} iconOnlyNarrow />
      <Btn icon="redo" label="やり直し" title="やり直す（Ctrl+Shift+Z）" testId="redo-btn" disabled={!canRedo} onClick={redo} iconOnlyNarrow />
      <Btn icon="export" label="書き出し" title="画像として書き出す（Ctrl+Shift+E）" testId="export-btn" onClick={openExportDialog} primary={wide} />
      {wide && (
        <>
          <span className="sep" />
          <Btn icon="frame" label="キャンバス" title="キャンバスサイズと背景" testId="canvas-btn" onClick={() => ui.set({ dialog: { type: 'canvas' } })} />
          <button
            type="button"
            className="hbtn icononly"
            aria-pressed={leftOpen}
            title="ツールバーの表示／非表示"
            aria-label="ツールバーの表示／非表示"
            data-testid="toggle-left"
            onClick={() => ui.set({ leftOpen: !leftOpen })}
          >
            <Icon name="panelLeft" size={20} />
          </button>
          <button
            type="button"
            className="hbtn icononly"
            aria-pressed={rightOpen}
            title="プロパティ／レイヤーパネルの表示／非表示"
            aria-label="プロパティ／レイヤーパネルの表示／非表示"
            data-testid="toggle-right"
            onClick={() => ui.set({ rightOpen: !rightOpen })}
          >
            <Icon name="panelRight" size={20} />
          </button>
          <button type="button" className="hbtn icononly" title="使い方・ショートカット" aria-label="使い方・ショートカット" data-testid="help-btn" onClick={() => ui.set({ dialog: { type: 'help' } })}>
            <Icon name="help" size={20} />
          </button>
        </>
      )}
    </header>
  );
}

/** コンパクトレイアウトのメニュー */
export function MenuSheet() {
  const open = useUi((s) => s.menuOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-testid="menu-btn"]'))
        ui.set({ menuOpen: false });
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && ui.set({ menuOpen: false });
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  if (!open) return null;
  const run = (fn: () => void) => () => {
    ui.set({ menuOpen: false });
    fn();
  };
  const items: { icon: IconName; label: string; fn: () => void; id: string }[] = [
    { icon: 'newFile', label: '新規プロジェクト', fn: requestNewProject, id: 'new' },
    { icon: 'open', label: 'プロジェクトを開く', fn: pickProject, id: 'open' },
    { icon: 'save', label: 'プロジェクトを保存', fn: () => void saveProject(), id: 'save' },
    { icon: 'frame', label: 'キャンバスサイズ・背景', fn: () => ui.set({ dialog: { type: 'canvas' } }), id: 'canvas' },
    { icon: 'help', label: '使い方', fn: () => ui.set({ dialog: { type: 'help' } }), id: 'help' },
  ];
  return (
    <div className="menu" ref={ref} role="menu" data-testid="menu">
      {items.map((i) => (
        <button key={i.id} type="button" role="menuitem" className="menu-item" data-testid={`menu-${i.id}`} onClick={run(i.fn)}>
          <Icon name={i.icon} size={22} />
          {i.label}
        </button>
      ))}
    </div>
  );
}
