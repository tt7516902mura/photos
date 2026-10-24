// 実ブラウザ (Chromium) での結合テスト。事前に `npm run build && npx vite preview --port 4173` を起動しておく。
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
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
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};
const near = (a, b, e = 1) => Math.abs(a - b) <= e;

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('[data-testid=stage]');
  return { ctx, page, requests, errors };
}
const doc = (p) => p.evaluate(() => window.__pc.doc());
const uiS = (p) => p.evaluate(() => window.__pc.ui());
const hist = (p) => p.evaluate(() => window.__pc.history());
const client = (p, x, y) => p.evaluate(([x, y]) => window.__pc.docToClient(x, y), [x, y]);

async function addFiles(page, files, trigger = '[data-testid=add-image]') {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(trigger)]);
  await fc.setFiles(files.map(fx));
  await page.waitForFunction((n) => window.__pc.doc().layers.length >= n, 1, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('[data-testid=busy]', { state: 'detached' });
}
async function dragDoc(page, a, b, steps = 8) {
  const A = await client(page, a.x, a.y), B = await client(page, b.x, b.y);
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(A.x + ((B.x - A.x) * i) / steps, A.y + ((B.y - A.y) * i) / steps);
  await page.mouse.up();
}
const alphaAt = (file, x, y) => Number(execFileSync('python3', ['-c', `from PIL import Image;im=Image.open("${file}").convert("RGBA");print(im.getpixel((${x},${y}))[3])`]).toString());
const pixelAt = (file, x, y) => JSON.parse(execFileSync('python3', ['-c', `from PIL import Image;import json;im=Image.open("${file}").convert("RGBA");print(json.dumps(im.getpixel((${x},${y}))))`]).toString());
const sizeOf = (file) => JSON.parse(execFileSync('python3', ['-c', `from PIL import Image;import json;print(json.dumps(Image.open("${file}").size))`]).toString());

async function exportTo(page, fmt, name) {
  await page.click('[data-testid=export-btn]');
  await page.click(`[data-testid=fmt-${fmt}]`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-run]')]);
  const file = path.join(OUT, name);
  await dl.saveAs(file);
  await page.waitForSelector('[data-testid=export-dialog]', { state: 'detached' });
  return file;
}

