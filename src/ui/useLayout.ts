import { useEffect, useState } from 'react';

export type LayoutMode = 'wide' | 'compact';
const Q = '(min-width: 900px) and (min-height: 520px)';

/** 幅・高さに応じてレイアウトを切り替える（固定の端末判定ではなく実寸ベース） */
export function useLayout(): LayoutMode {
  const [wide, setWide] = useState(() => (typeof matchMedia === 'function' ? matchMedia(Q).matches : true));
  useEffect(() => {
    const mq = matchMedia(Q);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide ? 'wide' : 'compact';
}
