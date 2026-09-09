/**
 * 배포본이 자산(glb·draco)을 제대로 받아 오는지 확인한다.
 *
 *   npm run check:dist                      로컬 dist 를 BASE_PATH 하위 경로에서 서빙해 검사
 *   npm run check:dist -- <URL>             이미 배포된 실제 사이트를 검사
 */
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_PATH || '/';
const PORT = 4174;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const remote = process.argv[2];
const server = remote
  ? null
  : await preview({ root: ROOT, base: BASE, preview: { port: PORT, strictPort: true, open: false } });
const url = remote || `http://localhost:${PORT}${BASE}`;
console.log(remote ? '검사 대상(원격)' : '검사 대상(로컬 dist)', url);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const responses = [];
const errors = [];
page.on('response', (r) => responses.push([r.status(), new URL(r.url()).pathname]));
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const bad = responses.filter(([s]) => s >= 400);
const glb = responses.filter(([, p]) => p.endsWith('body.glb'));
const draco = responses.filter(([, p]) => p.includes('/draco/'));
const shot = path.join(ROOT, 'verify', 'shots', remote ? '06-live.png' : '05-dist.png');
await page.screenshot({ path: shot });

console.log('요청 수', responses.length);
console.log('glb   ', JSON.stringify(glb));
console.log('draco ', JSON.stringify(draco));
console.log('4xx/5xx', bad.length ? JSON.stringify(bad) : '없음');
console.log('페이지 오류', errors.length ? errors.slice(0, 3) : '없음');
console.log('스크린샷', path.relative(ROOT, shot));

await browser.close();
await server?.close();
process.exit(bad.length || errors.length || !glb.some(([s]) => s === 200) ? 1 : 0);
