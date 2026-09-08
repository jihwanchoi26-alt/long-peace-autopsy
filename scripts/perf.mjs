/**
 * 실제 GPU · 실제 창 크기에서 프레임 타임을 잰다.
 *
 *   npm run perf
 *
 * 크롬 창을 띄우고, 방 안을 실제로 걸어 다니는 상태에서 픽셀 비율별로 측정한다.
 * 셰이더 컴파일·텍스처 업로드에 오염되지 않도록 예열한 뒤 각 조건을 두 번 재고
 * 뒤엣것만 취한다.
 *
 *   CHROME_PATH=<경로>  크롬 실행 파일 지정
 */
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5179;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const server = await createServer({ root: ROOT, logLevel: 'warn', server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  defaultViewport: null,
  args: ['--window-size=1600,900', '--window-position=40,40']
});
const page = (await browser.pages())[0];
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction('!!window.__autopsy', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  document.getElementById('veil').hidden = true;
  document.getElementById('clipboard').classList.remove('open');
});

const info = await page.evaluate(() => {
  const c = document.getElementById('gl');
  return { css: [c.clientWidth, c.clientHeight], dpr: devicePixelRatio };
});
console.log(`창(css) ${info.css.join('x')}  devicePixelRatio ${info.dpr}\n`);

/** 방 안을 걸어 다니면서 seconds 초 동안 프레임 간격을 모은다. */
async function walk(ratio, seconds) {
  return page.evaluate(async (ratio, seconds) => {
    const a = window.__autopsy, R = a.stage.renderer, c = document.getElementById('gl');
    if (ratio) a.stage.setAdaptive(false);
    if (ratio) { R.setPixelRatio(ratio); R.setSize(c.clientWidth, c.clientHeight, false);
      a.stage.camera.aspect = c.clientWidth / c.clientHeight; a.stage.camera.updateProjectionMatrix(); }
    const deltas = [];
    let last = performance.now();
    const t0 = last, stop = last + seconds * 1000;
    await new Promise((resolve) => {
      function tick(t) {
        deltas.push(t - last); last = t;
        // 검안대 주위를 돈다 — 바닥이 화면에서 실제로 흐르게
        const p = (t - t0) / 1000;
        a.player.teleport(1.6 * Math.cos(p * 0.9), 2.2 + 1.2 * Math.sin(p * 0.9));
        if (t < stop) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
    deltas.shift();
    const s = [...deltas].sort((x, y) => x - y);
    const q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
    return {
      fps: +(1000 / (deltas.reduce((x, y) => x + y, 0) / deltas.length)).toFixed(1),
      median: q(0.5), p95: q(0.95), max: +Math.max(...deltas).toFixed(1),
      over20: deltas.filter((d) => d > 20).length, frames: deltas.length,
      buffer: [c.width, c.height], calls: R.info.render.calls, tris: R.info.render.triangles
    };
  }, ratio, seconds);
}

await walk(1, 3);                      // 예열 — 버린다
for (const r of [1, 1.25, 1.5, 2]) {
  await walk(r, 1.5);                  // 조건 전환 직후는 버린다
  const m = await walk(0, 3);
  console.log(
    `비율 ${String(r).padEnd(4)} ${String(m.fps).padStart(5)} fps  ` +
    `중앙값 ${String(m.median).padStart(5)}ms  p95 ${String(m.p95).padStart(5)}ms  ` +
    `최대 ${String(m.max).padStart(6)}ms  20ms초과 ${m.over20}/${m.frames}  ` +
    `버퍼 ${m.buffer.join('x')}  드로우 ${m.calls} 삼각형 ${m.tris}`
  );
}

// 적응 해상도를 켠 채로 — 실제 게임이 어디에 안착하는지
console.log('');
await page.evaluate(() => {
  const a = window.__autopsy;
  a.stage.setAdaptive(true);
  a.stage.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
await walk(0, 3);                       // 안착할 시간을 준다
const auto = await walk(0, 4);
const finalRatio = await page.evaluate(() => window.__autopsy.stage.pixelRatio());
console.log(
  `적응 모드  ${String(auto.fps).padStart(5)} fps  중앙값 ${String(auto.median).padStart(5)}ms  ` +
  `p95 ${String(auto.p95).padStart(5)}ms  20ms초과 ${auto.over20}/${auto.frames}  ` +
  `안착 비율 ${finalRatio}  버퍼 ${auto.buffer.join('x')}`
);

await browser.close();
await server.close();
