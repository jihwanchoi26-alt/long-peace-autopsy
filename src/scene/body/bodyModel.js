import * as THREE from 'three';
import { glowSprite } from '../textures.js';
import { fitRadius } from '../framing.js';
import { lin } from '../palette.js';
import {
  ALL_PARTS, INTERNAL_PARTS, SURFACE_PARTS, VIEW_ANGLES, WOUND_ANCHOR,
  boxInSpace, partKeyFor
} from './parts.js';

const TARGET_HEIGHT = 1.74;   // 직립 기준 신장(m). 검안대 크기에 맞춘 값.
const BLOOD = lin(0x7d1420);

/**
 * glb 든 프리미티브 폴백이든, 아래 규칙만 지키면 동일하게 동작한다.
 *   - 직립 좌표계(Y=위, Z=앞), 메시 이름은 SKIN_TORSO / SKIN_LIMBS / BONE / VESSEL / NERVE
 * 이 함수가 눕히기·부위 등록·히트박스·출혈 셰이더·카메라 프리셋을 모두 처리한다.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} model  직립 자세의 모델
 * @param {{normalize?:boolean, source?:string}} opts
 */
export function createBodyModel(scene, model, opts = {}) {
  const { normalize = true, source = 'unknown' } = opts;

  // 직립 로컬 좌표 (x, y, z) → 월드 (x, z+0.02, 0.88-y). 원본의 눕히기와 동일.
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.position.set(0, 0.02, 0.88);
  const content = new THREE.Group(); // 항상 단위 변환 — 로컬 크기 = 월드 크기
  root.add(content);
  content.add(model);
  scene.add(root);

  // ── 1. 이름으로 부위 등록 ──────────────────────────────
  const nodes = {};   // 표시/숨김 대상 (스프라이트 포함)
  const meshes = {};  // 레이캐스트·바운딩박스 대상
  ALL_PARTS.forEach((k) => { nodes[k] = []; meshes[k] = []; });

  // glb 는 여러 부위가 머티리얼 하나를 공유하는 일이 흔하다(실제로 받은 모델이
  // 표피·뼈·심장·신경을 한 머티리얼로 썼다). 그대로 두면 개복 때 표피를 반투명하게
  // 만든 설정이 장기까지 투명하게 만들고, 출혈 색도 장기에 번진다.
  // 그래서 부위마다 자기 머티리얼을 갖게 복제한다(같은 부위 안에서는 계속 공유).
  const matCache = new Map();
  const ownMaterial = (mat, part) => {
    const cacheKey = part + '|' + mat.uuid;
    let cloned = matCache.get(cacheKey);
    if (!cloned) { cloned = mat.clone(); matCache.set(cacheKey, cloned); }
    return cloned;
  };

  model.traverse((o) => {
    const key = partKeyFor(o.name);
    if (!key) return;
    nodes[key].push(o);
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      o.userData.part = key;
      o.material = Array.isArray(o.material)
        ? o.material.map((mat) => ownMaterial(mat, key))
        : ownMaterial(o.material, key);
      // 손으로 만든 해부 모델은 미러링한 반쪽의 노멀/와인딩이 뒤집힌 경우가 흔하다.
      // FrontSide 로 두면 그 반쪽이 통째로 컬링돼 사라지고 그림자만 남는다.
      // 시신은 모든 각도에서 들여다보는 대상이라 양면으로 그리는 편이 안전하다.
      // (three 는 양면 재질의 뒷면에서 셰이딩 노멀을 뒤집어 주므로 조명도 정상이다.)
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (mat) mat.side = THREE.DoubleSide;
      }
      meshes[key].push(o);
    }
  });

  const missing = ALL_PARTS.filter((k) => k !== 'wound' && meshes[k].length === 0);

  // ── 2. 크기·위치 정규화 (glb 는 단위가 제각각이다) ─────
  const partMeshes = ALL_PARTS.flatMap((k) => meshes[k]);
  if (normalize && partMeshes.length) {
    const raw = boxInSpace(partMeshes, content);
    const size = raw.getSize(new THREE.Vector3());
    if (size.y > 1e-6) {
      model.scale.multiplyScalar(TARGET_HEIGHT / size.y);
      model.updateWorldMatrix(true, true);
      const fixed = boxInSpace(partMeshes, content);
      const c = fixed.getCenter(new THREE.Vector3());
      // 발끝을 y=0 에, 좌우·앞뒤 중심을 원점에 맞춘다.
      model.position.sub(new THREE.Vector3(c.x, fixed.min.y, c.z));
      model.updateWorldMatrix(true, true);
    }
  }

  // ── 3. 부위별 바운딩박스 (content 로컬 = 월드 크기) ────
  const boxes = {};
  for (const k of ALL_PARTS) {
    if (meshes[k].length) boxes[k] = boxInSpace(meshes[k], content);
  }
  const bodyBox = boxInSpace(partMeshes, content);

  // ── 4. 총상 위치 ───────────────────────────────────────
  const woundLocal = new THREE.Vector3();
  if (boxes.wound) {
    boxes.wound.getCenter(woundLocal);
  } else {
    const t = boxes.skin || bodyBox;
    const size = t.getSize(new THREE.Vector3());
    woundLocal.set(
      t.min.x + size.x * WOUND_ANCHOR.x,
      bodyBox.min.y + bodyBox.getSize(new THREE.Vector3()).y * WOUND_ANCHOR.height,
      t.max.z
    );
    // 표피 표면으로 끌어낸다. 비율로 찍은 점은 몸 안에 묻혀 보이지 않는다.
    root.updateWorldMatrix(true, true);
    snapToSurface(woundLocal, meshes.skin.length ? meshes.skin : partMeshes, root, t);
    // glb 에 WOUND 메시가 없으면 표식을 직접 놓는다.
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 16, 12),
      new THREE.MeshStandardMaterial({
        color: lin(0x5c0d14), roughness: 0.5, emissive: lin(0x3d0910), emissiveIntensity: 1.4
      })
    );
    marker.name = 'WOUND_MARKER';
    marker.position.copy(woundLocal);
    marker.userData.part = 'wound';
    content.add(marker);
    nodes.wound.push(marker);
    meshes.wound.push(marker);
    boxes.wound = boxInSpace([marker], content);
  }
  const woundWorld = root.localToWorld(woundLocal.clone());

  const woundGlow = glowSprite('rgba(226,72,64,1)', 0.34);
  woundGlow.position.copy(woundLocal);
  content.add(woundGlow);

  // 총상 표식은 표피 안쪽에 묻혀 레이캐스트에 아예 잡히지 않을 수 있다
  // (원본 프로토타입이 그랬다 — 흉부 실린더가 총상 구체를 완전히 감싸서 클릭이 되지 않았다).
  // 계통과 같은 방식으로, 표면 밖까지 나오는 투명 구를 클릭 대상으로 둔다.
  const woundR = boxes.wound.getBoundingSphere(new THREE.Sphere()).radius;
  const woundHit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(woundR * 2.2, 0.05), 12, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  woundHit.name = 'HIT_WOUND';
  woundHit.position.copy(woundLocal);
  woundHit.userData.part = 'wound';
  woundHit.userData.hit = true;
  content.add(woundHit);

  // ── 5. 계통 히트박스 (얇은 관·뼈를 클릭 가능하게) ─────
  const hitboxes = [];
  for (const k of INTERNAL_PARTS) {
    if (!boxes[k]) continue;
    const b = boxes[k].clone().expandByScalar(0.02);
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(size.x, 0.12), Math.max(size.y, 0.12), Math.max(size.z, 0.12)
      ),
      new THREE.MeshBasicMaterial({ visible: false }) // 보이지 않지만 레이캐스트는 된다
    );
    hit.name = 'HIT_' + k.toUpperCase();
    hit.position.copy(center);
    hit.userData.part = k;
    hit.userData.hit = true;
    // 계통끼리 박스가 겹칠 때(전신 골격이 심장을 감싸는 식) 더 좁은 쪽을 고르기 위한 기준.
    // 패딩 전 부피를 써서 최소 크기 보정이 순위를 흔들지 않게 한다.
    const s0 = boxes[k].getSize(new THREE.Vector3());
    hit.userData.vol = Math.max(s0.x, 1e-4) * Math.max(s0.y, 1e-4) * Math.max(s0.z, 1e-4);
    content.add(hit);
    hitboxes.push(hit);
  }

  // 픽 사전 검사용 월드 바운딩박스. root 변환은 고정이라 한 번만 만들면 된다.
  root.updateWorldMatrix(true, false);
  const worldBoxes = {};
  for (const k of ALL_PARTS) {
    if (boxes[k]) worldBoxes[k] = boxes[k].clone().applyMatrix4(root.matrixWorld);
  }

  // ── 6. 출혈 — 표피 머티리얼에 셰이더를 덧댄다 ─────────
  const bleedUniforms = {
    uWound: { value: woundWorld.clone() },
    uBleed: { value: 0 },
    uBlood: { value: BLOOD.clone() }
  };
  const patched = new Set();
  const surfaceMats = [];
  for (const k of SURFACE_PARTS) {
    for (const m of meshes[k]) {
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) {
        if (!mat || patched.has(mat.uuid)) continue;
        patched.add(mat.uuid);
        surfaceMats.push(mat);
        patchBleed(mat, bleedUniforms);
      }
    }
  }

  // ── 7. 내부 계통은 개복 전까지 숨긴다 ─────────────────
  for (const k of INTERNAL_PARTS) nodes[k].forEach((o) => { o.visible = false; });

  let opened = false;

  function open() {
    if (opened) return;
    opened = true;
    for (const mat of surfaceMats) {
      mat.transparent = true;
      mat.opacity = 0.17;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
    // 17% 불투명이 된 몸이 실루엣 그림자를 그대로 드리우면 거짓말이 된다.
    // 게다가 그 그림자가 검안대에 찍혀 반투명한 몸 너머로 얼룩처럼 비쳐 보인다.
    for (const k of SURFACE_PARTS) meshes[k].forEach((m) => { m.castShadow = false; });
    for (const k of INTERNAL_PARTS) nodes[k].forEach((o) => { o.visible = true; });
  }

  /** t: 0~1 — 총상에서부터 번져 나가는 출혈 반경. */
  function setBleed(t) {
    bleedUniforms.uBleed.value = t * 1.95;
  }

  /**
   * 레이가 맞은 부위 키를 돌려준다. 단순 최근접이 아니라 우선순위로 고른다.
   *   1) 총상 — 작고 중요한 표적이라 항상 최우선
   *   2) 개복 후에는 계통이 표피보다 우선(표피가 17% 불투명이라 눈에 보이는 건 계통이다).
   *      계통끼리 겹치면 바운딩박스가 작은 = 더 구체적인 쪽이 이긴다.
   *      전신 골격 박스가 그 안의 심장·신경을 삼키는 것을 막기 위한 규칙이다.
   *   3) 그 밖에는 표피/사지
   */
  function pickPart(raycaster, stageNo) {
    // 총상은 외표검사 단계에서만 최우선이다. 개복 뒤에도 우선하면 총상 바로 아래
    // 붙어 있는 심장을 영영 조준할 수 없다(해부학적으로 겹쳐 있다).
    if (stageNo === 0 && raycaster.intersectObject(woundHit, false).length) return 'wound';

    if (stageNo >= 1 && hitboxes.length) {
      const hits = raycaster.intersectObjects(hitboxes, false);
      let best = null;
      for (const h of hits) {
        if (!best || h.object.userData.vol < best.userData.vol) best = h.object;
      }
      if (best) return best.userData.part;
    }

    // 표피는 실제 지오메트리를 쏜다. 고해상도 glb 는 이 비용이 크므로,
    // 먼저 바운딩박스로 걸러 몸을 빗나간 광선은 메시 검사를 아예 건너뛴다.
    const surface = meshes.wound.slice();
    for (const k of SURFACE_PARTS) {
      if (worldBoxes[k] && raycaster.ray.intersectsBox(worldBoxes[k])) surface.push(...meshes[k]);
    }
    if (!surface.length) return null;
    const hit = raycaster.intersectObjects(surface, false)[0];
    return hit ? hit.object.userData.part : null;
  }

  function update(t) {
    const s = 0.34 * (1 + Math.sin(t * 0.0022) * 0.16);
    woundGlow.scale.set(s, s, 1);
  }

  /**
   * 그 부위를 조준할 만한 월드 좌표 후보들.
   * 계통끼리 영역이 겹치므로(전신 골격 안에 심장, 심장 박스 안에 척수 중심)
   * 바운딩박스 중심 하나로는 부족하다 — 상하좌우로도 흩어 놓는다.
   */
  function aimPoints(part) {
    const b = boxes[part];
    if (!b) return [];
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3());
    const offs = [
      [0, 0, 0], [0, 0.34, 0], [0, -0.34, 0], [0, 0.44, 0], [0, -0.44, 0],
      [0.3, 0, 0], [-0.3, 0, 0], [0, 0.2, 0.3], [0, -0.2, -0.3]
    ];
    return offs.map(([fx, fy, fz]) => root.localToWorld(
      new THREE.Vector3(c.x + fx * s.x, c.y + fy * s.y, c.z + fz * s.z)
    ));
  }

  /** 바운딩박스에서 카메라 프리셋을 만든다. 종횡비가 바뀌면 다시 부르면 된다. */
  function buildViews(camera) {
    const views = {};
    const make = (key, box) => {
      const cfg = VIEW_ANGLES[key] || VIEW_ANGLES.overview;
      const b = box.clone();
      if (cfg.expand) b.expandByScalar(cfg.expand);
      const center = b.getCenter(new THREE.Vector3());
      views[key] = {
        tgt: root.localToWorld(center),
        r: fitRadius(b, camera, cfg.pad),
        th: cfg.th,
        ph: cfg.ph
      };
    };
    make('overview', bodyBox);
    for (const k of ALL_PARTS) {
      if (boxes[k]) make(k, boxes[k]);
      else views[k] = views.overview; // 모델에 없는 부위는 전체 뷰로 대체
    }
    return views;
  }

  return {
    source, root, content, missing, meshes, nodes, boxes,
    woundWorld, open, setBleed, pickPart, update, buildViews, aimPoints,
    isOpened: () => opened
  };
}

