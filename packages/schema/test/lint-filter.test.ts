/**
 * **결과 거르개**(P9-3 T5 · D5).
 *
 * 여기서 재는 것은 *"무엇이 남고 무엇이 빠지는가"*다. 경로를 id로 푸는 것은 부르는 쪽의
 * 몫이므로(`matchPageTargets`) 이 파일에 경로 문자열이 없다.
 */
import { describe, expect, it } from 'vitest'
import { filterLintIssues } from '../src/lint/filter'
import type { LintIssue } from '../src/lint/issue'

function issue(over: Partial<LintIssue>): LintIssue {
  return {
    rule: 'comment-missing',
    severity: 'warning',
    pageId: null,
    themeId: null,
    nodeId: null,
    path: '/',
    message: '무엇',
    ...over,
  }
}

const 목록 = issue({ pageId: 'p1' })
const 상세 = issue({ pageId: 'p2' })
const 테마 = issue({ rule: 'theme-token', themeId: 'layout-1' })
const 프로젝트 = issue({ rule: 'naming' })

describe('안 주면 안 거른다', () => {
  it('`undefined`는 전부 남긴다', () => {
    expect(filterLintIssues([목록, 테마, 프로젝트])).toEqual([목록, 테마, 프로젝트])
  })

  /** **빈 배열은 `undefined`와 다르다** — *"어느 페이지도 고르지 않았다"*이다. */
  it('빈 배열은 아무것도 안 남긴다', () => {
    expect(filterLintIssues([목록, 테마], { pageIds: [] })).toEqual([])
  })
})

describe('고른 페이지의 것만 남는다', () => {
  it('다른 페이지의 이슈는 빠진다', () => {
    expect(filterLintIssues([목록, 상세], { pageIds: ['p1'] })).toEqual([목록])
  })

  /**
   * **자리가 없는 이슈는 남지 않는다.** 페이지를 골랐으면 테마 이슈와 메뉴 이름 이슈는
   * 그 페이지의 것이 아니다. **빠진 개수를 부르는 쪽이 말해야 한다** — `wireb lint`가
   * *"전체 N건 중 M건"*을 내는 것이 그 자리다.
   */
  it('pageId가 null인 이슈는 빠진다', () => {
    expect(filterLintIssues([목록, 테마, 프로젝트], { pageIds: ['p1'] })).toEqual([목록])
  })

  it('순서를 바꾸지 않는다 — 설계서 이슈가 앞이고 테마가 뒤다', () => {
    const many = [목록, 상세, issue({ pageId: 'p1', rule: 'duplicate-marker' })]
    expect(filterLintIssues(many, { pageIds: ['p1', 'p2'] })).toEqual(many)
  })

  it('입력 배열을 건드리지 않는다', () => {
    const input = [목록, 상세]
    filterLintIssues(input, { pageIds: ['p1'] })
    expect(input).toEqual([목록, 상세])
  })
})
