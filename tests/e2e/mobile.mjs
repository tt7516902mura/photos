// スマホ・タブレットのタッチ操作とレスポンシブ検証
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => path.join(here, 'fixtures', n);
const OUT = process.env.E2E_OUT || '/tmp/pc-e2e';
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.APP_URL || 'http://localhost:4173/?debug';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, x)));
const near = (a, b, e = 1.5) => Math.abs(a - b) <= e;
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

async function open(name, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, acceptDownloads: true, ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('[data-testid=stage]');
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
  return { ctx, page, errors, touch, name };
}
const doc = (p) => p.evaluate(() => window.__pc.doc());
const uiS = (p) => p.evaluate(() => window.__pc.ui());
const hist = (p) => p.evaluate(() => window.__pc.history());
const client = (p, x, y) => p.evaluate(([x, y]) => window.__pc.docToClient(x, y), [x, y]);
async function add(page, files) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=add-image-empty], [data-testid=add-image]')]);
  await fc.setFiles(files.map(fx));
  await page.waitForFunction(() => window.__pc.doc().layers.length > 0, null, { timeout: 15000 });
  await page.waitForSelector('[data-testid=busy]', { state: 'detached' });
}
async function layoutChecks(t, label) {
  const { page } = t;
  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  ok(`${label}: 横スクロールなし`, sw.sw <= sw.iw && sw.sh <= sw.ih, JSON.stringify(sw));
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.header button, .rail button, .zoom button, .cropbar button, .sheet button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${b.getAttribute('data-testid') || b.textContent?.trim()}:${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  ok(`${label}: 主要ボタンが 44px 以上`, small.length === 0, small.join(' '));
  const stage = await page.evaluate(() => { const r = document.querySelector('[data-testid=stage]').getBoundingClientRect(); return { w: r.width, h: r.height, ih: innerHeight, iw: innerWidth }; });
  return stage;
}
const overlap = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('.header > *, .rail > *')].filter((e) => e.getBoundingClientRect().width > 0);
  const rs = els.map((e) => e.getBoundingClientRect());
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return `${els[i].className}/${els[j].className}`;
  }
  return '';
});

