import { defineConfig } from 'vite';

/**
 * base 는 배포 위치에 따라 달라진다.
 *  - 도메인 루트(넷리파이/버셀/커스텀 도메인) : 기본값 '/'
 *  - 하위 경로(github.io/<저장소>/)          : BASE_PATH 환경 변수로 지정
 *    예) BASE_PATH=/긴평화부검/ npm run build
 * 코드에서는 import.meta.env.BASE_URL 로 읽어 쓰므로 glb·draco 경로도 함께 따라간다.
 */
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5173, open: true },
  preview: { port: 4173 },
  build: { target: 'es2020', assetsInlineLimit: 0 }
});