/**
 * 몸 앞쪽에서 광선을 쏘아 점을 표피 표면 위로 옮긴다.
 * 표면을 못 찾으면 입력값을 그대로 둔다(형상이 특이한 모델 대비).
 * @param {THREE.Vector3} point  content 로컬 좌표 — 제자리에서 수정된다
 */
function snapToSurface(point, targets, root, box) {
  if (!targets.length) return;
  const ray = new THREE.Raycaster();
  const from = root.localToWorld(new THREE.Vector3(point.x, point.y, box.max.z + 0.5));
  const to = root.localToWorld(new THREE.Vector3(point.x, point.y, box.min.z));
  ray.set(from, to.sub(from).normalize());
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return;
  point.copy(root.worldToLocal(hit.point));
  point.z += 0.004; // 표면 바로 바깥에 얹는다
}

/**
 * MeshStandardMaterial 에 "총상에서 거리 기반으로 붉게 물드는" 항을 주입한다.
 * 메시 단위가 아니라 프래그먼트 단위라, glb 처럼 몸 전체가 메시 두어 개여도
 * 원본(수십 개 프리미티브)과 같은 번짐이 나온다.
 */
function patchBleed(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBleedPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvBleedPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vBleedPos;\nuniform vec3 uWound;\nuniform vec3 uBlood;\nuniform float uBleed;'
      )
      .replace(
        '#include <dithering_fragment>',
        [
          '#include <dithering_fragment>',
          'float bleedK = clamp((uBleed - distance(vBleedPos, uWound)) / 0.3, 0.0, 1.0);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uBlood, bleedK * 0.92);',
          'gl_FragColor.rgb += vec3(0.32, 0.03, 0.05) * bleedK * 0.5;',
          'gl_FragColor.a = mix(gl_FragColor.a, min(1.0, gl_FragColor.a + 0.62), bleedK);'
        ].join('\n')
      );
  };
  mat.customProgramCacheKey = () => 'bleed';
  mat.needsUpdate = true;
}