// ===== スマホ縦 =====
console.log('# スマホ縦 390x844');
{
  const t = await open('phone', { width: 390, height: 844 });
  const { page } = t;
  ok('compact レイアウト', (await page.getAttribute('.app', 'data-layout')) === 'compact');
  await add(page, ['red-blue-hole.png', 'gradient.jpg']);
  const st = await layoutChecks(t, 'スマホ縦');
  ok('スマホ縦: キャンバスが十分広い', st.h > st.ih * 0.55, JSON.stringify(st));
  ok('スマホ縦: ボタンが重ならない', (await overlap(page)) === '', await overlap(page));
  await page.screenshot({ path: path.join(OUT, 'phone-portrait.png') });

  // シート（レイヤー / プロパティ）
  await page.tap('[data-testid=open-layers]');
  ok('レイヤーシートが開く', await page.isVisible('[data-testid=layer-list]'));
  const st2 = await layoutChecks(t, 'スマホ縦(シート表示中)');
  ok('シート表示中もキャンバスが残る', st2.h > st2.ih * 0.3, JSON.stringify(st2));
  await page.screenshot({ path: path.join(OUT, 'phone-layers.png') });
  await page.tap('[data-testid=tab-props]');
  ok('プロパティシートに数値入力', await page.isVisible('[data-testid=prop-x]'));
  await page.screenshot({ path: path.join(OUT, 'phone-props.png') });
  await page.tap('[data-testid=sheet-close]');

  // 1 本指でレイヤー移動
  const d0 = await doc(page);
  const L = d0.layers[1];
  await page.tap('[data-testid=tool-select]');
  const c = await client(page, L.cx, L.cy);
  await t.touch('touchStart', [{ x: c.x, y: c.y }]);
  for (let i = 1; i <= 8; i++) await t.touch('touchMove', [{ x: c.x + i * 6, y: c.y + i * 4 }]);
  await t.touch('touchEnd', []);
  const d1 = await doc(page);
  ok('タッチでレイヤーを移動できる', d1.layers[1].cx > L.cx + 20, `${L.cx} -> ${d1.layers[1].cx}`);

  // ピンチ: レイヤーを動かさず拡大
  const before = await doc(page);
  const z0 = (await uiS(page)).view.zoom;
  const h0 = (await hist(page)).depth;
  const cc = await client(page, 960, 540);
  const A = { x: cc.x - 30, y: cc.y }, B = { x: cc.x + 30, y: cc.y };
  await t.touch('touchStart', [{ ...A, id: 1 }]);
  await t.touch('touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]);
  for (let i = 1; i <= 10; i++) await t.touch('touchMove', [{ x: A.x - i * 6, y: A.y, id: 1 }, { x: B.x + i * 6, y: B.y, id: 2 }]);
  await t.touch('touchEnd', []);
  const z1 = (await uiS(page)).view.zoom;
  const after = await doc(page);
  ok('2 本指ピンチで拡大', z1 > z0 * 1.8, `${z0} -> ${z1}`);
  ok('ピンチ中にレイヤーは動かない・履歴も増えない', JSON.stringify(before) === JSON.stringify(after) && (await hist(page)).depth === h0, `${h0} -> ${(await hist(page)).depth}`);
  // 2 本指パン
  const v0 = (await uiS(page)).view;
  await t.touch('touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]);
  for (let i = 1; i <= 8; i++) await t.touch('touchMove', [{ x: A.x + i * 5, y: A.y + i * 5, id: 1 }, { x: B.x + i * 5, y: B.y + i * 5, id: 2 }]);
  await t.touch('touchEnd', []);
  const v1 = (await uiS(page)).view;
  ok('2 本指ドラッグでパン', v1.panX > v0.panX + 20 && near(v1.zoom, v0.zoom, 0.01), `${v0.panX} -> ${v1.panX}`);
  await page.tap('[data-testid=zoom-fit]');

  // タッチ投げ縄
  await page.tap(`[data-layer-id="${L.id}"]`).catch(() => {});
  await page.tap('[data-testid=open-layers]');
  await page.tap(`[data-layer-id="${L.id}"] .layer-main`);
  await page.tap('[data-testid=sheet-close]');
  await page.tap('[data-testid=tool-lasso]');
  const cur = (await doc(page)).layers[1];
  const pts = [[-60, -60], [60, -60], [60, 60], [-60, 60]].map(([dx, dy]) => [cur.cx + dx, cur.cy + dy]);
  const P = [];
  for (const [x, y] of pts) P.push(await client(page, x, y));
  await t.touch('touchStart', [P[0]]);
  for (let i = 1; i < P.length; i++) for (let s = 1; s <= 5; s++) await t.touch('touchMove', [{ x: P[i - 1].x + ((P[i].x - P[i - 1].x) * s) / 5, y: P[i - 1].y + ((P[i].y - P[i - 1].y) * s) / 5 }]);
  await t.touch('touchEnd', []);
  ok('タッチ投げ縄で範囲が確定', await page.isVisible('[data-testid=crop-apply]'));
  await layoutChecks(t, 'スマホ縦(切り抜きバー表示中)');
  await page.screenshot({ path: path.join(OUT, 'phone-lasso.png') });
  await page.tap('[data-testid=crop-apply]');
  ok('タッチ投げ縄で切り抜き', (await doc(page)).layers[1].cropCount === 1);

  // 投げ縄の途中で 2 本目の指 → 描画は破棄、ズームのみ
  await t.touch('touchStart', [P[0]]);
  for (let s = 1; s <= 4; s++) await t.touch('touchMove', [{ x: P[0].x + s * 8, y: P[0].y }]);
  await t.touch('touchStart', [{ ...P[0], x: P[0].x + 32, id: 0 }, { x: P[2].x, y: P[2].y, id: 1 }]);
  await t.touch('touchMove', [{ x: P[0].x + 32, y: P[0].y, id: 0 }, { x: P[2].x + 40, y: P[2].y + 40, id: 1 }]);
  await t.touch('touchEnd', []);
  ok('投げ縄途中のマルチタッチで範囲を確定しない', !(await page.isVisible('[data-testid=crop-apply]')));
  ok('マルチタッチ後もアプリは動作', await page.isVisible('[data-testid=cropbar]'));

  // タッチ多角形（画面ボタン）
  await page.tap('[data-testid=zoom-fit]');
  await page.tap('[data-testid=tool-polygon]');
  const cur2 = (await doc(page)).layers[1];
  for (const [dx, dy] of [[-100, -100], [100, -100], [100, 100], [-100, 100]]) {
    const p = await client(page, cur2.cx + dx, cur2.cy + dy);
    await page.touchscreen.tap(p.x, p.y);
  }
  await page.tap('[data-testid=crop-back]');
  ok('多角形: 「戻る」で頂点を削除', (await page.locator('.cropbar-hint').innerText()).includes('頂点 3'));
  const p4 = await client(page, cur2.cx - 100, cur2.cy + 100);
  await page.touchscreen.tap(p4.x, p4.y);
  await page.tap('[data-testid=crop-close]');
  ok('多角形: 「確定」で閉じる', await page.isVisible('[data-testid=crop-apply]'));
  await page.tap('[data-testid=crop-cancel]');
  ok('多角形: 「キャンセル」で破棄', !(await page.isVisible('[data-testid=crop-apply]')));

  // メニュー
  await page.tap('[data-testid=menu-btn]');
  ok('メニューが開く', await page.isVisible('[data-testid=menu]'));
  await page.screenshot({ path: path.join(OUT, 'phone-menu.png') });
  await page.tap('[data-testid=menu-canvas]');
  ok('キャンバス設定ダイアログ', await page.isVisible('[data-testid=canvas-dialog]'));
  await page.screenshot({ path: path.join(OUT, 'phone-canvas-dialog.png') });
  await page.keyboard.press('Escape');
  ok('Esc でダイアログが閉じる', !(await page.isVisible('[data-testid=canvas-dialog]')));
  ok('ページエラーなし', t.errors.length === 0, t.errors.join('\n'));
  await t.ctx.close();
}

// ===== スマホ横 =====
console.log('# スマホ横 844x390');
{
  const t = await open('phone-l', { width: 844, height: 390 });
  const { page } = t;
  await add(page, ['red-blue-hole.png']);
  const st = await layoutChecks(t, 'スマホ横');
  ok('スマホ横: キャンバスが極端に狭くない', st.w > 500 && st.h > 250, JSON.stringify(st));
  ok('スマホ横: ツールが縦レールで左にある', await page.evaluate(() => document.querySelector('.rail.bottom').getBoundingClientRect().left < 5));
  ok('スマホ横: ボタンが重ならない', (await overlap(t.page)) === '', await overlap(t.page));
  await page.tap('[data-testid=open-layers]');
  const st2 = await layoutChecks(t, 'スマホ横(シート)');
  ok('スマホ横: シート表示中もキャンバス幅を確保', st2.w > 400, JSON.stringify(st2));
  await page.screenshot({ path: path.join(OUT, 'phone-landscape.png') });
  await t.ctx.close();
}

// ===== タブレット =====
for (const [label, w, h] of [['タブレット縦 768x1024', 768, 1024], ['タブレット横 1180x820', 1180, 820]]) {
  console.log('# ' + label);
  const t = await open(label, { width: w, height: h });
  const { page } = t;
  await add(page, ['red-blue-hole.png', 'gradient.jpg']);
  const lay = await page.getAttribute('.app', 'data-layout');
  ok(`${label}: レイアウト ${lay}`, w >= 900 ? lay === 'wide' : lay === 'compact');
  const st = await layoutChecks(t, label);
  ok(`${label}: キャンバスが十分広い`, st.w * st.h > w * h * 0.5, JSON.stringify(st));
  ok(`${label}: ボタンが重ならない`, (await overlap(page)) === '', await overlap(page));
  if (lay === 'wide') ok(`${label}: 右パネル表示`, await page.isVisible('[data-testid=side]'));
  await page.screenshot({ path: path.join(OUT, `tablet-${w}.png`) });
  // タッチで選択ツール移動
  const d0 = await doc(page);
  const L = d0.layers[1];
  const c = await client(page, L.cx, L.cy);
  await t.touch('touchStart', [{ x: c.x, y: c.y }]);
  for (let i = 1; i <= 6; i++) await t.touch('touchMove', [{ x: c.x + i * 8, y: c.y }]);
  await t.touch('touchEnd', []);
  ok(`${label}: タッチ移動`, (await doc(page)).layers[1].cx > L.cx + 20);
  await t.ctx.close();
}

// ===== PC: 小さいウィンドウ、パネル開閉、ショートカット =====
console.log('# PC 操作');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('[data-testid=stage]');
  await add(page, ['red-blue-hole.png']);
  ok('PC: 右パネル表示', await page.isVisible('[data-testid=side]'));
  await page.click('[data-testid=toggle-right]');
  ok('PC: 右パネルを隠せる', !(await page.isVisible('[data-testid=side]')));
  await page.click('[data-testid=toggle-left]');
  ok('PC: ツールバーを隠せる', !(await page.isVisible('[data-testid=toolbar]')));
  await page.click('[data-testid=toggle-left]');
  await page.click('[data-testid=toggle-right]');
  // 入力中のショートカット抑止
  const id = (await doc(page)).layers[0].id;
  await page.click(`[data-layer-id="${id}"] .layer-main`);
  await page.focus('[data-testid=prop-name]');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  ok('入力欄での Delete/Backspace でレイヤーが消えない', (await doc(page)).layers.length === 1);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=prop-name]').blur();
  await page.keyboard.press('Delete');
  ok('Delete でレイヤー削除', (await doc(page)).layers.length === 0);
  await page.keyboard.press('Control+z');
  ok('Ctrl+Z で復元', (await doc(page)).layers.length === 1);
  await page.keyboard.press('l');
  ok('L キーで投げ縄', (await uiS(page)).tool === 'lasso');
  await page.keyboard.press('Escape');
  ok('Esc で選択ツールへ', (await uiS(page)).tool === 'select');
  // ホイールズーム（Ctrl+ホイール）
  const z0 = (await uiS(page)).view.zoom;
  await page.mouse.move(600, 400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  ok('Ctrl+ホイールで拡大', (await uiS(page)).view.zoom > z0);
  // Space+ドラッグでパン
  const v0 = (await uiS(page)).view;
  await page.keyboard.down('Space');
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(700, 450, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Space');
  const v1 = (await uiS(page)).view;
  ok('Space+ドラッグでパン（レイヤーは動かない）', v1.panX > v0.panX + 50 && (await doc(page)).layers[0].cx === 960);
  // キャンバス設定
  await page.click('[data-testid=canvas-btn]');
  await page.fill('[data-testid=canvas-w]', '1000'); await page.fill('[data-testid=canvas-h]', '500');
  await page.click('[data-testid=bg-color]');
  await page.click('[data-testid=canvas-apply]');
  const dd = await doc(page);
  ok('キャンバスサイズ・背景を変更', dd.width === 1000 && dd.height === 500 && dd.background.type === 'color');
  await page.click('[data-testid=canvas-btn]');
  await page.fill('[data-testid=canvas-w]', '99999');
  await page.click('[data-testid=canvas-apply]');
  ok('不正サイズはエラー表示', await page.isVisible('.note.error'));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'desktop-final.png') });
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
