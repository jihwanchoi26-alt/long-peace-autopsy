import * as THREE from 'three';
import { lin } from './palette.js';
import { tileTexture, monitorTexture } from './textures.js';

export const FLOOR_Y = -0.92;          // 검안대 높이에 맞춘 바닥
export const ROOM = { w: 9, d: 11, h: 3.4 };
export const CEIL_Y = FLOOR_Y + ROOM.h;

/**
 * 병원 수술실. 검안대(부검대)를 원점에 두고 그 주위를 세운다.
 * 모두 프리미티브라 폴리곤이 가볍다 — 무거운 건 시신 모델 하나뿐이다.
 *
 * @returns {{blockers: THREE.Box3[], lampTarget: THREE.Object3D}}
 *   blockers: 플레이어가 통과하지 못할 상자들(월드 좌표, y 는 무시하고 x/z 만 쓴다)
 */
export function buildRoom(scene) {
  const blockers = [];
  const hw = ROOM.w / 2, hd = ROOM.d / 2;

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const put = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
  const block = (mesh, pad = 0.12) => {
    const b = new THREE.Box3().setFromObject(mesh).expandByScalar(pad);
    blockers.push(b);
    return mesh;
  };

  // ── 재질 ──
  const floorMat = new THREE.MeshStandardMaterial({
    map: tileTexture('#39464a', '#303b3f', 6), color: lin(0xffffff), roughness: 0.62, metalness: 0.04
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: tileTexture('#4d5f60', '#445455', 4), color: lin(0xffffff), roughness: 0.85, metalness: 0.02,
    side: THREE.BackSide
  });
  const ceilMat = new THREE.MeshStandardMaterial({ color: lin(0x1b2427), roughness: 0.9, side: THREE.BackSide });
  const steel = new THREE.MeshStandardMaterial({ color: lin(0x9fb0b4), roughness: 0.29, metalness: 0.92 });
  const steelDull = new THREE.MeshStandardMaterial({ color: lin(0x7d8f94), roughness: 0.45, metalness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: lin(0xc9d3d2), roughness: 0.7, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: lin(0x222b2e), roughness: 0.8, metalness: 0.1 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: lin(0x6e8c9b), roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.28
  });
  const lampGlow = new THREE.MeshBasicMaterial({ color: lin(0xfff4de) });

  // ── 바닥 · 벽 · 천장 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d), wallMat);
  walls.position.y = FLOOR_Y + ROOM.h / 2;
  walls.receiveShadow = true;
  scene.add(walls);

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w - 0.02, 0.1, ROOM.d - 0.02), ceilMat);
  ceil.position.y = CEIL_Y;
  scene.add(ceil);

  // 천장 조명 패널 — 방을 아주 낮게 깔아 준다
  for (const z of [-3.2, 3.2]) {
    for (const x of [-2.4, 2.4]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.35), lampGlow);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, CEIL_Y - 0.06, z);
      panel.material = new THREE.MeshBasicMaterial({ color: lin(0x3d4a52) });
      scene.add(panel);
    }
  }

  // ── 부검대 ──
  const table = box(0.94, 0.07, 2.34, steel);
  table.receiveShadow = table.castShadow = true;
  put(table, 0, -0.035, 0);
  block(table, 0.12);
  const legMat = steelDull;
  [[-0.36, -1.02], [0.36, -1.02], [-0.36, 1.02], [0.36, 1.02]].forEach(([px, pz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.85, 10), legMat);
    put(leg, px, -0.5, pz);
  });
  // 배수 홈
  const gutter = box(0.7, 0.012, 2.0, new THREE.MeshStandardMaterial({
    color: lin(0x6f8085), roughness: 0.2, metalness: 0.95
  }));
  put(gutter, 0, 0.002, 0);

  // ── 무영등(수술등) ──
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, 0, 0);
  scene.add(lampTarget);

  const lampGroup = new THREE.Group();
  lampGroup.position.set(0, CEIL_Y - 0.9, 0.1);
  scene.add(lampGroup);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10), steelDull);
  arm.position.y = 0.45;
  lampGroup.add(arm);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), steel);
  dome.rotation.x = Math.PI;
  lampGroup.add(dome);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), lampGlow);
    lens.rotation.x = Math.PI / 2;   // 아래(검안대)를 향한다
    lens.position.set(Math.cos(ang) * 0.32, -0.12, Math.sin(ang) * 0.32);
    lampGroup.add(lens);
  }
  const centerLens = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), lampGlow);
  centerLens.rotation.x = Math.PI / 2;
  centerLens.position.y = -0.13;
  lampGroup.add(centerLens);

  // ── 생체 신호 모니터 ──
  const monStand = new THREE.Group();
  monStand.position.set(1.55, 0, -1.5);
  scene.add(monStand);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10), steelDull);
  pole.position.y = FLOOR_Y + 0.75;
  monStand.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), dark);
  base.position.y = FLOOR_Y + 0.02;
  monStand.add(base);
  const monBody = box(0.62, 0.44, 0.12, dark);
  monBody.position.y = FLOOR_Y + 1.5;
  monBody.castShadow = true;
  monStand.add(monBody);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.34),
    new THREE.MeshBasicMaterial({ map: monitorTexture() })
  );
  screen.position.set(0, FLOOR_Y + 1.5, 0.062);
  screen.rotation.y = Math.PI;
  monStand.add(screen);
  screen.rotation.y = 0;
  monStand.rotation.y = -0.5;
  block(monBody, 0.25);

  // ── 기구 카트 ──
  const cart = new THREE.Group();
  cart.position.set(-1.5, 0, 0.5);
  cart.rotation.y = 0.3;
  scene.add(cart);
  const top = box(0.7, 0.05, 0.45, steel);
  top.position.y = FLOOR_Y + 0.85;
  top.castShadow = top.receiveShadow = true;
  cart.add(top);
  const shelf = box(0.66, 0.03, 0.42, steelDull);
  shelf.position.y = FLOOR_Y + 0.4;
  cart.add(shelf);
  [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]].forEach(([x, z]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 8), steelDull);
    l.position.set(x, FLOOR_Y + 0.42, z);
    cart.add(l);
  });
  // 기구 몇 개
  const tray = box(0.42, 0.02, 0.26, steelDull);
  tray.position.y = FLOOR_Y + 0.89;
  cart.add(tray);
  for (let i = 0; i < 4; i++) {
    const tool = box(0.02, 0.008, 0.16 + i * 0.02, steel);
    tool.position.set(-0.14 + i * 0.08, FLOOR_Y + 0.905, 0);
    tool.rotation.y = 0.1 * i;
    cart.add(tool);
  }
  block(top, 0.2);

  // ── 링거대 ──
  const iv = new THREE.Group();
  iv.position.set(-1.7, 0, -1.9);
  scene.add(iv);
  const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.9, 8), steelDull);
  ivPole.position.y = FLOOR_Y + 0.95;
  iv.add(ivPole);
  const ivBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), dark);
  ivBase.position.y = FLOOR_Y + 0.015;
  iv.add(ivBase);
  const bag = box(0.14, 0.26, 0.06, new THREE.MeshStandardMaterial({
    color: lin(0xa8b8b0), roughness: 0.3, transparent: true, opacity: 0.55
  }));
  bag.position.set(0.1, FLOOR_Y + 1.72, 0);
  iv.add(bag);
  block(ivPole, 0.2);

  // ── 벽 수납장 ──
  const cab = new THREE.Group();
  cab.position.set(-hw + 0.3, 0, -2.6);
  scene.add(cab);
  const cabBody = box(0.5, 1.9, 2.2, white);
  cabBody.position.y = FLOOR_Y + 0.95;
  cabBody.castShadow = cabBody.receiveShadow = true;
  cab.add(cabBody);
  for (let i = 0; i < 3; i++) {
    const glass = box(0.02, 0.5, 0.95, glassMat);
    glass.position.set(0.26, FLOOR_Y + 0.5 + i * 0.6, -0.52 + (i % 2) * 1.04);
    cab.add(glass);
  }
  block(cabBody, 0.15);

  // ── 세척 싱크 ──
  const sink = new THREE.Group();
  sink.position.set(hw - 0.4, 0, 2.6);
  scene.add(sink);
  const sinkBody = box(0.6, 0.95, 1.2, steelDull);
  sinkBody.position.y = FLOOR_Y + 0.47;
  sinkBody.castShadow = true;
  sink.add(sinkBody);
  const basin = box(0.5, 0.06, 1.0, dark);
  basin.position.y = FLOOR_Y + 0.93;
  sink.add(basin);
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), steel);
  tap.position.set(0.2, FLOOR_Y + 1.15, 0);
  sink.add(tap);
  block(sinkBody, 0.15);

  // ── 문 ──
  const door = box(0.08, 2.1, 1.6, new THREE.MeshStandardMaterial({
    color: lin(0x8f9ea2), roughness: 0.6, metalness: 0.3
  }));
  put(door, hw - 0.04, FLOOR_Y + 1.05, -3.4);
  const win = box(0.02, 0.5, 0.4, glassMat);
  put(win, hw - 0.1, FLOOR_Y + 1.5, -3.4);

  // ── 벽시계 ──
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), white);
  clock.rotation.z = Math.PI / 2;
  put(clock, -hw + 0.06, FLOOR_Y + 2.2, 1.2);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshBasicMaterial({ color: lin(0x2a3336) }));
  face.rotation.y = Math.PI / 2;
  put(face, -hw + 0.1, FLOOR_Y + 2.2, 1.2);

  // ── 배수구 ──
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), dark);
  drain.rotation.x = -Math.PI / 2;
  put(drain, 0, FLOOR_Y + 0.006, 2.2);

  return { blockers, lampGroup, lampTarget };
}
