import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'

/**
 * **설계서 「컴파일」의 여섯 속성 계약을 세는 가드.**
 *
 * 이 파일은 **계약 밖 일곱 번째가 생기지 않게 한다.**
 *
 * ---
 *
 * **왜 렌더 결과가 아니라 원문을 세는가.** `structures.test.tsx`의 가드는 기본 props로
 * 그린 HTML을 훑으므로 **조건부로만 나오는 속성을 보지 못한다** — `props.caption`이
 * 있을 때만 그려지는 조각처럼, 기본값에서 안 나오는 자리에 속성을 달면 그냥 통과한다.
 * 원문을 세면 그 갈래가 없다. 둘은 서로를 대신하지 않고 반대쪽 사각을 덮는다.
 *
 * **세는 파일이 세는 대상 안에 들어가면 안 된다.** 들어가면 개수를 적은 주석이 자기를
 * 세거나, 범위를 좁힌 파일의 주석이 세어진다. 그래서 대상 글롭은 `../src/**`이고 이 파일은
 * `test/`에 있다.
 *
 * **주석을 걷고 센다.** `src/`의 주석에 적힌 속성 이름(계약 밖 이름을 설명하는 주석 등)이
 * 세어지면 거짓 실패다.
 */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

/** 렌더러가 테마에 노출하기로 한 속성 전부. 설계서 「컴파일」 */
const CONTRACT_ATTRS = [
  'data-wb-id',
  'data-wb-component',
  'data-wb-structure',
  'data-wb-variant',
  'data-wb-part',
  'data-wb-state',
]

/**
 * 계약 밖인데 원문에 있어도 되는 것. **이름 있는 예외 셋이다.**
 *
 * `data-wb-error`는 폴백이 단다(`src/fallback.tsx`). 폴백은 **문서 노드가 아니라 오류
 * 표시**이고 테마의 어휘 밖이라(설계서 「컴포넌트 정의 구조」 — 테마는 카탈로그가 선언한 컴포넌트와 parts만
 * 스타일한다) 테마 검증기가 대조할 일이 없다. 같은 판정을 `structures.test.tsx`의
 * *"폴백만 일반 선언을 낸다"*가 스타일 쪽에서 함께 고정한다.
 *
 * `data-wb-marker` · `data-wb-marker-offset`은 **테마 뷰가 호스트에게 마커 자리를 알리는 속성**이다 — SDK 의 `<Root marker>` 가
 * 달고(`packages/theme-sdk/src/root.tsx`), 렌더러는 **읽기만** 한다(`src/marker.ts` 의 `markerPoint`). 셀렉터 어휘가 아니고 SDK
 * 기본 뷰는 달지 않는다(코드 테마 spec 「뷰 계약」). 같은 부류의 `data-wb-focus` 는 `src/` 에 셀렉터 글자(`[data-wb-focus]`)로만
 * 있어 아래 `dataAttrs` 의 정규식이 세지 않는다 — 그래서 목록에 없다(있으면 «실제로 쓰인다» 가 죽는다).
 */
const ALLOWED_OUTSIDE_CONTRACT = ['data-wb-error', 'data-wb-marker', 'data-wb-marker-offset']

/**
 * 원문에서 `data-…` 리터럴을 모은다. JSX 속성과 문자열 키를 함께 잡는다.
 *
 * **주석은 파서가 걷는다**(`@wirebound/test-support` 의 `stripComments`) — 문자열 · 템플릿 안의 `//` · `/*` 는 글자로
 * 남으므로 `{...{ 'https://x': '', 'data-wb-foo': '1' }}` 의 뒤쪽 속성도 센다.
 *
 * **이 가드가 덮는 범위:** 렌더되지 않는 자리(주석 아닌 코드에 적힌 속성 리터럴, 아직 안 쓰이는 구조)까지 본다.
 * 조건부 조각이 **실제로 내는** 속성은 렌더 결과 가드가 비기본 props로 돌며 본다(`structures.test.tsx`의
 * *"비기본 props로 전수 렌더해도…"*) — 둘은 서로를 대신하지 않는다.
 */
function dataAttrs(source: string): string[] {
  return [...stripComments(source).matchAll(/['"\s{](data-[\w-]+)['"\s=:]/g)].map((m) => m[1]!)
}

describe('설계서 「컴파일」 여섯 속성 계약', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(0)
    expect(Object.keys(SOURCES)).toContain('../src/attrs.ts')
  })

  it('세는 파일이 세는 대상 안에 있지 않다', () => {
    // 이 파일이 `src/`로 옮겨지면(또는 글롭이 넓어지면) 자기 자신을 센다.
    expect(Object.keys(SOURCES).some((path) => path.includes('contract-attrs'))).toBe(false)
  })

  it('주석을 걷고 센다', () => {
    // 카나리아. 주석 걷기가 사라지면 `src/`의 주석에 적힌 속성 이름이 세어져 아래
    // 케이스가 거짓으로 실패한다.
    expect(dataAttrs('// data-wb-role="x"\nconst a = 1')).toEqual([])
    expect(dataAttrs('/* data-control="x" */\nconst a = 1')).toEqual([])
    // 걷은 뒤에도 진짜 속성은 보인다.
    expect(dataAttrs('<div data-wb-id="n" />')).toEqual(['data-wb-id'])
  })

  it('문자열 속 `//` · 주석 속 `/*` 가 뒤따르는 속성을 지우지 않는다', () => {
    // 주석을 정규식으로 걷으면 둘 다 뒤를 지운다 — 앞의 것은 줄 끝까지, 뒤의 것은 다음 `*/` 까지.
    expect(dataAttrs("const a = { 'https://x': '', 'data-wb-bad': '1' }")).toEqual(['data-wb-bad'])
    expect(dataAttrs("// 글롭 예: src/*\nconst a = { 'data-wb-bad': '1' }\n/** 끝 */")).toEqual(['data-wb-bad'])
  })

  it('src의 data-* 속성이 계약 여섯과 이름 있는 예외뿐이다', () => {
    const offenders: string[] = []
    let scanned = 0

    for (const [path, source] of Object.entries(SOURCES)) {
      for (const attr of dataAttrs(source)) {
        scanned += 1
        if (!CONTRACT_ATTRS.includes(attr) && !ALLOWED_OUTSIDE_CONTRACT.includes(attr)) {
          offenders.push(`${path}: ${attr}`)
        }
      }
    }

    // 정규식이 아무것도 못 잡으면 위 루프가 안 돌고 그냥 초록이 된다.
    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('여섯이 실제로 원문에 다 있다', () => {
    // 계약이 줄어드는 방향도 본다. 어느 속성이 코드에서 사라지면 그것은 계약이 바뀐 것이고
    // 여기서 드러나야 한다.
    const found = new Set(Object.values(SOURCES).flatMap(dataAttrs))
    expect(CONTRACT_ATTRS.filter((attr) => !found.has(attr))).toEqual([])
  })

  it('이름 있는 예외가 실제로 쓰인다', () => {
    // 예외 목록이 썩는 것을 막는다 — 안 쓰이게 되면 지워야 한다.
    const found = new Set(Object.values(SOURCES).flatMap(dataAttrs))
    expect(ALLOWED_OUTSIDE_CONTRACT.filter((attr) => !found.has(attr))).toEqual([])
  })
})
