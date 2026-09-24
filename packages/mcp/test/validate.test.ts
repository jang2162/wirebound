/**
 * `validate`.
 *
 * 재는 것 다섯: **결함이 오류가 아닌 것** · **카탈로그를 안 부르면 결과가 통째로 거짓이 되는
 * 것** · **경로가 출력 거르개인 것과 그때 빠지는 것을 값으로 말하는 것** · **`notes`를
 * 버리지 않는 것** · **정규식을 세션이 못 주는 것**.
 */
import { describe, expect, it } from 'vitest'
import { LAYOUT, THEME_ROW, snapshotPayload, 경고가_있는_프로젝트, 오류가_있는_프로젝트 } from '@wirebound/cli/test-support'
import { callTool } from '../src/server'
import { PROJECT, SERVER, callJson, harness } from './harness'

interface Report {
  ran: boolean
  path: string | null
  failing: boolean
  errors: number
  warnings: number
  totalIssues: number
  outsideErrors: number
  droppedProjectIssues: number
  notes: { kind: string; message: string }[]
  issues: { rule: string; severity: string; message: string; pageId: string | null; pagePath: string | null }[]
}

const 명명규칙 = { server: SERVER, projectId: PROJECT, lint: { naming: { page: '^[A-Z]+$', menu: '^[A-Z]+$' } } }

describe('결함을 찾은 것은 오류가 아니다', () => {
  it('error 가 있어도 정상 결과이고 `failing`이 값이다', async () => {
    const outcome = await callTool(harness({ payload: 오류가_있는_프로젝트() }), 'validate', {})

    // **`isError`를 세우면 에이전트가 *"도구가 고장났다"*로 읽고 재시도한다.**
    expect(outcome.isError).toBe(false)

    const said = JSON.parse(outcome.text) as Report
    expect(said.ran).toBe(true)
    expect(said.failing).toBe(true)
    expect(said.errors).toBeGreaterThan(0)
  })

  it('결함이 없으면 `failing`이 거짓이다 — 반대편', async () => {
    const said = (await callJson(harness(), 'validate')) as Report
    expect(said.failing).toBe(false)
    expect(said.errors).toBe(0)
    expect(said.issues).toEqual([])
  })

  /**
   * `wireb lint`가 코드 10을 내는 조건과 **같은 값**이다 — `error`가 하나라도 있을 때이고
   * `warning`만 있으면 아니다(근거와 실측은 `exit.ts`의 표 아래).
   */
  it('경고만 있으면 `failing`이 거짓이다 — 코드 10의 조건과 같다', async () => {
    const said = (await callJson(harness({ payload: 경고가_있는_프로젝트() }), 'validate')) as Report
    expect(said.warnings).toBe(1)
    expect(said.errors).toBe(0)
    expect(said.failing).toBe(false)
  })
})

describe('installCatalog 를 부른다 — 안 부르면 결과가 통째로 거짓이다', () => {
  /**
   * 카탈로그 없이 `lintProject`를 돌리면 이 픽스처가 `document-invalid:error`를 낸다
   * (*"알 수 없는 컴포넌트 타입: Page·Button·List"* — 아래 케이스가 그 문장을 본다). 조용히 통과하지는 않지만
   * **전부 `error`라 `failing`까지 뒤집힌다** — 결함이 없는 프로젝트가 실패로 보고된다.
   *
   * 부르는 자리는 `read/catalog.ts` **하나**이고 `wireb lint`도 그것을 지난다.
   */
  it('멀쩡한 카탈로그 노드를 "알 수 없는 컴포넌트 타입"이라 하지 않는다', async () => {
    const said = (await callJson(harness(), 'validate')) as Report
    expect(said.issues.map((i) => i.message).join('\n')).not.toContain('알 수 없는 컴포넌트 타입')
    expect(said.failing).toBe(false)
  })

  it('진짜로 없는 타입은 여전히 말한다 — 반대편', async () => {
    const said = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'validate')) as Report
    expect(said.issues.map((i) => i.message).join('\n')).toContain('알 수 없는 컴포넌트 타입: 없는컴포넌트')
  })
})

