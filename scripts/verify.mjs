/**
 * 전 과정 자동 검증.
 *
 *   npm run verify
 *
 * vite 개발 서버를 코드에서 직접 띄우고, 설치된 크롬을 헤드리스로 붙여
 * 외표검사 → 개복 → 세 계통 → 37일 → 사인판정까지 실제 게임 경로로 통과시킨다.
 * 각 단계 스크린샷은 verify/shots/ 에 남는다. 하나라도 실패하면 종료 코드 1.
 *
 * 환경 변수
 *   VERIFY_HEADED=1        창을 띄운 채로 실행(디버깅용)
 *   CHROME_PATH=<경로>     크롬 실행 파일을 직접 지정
 */
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'verify', 'shots');
const PORT = 5178;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);

const ANSWERS = [
  '1914년 유럽 전면전 발발',
  '동맹과 총동원 계획표가 자동으로 작동해 작은 분쟁이 전면전이 됨',
  '두 진영으로 굳은 체제 + 군비경쟁 + 속이 비어 버린 국내 정당성',
  '평화로운 번영과 파국을 동시에 만든 제국주의 경쟁 체제 그 자체'
];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`);
};

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      '크롬을 찾지 못했습니다. CHROME_PATH 환경 변수로 실행 파일 경로를 지정하세요.\n' +
      '  예) set CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    );
  }
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, browser;
try {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  console.log('\n[1/3] vite 개발 서버 기동');
  server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    server: { port: PORT, strictPort: true, open: false }
  });
  await server.listen();
  const url = `http://localhost:${PORT}/`;
  console.log(`      ${url}`);

  console.log('[2/3] 크롬 기동');
  const executablePath = findChrome();
  console.log(`      ${executablePath}`);
  browser = await puppeteer.launch({
    executablePath,
    headless: process.env.VERIFY_HEADED ? false : 'new',
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--enable-unsafe-swiftshader',   // 헤드리스에서 WebGL 을 소프트웨어로 돌린다
      '--use-angle=swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  console.log('[3/3] 검안 진행\n');
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // 모델 로드까지 대기 (DRACO 디코딩 포함)
  await page.waitForFunction('!!window.__autopsy', { timeout: 60000 });
  await sleep(700);
  // 자동 실행에는 포인터 락이 없으므로 시작 안내막을 걷는다
  await page.evaluate(() => {
    document.getElementById('veil').hidden = true;
    document.getElementById('clipboard').classList.remove('open');
  });

  const info = await page.evaluate(() => ({
    source: window.__autopsy.model.source,
    missing: window.__autopsy.model.missing,
    parts: Object.fromEntries(
      ['skin', 'limbs', 'wound', 'vessel', 'bone', 'nerve']
        .map((k) => [k, window.__autopsy.model.meshes[k].length])
    )
  }));
  check('모델 로드', info.source === 'glb' || info.source === 'fallback', `source=${info.source}`);
  check('부위 매핑 완결', info.missing.length === 0, `meshes=${JSON.stringify(info.parts)}`);
  await page.screenshot({ path: path.join(SHOTS, '00-room.png') });

  // ── 외표검사 ──
  await page.evaluate(() => window.__autopsy.api.approach());
  await sleep(500);
  const wound = await page.evaluate(() => {
    const hit = window.__autopsy.api.examine('wound');
    return { hit, title: document.getElementById('docTitle').textContent, action: window.__autopsy.api.actionLabel() };
  });
  check('총상 조준·검안', wound.hit === 'wound' && wound.title === '흉부 관통상', `조준=${wound.hit}`);
  check('개복 행동 열림', wound.action === '개복하기', `action=${wound.action}`);
  await sleep(1400);
  await page.screenshot({ path: path.join(SHOTS, '01-wound.png') });

  // ── 내부검사 ──
  await page.evaluate(() => window.__autopsy.api.act());
  await sleep(600);
  const opened = await page.evaluate(() => {
    const m = window.__autopsy.model;
    const op = (k) => m.meshes[k][0].material.opacity;
    return {
      stage: window.__autopsy.api.stage(),
      skin: op('skin'), limbs: op('limbs'),
      vessel: op('vessel'), bone: op('bone'), nerve: op('nerve'),
      internalsVisible: m.nodes.bone.every((o) => o.visible)
    };
  });
  check('개복 → 2단계 진입', opened.stage === 1, `stage=${opened.stage}`);
  check('표피만 반투명', opened.skin === 0.17 && opened.limbs === 0.17,
    `skin=${opened.skin} limbs=${opened.limbs}`);
  check('장기는 불투명 유지', opened.vessel === 1 && opened.bone === 1 && opened.nerve === 1,
    `vessel=${opened.vessel} bone=${opened.bone} nerve=${opened.nerve}`);
  check('내부 계통 표시', opened.internalsVisible);

  for (const part of ['vessel', 'bone', 'nerve']) {
    await page.evaluate(() => window.__autopsy.api.approach());
    const r = await page.evaluate((p) => {
      const hit = window.__autopsy.api.examine(p);
      return { hit, title: document.getElementById('docTitle').textContent };
    }, part);
    check(`계통 검안 — ${part}`, r.hit === part, `조준=${r.hit} / ${r.title}`);
    await sleep(350);
  }
  const ledger = await page.evaluate(() => ({
    text: document.querySelector('.ledger h3')?.textContent ?? '',
    action: window.__autopsy.api.actionLabel()
  }));
  check('장기 소견 3/3', ledger.text.includes('3 / 3'), ledger.text);
  check('타임라인 행동 열림', ledger.action === '37일 타임라인', `action=${ledger.action}`);
  await sleep(900);
  await page.screenshot({ path: path.join(SHOTS, '02-opened.png') });

  // ── 37일 ──
  await page.evaluate(() => window.__autopsy.api.act());
  await sleep(400);
  let days = 0;
  for (let i = 0; i < 12; i++) {
    const label = await page.evaluate(() => window.__autopsy.api.actionLabel());
    if (label !== '다음 날짜') break;
    await page.evaluate(() => window.__autopsy.api.act());
    days++;
    await sleep(140);
  }
  const tl = await page.evaluate(() => ({
    shown: document.querySelectorAll('#tl li.shown').length,
    end: document.getElementById('tlEnd')?.style.display === '',
    bleed: window.__autopsy.model.meshes.skin[0].material.opacity,
    action: window.__autopsy.api.actionLabel()
  }));
  check('37일 경과', days === 8 && tl.shown === 8, `진행=${days}일 / 표시=${tl.shown}행`);
  check('사망 판정문 노출', tl.end);
  check('판정서 행동 열림', tl.action === '사인 판정서 작성', `action=${tl.action}`);
  await page.screenshot({ path: path.join(SHOTS, '03-timeline.png') });

  // ── 사인판정 ──
  await page.evaluate(() => window.__autopsy.api.act());
  await sleep(400);
  const certRows = await page.evaluate(() => document.querySelectorAll('.cert tr').length);
  check('판정서 4칸', certRows === 4, `rows=${certRows}`);

  // 오답을 한 번 넣어 판정 로직이 실제로 걸러내는지 본다
  // (그 칸이 실제로 가진 선택지 중 정답이 아닌 것을 고른다)
  const wrong = await page.evaluate((correct) => {
    const sel = document.querySelectorAll('.cert select')[0];
    const bad = [...sel.options].map((o) => o.value).find((v) => v && v !== correct);
    sel.value = bad;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      chosen: bad,
      no: document.querySelectorAll('.cert tr.no').length,
      mark: document.querySelector('.mark')?.textContent ?? '',
      final: !!document.querySelector('.stamp.over')
    };
  }, ANSWERS[0]);
  check('오답 표시', wrong.no === 1 && wrong.mark.startsWith('부적합') && !wrong.final,
    `"${wrong.chosen}" → ${wrong.mark}`);

  await page.evaluate((a) => window.__autopsy.api.fillCert(a), ANSWERS);
  await sleep(400);
  const final = await page.evaluate(() => ({
    marks: [...document.querySelectorAll('.mark')].map((m) => m.textContent),
    stamp: !!document.querySelector('.stamp.over'),
    action: window.__autopsy.api.actionLabel()
  }));
  check('네 칸 모두 적합', final.marks.length === 4 && final.marks.every((m) => m === '적합'),
    final.marks.join(', '));
  check('최종 판정 도장', final.stamp);
  check('처음부터 행동 노출', final.action === '처음부터', `action=${final.action}`);
  await page.screenshot({ path: path.join(SHOTS, '04-verdict.png') });

  check('페이지 오류 없음', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

} catch (err) {
  check('실행', false, err.message);
  console.error(err);
} finally {
  await browser?.close();
  await server?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(52)}`);
console.log(`검증 ${results.length - failed.length}/${results.length} 통과 · 스크린샷 verify/shots/`);
if (failed.length) {
  console.log('실패:');
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? '  — ' + f.detail : ''}`);
}
process.exit(failed.length ? 1 : 0);
