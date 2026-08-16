/**
 * **`wireb export`가 받는 zip을 만드는 자리 하나.**
 *
 * `apps/api`가 `fflate`의 `zipSync`로 만든 것을 CLI가 `unzipSync`로 푼다 — 케이스도 같은
 * 함수로 만들어야 *"우리가 만든 모양"*이 아니라 **그 라이브러리가 만든 모양**을 잰다.
 * 손으로 조립한 바이트 배열로 재면 헤더 하나가 어긋나도 자가 모른다.
 *
 * **뿌리 폴더가 있는 것이 진짜 모양이다** — `apps/api/src/services/export-zip.ts`가
 * `wirebound-export-<슬러그>/` 아래에 전부를 담는다.
 */
import { strToU8, zipSync } from 'fflate'

export const BUNDLE_ROOT = 'wirebound-export-my-project'

/** §11.3의 트리를 흉내 낸 최소 번들. 파일 셋과 하위 디렉터리 하나. */
export const BUNDLE_FILES: Record<string, string> = {
  'index.html': '<!doctype html><title>설계서</title>',
  'assets/theme.css': ':root { --wb-semantic-primary: #2563eb; }',
  'pages/관리자-회원-목록.html': '<!doctype html><title>관리자 회원 목록</title>',
}

/** 뿌리 폴더 아래에 담는다. `over`로 항목을 더하거나 갈아 끼운다. */
export function bundleZip(over: Record<string, string> = {}, root: string | null = BUNDLE_ROOT): Uint8Array {
  const tree: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries({ ...BUNDLE_FILES })) {
    tree[root === null ? path : `${root}/${path}`] = strToU8(content)
  }
  for (const [path, content] of Object.entries(over)) {
    tree[path] = strToU8(content)
  }
  return zipSync(tree, { level: 6 })
}
