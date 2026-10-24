import { useUi } from '../state/hooks';
import { fitView, zoomBy } from '../state/view';
import { Icon } from './Icon';

export function ZoomControls() {
  const zoom = useUi((s) => s.view.zoom);
  return (
    <div className="zoom" role="group" aria-label="表示倍率">
      <button type="button" className="iconbtn" data-testid="zoom-out" title="縮小（-）" aria-label="縮小" onClick={() => zoomBy(1 / 1.25)}>
        <Icon name="minus" size={20} />
      </button>
      <span className="zoom-val" data-testid="zoom-val" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" className="iconbtn" data-testid="zoom-in" title="拡大（+）" aria-label="拡大" onClick={() => zoomBy(1.25)}>
        <Icon name="plus" size={20} />
      </button>
      <button type="button" className="iconbtn fit" data-testid="zoom-fit" title="全体を表示（Ctrl+0）" aria-label="全体を表示" onClick={fitView}>
        <Icon name="fit" size={20} />
        <span>全体</span>
      </button>
    </div>
  );
}
