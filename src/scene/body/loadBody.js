import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createBodyModel } from './bodyModel.js';
import { buildFallbackBody } from './fallbackBody.js';
import { ALL_PARTS, partKeyFor } from './parts.js';

// 하위 경로에 배포될 수 있으므로(github.io/<저장소>/ 같은) 절대 경로를 쓰지 않는다.
// BASE_URL 은 vite 가 빌드 시점에 박아 넣는다 — dev 에서는 '/'.
const BASE = import.meta.env.BASE_URL;
export const MODEL_URL = BASE + 'models/body.glb';
export const DRACO_PATH = BASE + 'draco/'; // npm postinstall 이 three 패키지에서 복사한다

function loadGLTF(url) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH); // 설정하지 않으면 wasm 을 우선 쓰고, 미지원 환경에서만 js 로 내려간다
  loader.setDRACOLoader(draco);
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => { draco.dispose(); resolve(gltf); },
      undefined,
      (err) => { draco.dispose(); reject(err); });
  });
}

function hasKnownParts(model) {
  let found = false;
  model.traverse((o) => { if (!found && o.isMesh && partKeyFor(o.name)) found = true; });
  return found;
}

/**
 * public/models/body.glb 를 GLTFLoader + DRACOLoader 로 읽는다.
 * 파일이 없거나(404) 규약에 맞는 메시 이름이 하나도 없으면 프리미티브 폴백으로 내려간다.
 * 어느 쪽이든 반환되는 BodyModel 인터페이스는 동일하다.
 */
export async function loadBody(scene, url = MODEL_URL) {
  try {
    const gltf = await loadGLTF(url);
    if (!hasKnownParts(gltf.scene)) {
      console.warn(
        '[body] ' + url + ' 를 읽었지만 부위 메시를 찾지 못했습니다. ' +
        '메시 이름을 ' + ALL_PARTS.join(' / ') + ' 규약(SKIN_TORSO, SKIN_LIMBS, BONE, VESSEL, NERVE)에 ' +
        '맞춰 주세요. 이번에는 프리미티브 폴백을 사용합니다.'
      );
      return createBodyModel(scene, buildFallbackBody(), { normalize: false, source: 'fallback' });
    }
    const model = createBodyModel(scene, gltf.scene, { normalize: true, source: 'glb' });
    if (model.missing.length) {
      console.warn('[body] glb 에 없는 부위: ' + model.missing.join(', ') + ' — 해당 단계는 진행되지 않습니다.');
    }
    return model;
  } catch (err) {
    // dev 서버는 없는 파일에 404 대신 index.html 을 돌려주기도 한다.
    // 그때는 glb 파싱 단계에서 "Unexpected token '<'" 로 실패한다 — 파일이 없다는 뜻이다.
    console.info(
      '[body] ' + url + ' 로드 실패 — 프리미티브 폴백으로 대체합니다. ' +
      '(파일을 놓으려면 public/models/README.md 의 이름 규약을 참고하세요)',
      err?.message || err
    );
    return createBodyModel(scene, buildFallbackBody(), { normalize: false, source: 'fallback' });
  }
}
