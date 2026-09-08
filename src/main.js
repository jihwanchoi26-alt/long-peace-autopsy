import * as THREE from 'three';
import { PARTS, TIMELINE, CERT } from './data/content.js';
import { createStage } from './scene/stage.js';
import { createPlayer } from './scene/player.js';
import { loadBody } from './scene/body/loadBody.js';
import { INTERNAL_PARTS } from './scene/body/parts.js';
import * as report from './ui/report.js';

/* ════════ 수술실 ════════ */
const canvas = document.getElementById('gl');
const stage = createStage(canvas);
const player = createPlayer(stage.camera, canvas, {
  blockers: stage.room.blockers,
  onLockChange: (locked) => { veil.hidden = locked || mode === 'form'; }
});

let body = null;
let views = {};

loadBody(stage.scene).then((model) => {
  body = model;
  if (import.meta.env.DEV) window.__autopsy = { model, stage, player, S, api };
  stage.onFrame((t) => model.update(t));
  const refreshViews = () => { views = model.buildViews(stage.camera); };
  refreshViews();
  stage.onResize(refreshViews);   // 종횡비가 바뀌면 프리셋 거리도 다시 계산
  document.getElementById('loader').style.display = 'none';
});

/* ════════ 게임 상태 ════════ */
const S = { stage: 0, found: new Set(), day: 0, cert: [null, null, null, null] };
let mode = 'play';        // 'play' | 'form' (판정서 작성 중에는 마우스를 돌려준다)
let aimed = null;         // 조준 중인 부위 키
let action = null;        // { label, run } — F 키로 실행

const view = document.getElementById('view');
const hint = document.getElementById('hint');
const actionEl = document.getElementById('action');
const aimEl = document.getElementById('aim');
const reticle = document.getElementById('reticle');
const clipboard = document.getElementById('clipboard');
const veil = document.getElementById('veil');
const docTitle = document.getElementById('docTitle');
const docSub = document.getElementById('docSub');

function render({ title, sub, html }) {
  docTitle.textContent = title;
  docSub.textContent = sub;
  view.innerHTML = html;
  document.getElementById('scroll').scrollTop = 0;
}
const openClipboard = (on = true) => clipboard.classList.toggle('open', on);
const setAction = (label, run) => {
  action = label ? { label, run } : null;
  actionEl.hidden = !action;
  if (action) actionEl.textContent = `[F] ${label}`;
};

/** 모델에 실제로 들어 있는 계통만 검사 대상으로 센다(부위가 빠진 glb 에서 진행이 막히지 않게). */
function internalsInModel() {
  return body ? INTERNAL_PARTS.filter((k) => body.meshes[k].length) : INTERNAL_PARTS;
}

/* ════════ 진행 ════════ */
function showPart(key) {
  render(report.part(key, S));
  openClipboard(true);
}

function examine(key) {
  if (!key || S.stage >= 2) return;
  if (S.stage === 0 && !['wound', 'skin', 'limbs'].includes(key)) return;
  S.found.add(key);
  showPart(key);
  player.focus(views[key]);
  if (S.stage === 0 && key === 'wound') {
    hint.textContent = '상처 하나로는 설명되지 않습니다.';
    setAction('개복하기', () => setStage(1));
  }
  if (S.stage === 1 && internalsInModel().every((k) => S.found.has(k))) {
    hint.textContent = '세 소견이 모두 확보되었습니다.';
    setAction('37일 타임라인', () => setStage(2));
  }
}

function paintDays() {
  document.querySelectorAll('#tl li').forEach((li, i) => li.classList.toggle('shown', i < S.day));
  if (body) body.setBleed(S.day / TIMELINE.length);
  const last = document.querySelector(`#tl li[data-i="${S.day - 1}"]`);
  if (last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (S.day >= TIMELINE.length) {
    document.getElementById('tlEnd').style.display = '';
    hint.textContent = '전신 마비 — 사망.';
    setAction('사인 판정서 작성', () => setStage(3));
  } else {
    hint.textContent = `${S.day} / ${TIMELINE.length}일차 경과`;
    setAction('다음 날짜', () => { S.day++; paintDays(); });
  }
}

function showCert() {
  render(report.cert());
  view.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', (e) => {
    const i = +e.target.dataset.i;
    const row = view.querySelector(`tr[data-i="${i}"]`);
    const ok = e.target.value === CERT[i].ans;
    S.cert[i] = e.target.value;
    row.className = e.target.value ? (ok ? 'ok' : 'no') : '';
    row.querySelector('.mark')?.remove();
    if (e.target.value) {
      const m = document.createElement('span');
      m.className = 'mark ' + (ok ? 'ok' : 'no');
      m.textContent = ok ? '적합' : '부적합 — 다시 검토';
      row.querySelector('th').appendChild(m);
    }
    checkFinal();
  }));
}

