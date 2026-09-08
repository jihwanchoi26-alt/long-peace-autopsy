import * as THREE from 'three';
import { lin } from './palette.js';
import { buildRoom, FLOOR_Y, CEIL_Y } from './room.js';
import { setDefaultAnisotropy } from './textures.js';

/**
 * 렌더러 · 씬 · 조명 · 수술실을 만든다.
 * 원본의 r128 씬을 최신 three 로 옮기면서 조정한 것들:
 *  - outputEncoding/sRGBEncoding -> outputColorSpace/SRGBColorSpace
 *  - r155 이후 punctual light 가 물리 단위로 바뀌어 spot/point 세기에 PI 를 곱했다
 *  - 1인칭으로 바뀌면서 조명이 방 안으로 들어왔다(무영등이 천장 아래에 달린다)
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // 화면의 물리 픽셀 격자까지만 그린다. 그 위로 초과표본을 하면 픽셀 수가
  // 배로 늘어 프레임이 무너지는데(dpr 1.5 화면에서 44fps 까지 떨어졌다),
  // 정작 지직거림은 이방성 필터링과 타일 무늬 쪽이 훨씬 크게 좌우한다.
  const nativeRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(nativeRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  // 방이 보여야 하므로 원본(0.13)보다 훨씬 옅게. 그래도 구석은 어둠에 잠긴다.
  scene.fog = new THREE.FogExp2(lin(0x0c1012), 0.045);
  // 1인칭이라 화각을 넓혔다. near 를 너무 작게 잡으면 깊이 정밀도가 떨어져
  // 바닥에 붙은 배수구 같은 것이 깜박인다(z-fighting).
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);

  // — 환경맵 —
  // 금속은 반사할 환경이 없으면 그림자 속에서 완전한 검정이 된다. 검안대가
  // metalness 0.92 라, 시신이 만든 그림자가 새까만 얼룩으로 찍히고 개복 후에는
  // 반투명해진 표피 너머로 그 얼룩이 비쳐 보인다.
  // 그래서 이 씬의 조명과 같은 모양의 아주 어두운 환경을 구워 넣는다 —
  // 어두운 방 + 머리 위 조명 패널 하나. 밝은 기성 환경맵을 쓰면 수술실 톤이 날아간다.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildRoomEnv(), 0.04).texture;
  scene.environmentIntensity = 0.3; // three >= 0.163
  pmrem.dispose();

  // — 수술실 —
  // 타일 텍스처를 만들기 전에 이방성 필터링 단계를 올려 둔다.
  // 이게 없으면 바닥·벽이 원경에서 지직거린다(밉맵만으로는 부족하다).
  setDefaultAnisotropy(renderer.capabilities.getMaxAnisotropy());
  const room = buildRoom(scene);

  // — 조명 —
  const L = Math.PI; // 물리 단위 보정 계수
  scene.add(new THREE.AmbientLight(lin(0x2b3a40), 1.15));

  // 무영등 — 검안대 바로 위
  const key = new THREE.SpotLight(lin(0xfff2dc), 1.25 * L, 9, 0.75, 0.5, 1.3);
  key.position.set(0, CEIL_Y - 1.05, 0.1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0012;
  key.target = room.lampTarget;
  scene.add(key);

  const rim = new THREE.DirectionalLight(lin(0x7fd0e8), 0.55);
  rim.position.set(-3.2, 1.6, -3.4);
  scene.add(rim);
  const fill = new THREE.PointLight(lin(0x4a7f8c), 0.5 * L, 7, 1);
  fill.position.set(2.6, 0.5, 2.4);
  scene.add(fill);
  const under = new THREE.PointLight(lin(0x1e3b44), 0.6 * L, 5, 1);
  under.position.set(0, -0.7, 0);
  scene.add(under);
  // 방 전체를 아주 낮게 깔아 주는 천장 조명
  const ceiling = new THREE.PointLight(lin(0x9fb6c4), 1.0 * L, 20, 1);
  ceiling.position.set(0, CEIL_Y - 0.3, 0);
  scene.add(ceiling);

  // — 루프 —
  const frameHooks = [];
  const resizeHooks = [];
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      resizeHooks.forEach((fn) => fn());
    }
  }
  // — 적응 해상도 —
  // 창 크기와 GPU 는 알 수 없다. 프레임이 밀리기 시작하면 렌더 해상도를 한 단계
  // 낮추고, 여유가 돌아오면 원래(화면 물리 해상도)까지 되올린다.
  // 1인칭에서는 바닥이 화면에서 가장 빠르게 흐르기 때문에, 프레임이 밀리면
  // 바닥이 심하게 흔들리는 것처럼 보인다.
  const STEPS = [0.8, 1, 1.25, 1.5, 2].filter((r) => r <= nativeRatio);
  if (!STEPS.length) STEPS.push(nativeRatio);
  let stepIdx = STEPS.length - 1;
  let adaptive = true;
  const window45 = [];
  let fastWindows = 0;

  function adaptResolution() {
    const n = window45.length;
    if (!n) return;
    window45.sort((a, b) => a - b);
    const median = window45[n >> 1];
    const p90 = window45[Math.min(n - 1, Math.floor(n * 0.9))];
    // 중앙값만 보면 놓친다 — 중앙값 16.7ms 인데 프레임의 1/4 이 20ms 를 넘는 상태가 있다.
    // 그 끊김이 곧 바닥이 흔들려 보이는 원인이라, 느린 프레임 비율도 함께 본다.
    let slow = 0;
    for (const d of window45) if (d > 20) slow++;
    window45.length = 0;

    if ((median > 18 || slow / n > 0.25) && stepIdx > 0) {
      stepIdx--; fastWindows = 0;
      renderer.setPixelRatio(STEPS[stepIdx]);
    } else if (p90 < 14 && stepIdx < STEPS.length - 1) {
      if (++fastWindows >= 3) {                  // 충분히 오래 여유로우면 되올린다
        stepIdx++; fastWindows = 0;
        renderer.setPixelRatio(STEPS[stepIdx]);
      }
    } else {
      fastWindows = 0;
    }
  }

  let last = 0;
  let frames = 0;
  function loop(t) {
    resize();
    const dt = last ? (t - last) / 1000 : 0.016;
    last = t;
    for (const fn of frameHooks) fn(t, dt);
    renderer.render(scene, camera);
    if (dt > 0) window45.push(dt * 1000);
    if (++frames >= 45) { frames = 0; if (adaptive) adaptResolution(); }
    requestAnimationFrame(loop);
  }

  return {
    renderer, scene, camera, key, room, FLOOR_Y, CEIL_Y,
    pixelRatio: () => renderer.getPixelRatio(),
    setAdaptive: (on) => { adaptive = on; },   // 성능 측정 때 해상도를 고정하려고
    onFrame: (fn) => frameHooks.push(fn),
    onResize: (fn) => resizeHooks.push(fn),
    start: () => requestAnimationFrame(loop)
  };
}

/** 환경맵을 굽기 위한 최소한의 방. 무영등과 같은 자리에 조명 패널을 둔다. */
function buildRoomEnv() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(12, 6, 12),
    new THREE.MeshBasicMaterial({ color: lin(0x0e1418), side: THREE.BackSide })
  ));
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ color: lin(0xfff2dc) })
  );
  panel.position.set(0.6, 2.9, 0.4);
  panel.rotation.x = Math.PI / 2; // 아래를 향한다
  env.add(panel);
  return env;
}
