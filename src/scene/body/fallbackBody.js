import * as THREE from 'three';
import { woodTexture, glowSprite } from '../textures.js';
import { lin } from '../palette.js';

/**
 * public/models/body.glb 가 아직 없을 때 쓰는 프리미티브 폴백.
 * 원본 HTML의 마네킹 형상을 그대로 유지하되, 메시 이름을 glb 와 동일한
 * 규칙(SKIN_TORSO / SKIN_LIMBS / BONE / VESSEL / NERVE)으로 붙인다.
 * 덕분에 부위 매핑·히트박스·카메라 프리셋·출혈 코드는 glb 와 완전히 같은 경로를 탄다.
 *
 * 좌표는 직립 기준: y=0 이 발끝, y≈1.74 가 정수리, +z 가 앞쪽.
 */
export function buildFallbackBody() {
  const g = new THREE.Group();
  g.name = 'FALLBACK_BODY';

  const wood = new THREE.MeshStandardMaterial({
    map: woodTexture(), color: lin(0xb99a6e), roughness: 0.58, metalness: 0.05
  });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  function seg(a, b, r1, r2, name) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, dir.length(), 22, 1), wood);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    m.name = name;
    g.add(m);
    return m;
  }
  function ball(p, r, name) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), wood);
    m.position.copy(p);
    m.name = name;
    g.add(m);
    return m;
  }

  // ── 몸통 ──
  const T = 'SKIN_TORSO';
  seg(V(0, 0.90, 0), V(0, 1.07, 0), 0.135, 0.118, T).scale.set(1.28, 1, 0.86);
  ball(V(0, 1.10, 0), 0.062, T).scale.set(1.2, 1, 0.9);
  seg(V(0, 1.13, 0), V(0, 1.45, 0), 0.128, 0.182, T).scale.set(1.32, 1, 0.84);
  seg(V(0, 1.45, 0), V(0, 1.545, 0), 0.052, 0.048, T);
  ball(V(0, 1.645, 0.01), 0.112, T).scale.set(0.92, 1.12, 1);

  // ── 사지 ──
  const L = 'SKIN_LIMBS';
  [-1, 1].forEach((s) => {
    ball(V(s * 0.185, 1.425, 0), 0.056, L);
    seg(V(s * 0.185, 1.425, 0), V(s * 0.225, 1.14, 0.01), 0.052, 0.042, L);
    ball(V(s * 0.225, 1.14, 0.01), 0.043, L);
    seg(V(s * 0.225, 1.14, 0.01), V(s * 0.252, 0.885, 0.02), 0.04, 0.032, L);
    ball(V(s * 0.258, 0.845, 0.02), 0.042, L).scale.set(0.75, 1.25, 0.5);
  });
  [-1, 1].forEach((s) => {
    ball(V(s * 0.098, 0.935, 0), 0.062, L);
    seg(V(s * 0.098, 0.935, 0), V(s * 0.108, 0.505, 0), 0.062, 0.05, L);
    ball(V(s * 0.108, 0.505, 0), 0.05, L);
    seg(V(s * 0.108, 0.505, 0), V(s * 0.112, 0.105, 0), 0.048, 0.036, L);
    ball(V(s * 0.112, 0.075, 0.045), 0.05, L).scale.set(0.8, 0.7, 1.5);
  });

  // ── 총상 (좌흉부) ──
  const wound = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 16, 12),
    new THREE.MeshStandardMaterial({
      color: lin(0x5c0d14), roughness: 0.5, emissive: lin(0x3d0910), emissiveIntensity: 1.4
    })
  );
  wound.name = 'WOUND';
  wound.position.set(0.055, 1.325, 0.108);
  g.add(wound);

  // ── 내부 계통 ──
  const matA = new THREE.MeshStandardMaterial({ color: lin(0x9d2431), emissive: lin(0x5e0f18), emissiveIntensity: 1.5, roughness: 0.5 });
  const matB = new THREE.MeshStandardMaterial({ color: lin(0x6e8c9b), emissive: lin(0x1f4351), emissiveIntensity: 1.4, roughness: 0.5 });
  const matBone = new THREE.MeshStandardMaterial({ color: lin(0xdad2bd), emissive: lin(0x2a2a24), emissiveIntensity: 0.6, roughness: 0.7 });
  const matNerve = new THREE.MeshStandardMaterial({ color: lin(0xc8a24a), emissive: lin(0x8a6a1e), emissiveIntensity: 1.6, roughness: 0.6 });

  function tube(pts, r, mat, name) {
    const cv = new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 42, r, 7, false), mat);
    m.name = name;
    g.add(m);
    return m;
  }

  const H = [0, 1.325, 0.0];
  tube([H, [0.06, 1.40, 0.02], [0.14, 1.45, 0.01], [0.20, 1.42, 0]], 0.012, matA, 'VESSEL');
  tube([H, [0.05, 1.24, 0.02], [0.10, 1.10, 0.01], [0.11, 0.90, 0], [0.115, 0.50, 0], [0.112, 0.14, 0]], 0.013, matA, 'VESSEL');
  tube([H, [0.02, 1.47, 0.03], [0.03, 1.56, 0.03], [0.02, 1.60, 0.02]], 0.010, matA, 'VESSEL');
  tube([H, [-0.06, 1.40, 0.02], [-0.14, 1.45, 0.01], [-0.20, 1.42, 0]], 0.012, matB, 'VESSEL');
  tube([H, [-0.05, 1.24, 0.02], [-0.10, 1.10, 0.01], [-0.11, 0.90, 0], [-0.115, 0.50, 0], [-0.112, 0.14, 0]], 0.013, matB, 'VESSEL');
  tube([H, [-0.02, 1.47, 0.03], [-0.03, 1.56, 0.03], [-0.02, 1.60, 0.02]], 0.010, matB, 'VESSEL');
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), matA);
  heart.name = 'VESSEL_HEART';
  heart.position.set(0.02, 1.325, 0.0);
  heart.scale.set(1, 1.2, 0.85);
  g.add(heart);

  for (let i = 0; i < 15; i++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.032, 12), matBone);
    v.name = 'BONE_SPINE';
    v.position.set(0, 0.98 + i * 0.042, -0.03);
    g.add(v);
  }
  for (let i = 0; i < 6; i++) {
    const y = 1.16 + i * 0.055, r = 0.155 - Math.abs(i - 2) * 0.012;
    [-1, 1].forEach((s) => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.009, 6, 20, Math.PI * 0.92), matBone);
      rib.name = 'BONE_RIB';
      rib.position.set(0, y, -0.02);
      rib.rotation.y = s > 0 ? 0 : Math.PI;
      rib.rotation.z = s > 0 ? -0.15 : Math.PI + 0.15;
      rib.scale.z = 0.62;
      g.add(rib);
    });
  }
  const hip = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 20, Math.PI * 1.5), matBone);
  hip.name = 'BONE_HIP';
  hip.position.set(0, 0.96, -0.01);
  hip.rotation.x = Math.PI / 2;
  hip.rotation.z = Math.PI * 0.25;
  g.add(hip);

  // 신경 — 중심은 흐리고 말단이 밝다
  tube([[0, 1.60, -0.02], [0, 1.30, -0.04], [0, 0.98, -0.03]], 0.009, matNerve, 'NERVE');
  [-1, 1].forEach((s) => {
    tube([[s * 0.02, 1.42, -0.03], [s * 0.15, 1.42, 0], [s * 0.23, 1.14, 0.01], [s * 0.255, 0.87, 0.02]], 0.007, matNerve, 'NERVE');
    tube([[s * 0.02, 1.00, -0.03], [s * 0.10, 0.94, 0], [s * 0.11, 0.50, 0], [s * 0.113, 0.12, 0]], 0.007, matNerve, 'NERVE');
    [[s * 0.258, 0.845, 0.02], [s * 0.112, 0.075, 0.045]].forEach((p) => {
      const sp = glowSprite('rgba(214,172,88,1)', 0.2);
      sp.name = 'NERVE_GLOW';
      sp.position.set(p[0], p[1], p[2]);
      g.add(sp);
    });
  });

  return g;
}