function checkFinal() {
  if (!CERT.every((c, i) => S.cert[i] === c.ans)) return;
  document.getElementById('final').innerHTML = report.finalVerdict();
  hint.textContent = '판정 완료.';
  setAction('처음부터', () => location.reload());
  document.getElementById('final').scrollIntoView({ behavior: 'smooth' });
}

function setStage(n) {
  S.stage = n;
  document.querySelectorAll('#steps li').forEach((li) => {
    const v = +li.dataset.s;
    li.className = v === n ? 'on' : (v < n ? 'done' : '');
  });
  setAction(null);
  if (n === 1) {
    if (body) body.open();
    player.release();
    showPart('wound');
    hint.textContent = '① ② ③ 세 계통을 조준해 검안하십시오.';
    if (internalsInModel().length === 0) setAction('37일 타임라인', () => setStage(2));
  }
  if (n === 2) {
    S.day = 0;
    player.release();
    render(report.timeline());
    openClipboard(true);
    paintDays();
  }
  if (n === 3) {
    mode = 'form';
    player.unlock();
    veil.hidden = true;
    showCert();
    openClipboard(true);
    hint.textContent = '네 칸을 모두 맞게 채우십시오. (마우스로 선택)';
  }
}

/* ════════ 조준 ════════ */
const lastCam = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
function updateAim() {
  if (!body || S.stage >= 2 || player.isFocused()) {
    if (aimed !== null) { aimed = null; aimEl.classList.remove('show'); reticle.classList.remove('hot'); }
    return;
  }
  const cam = stage.camera;
  if (cam.position.distanceToSquared(lastCam.p) < 1e-8 && Math.abs(cam.quaternion.dot(lastCam.q)) > 0.9999999) return;
  lastCam.p.copy(cam.position);
  lastCam.q.copy(cam.quaternion);

  const key = body.pickPart(player.aimRay(), S.stage);
  if (key === aimed) return;
  aimed = key;
  reticle.classList.toggle('hot', !!key);
  if (key) {
    aimEl.innerHTML = `${PARTS[key].n}<span class="key">[E] 검안</span>`;
    aimEl.classList.add('show');
  } else {
    aimEl.classList.remove('show');
  }
}

/* ════════ 입력 ════════ */
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    openClipboard(!clipboard.classList.contains('open'));
    return;
  }
  if (mode === 'form') return;
  if (e.code === 'KeyE') { examine(aimed); return; }
  if (e.code === 'KeyF' && action) { const run = action.run; setAction(null); run(); }
});

canvas.addEventListener('click', () => { if (mode === 'play') player.lock(); });
veil.addEventListener('click', () => { if (mode === 'play') player.lock(); });

document.querySelectorAll('#steps li').forEach((li) => li.addEventListener('click', () => {
  const v = +li.dataset.s;
  if (v >= S.stage || v > 1) return;
  setStage(v);
  showPart('wound');
}));

stage.onFrame((t, dt) => { player.update(dt); updateAim(); });
stage.start();

render({ title: '검안 개요', sub: 'AUTOPSY OBSERVATION REPORT', html: report.placeholder() });
openClipboard(false);

/* ════════ 자동 검증용 API (dev 전용) ════════ */
const api = {
  /** 검안대 옆으로 이동한다. */
  approach() { player.release(); player.teleport(1.05, 0.25); },

  /**
   * 부위를 바라보고 검안한다 — 조준선이 실제로 그 부위를 잡았을 때만 검안이 된다.
   * (편의를 위해 강제로 통과시키지 않는다. 조준이 빗나가면 null 이 돌아온다.)
   */
  examine(key) {
    if (!body || !views[key]) return null;
    player.release();
    // 그 부위를 실제로 조준할 수 있는 지점을 찾는다. 계통끼리 영역이 겹치므로
    // (척수 중심이 심장 히트박스 안에 들어가는 식) 한 점만으로는 부족하다.
    for (const point of body.aimPoints(key)) {
      player.lookAt(point);
      if (body.pickPart(player.aimRay(), S.stage) === key) {
        updateAim();
        examine(key);
        return key;
      }
    }
    return null;   // 어느 지점을 조준해도 잡히지 않는다 = 실제 문제
  },
  act() { if (action) { const run = action.run; setAction(null); run(); return true; } return false; },
  actionLabel: () => action?.label ?? null,
  aimedPart: () => aimed,
  stage: () => S.stage,
  found: () => [...S.found],
  fillCert(answers) {
    const sels = [...view.querySelectorAll('.cert select')];
    sels.forEach((sel, i) => { sel.value = answers[i]; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  }
};
