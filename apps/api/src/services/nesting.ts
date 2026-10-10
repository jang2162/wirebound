/**
 * **본문의 중첩 깊이 상한** — 재귀로 도는 코드(`@wirebound/schema` 의 `applyOps` · `invertOps`, `db/nul-guard.ts` 의 훑기)가 호출 스택을 넘기기 전에
 * 입구에서 400 으로 끊는다. 상한이 없으면 깊이 1500 안팎(노드 단계 — 이 기계의 Node 기본 스택에서 `applyOps` 가 1000 단계는 지나고 1500 단계에서 넘쳤다)부터
 * 500 이고(PUT · 가져오기는 400 에 «Maximum call stack size exceeded» 문장이 실렸다), 한도 없이 쌓인 깊은 문서는 그 뒤 **모든 편집이 500** 이다.
 * 다시 재는 법: `apps/api/test/nesting-limit.test.ts`(깊이 3000 · 8000 · 한도 위의 값).
 *
 * `MAX_JSON_NESTING` — 본문(JSON) 값의 객체 · 배열 중첩. 노드 하나가 객체 + `children` 배열 = 2 단계라 노드 300 단계다. **기술 한도다 — 제품 규칙이 아니다**
 * (현실의 설계서는 수십 단계 안이다). 넘기는 설계서가 나오면 올리되, 그 전에 재귀를 반복으로 바꾸는 쪽(`@wirebound/schema`)이 먼저다.
 *
 * **편집 뒤 문서의 깊이는 따로 안 본다 — 편집으로는 한도를 넘어 쌓이지 않는다.** 편집 하나가 더하는 깊이는 «경로가 가리키는 자리의 깊이 + 값의 깊이» 이고, 경로는
 * 2000 글자까지(`http/patch-ops.ts` 의 `PatchOpSchema`)라 노드 단계로 190 안팎이다 — 그 밑에 값(300 단계)을 달면 한 편집 뒤 문서는 500 단계 안이고, 그보다 깊은 자리는
 * 경로로 닿지 못해 더 쌓지 못한다(120 단계 조각을 맨 밑에 계속 다는 케이스가 셋째에서 `ops.0.path` 400 으로 멈춘다 — `nesting-limit.test.ts`). 경로 한도를 올리면 이 근거가
 * 깨지니 그 케이스가 먼저 죽는다.
 *
 * 훑기는 **스택으로 돈다**(이 파일이 재귀면 지키려던 것에 같은 방식으로 진다).
 */
export const MAX_JSON_NESTING = 600

/** 값의 객체 · 배열 중첩이 `limit` 단계를 넘는가. 원시값은 0 단계다. */
export function jsonNestingExceeds(value: unknown, limit: number = MAX_JSON_NESTING): boolean {
  if (value === null || typeof value !== 'object') return false
  const stack: { value: object; depth: number }[] = [{ value, depth: 1 }]
  while (stack.length > 0) {
    const { value: current, depth } = stack.pop()!
    if (depth > limit) return true
    for (const child of Array.isArray(current) ? current : Object.values(current)) {
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: depth + 1 })
    }
  }
  return false
}

/** 400 에 싣는 문장 — 입구마다 같다. */
export const TOO_DEEP_MESSAGE = `본문의 중첩이 너무 깁니다(객체 · 배열 ${MAX_JSON_NESTING} 단계까지)`
