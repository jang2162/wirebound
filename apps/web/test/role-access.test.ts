/**
 * **`.role`을 읽는 자리가 전부 판정 함수를 지나는지 세는 것을 사람이 아니라 이 파일이 한다.**
 *
 * ## 왜 테스트인가 — 세는 문장은 자기 자신을 센다
 *
 * 규칙의 하중은 *"역할 판정이 한 자리에 있다"*이고, 그것을 지키려면 `.role`을 읽는 코드를
 * 세어야 한다. 그 수를 **주석에 적으면 낡는다** — 고장 방식이 둘이다:
 *
 * 1. `rg -n "\.role\b" apps/web/src`로 세라고 적으면 **그 문장 자신이 세어진다.**
 * 2. *"세는 범위를 한 파일로 좁혀라"*로 적어도 **좁힌 그 파일 안의 주석이 세어진다.**
 *
 * > **소스 텍스트를 세는 문장은 자기 자신을 센다. 범위를 좁혀도 대상 안에 그 문장이 있으면
 * > 같은 일이 난다.** 닫는 방법은 **주석을 걷고 실행으로 세는 것**이다 — 실행으로 재지면
 * > 낡지 않는다. `shell-css.test.ts`·`store-access.test.ts`가 같은 형식의 선례다.
 */
import { describe, expect, it } from 'vitest'
import { stripComments } from './store-access-guard'

