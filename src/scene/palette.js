import * as THREE from 'three';

/**
 * 원본(three r128)에는 색 관리가 없어서 16진 팔레트가 그대로 선형 색값으로 쓰였다.
 * 최신 three 는 기본적으로 이 값들을 sRGB 로 해석해 어둡게 만든다.
 * 그래서 "이전해 온 팔레트"만 선형으로 못박아 원본 톤을 보존한다.
 * ColorManagement 자체는 켜 둔 채이므로, glb 의 텍스처/머티리얼은 정상 경로를 탄다.
 */
export const lin = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
