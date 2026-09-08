import * as THREE from 'three';

// 부위 시점의 거리 한계. 너무 가까우면 몸 안으로 들어가고, 너무 멀면 방을 벗어난다.
export const MIN_R = 0.7;
export const MAX_R = 5.2;

/**
 * 바운딩박스가 화면에 꽉 차는 카메라 거리.
 * 수직/수평 화각 중 좁은 쪽을 기준으로 삼아 가로가 잘리지 않게 한다.
 * 1인칭에서는 이 값이 "그 부위를 들여다볼 때 얼굴을 얼마나 들이밀지"가 된다.
 */
export function fitRadius(box, camera, pad = 1.25) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1));
  const f = Math.min(vFov, hFov);
  const d = (sphere.radius * pad) / Math.sin(f / 2);
  return THREE.MathUtils.clamp(d, MIN_R, MAX_R);
}
