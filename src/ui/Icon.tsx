import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  addImage: (
    <>
      <path d="M13 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m3 17 4.5-4.5L11 16l3-3 5 5" />
      <path d="M19 3v6M16 6h6" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  select: <path d="m5 3 14 7.2-6 1.8-1.8 6.3z" />,
  hand: (
    <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14c0 4-2.4 7-6 7-3 0-4.4-1.8-5.8-4.4l-1.6-3a1.5 1.5 0 0 1 2.6-1.5L8 13" />
  ),
  lasso: (
    <>
      <path d="M12 4c5 0 9 2.2 9 5s-4 5.2-9 5.2S3 11.8 3 9s4-5 9-5z" />
      <path d="M8.5 13.6c-.7 2.8.2 5 3 6.4" />
    </>
  ),
  polygon: <path d="m12 3.5 8 5.8-3 10.2H7L4 9.3z" />,
  rect: <rect x="4" y="5.5" width="16" height="13" rx="1" strokeDasharray="3.2 2.6" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="6.5" strokeDasharray="3.2 2.6" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.9 3.8M6.5 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6M14 11v6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  front: <path d="M12 20V6m-6 5 6-6 6 6M5 3h14" />,
  forward: <path d="M12 19V5m-6 6 6-6 6 6" />,
  backward: <path d="M12 5v14m-6-6 6 6 6-6" />,
  back: <path d="M12 4v14m-6-5 6 6 6-6M5 21h14" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  save: (
    <>
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v5h7V3M8 21v-7h8v7" />
    </>
  ),
  open: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h13l3-8H7.5L5 19" />,
  export: <path d="M12 3v12m-5-5 5 5 5-5M4 19v1.5a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5V19" />,
  newFile: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M12 11v6M9 14h6" />
    </>
  ),
  frame: <path d="M7 3v4H3m4-4v14a2 2 0 0 0 2 2h12M17 21v-4h4M17 21V7a2 2 0 0 0-2-2H3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />,
  panelRight: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  panelLeft: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17.2v.1" />
    </>
  ),
  back1: <path d="m10 6-6 6 6 6M4 12h11a5 5 0 0 1 0 8h-3" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  link: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  linkOff: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16" />
  ),
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
