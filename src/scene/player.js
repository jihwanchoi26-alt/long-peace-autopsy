import * as THREE from 'three';
import { ROOM, FLOOR_Y, CEIL_Y } from './room.js';

const EYE = 1.65;        // 시선 높이(바닥 기준)
const RADIUS = 0.35;     // 플레이어 반지름
const WALK = 2.3;        // m/s
const RUN = 4.0;
const ACCEL = 12;        // 가감속
const LOOK = 0.0022;     // 마우스 감도(rad/px)
const PITCH_LIMIT = Math.PI / 2 - 0.05;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 1인칭 컨트롤러. 포인터 락 + WASD 이동 + 조준 광선.
 *
 * "검안" 순간에는 focus(view) 로 부위 프리셋 시점까지 카메라를 부드럽게 끌고 간다.
 * 프리셋(bodyModel.buildViews)은 부위 바운딩박스에서 계산된 값이라, 1인칭에서도
 * 부위마다 알맞은 거리·각도로 몸을 들여다보게 된다. release() 하면 원래 서 있던
 * 자리로 되돌아온다.
 */
export function createPlayer(camera, dom, opts = {}) {
  const blockers = opts.blockers || [];
  const hw = ROOM.w / 2, hd = ROOM.d / 2;

  const pos = new THREE.Vector3(opts.start?.x ?? 1.9, FLOOR_Y + EYE, opts.start?.z ?? 3.6);
  const vel = new THREE.Vector3();
  let yaw = opts.yaw ?? 0;   // -z 방향(검안대)을 본다
  let pitch = -0.12;

  // 자유 이동 상태 저장용(검안 시점에서 돌아올 자리)
  const saved = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  let focusView = null;            // {pos, yaw, pitch}
  let focusing = false;

  const keys = new Set();
  let locked = false;

  // ── 입력 ──
  const onKeyDown = (e) => {
    keys.add(e.code);
    if (opts.onKey) opts.onKey(e);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => keys.clear());

  const onMove = (e) => {
    if (!locked) return;
    yaw -= e.movementX * LOOK;
    pitch = clamp(pitch - e.movementY * LOOK, -PITCH_LIMIT, PITCH_LIMIT);
    if (focusing) release();       // 둘러보기 시작하면 검안 시점에서 빠져나온다
  };
  addEventListener('mousemove', onMove);

  const onLockChange = () => {
    locked = document.pointerLockElement === dom;
    if (opts.onLockChange) opts.onLockChange(locked);
  };
  document.addEventListener('pointerlockchange', onLockChange);

  function lock() { dom.requestPointerLock?.(); }
  function unlock() { document.exitPointerLock?.(); }

  // ── 이동 ──
  function resolveCollision(p) {
    p.x = clamp(p.x, -hw + RADIUS + 0.08, hw - RADIUS - 0.08);
    p.z = clamp(p.z, -hd + RADIUS + 0.08, hd - RADIUS - 0.08);
    for (const b of blockers) {
      const cx = clamp(p.x, b.min.x, b.max.x);
      const cz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > RADIUS * RADIUS) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * RADIUS;
        p.z = cz + (dz / d) * RADIUS;
      } else {
        // 상자 한가운데에 들어간 경우 — 가장 가까운 면으로 밀어낸다
        const outs = [
          [b.min.x - RADIUS - p.x, 0], [b.max.x + RADIUS - p.x, 0],
          [0, b.min.z - RADIUS - p.z], [0, b.max.z + RADIUS - p.z]
        ].sort((a, c) => Math.hypot(a[0], a[1]) - Math.hypot(c[0], c[1]));
        p.x += outs[0][0];
        p.z += outs[0][1];
      }
    }
  }

  function update(dt) {
    const d = Math.min(dt, 0.05);
    if (focusing && focusView) {
      // 검안 시점으로 미끄러져 들어간다
      const k = 1 - Math.pow(0.0016, d);
      camera.position.lerp(focusView.pos, k);
      yaw += shortAngle(yaw, focusView.yaw) * k;
      pitch += (focusView.pitch - pitch) * k;
    } else {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN : WALK;
      const want = new THREE.Vector3(
        Math.sin(yaw) * -f + Math.cos(yaw) * s,
        0,
        Math.cos(yaw) * -f - Math.sin(yaw) * s
      );
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      vel.lerp(want, 1 - Math.pow(0.0001, d * ACCEL / 12));
      pos.addScaledVector(vel, d);
      resolveCollision(pos);
      pos.y = FLOOR_Y + EYE;
      // 걷는 느낌의 아주 얕은 흔들림
      const bob = Math.sin(performance.now() * 0.011) * 0.012 * Math.min(1, vel.length() / WALK);
      camera.position.set(pos.x, pos.y + bob, pos.z);
    }
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  function shortAngle(from, to) {
    let a = (to - from) % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /** 구면 프리셋 {tgt, r, th, ph} → 1인칭 검안 시점 */
  function focus(view) {
    if (!view) return;
    if (!focusing) {
      saved.pos.copy(pos);
      saved.yaw = yaw;
      saved.pitch = pitch;
    }
    const p = new THREE.Vector3(
      view.tgt.x + view.r * Math.sin(view.ph) * Math.sin(view.th),
      view.tgt.y + view.r * Math.cos(view.ph),
      view.tgt.z + view.r * Math.sin(view.ph) * Math.cos(view.th)
    );
    p.x = clamp(p.x, -hw + 0.3, hw - 0.3);
    p.z = clamp(p.z, -hd + 0.3, hd - 0.3);
    p.y = clamp(p.y, FLOOR_Y + 0.5, CEIL_Y - 0.35);
    const dir = new THREE.Vector3().subVectors(view.tgt, p);
    focusView = {
      pos: p,
      yaw: Math.atan2(-dir.x, -dir.z),
      // 살짝 내려다본다 — 대상이 화면 위쪽에 와서 클립보드에 가리지 않게 한다
      pitch: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) - 0.17
    };
    focusing = true;
  }

  /** 검안 시점에서 원래 서 있던 자리로 돌아온다. */
  function release() {
    if (!focusing) return;
    focusing = false;
    focusView = null;
    pos.copy(saved.pos);
    yaw = saved.yaw;
    pitch = saved.pitch;
  }

  /** 조준선 — 화면 한가운데에서 앞으로 쏘는 광선 */
  const ray = new THREE.Raycaster();
  const fwd = new THREE.Vector3();
  function aimRay() {
    camera.getWorldDirection(fwd);
    ray.set(camera.position, fwd);
    return ray;
  }

  /** 자동 검증·연출용 — 특정 월드 좌표를 바라보게 한다. */
  function lookAt(target) {
    const dir = new THREE.Vector3().subVectors(target, camera.position);
    yaw = Math.atan2(-dir.x, -dir.z);
    pitch = clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -PITCH_LIMIT, PITCH_LIMIT);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  /** 자동 검증·연출용 — 방 안 특정 지점으로 순간 이동. */
  function teleport(x, z) {
    pos.set(x, FLOOR_Y + EYE, z);
    resolveCollision(pos);
    camera.position.copy(pos);
  }

  camera.position.copy(pos);
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

  return {
    update, aimRay, focus, release, lock, unlock, lookAt, teleport,
    isLocked: () => locked,
    isFocused: () => focusing,
    position: () => camera.position
  };
}
