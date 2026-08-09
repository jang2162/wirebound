/**
 * **`.role`을 읽는 자리가 하나인지 세는 것을 사람이 아니라 이 파일이 한다**(P2b-5 D3).
 *
 * ## 왜 테스트인가 — 주석으로는 두 번 실패했다
 *
 * D3의 하중은 *"역할 판정이 한 자리에 있다"*이고, 그것을 지키려면 `.role`을 읽는 코드가
 * 하나여야 한다. 처음에는 그 수를 **주석에 적었고 두 번 낡았다:**
 *
 * 1. `rg -n "\.role\b" apps/web/src`로 세라고 적었더니 **그 문장 자신이 세어졌다.**
 * 2. 고치면서 *"세는 범위를 한 파일로 좁혀라"*로 바꿨더니 **좁힌 그 파일 안의 주석이
 *    세어졌다**(`project-list.tsx`에서 2가 나오고 둘째가 그 파일의 주석이다).
 *
 * > **소스 텍스트를 세는 문장은 자기 자신을 센다. 범위를 좁혀도 대상 안에 그 문장이 있으면
 * > 같은 일이 난다.** 닫는 방법은 **주석을 걷고 실행으로 세는 것**이다 — 실행으로 재지면
 * > 낡지 않는다. `shell-css.test.ts`·`store-access.test.ts`가 같은 형식의 선례다.
 */
import { describe, expect, it } from 'vitest'
import { stripComments } from './store-access-guard'

/**
 * `apps/web/src`의 소스 전문. 경로가 어긋나거나 파일이 비면 아래가 통째로 헛돈다 —
 * `검사가 진짜 소스를 읽는다`가 그것을 잡는다(D7 검사에서 실제로 난 사고다).
 */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** `.role`을 **코드에서** 읽는 자리. 주석은 걷어 낸다. */
function roleReads(): { path: string; line: string }[] {
  const found: { path: string; line: string }[] = []
  for (const [path, source] of Object.entries(SOURCES)) {
    for (const line of stripComments(source).split('\n')) {
      if (/\.role\b/.test(line)) found.push({ path, line: line.trim() })
    }
  }
  return found
}

describe('역할을 읽는 자리', () => {
  it('검사가 진짜 소스를 읽는다', () => {
    // 이것이 없으면 `SOURCES`가 비어도 아래가 초록이다.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    expect(Object.values(SOURCES).every((text) => text.length > 0)).toBe(true)
  })

  it('.role을 읽는 코드는 판정 함수의 호출부 하나뿐이다', () => {
    // **D3의 하중이다.** 둘이 되는 순간 "판정이 한 곳"이라는 근거가 사라진다 —
    // 역할 분기를 더할 때는 `.role`을 직접 읽지 말고 `projectAbilities`를 지나라.
    const reads = roleReads()

    expect(reads.map((r) => r.path)).toEqual(['../src/routes/project-list.tsx'])
    expect(reads[0]?.line).toContain('projectAbilities(project.role)')
  })

  it('주석은 세지 않는다 — 심어서 확인한다', () => {
    // **이 케이스가 위 검사의 구분력이다.** 주석을 걷지 않으면 `.role`을 말하는 문장이
    // 늘어날 때마다 위 케이스가 죽는다(P2b-5에서 두 번 그랬다).
    const planted = [
      '// `.role`을 읽는 자리를 세는 문장이다',
      '/** 머리말에서 `.role`을 언급한다 */',
      'const ok = 1 // project.role 이라고 적어도 코드가 아니다',
    ].join('\n')

    expect(/\.role\b/.test(planted)).toBe(true)
    expect(/\.role\b/.test(stripComments(planted))).toBe(false)
  })

  it('코드에 심은 읽기는 잡는다 — 음성 대조', () => {
    // 반대편. 주석을 걷는 것이 **코드까지** 지우지는 않는지 본다.
    const planted = 'const r = project.role\n// `.role` 을 설명하는 주석'

    expect(/\.role\b/.test(stripComments(planted))).toBe(true)
  })
})
