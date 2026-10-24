import type { Tool } from '../core/types';
import { setTool } from '../state/actions';
import { useUi } from '../state/hooks';
import { Icon, type IconName } from './Icon';

export const TOOLS: { id: Tool; label: string; icon: IconName; key: string; hint: string }[] = [
  { id: 'select', label: '選択', icon: 'select', key: 'V', hint: 'レイヤーを選択・移動・変形' },
  { id: 'hand', label: '手のひら', icon: 'hand', key: 'H', hint: '表示をドラッグして動かす' },
  { id: 'lasso', label: '投げ縄', icon: 'lasso', key: 'L', hint: 'なぞって囲んだ範囲だけを残す' },
  { id: 'polygon', label: '多角形', icon: 'polygon', key: 'P', hint: 'タップした点を結んだ範囲だけを残す' },
  { id: 'rect', label: '四角形', icon: 'rect', key: 'R', hint: 'ドラッグした四角形の範囲だけを残す' },
  { id: 'ellipse', label: '楕円', icon: 'ellipse', key: 'E', hint: 'ドラッグした楕円の範囲だけを残す' },
];

export function ToolButtons() {
  const tool = useUi((s) => s.tool);
  return (
    <>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tool"
          data-testid={`tool-${t.id}`}
          aria-pressed={tool === t.id}
          title={`${t.label}（${t.key}）：${t.hint}`}
          onClick={() => setTool(t.id)}
        >
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </>
  );
}