describe('경로는 출력 거르개다 — 빠진 것을 **값으로** 말한다', () => {
  it('걸러진 것으로 답하되 전체 개수를 함께 낸다', async () => {
    const said = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'validate', {
      path: '관리자/회원/목록',
    })) as Report

    expect(said.path).toBe('관리자/회원/목록')
    expect(said.issues).toEqual([])
    expect(said.totalIssues).toBe(2)
  })

  /**
   * **`wireb lint <경로>`가 0으로 끝나면서 프로젝트에 `error`가 남아 있을 수 있다**
   * (`commands/lint.ts`).
   * CLI는 그것을 stderr 한 줄로 말하는데 **에이전트는 그 줄을 놓치기 쉽다** — 그래서 필드다.
   */
  it('경로 밖에 남은 error 개수를 필드로 낸다 — 산문이 아니다', async () => {
    const said = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'validate', {
      path: '관리자/회원/목록',
    })) as Report

    expect(said.failing).toBe(false)
    expect(said.outsideErrors).toBe(2)
  })

  it('경로를 안 주면 밖이 없다 — 반대편', async () => {
    const said = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'validate')) as Report
    expect(said.path).toBeNull()
    expect(said.outsideErrors).toBe(0)
    expect(said.failing).toBe(true)
  })

  /**
   * **`filterLintIssues`가 `pageId`로만 거른다** — 테마 이슈와 메뉴 이름 이슈는 `pageId`가
   * `null`이라 **어느 경로를 줘도 통째로 빠진다.** 개수를 안 말하면
   * *"이 페이지는 깨끗하다"*가 *"프로젝트가 깨끗하다"*로 읽힌다.
   */
  it('페이지에 안 매달린 이슈가 몇 건 빠졌는지 말한다', async () => {
    const io = harness({ binding: 명명규칙 })
    const said = (await callJson(io, 'validate', { path: '관리자/회원/목록' })) as Report

    // 메뉴 셋의 이름 이슈가 `pageId: null`이다.
    expect(said.droppedProjectIssues).toBe(3)
    expect(said.issues.every((i) => i.pageId !== null)).toBe(true)
  })

  it('경로를 안 주면 그 이슈들이 그대로 보인다 — 반대편', async () => {
    const said = (await callJson(harness({ binding: 명명규칙 }), 'validate')) as Report
    expect(said.droppedProjectIssues).toBe(0)
    expect(said.issues.filter((i) => i.pageId === null)).toHaveLength(3)
  })

  it('없는 경로는 결과로 말하고 후보를 낸다 — 오류가 아니다', async () => {
    const outcome = await callTool(harness(), 'validate', { path: '관리자/없다' })
    expect(outcome.isError).toBe(false)

    const said = JSON.parse(outcome.text) as { ran: boolean; reason: string; candidates: string[] }
    expect(said.ran).toBe(false)
    expect(said.reason).toBe('no-such-path')
    expect(said.candidates).toContain('관리자/회원/목록')
  })
})

/**
 * **`notes`를 버리지 않는다.** 버리면 테마를 안 고른 레이아웃·상속이 끊긴 파생 테마·
 * 안 돈 ⑪·못 올린 문서 버전·메뉴를 잃은 페이지가 전부 *"결함 0건"*으로 위장된다.
 *
 * **하나짜리로 재지 않는다** — 다섯 모양 중 넷을 각각 만들어 잰다.
 */
describe('검사에서 빠진 것을 싣는다', () => {
  it('상속이 끊긴 파생 테마 — 기본 픽스처가 이미 그 상태다', async () => {
    const said = (await callJson(harness(), 'validate')) as Report
    expect(said.issues).toEqual([])
    // **결함 0건인데 검사에서 빠진 것이 있다.** 그 둘이 같이 나가야 한다.
    expect(said.notes.map((n) => n.kind)).toContain('theme-unresolved')
    expect(said.notes.map((n) => n.message).join('\n')).toContain(THEME_ROW)
  })

  it('테마를 안 고른 레이아웃', async () => {
    const payload = snapshotPayload({ themes: [{ layoutId: LAYOUT, themeId: null, theme: null }] })
    const said = (await callJson(harness({ payload }), 'validate')) as Report
    expect(said.notes.map((n) => n.kind)).toContain('theme-unset')
  })

  it('레이아웃이 둘이라 ⑪을 안 돌렸다', async () => {
    const 둘 = snapshotPayload()
    둘.layouts.push({ id: LAYOUT.replace(/1$/, '2'), name: '둘째', themeId: null, schema: 둘.layouts[0]!.schema })
    둘.themes.push({ layoutId: LAYOUT.replace(/1$/, '2'), themeId: null, theme: null })

    const said = (await callJson(harness({ payload: 둘 }), 'validate')) as Report
    expect(said.notes.map((n) => n.kind)).toContain('variant-rule-off')
    expect(said.notes.map((n) => n.message).join('\n')).toContain('노드 variant 대조를 돌리지 않았습니다')
  })

  it('메뉴를 잃은 페이지', async () => {
    const 고아 = snapshotPayload()
    고아.menu = []
    const said = (await callJson(harness({ payload: 고아 }), 'validate')) as Report
    expect(said.notes.map((n) => n.kind)).toContain('menu-detached')
  })

  it('못 올리는 문서 버전', async () => {
    const 미래 = snapshotPayload()
    ;(미래.pages[0]!.schema as unknown as { version: number }).version = 99
    const said = (await callJson(harness({ payload: 미래 }), 'validate')) as Report
    expect(said.notes.map((n) => n.kind)).toContain('document-version')
  })

  it('빠진 것이 없으면 빈 배열이다 — 반대편', async () => {
    const 깨끗 = snapshotPayload({ layouts: [], themes: [] })
    const said = (await callJson(harness({ payload: 깨끗 }), 'validate')) as Report
    expect(said.notes).toEqual([])
  })
})