/**
 * `apps/web/src`의 소스 전문. 경로가 어긋나거나 파일이 비면 아래가 통째로 헛돈다 —
 * `검사가 진짜 소스를 읽는다`가 그것을 잡는다.
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
      if (/\.\s*role\b/.test(line)) found.push({ path, line: line.trim() })
    }
  }
  return found
}

describe('역할을 읽는 자리', () => {
  it('검사가 진짜 소스를 읽는다', () => {
    // 이것이 없으면 `SOURCES`가 비어도 아래 하중 단언(판정 함수를 안 지나는 읽기가 없다)이
    // 빈 목록으로 초록이다.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    expect(Object.values(SOURCES).every((text) => text.length > 0)).toBe(true)
  })

  /**
   * **규칙의 하중은 *"판정이 한 곳"*이지 *"읽는 자리가 하나"*가 아니다.**
   *
   * 역할을 보는 화면은 여럿이다 — 에디터 셸은 설계서 편집을 owner · editor 에게만 열어야 하므로
   * (설계서 「권한 모델」) 역할을 알아야 한다. 경로를 하나로 못박으면 규칙이 아니라 화면
   * 수를 재게 된다.
   *
   * **그래서 하중 쪽을 잰다 — 모든 읽기가 `projectAbilities(…)`의 인자 자리인가.**
   * 그것이 깨지는 순간이 *"역할 분기가 판정 함수 밖에 생겼다"*이고, 이 규칙은 화면이
   * 몇이 되든 낡지 않는다. **경로 목록도 함께 못박는다** — 새 자리가 생기면 여전히
   * 이 케이스가 죽어 사람이 보고, *"판정을 지나기만 하면 아무 데서나 읽어도 된다"*로
   * 조용히 넓어지지 않는다.
   */
  it('.role을 읽는 코드는 전부 판정 함수의 호출부다', () => {
    const reads = roleReads()

    // 하중: 판정 함수를 지나지 않는 읽기가 하나도 없다 — **판정한 예외 하나**: 설정 페이지 «멤버» 절이 **그 멤버의** 역할
    // (`member.role` — 줄에 보이고 고르개에 싣는 값)을 읽는다. 부르는 사람의 권한이 아니라 표의 값이다. 예외는 그 파일의
    // `member.role` 글자뿐이다 — 같은 파일의 다른 `.role` 읽기는 여전히 여기서 죽는다.
    const memberRow = (r: { path: string; line: string }) =>
      r.path === '../src/settings/members-section.tsx' && /\bmember\.role\b/.test(r.line)
    // **판정한 예외 둘째**: 프로젝트 목록의 역할 표지 · 역할 거름(`projects/project-filter.ts`) — 설계 「프로젝트 목록」 이 카드에 «내 역할» 을
    // 보이고 그것으로 거르게 한다. 무엇을 열지 정하지 않는다(보이고 고르기만). 예외는 그 파일의 `item.role`(목록 항목) · `q.role` ·
    // `DEFAULT_QUERY.role`(거름 값 — 프로젝트의 역할이 아니다)과 목록 화면(`routes/project-list.tsx`)의 거름 고르개 값 `query.role` 글자뿐이다.
    const listFilterRow = (r: { path: string; line: string }) =>
      (r.path === '../src/projects/project-filter.ts' &&
        r.line.replace(/\b(item|q|DEFAULT_QUERY)\.role\b/g, '').search(/\.\s*role\b/) === -1) ||
      (r.path === '../src/routes/project-list.tsx' && r.line.replace(/\bquery\.role\b/g, '').search(/\.\s*role\b/) === -1)
    expect(reads.filter((r) => !r.line.includes('projectAbilities(') && !memberRow(r) && !listFilterRow(r))).toEqual([])

    // 자리: 새 화면이 역할을 보게 되면 여기가 죽는다.
    expect([...new Set(reads.map((r) => r.path))].sort()).toEqual(
      [
        '../src/routes/editor.tsx',
        // 셸 머리의 스냅샷 팝오버가 *"저장 폼을 열어도 되는가"*를 알아야 한다(「권한 모델」 —
        // 생성이 editor 게이트다). **판정은 팝오버가 자기가 한다:** 셸이 역할을 내려보내지
        // 않고 팝오버가 자기 `getProject`로 받는다.
        '../src/shell/snapshots-panel.tsx',
        // 설정 페이지의 «일반» 절이 칸을 열지(`rename`)를 안다 — 역할은 설정 라우트의 `getProject` 에서 온다.
        '../src/settings/general-section.tsx',
        // «테마» 절이 고르개를 열지(`chooseTheme`)를 안다.
        '../src/settings/theme-section.tsx',
        // «멤버» 절이 초대 · 역할 바꾸기 · 제외를 열지(`manageMembers`)를 안다(멤버 줄의 `member.role` 은 위 예외).
        '../src/settings/members-section.tsx',
        // «위험 구역» 이 절을 세울지(`remove`)를 안다 — 목록 줄의 삭제는 없다.
        '../src/settings/danger-section.tsx',
        // 공통코드 화면이 만들기 · 줄 «…» 를 열지(`editDesign`)를 안다 — 역할은 그 라우트의 `getProject` 에서 온다.
        '../src/routes/codes.tsx',
        // 목록 카드의 역할 표지 · 역할 거름과 그 고르개(위 «예외 둘째»).
        '../src/projects/project-filter.ts',
        '../src/routes/project-list.tsx',
      ].sort(),
    )
  })

  it('주석은 세지 않는다 — 심어서 확인한다', () => {
    // **이 케이스가 위 검사의 구분력이다.** 주석을 걷지 않으면 `.role`을 말하는 문장이
    // 늘어날 때마다 위 케이스가 죽는다.
    const planted = [
      '// `.role`을 읽는 자리를 세는 문장이다',
      '/** 머리말에서 `.role`을 언급한다 */',
      'const ok = 1 // project.role 이라고 적어도 코드가 아니다',
    ].join('\n')

    expect(/\.\s*role\b/.test(planted)).toBe(true)
    expect(/\.\s*role\b/.test(stripComments(planted))).toBe(false)
  })

  it('코드에 심은 읽기는 잡는다 — 음성 대조', () => {
    // 반대편. 주석을 걷는 것이 **코드까지** 지우지는 않는지 본다.
    const planted = 'const r = project.role\n// `.role` 을 설명하는 주석'

    expect(/\.\s*role\b/.test(stripComments(planted))).toBe(true)
  })
})
