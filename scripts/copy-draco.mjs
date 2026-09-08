/**
 * three 패키지에 동봉된 DRACO 디코더를 public/draco 로 복사한다.
 * DRACOLoader 는 압축된 glb 를 만났을 때만 /draco/ 를 요청하므로,
 * 복사에 실패해도 비압축 glb 는 정상 동작한다.
 */
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco');
const dst = path.join(root, 'public', 'draco');

try {
  await access(src);
  await mkdir(dst, { recursive: true });
  await cp(src, dst, { recursive: true });
  console.log('[draco] copied ->', path.relative(root, dst));
} catch (err) {
  console.warn('[draco] skipped:', err.message);
}