/**
 * **정규식의 신뢰 경계를 열지 않는다.**
 *
 * `LintConfig`는 리포의 `.wirebound.json`에서만 온다. 도구 스키마에 그 자리가 **없는 것**은
 * `test/tools.test.ts`가 들고, 여기서는 **그 부재가 동작으로도 참인지**를 잰다.
 */
describe('명명 규칙은 리포의 파일이 정한다 — 세션이 아니다', () => {
  it('`.wirebound.json`의 lint 절이 그 축을 돌린다', async () => {
    const said = (await callJson(harness({ binding: 명명규칙 }), 'validate')) as Report
    expect(said.issues.filter((i) => i.rule === 'naming')).toHaveLength(6)
  })

  it('그 절이 없으면 그 축이 아예 안 돈다 — 기본값을 지어내지 않는다', async () => {
    const said = (await callJson(harness(), 'validate')) as Report
    expect(said.issues.filter((i) => i.rule === 'naming')).toEqual([])
  })

  it('도구 인자로는 그 값을 줄 수 없다 — 주면 InvalidParams다', async () => {
    for (const args of [{ config: '{}' }, { naming: '^[A-Z]+$' }, { lint: 'x' }]) {
      await expect(callTool(harness(), 'validate', args), JSON.stringify(args)).rejects.toMatchObject({
        code: -32602,
      })
    }
  })

  /**
   * **못 읽는 정규식을 도구가 먼저 죽이지 않는다.** `readLintConfig`가 모양만 보고
   * 컴파일하지 않으므로(`binding.ts`) *"규칙 하나가 잘못 적혔다"*가 *"도구가 서지 못했다"*가
   * 되어 **나머지 규칙의 결과까지 사라지는** 일이 없다.
   */
  it('못 읽는 정규식은 이슈가 되고 나머지 규칙은 계속 돈다', async () => {
    const 나쁜정규식 = { server: SERVER, projectId: PROJECT, lint: { naming: { page: '[' } } }
    const outcome = await callTool(harness({ binding: 나쁜정규식, payload: 오류가_있는_프로젝트() }), 'validate', {})

    expect(outcome.isError).toBe(false)
    const said = JSON.parse(outcome.text) as Report
    expect(said.issues.some((i) => i.rule === 'naming')).toBe(true)
    // 다른 규칙의 결과가 살아 있다.
    expect(said.issues.some((i) => i.rule === 'document-invalid')).toBe(true)
  })
})

describe('이슈가 다음 걸음을 든다', () => {
  it('`pageId`를 페이지 경로로도 옮긴다 — 그대로 `get_page`에 넣을 수 있다', async () => {
    const said = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'validate')) as Report
    const 오류 = said.issues.find((i) => i.rule === 'document-invalid')!
    expect(오류.pagePath).toBe('관리자/회원/오류')

    const 페이지 = (await callJson(harness({ payload: 오류가_있는_프로젝트() }), 'get_page', {
      path: 오류.pagePath!,
    })) as { found: boolean }
    expect(페이지.found).toBe(true)
  })

  it('페이지에 안 매달린 이슈는 `pagePath`가 null이다 — 지어내지 않는다', async () => {
    const said = (await callJson(harness({ binding: 명명규칙 }), 'validate')) as Report
    for (const issue of said.issues.filter((i) => i.pageId === null)) {
      expect(issue.pagePath).toBeNull()
    }
  })
})
