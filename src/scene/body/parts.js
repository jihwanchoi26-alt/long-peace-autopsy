import * as THREE from 'three';

/**
 * glb 메시 이름 → 부위 키.
 * 접두사 매칭이라 Blender 가 붙이는 접미사(SKIN_TORSO.001, BONE_rib_03 …)도 그대로 잡힌다.
 * 순서가 곧 우선순위다.
 */
export const NAME_TO_PART = [
  ['SKIN_TORSO', 'skin'],
  ['SKIN_LIMBS', 'limbs'],
  ['VESSEL', 'vessel'],
  ['HEART', 'vessel'],   // 순환계를 심장 하나로 모델링한 경우의 별칭
  ['BONE', 'bone'],
  ['NERVE', 'nerve'],
  ['WOUND', 'wound']
];

export const SURFACE_PARTS = ['skin', 'limbs'];
export const INTERNAL_PARTS = ['vessel', 'bone', 'nerve'];
export const ALL_PARTS = ['wound', 'skin', 'limbs', 'vessel', 'bone', 'nerve'];

export function partKeyFor(name) {
  if (!name) return null;
  const n = name.toUpperCase();
  for (const [prefix, key] of NAME_TO_PART) {
    if (n.startsWith(prefix)) return key;
  }
  return null;
}

/**
 * 부위별 관찰 각도. 거리(r)와 시선 중심(tgt)은 바운딩박스에서 계산하지만,
 * "어느 쪽에서 볼 것인가"는 기하만으로 정해지지 않으므로 여기서 지정한다.
 * expand: 대상이 너무 작을 때 박스를 키워 여백을 준다(총상 같은 점 단위 대상).
 */
export const VIEW_ANGLES = {
  overview: { th: 0.42, ph: 0.95, pad: 1.12 },
  wound:    { th: 0.50, ph: 0.82, pad: 1.30, expand: 0.16 },
  skin:     { th: 0.20, ph: 0.72, pad: 1.22 },
  limbs:    { th: 0.95, ph: 1.05, pad: 1.08 },
  vessel:   { th: 0.35, ph: 0.90, pad: 1.28 },
  bone:     { th: -0.35, ph: 0.85, pad: 1.28 },
  nerve:    { th: 0.75, ph: 1.00, pad: 1.12 }
};

/**
 * 총상 위치 기준점 — 좌흉부. glb 에 WOUND 메시가 있으면 그쪽이 우선이다.
 *  x      : SKIN_TORSO 바운딩박스 가로 비율 (0.5 가 정중선)
 *  height : 전신 신장 대비 높이. 원본의 y=1.325 / 1.74 와 같은 지점이다.
 *           몸통 박스 기준으로 잡으면 모델마다 몸통이 어디서 시작하는지가 달라
 *           명치까지 내려간다.
 * 앞뒤(z)는 비율로 잡지 않는다 — 표피 표면에 광선을 쏘아 붙인다.
 * 비율로 찍으면 몸 안에 묻혀 보이지 않는다.
 */
export const WOUND_ANCHOR = { x: 0.62, height: 0.762 };

/** objects 의 합집합 바운딩박스를 space 의 로컬 좌표계로 계산한다. */
export function boxInSpace(objects, space) {
  space.updateWorldMatrix(true, false);
  const inv = space.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const o of objects) {
    if (!o.geometry) continue;
    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    if (!b) continue;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      box.expandByPoint(v.applyMatrix4(m));
    }
  }
  return box;
}
