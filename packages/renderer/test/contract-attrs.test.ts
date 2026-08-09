import { describe, expect, it } from 'vitest'

/**
 * **§6.11의 여섯 속성 계약을 세는 가드.**
 *
 * Task 5가 계약 밖 셋을 지웠다. 이 파일은 **일곱 번째가 다시 생기지 않게 한다.**
 *
 * ---
 *
 * **왜 렌더 결과가 아니라 원문을 세는가.** `structures.test.tsx`의 가드는 기본 props로
 * 그린 HTML을 훑으므로 **조건부로만 나오는 속성을 보지 못한다** — `props.caption`이
 * 있을 때만 그려지는 조각처럼, 기본값에서 안 나오는 자리에 속성을 달면 그냥 통과한다.
 * 원문을 세면 그 갈래가 없다. 둘은 서로를 대신하지 않고 반대쪽 사각을 덮는다.
 *
 * **세는 파일이 세는 대상 안에 들어가면 안 된다.** 이 저장소가 P2b-4·P2b-5에서 같은
 * 사고를 세 번 겪었다(개수를 적은 주석이 자기를 세거나, 범위를 좁혔더니 좁힌 파일의
 * 주석이 세어졌다). 그래서 대상 글롭은 `../src/**`이고 이 파일은 `test/`에 있다.
 *
 * **주석을 걷고 센다.** 주석에 적힌 옛 이름(`data-wb-role` 등 — 실제로 `document.tsx`·
 * `input.tsx`의 주석에 남겨 뒀다)이 세어지면 거짓 실패다.
 */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

/** 렌더러가 테마에 노출하기로 한 속성 전부. 설계 문서 §6.11 */
const CONTRACT_ATTRS = [
  'data-wb-id',
  'data-wb-component',
  'data-wb-structure',
  'data-wb-variant',
  'data-wb-part',
  'data-wb-state',
]

/**
 * 계약 밖인데 원문에 있어도 되는 것. **이름 있는 예외 하나뿐이다.**
 *
 * `data-wb-error`는 폴백이 단다(`src/fallback.tsx`). 폴백은 **문서 노드가 아니라 오류
 * 표시**이고 테마의 어휘 밖이라(§5.1 — 테마는 카탈로그가 선언한 컴포넌트와 parts만
 * 스타일한다) 테마 검증기가 대조할 일이 없다. 같은 판정을 `structures.test.tsx`의
 * *"폴백만 일반 선언을 낸다"*가 스타일 쪽에서 함께 고정한다.
 */
const ALLOWED_OUTSIDE_CONTRACT = ['data-wb-error']

/**
 * 주석을 걷는다. 줄 주석과 블록 주석 둘 다.
 *
 * ---
 *
 * **문자열 안의 `//`를 주석으로 오인한다**(`'https://…'`). **이것은 실재하는 사각이다.**
 *
 * 앞서 이 자리에 *"이 검사에서는 무해하다 — 놓치면 `expect(scanned)`와 카나리아가
 * 걸린다"*고 적었는데 **거짓이었다.** 실측:
 *
 * | 심은 것 | 이 가드 | 렌더 결과 가드 |
 * |---|---|---|
 * | `PageDefault`에 `{...{ 'https://x': '', 'data-wb-foo': '1' }}` | **놓친다** | 잡는다 |
 * | **조건부** `<figcaption>`에 `{...{ 'x://y': '', 'data-wb-bad': '1' }}` | **놓친다** | (기본 props로만 그리던 때) **놓쳤다** |
 *
 * `scanned`는 **다른 파일들이 올려 주므로** 0이 되지 않고, 카나리아는 손으로 만든
 * 문자열만 보므로 `src/`의 실제 사각을 대신 재지 못한다. 즉 **두 장치 다 이 부류를
 * 잡지 못한다.**
 *
 * **고친 방법은 이 함수가 아니다.** 문자열 인지형 파서로 바꾸는 대신 **렌더 결과 가드를
 * 비기본 props로 돌리게 했다**(`structures.test.tsx`의 *"비기본 props로 전수 렌더해도…"*).
 * 그쪽은 원문을 읽지 않고 **실제로 나온 HTML**을 보므로 주석·문자열 문제가 원리적으로
 * 없고, 조건부 조각까지 지나간다. 위 표의 둘째 줄을 다시 심어 그 가드가 잡는 것을 확인했다.
 *
 * **그래서 이 가드가 덮는 범위는 이제 이렇다:** 렌더되지 않는 자리(주석 아닌 코드에 적힌
 * 속성 리터럴, 아직 안 쓰이는 구조)까지 본다. **문자열 안에 `//`가 든 줄은 못 본다.**
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** 원문에서 `data-…` 리터럴을 모은다. JSX 속성과 문자열 키를 함께 잡는다. */
function dataAttrs(source: string): string[] {
  return [...stripComments(source).matchAll(/['"\s{](data-[\w-]+)['"\s=:]/g)].map((m) => m[1]!)
}

describe('§6.11 여섯 속성 계약', () => {
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
    // 카나리아. 주석 걷기가 사라지면 `document.tsx`·`input.tsx`의 주석에 남은 옛 이름이
    // 세어져 아래 케이스가 거짓으로 실패한다.
    expect(dataAttrs('// data-wb-role="x"\nconst a = 1')).toEqual([])
    expect(dataAttrs('/* data-control="x" */\nconst a = 1')).toEqual([])
    // 걷은 뒤에도 진짜 속성은 보인다.
    expect(dataAttrs('<div data-wb-id="n" />')).toEqual(['data-wb-id'])
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
