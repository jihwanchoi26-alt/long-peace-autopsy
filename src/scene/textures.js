import * as THREE from 'three';

/**
 * 이 모듈이 만드는 모든 텍스처에 적용할 이방성 필터링 단계.
 * 바닥·벽 타일은 시선이 눕는 각도에서 보게 되는데, 이방성 필터링이 없으면
 * 밉맵만으로는 못 버티고 원경이 지직거린다(움직일 때 특히 심하다).
 * 렌더러가 만들어진 뒤 createStage 에서 GPU 가 지원하는 값으로 올려 준다.
 */
let ANISO = 1;
export function setDefaultAnisotropy(n) { ANISO = Math.max(1, Math.floor(n) || 1); }

/** 나뭇결 텍스처 (절차 생성) — 원본 그대로. 프리미티브 폴백 전용. */
export function woodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#b99a6e';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 190; i++) {
    const y = Math.random() * 512, h = 1 + Math.random() * 4;
    x.globalAlpha = 0.05 + Math.random() * 0.16;
    x.fillStyle = Math.random() > 0.45 ? '#8d6f47' : '#d8bd92';
    x.beginPath();
    for (let px = 0; px <= 512; px += 8) {
      x.lineTo(px, y + Math.sin(px * 0.02 + i) * 5 + Math.sin(px * 0.006 + i * 2) * 11);
    }
    x.lineTo(512, y + h + 22);
    x.lineTo(0, y + h + 22);
    x.closePath();
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  // 절차 생성 캔버스는 사진 소재가 아니라 원시 색값이다. r128 기본값(LinearEncoding)과
  // 같게 두어야 원본의 밝은 나뭇결 톤이 그대로 나온다.
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = ANISO;
  return t;
}

/**
 * 수술실 타일 — 줄눈과 얼룩이 있는 정사각 타일.
 * 줄눈을 진하고 가늘게 그리면 원경에서 지직거린다(밉맵·이방성 필터링으로도
 * 다 못 막는다). 그래서 줄눈은 굵고 옅게, 얼룩은 낮은 대비로 둔다.
 */
export function tileTexture(base, grout, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = grout;
  x.fillRect(0, 0, 512, 512);
  const n = 4, s = 512 / n, gap = 7;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      x.fillStyle = base;
      x.globalAlpha = 0.9 + Math.random() * 0.1;
      x.fillRect(i * s + gap / 2, j * s + gap / 2, s - gap, s - gap);
    }
  }
  // 오래된 타일의 얼룩 — 넓고 옅게
  x.globalAlpha = 0.035;
  for (let i = 0; i < 34; i++) {
    x.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    const r = 14 + Math.random() * 34;
    x.beginPath();
    x.arc(Math.random() * 512, Math.random() * 512, r, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = ANISO;
  return t;
}

/** 생체 신호 모니터 화면 — 평탄해진 심전도. */
export function monitorTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#04120e';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#0b2a22';
  x.lineWidth = 1;
  for (let i = 0; i < 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
  for (let j = 0; j < 256; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(512, j); x.stroke(); }
  x.strokeStyle = '#3ef0a8';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 96);
  x.lineTo(512, 96);   // 평탄 — 이미 죽은 몸이다
  x.stroke();
  x.fillStyle = '#3ef0a8';
  x.font = 'bold 30px monospace';
  x.fillText('HR  0', 18, 168);
  x.fillText('BP  --/--', 18, 208);
  x.fillStyle = '#8c1d28';
  x.font = 'bold 26px monospace';
  x.fillText('ASYSTOLE', 300, 208);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** 가산합성 글로우 스프라이트 — 총상/신경 말단 표시용. */
export function glowSprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace('1)', '0.45)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.NoColorSpace; // 위와 같은 이유
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  }));
  sp.scale.set(size, size, 1);
  return sp;
}
