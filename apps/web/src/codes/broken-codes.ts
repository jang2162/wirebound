/**
 * **끊긴 공통코드를 센다** — 붙여넣기 · 모듈 넣기 · 페이지 JSON 가져오기가 들어온 노드를 이 프로젝트의 표로 보고 «끊긴 공통코드 N» 을 말한다(거절하지
 * 않는다 — 참조는 키 · 값이라 다른 프로젝트에서 온 노드는 같은 키가 없으면 끊긴 채 들어온다). 표를 못 읽었으면(`undefined`) 세지 않는다 — 모르는 것을
 * 끊겼다고 말하지 않는다.
 */
import { isCodeBroken, type CodeIndex, type WbNode } from '@wirebound/schema'
import { walkSafely } from '../edit/safe-walk'

export function countBrokenCodes(roots: readonly WbNode[], index: CodeIndex | undefined): number {
  if (index === undefined) return 0
  let count = 0
  for (const root of roots) for (const { node } of walkSafely(root)) if (isCodeBroken(node, index)) count += 1
  return count
}

/** 통지 한 줄 — 0 이면 빈 글. */
export function brokenCodesNotice(count: number): string {
  return count === 0 ? '' : `끊긴 공통코드 ${count}개 — 이 프로젝트의 표에 없는 참조입니다. 속성 패널에서 다시 묶거나 푸세요.`
}
