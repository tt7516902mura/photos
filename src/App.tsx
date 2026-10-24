import { useEffect } from 'react';
import { CanvasStage } from './canvas/CanvasStage';
import { addFiles, handleIncomingFiles } from './state/actions';
import { useUi } from './state/hooks';
import { ui } from './state/ui';
import { CropBar } from './ui/CropBar';
import { Dialogs } from './ui/Dialogs';
import { Header, MenuSheet } from './ui/Header';
import { Icon } from './ui/Icon';
import { LayerPanel } from './ui/LayerPanel';
import { BusyOverlay, DropOverlay, EmptyState, Toasts } from './ui/Overlays';
import { PropsPanel } from './ui/PropsPanel';
import { ToolButtons } from './ui/ToolBar';
import { useLayout } from './ui/useLayout';
import { useShortcuts } from './ui/useShortcuts';
import { ZoomControls } from './ui/ZoomControls';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

function useGlobalFileInput() {
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      ui.set({ dragOver: true });
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) ui.set({ dragOver: false });
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      ui.set({ dragOver: false });
      void handleIncomingFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);
}

function Sheet() {
  const sheet = useUi((s) => s.sheet);
  if (!sheet) return null;
  return (
    <div className="sheet" role="region" aria-label={sheet === 'layers' ? 'レイヤー' : 'プロパティ'} data-testid="sheet">
      <div className="sheet-head">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={sheet === 'layers'} className="tab" onClick={() => ui.set({ sheet: 'layers' })} data-testid="tab-layers">
            レイヤー
          </button>
          <button type="button" role="tab" aria-selected={sheet === 'props'} className="tab" onClick={() => ui.set({ sheet: 'props' })} data-testid="tab-props">
            プロパティ
          </button>
        </div>
        <button type="button" className="iconbtn" aria-label="パネルを閉じる" data-testid="sheet-close" onClick={() => ui.set({ sheet: null })}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sheet-body">{sheet === 'layers' ? <LayerPanel /> : <PropsPanel />}</div>
    </div>
  );
}

function PanelButtons() {
  const sheet = useUi((s) => s.sheet);
  const toggle = (k: 'layers' | 'props') => ui.set({ sheet: sheet === k ? null : k });
  return (
    <>
      <button type="button" className="tool" data-testid="open-layers" aria-pressed={sheet === 'layers'} title="レイヤー一覧を開く" onClick={() => toggle('layers')}>
        <Icon name="layers" />
        <span>レイヤー</span>
      </button>
      <button type="button" className="tool" data-testid="open-props" aria-pressed={sheet === 'props'} title="プロパティを開く" onClick={() => toggle('props')}>
        <Icon name="sliders" />
        <span>設定</span>
      </button>
    </>
  );
}

export default function App() {
  const layout = useLayout();
  const leftOpen = useUi((s) => s.leftOpen);
  const rightOpen = useUi((s) => s.rightOpen);
  const wide = layout === 'wide';
  useShortcuts();
  useGlobalFileInput();

  const work = (
    <main className="workarea">
      <CanvasStage />
      <ZoomControls />
      <CropBar />
      <EmptyState />
    </main>
  );

  return (
    <div className={`app ${layout}`} data-layout={layout}>
      <Header layout={layout} />
      <MenuSheet />
      {wide ? (
        <div className="mid">
          {leftOpen && (
            <nav className="rail" aria-label="ツール" data-testid="toolbar">
              <ToolButtons />
            </nav>
          )}
          {work}
          {rightOpen && (
            <aside className="side" aria-label="パネル" data-testid="side">
              <PropsPanel />
              <LayerPanel />
            </aside>
          )}
        </div>
      ) : (
        <div className="mid">
          {work}
          <Sheet />
          <nav className="rail bottom" aria-label="ツール" data-testid="toolbar">
            <ToolButtons />
            <PanelButtons />
          </nav>
        </div>
      )}
      <Dialogs />
      <Toasts />
      <BusyOverlay />
      <DropOverlay />
    </div>
  );
}