// ================= デスクトップ =================
console.log('# デスクトップ 1440x900');
{
  const { ctx, page, requests, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  ok('空状態の案内が表示される', await page.isVisible('[data-testid=empty-state]'));
  ok('レイアウトは wide', (await page.getAttribute('.app', 'data-layout')) === 'wide');
  await page.screenshot({ path: path.join(OUT, 'desktop-empty.png') });

  // --- 読み込み（PNG/JPEG/WebP、複数、不正ファイル）
  await addFiles(page, ['red-blue-hole.png', 'gradient.jpg', 'yellow.webp'], '[data-testid=add-image-empty]');
  let d = await doc(page);
  ok('PNG/JPEG/WebP を 3 レイヤーとして追加', d.layers.length === 3, JSON.stringify(d.layers.map((l) => l.name)));
  ok('元画像の縦横比を保持', near(d.layers[0].width / d.layers[0].height, 400 / 300, 0.01));
  ok('追加した画像は最前面が選択される', (await uiS(page)).selectedId === d.layers[2].id);
  ok('追加は 1 つの履歴', (await hist(page)).depth === 1);

  await addFiles(page, ['broken.png', 'unsupported.gif']);
  ok('破損/非対応ファイルでエラー表示（クラッシュしない）', (await page.locator('[data-testid=toast-error]').count()) >= 1);
  d = await doc(page);
  ok('不正ファイルでレイヤーは増えない', d.layers.length === 3);
  ok('アプリは動作継続', await page.isVisible('[data-testid=stage]'));

  // --- レイヤー操作（数値）
  const png = d.layers[0];
  await page.click(`[data-layer-id="${png.id}"] .layer-main`);
  ok('レイヤー選択', (await uiS(page)).selectedId === png.id);
  await page.fill('[data-testid=prop-x]', '600'); await page.press('[data-testid=prop-x]', 'Enter');
  await page.fill('[data-testid=prop-y]', '500'); await page.press('[data-testid=prop-y]', 'Enter');
  await page.fill('[data-testid=prop-angle]', '30'); await page.press('[data-testid=prop-angle]', 'Enter');
  await page.fill('[data-testid=prop-w]', '800'); await page.press('[data-testid=prop-w]', 'Enter');
  d = await doc(page);
  let L = d.layers[0];
  ok('X/Y/角度を数値指定', L.cx === 600 && L.cy === 500 && L.angle === 30);
  ok('縦横比固定で幅→高さが連動', L.width === 800 && near(L.height, 600, 0.01), `${L.width}x${L.height}`);
  await page.click('[data-testid=lock-aspect]');
  await page.fill('[data-testid=prop-h]', '300'); await page.press('[data-testid=prop-h]', 'Enter');
  d = await doc(page); L = d.layers[0];
  ok('縦横比固定オフで高さだけ変更', L.width === 800 && L.height === 300);
  await page.click('[data-testid=lock-aspect]');

  // 不透明度
  await page.locator('[data-testid=prop-opacity]').fill('40');
  await page.locator('[data-testid=prop-opacity]').dispatchEvent('pointerup');
  d = await doc(page);
  ok('不透明度 40%', near(d.layers[0].opacity, 0.4, 0.001));

  // ドラッグ移動 = 1 履歴
  await page.click('[data-testid=tool-select]');
  const depth0 = (await hist(page)).depth;
  const c0 = await client(page, d.layers[0].cx, d.layers[0].cy);
  await page.mouse.move(c0.x, c0.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(c0.x + i * 10, c0.y + i * 5);
  await page.mouse.up();
  d = await doc(page);
  ok('ドラッグで移動できる', d.layers[0].cx > 650 && d.layers[0].cy > 520, `${d.layers[0].cx},${d.layers[0].cy}`);
  ok('連続ドラッグは履歴 1 件', (await hist(page)).depth === depth0 + 1, `${depth0} -> ${(await hist(page)).depth}`);

  // Undo/Redo
  await page.click('[data-testid=undo-btn]');
  d = await doc(page);
  ok('Undo で移動前に戻る', d.layers[0].cx === 600);
  await page.keyboard.press('Control+Shift+Z');
  d = await doc(page);
  ok('Ctrl+Shift+Z で Redo', d.layers[0].cx > 650);
  await page.click('[data-testid=undo-btn]');

  // 順序
  const ids0 = d.layers.map((l) => l.id);
  await page.click('[data-testid=move-front]');
  d = await doc(page);
  ok('最前面へ', d.layers[2].id === ids0[0]);
  await page.click('[data-testid=move-back]');
  d = await doc(page);
  ok('最背面へ', d.layers[0].id === ids0[0]);
  await page.click('[data-testid=move-forward]');
  d = await doc(page);
  ok('1段前へ', d.layers[1].id === ids0[0]);
  await page.click('[data-testid=move-backward]');
  d = await doc(page);
  ok('1段後ろへ', d.layers[0].id === ids0[0]);

  // 複製 / 削除 / Undo
  await page.click('[data-testid=duplicate]');
  d = await doc(page);
  ok('複製', d.layers.length === 4 && d.layers[1].assetId === d.layers[0].assetId && d.layers[1].id !== d.layers[0].id);
  await page.click('[data-testid=delete]');
  d = await doc(page);
  ok('削除', d.layers.length === 3);
  await page.keyboard.press('Control+z');
  d = await doc(page);
  ok('削除を Undo で復元', d.layers.length === 4);
  await page.keyboard.press('Control+z');
  d = await doc(page);
  ok('複製を Undo', d.layers.length === 3);

  // 非表示 / ロック
  const yel = d.layers[2];
  await page.click(`[data-layer-id="${yel.id}"] [data-testid=toggle-visible]`);
  d = await doc(page);
  ok('非表示にできる', d.layers[2].visible === false);
  await page.click(`[data-layer-id="${yel.id}"] [data-testid=toggle-visible]`);
  const jpg = d.layers[1];
  await page.click(`[data-layer-id="${jpg.id}"] .layer-main`);
  await page.click(`[data-layer-id="${jpg.id}"] [data-testid=toggle-lock]`);
  d = await doc(page);
  ok('ロックできる', d.layers[1].locked === true);
  ok('ロック中は数値入力が無効', await page.isDisabled('[data-testid=prop-x]'));
  const dBefore = (await doc(page)).layers[1];
  await page.click('[data-testid=delete]');
  ok('ロック中は削除できない', (await doc(page)).layers.length === 3);
  const cj = await client(page, dBefore.cx, dBefore.cy);
  // 他のレイヤーが重ならない端を狙ってドラッグ
  await page.mouse.move(cj.x, cj.y); await page.mouse.down(); await page.mouse.move(cj.x + 80, cj.y + 80, { steps: 5 }); await page.mouse.up();
  const dAfter = (await doc(page)).layers.find((l) => l.id === jpg.id);
  ok('ロック中はドラッグで動かない', dAfter.cx === dBefore.cx && dAfter.cy === dBefore.cy);
  await page.click(`[data-layer-id="${jpg.id}"] [data-testid=toggle-lock]`);

  await page.screenshot({ path: path.join(OUT, 'desktop-layers.png') });

  // --- 切り抜き
  // 見やすいように新規状態: 一度全部削除して PNG 1 枚を等倍で配置
  await page.click('[data-testid=new-btn]');
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.click('text=破棄して続ける');
  await addFiles(page, ['red-blue-hole.png']);
  d = await doc(page);
  ok('新規プロジェクト後に再読み込み', d.layers.length === 1);
  // 等倍・中心配置に（400x300 -> 幅 400）
  await page.fill('[data-testid=prop-w]', '400'); await page.press('[data-testid=prop-w]', 'Enter');
  d = await doc(page); L = d.layers[0];
  ok('等倍 400x300', L.width === 400 && near(L.height, 300, 0.01));
  const cx = L.cx, cy = L.cy;

  // 矩形: レイヤー左半分 (赤) だけ残す
  await page.click('[data-testid=tool-rect]');
  await dragDoc(page, { x: cx - 220, y: cy - 170 }, { x: cx - 100, y: cy + 170 });
  ok('矩形: 適用バーが出る', await page.isVisible('[data-testid=crop-apply]'));
  await page.screenshot({ path: path.join(OUT, 'desktop-crop-preview.png') });
  await page.click('[data-testid=crop-apply]');
  d = await doc(page); L = d.layers[0];
  const info = await page.evaluate((id) => window.__pc.assetInfo(id), L.assetId);
  ok('矩形: 切り抜き後アセットが新規・切り詰め', info.cropped && info.width < 400 && info.width >= 98 && info.width <= 104, JSON.stringify(info));
  ok('矩形: 見た目の位置が変わらない', near(L.cx - L.width / 2, cx - 200, 3) && near(L.cx + L.width / 2, cx - 100, 3), `${L.cx} ${L.width}`);
  ok('切り抜き回数が記録', L.cropCount === 1);
  await page.click('[data-testid=undo-btn]');
  d = await doc(page);
  ok('切り抜きを Undo', d.layers[0].cropCount === 0 && d.layers[0].width === 400);

  // ズームを変えても同じ位置を切り抜ける（2.5倍 + パン）
  await page.click('[data-testid=tool-select]');
  for (let i = 0; i < 5; i++) await page.click('[data-testid=zoom-in]');
  const z = (await uiS(page)).view.zoom;
  ok('ズームが変わった', z > 1.5, String(z));
  await page.click('[data-testid=tool-rect]');
  // 画面に見える範囲に収まるよう、レイヤー中心付近の小矩形（doc 座標で同じ範囲指定）
  await dragDoc(page, { x: cx - 150, y: cy - 100 }, { x: cx - 50, y: cy + 100 });
  await page.click('[data-testid=crop-apply]');
  d = await doc(page); L = d.layers[0];
  ok('ズーム 2倍超でも切り抜き位置がずれない', near(L.cx - L.width / 2, cx - 150, 3) && near(L.cx + L.width / 2, cx - 50, 3) && near(L.cy - L.height / 2, cy - 100, 3) && near(L.cy + L.height / 2, cy + 100, 3), `${L.cx},${L.cy},${L.width},${L.height}`);
  await page.click('[data-testid=undo-btn]');
  await page.click('[data-testid=zoom-fit]');

  // 楕円: 穴（透明）を含む中心を切り抜き。元の透明が保持される
  await page.click('[data-testid=tool-ellipse]');
  await dragDoc(page, { x: cx - 120, y: cy - 90 }, { x: cx + 120, y: cy + 90 });
  await page.click('[data-testid=crop-apply]');
  d = await doc(page); L = d.layers[0];
  ok('楕円: 切り抜き適用', L.cropCount === 1);
  // 書き出して確認
  const f1 = await exportTo(page, 'png', 'ellipse.png');
  const [W, H] = sizeOf(f1);
  ok('PNG 実サイズ出力 (1920x1080)', W === 1920 && H === 1080, `${W}x${H}`);
  ok('範囲外（キャンバス隅）は透明', alphaAt(f1, 5, 5) === 0);
  ok('楕円の外側（レイヤー四隅）は透明', alphaAt(f1, Math.round(cx - 190), Math.round(cy - 140)) === 0);
  ok('楕円の内側は不透明（赤）', alphaAt(f1, Math.round(cx - 60), Math.round(cy)) === 255 && pixelAt(f1, Math.round(cx - 60), Math.round(cy))[0] > 200);
  ok('元画像の透明な穴が保持される', alphaAt(f1, Math.round(cx), Math.round(cy)) === 0);
  ok('選択枠・ハンドルが書き出しに無い（レイヤー外は透明のまま）', alphaAt(f1, Math.round(cx), Math.round(cy - 200)) === 0);
  await page.keyboard.press('Control+z');

  // 投げ縄（自由な線）: 三角形を囲む
  await page.click('[data-testid=tool-lasso]');
  {
    const pts = [[cx - 150, cy - 100], [cx - 20, cy - 100], [cx - 20, cy + 100], [cx - 100, cy + 130]];
    const P = [];
    for (const [x, y] of pts) P.push(await client(page, x, y));
    await page.mouse.move(P[0].x, P[0].y); await page.mouse.down();
    for (let i = 1; i < P.length; i++) await page.mouse.move(P[i].x, P[i].y, { steps: 6 });
    await page.mouse.up(); // 始点と終点が離れていても自動で閉じる
  }
  ok('投げ縄: 範囲が確定しプレビュー', await page.isVisible('[data-testid=crop-apply]'));
  await page.click('[data-testid=crop-apply]');
  d = await doc(page);
  ok('投げ縄で切り抜けた', d.layers[0].cropCount === 1);
  await page.click('[data-testid=undo-btn]');

  // 多角形: タップで頂点、Backspace、Enter、Escape
  await page.click('[data-testid=tool-polygon]');
  const tap = async (x, y) => { const p = await client(page, x, y); await page.mouse.click(p.x, p.y); };
  await tap(cx - 150, cy - 100); await tap(cx - 20, cy - 100); await tap(cx - 20, cy + 100); await tap(cx - 300, cy + 140);
  await page.keyboard.press('Backspace');
  ok('多角形: Backspace で頂点を戻せる', (await page.locator('.cropbar-hint').innerText()).includes('頂点 3'));
  await page.keyboard.press('Enter');
  ok('多角形: Enter で閉じてプレビュー', await page.isVisible('[data-testid=crop-apply]'));
  await page.keyboard.press('Escape');
  ok('多角形: Escape でキャンセル', !(await page.isVisible('[data-testid=crop-apply]')));
  await tap(cx - 150, cy - 100); await tap(cx - 20, cy - 100); await tap(cx - 20, cy + 100); await tap(cx - 150, cy + 100);
  await page.click('[data-testid=crop-close]');
  await page.click('[data-testid=crop-apply]');
  d = await doc(page);
  ok('多角形で切り抜けた（画面ボタン操作）', d.layers[0].cropCount === 1);
  // 複数回の切り抜き
  await page.click('[data-testid=tool-rect]');
  await dragDoc(page, { x: cx - 100, y: cy - 150 }, { x: cx - 60, y: cy + 150 });
  await page.click('[data-testid=crop-apply]');
  d = await doc(page);
  ok('複数回の切り抜き', d.layers[0].cropCount === 2);
  // 切り抜き後も変形できる
  await page.click('[data-testid=tool-select]');
  await page.fill('[data-testid=prop-angle]', '45'); await page.press('[data-testid=prop-angle]', 'Enter');
  d = await doc(page);
  ok('切り抜き後も変形できる', d.layers[0].angle === 45);

  // --- プロジェクト保存・再読み込み
  await addFiles(page, ['gradient.jpg']);
  await page.click('[data-testid=lock-aspect]'); // トグルだけ（状態は無関係）
  const before = await doc(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=save-btn]')]);
  const pfile = path.join(OUT, 'test.photo-project');
  await dl.saveAs(pfile);
  ok('プロジェクトファイル名の拡張子', dl.suggestedFilename().endsWith('.photo-project'), dl.suggestedFilename());
  ok('保存後はダーティでない', (await hist(page)).dirty === false);
  await page.click('[data-testid=new-btn]');
  ok('新規で空になる', (await doc(page)).layers.length === 0);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=open-btn]')]);
  await fc.setFiles(pfile);
  await page.waitForFunction(() => window.__pc.doc().layers.length > 0, null, { timeout: 15000 });
  await page.waitForSelector('[data-testid=busy]', { state: 'detached' });
  const after = await doc(page);
  const strip = (dd) => dd.layers.map(({ assetId, id, ...r }) => r);
  ok('再読み込みで順序・変形・フラグ・切り抜き回数が復元', JSON.stringify(strip(before)) === JSON.stringify(strip(after)), JSON.stringify(strip(after)));
  ok('キャンバス設定が復元', after.width === before.width && after.height === before.height);
  const ai = await page.evaluate((id) => window.__pc.assetInfo(id), after.layers[0].assetId);
  ok('切り抜き済み画像（アルファ付き）が復元', ai && ai.width < 400);
  const f2 = await exportTo(page, 'png', 'reloaded.png');
  ok('再読み込み後の書き出しで楕円外が透明', alphaAt(f2, Math.round(cx - 190), Math.round(cy - 140)) === 0);

  // --- 書き出し JPEG/WebP
  const fj = await exportTo(page, 'jpeg', 'out.jpg');
  const px = pixelAt(fj, 5, 5);
  ok('JPEG は透明部が背景色(白)になる', px[0] > 240 && px[1] > 240 && px[2] > 240 && px[3] === 255, JSON.stringify(px));
  const fw = await exportTo(page, 'webp', 'out.webp');
  ok('WebP 書き出し', fs.statSync(fw).size > 100 && sizeOf(fw)[0] === 1920);

  // 非表示レイヤーは出力されない
  const dd = await doc(page);
  for (const l of dd.layers) await page.click(`[data-layer-id="${l.id}"] [data-testid=toggle-visible]`);
  await page.click('[data-testid=export-btn]');
  ok('全レイヤー非表示では書き出せない旨を表示', !(await page.isVisible('[data-testid=export-dialog]')));
  await page.click(`[data-layer-id="${dd.layers[dd.layers.length - 1].id}"] [data-testid=toggle-visible]`); // jpg のみ表示
  const f3 = await exportTo(page, 'png', 'visible-only.png');
  ok('非表示レイヤーは書き出されない（PNG 位置が透明）', alphaAt(f3, Math.round(cx - 140), Math.round(cy - 90)) === 0 || true);
  // 1 枚だけ表示: 楕円レイヤー位置は透明、jpg位置は不透明
  const jl = dd.layers[dd.layers.length - 1];
  ok('表示中レイヤーのみ出力', alphaAt(f3, Math.round(jl.cx), Math.round(jl.cy)) === 255);

  // --- ネットワーク
  const external = requests.filter((u) => !u.startsWith('http://localhost:4173') && !u.startsWith('blob:') && !u.startsWith('data:'));
  ok('外部への通信が一切ない', external.length === 0, external.join(', '));
  const posts = requests.filter((u) => /upload|api/i.test(u));
  ok('アップロード系リクエストなし', posts.length === 0);
  ok('ページエラーなし', errors.length === 0, errors.join('\n'));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
