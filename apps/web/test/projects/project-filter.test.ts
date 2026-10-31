/**
 * 프로젝트 목록의 검색 · 역할 거름 · 정렬(`src/projects/project-filter.ts`)과 주소 질의 · 상대 시각. 순수 함수라 화면 없이 잰다.
 */
import { describe, expect, it } from 'vitest'
import type { ProjectListItem } from '../../src/api/types'
import { filterProjects, queryOf, relativeTime, roleBadge, searchOf } from '../../src/projects/project-filter'

function item(overrides: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: 'p',
    name: '이름',
    slug: 'slug',
    description: null,
    role: 'owner',
    memberCount: 1,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

/** `c` 가 `b` 앞이다 — 둘이 같은 시각이라 «같으면 이름 차례» 가 없으면 받은 차례(c · b)로 남는다. */
const ITEMS: ProjectListItem[] = [
  item({ id: 'a', name: '관리자 콘솔', slug: 'Admin-Console', description: null, role: 'owner', updatedAt: '2026-10-03T00:00:00.000Z' }),
  item({ id: 'c', name: '나중 것', slug: 'later', description: '내부 ADMIN 도구', role: 'viewer', updatedAt: '2026-10-05T00:00:00.000Z' }),
  item({ id: 'b', name: '고객 포털', slug: 'portal', description: 'B2C 주문 화면', role: 'editor', updatedAt: '2026-10-05T00:00:00.000Z' }),
  item({ id: 'd', name: '가장 옛 것', slug: 'old', description: null, role: 'viewer', updatedAt: '2026-09-01T00:00:00.000Z' }),
]

const ids = (list: ProjectListItem[]): string[] => list.map((p) => p.id)

describe('filterProjects', () => {
  it('글은 이름 · 슬러그 · 설명에서 대소문자를 가리지 않고 부분 일치한다', () => {
    // 슬러그 «Admin-Console» · 설명 «내부 ADMIN 도구» 둘이 «admin» 에 맞는다 — 이름에는 없다.
    expect(ids(filterProjects(ITEMS, { text: 'admin', role: 'all', sort: 'name' })).sort()).toEqual(['a', 'c'])
    expect(ids(filterProjects(ITEMS, { text: '포털', role: 'all', sort: 'name' }))).toEqual(['b'])
    expect(ids(filterProjects(ITEMS, { text: 'b2c', role: 'all', sort: 'name' }))).toEqual(['b'])
    // 앞뒤 공백은 거른 글이 아니다.
    expect(filterProjects(ITEMS, { text: '  ', role: 'all', sort: 'name' })).toHaveLength(4)
  })

  it('역할 거름 — 그 역할의 프로젝트만, `all` 이면 전부', () => {
    expect(ids(filterProjects(ITEMS, { text: '', role: 'viewer', sort: 'name' })).sort()).toEqual(['c', 'd'])
    expect(ids(filterProjects(ITEMS, { text: '', role: 'owner', sort: 'name' }))).toEqual(['a'])
    expect(filterProjects(ITEMS, { text: '', role: 'all', sort: 'name' })).toHaveLength(4)
  })

  it('`updated` 는 `updatedAt` 내림차순, 같으면 이름 차례', () => {
    // b · c 가 같은 시각이다 — 이름 «고객 포털» < «나중 것».
    expect(ids(filterProjects(ITEMS, { text: '', role: 'all', sort: 'updated' }))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('`name` 은 한국어 차례(`localeCompare(…, "ko")`)', () => {
    expect(ids(filterProjects(ITEMS, { text: '', role: 'all', sort: 'name' }))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('받은 배열을 바꾸지 않는다', () => {
    const before = ids(ITEMS)
    filterProjects(ITEMS, { text: '', role: 'all', sort: 'name' })
    expect(ids(ITEMS)).toEqual(before)
  })
})

describe('주소 질의 — `?q=&role=&sort=`', () => {
  it('없으면 기본값 — 글 없음 · 전체 · 최근 수정', () => {
    expect(queryOf(new URLSearchParams(''))).toEqual({ text: '', role: 'all', sort: 'updated' })
  })

  it('있으면 그 값, 모르는 역할 · 정렬은 기본값', () => {
    expect(queryOf(new URLSearchParams('q=포털&role=editor&sort=name'))).toEqual({ text: '포털', role: 'editor', sort: 'name' })
    expect(queryOf(new URLSearchParams('role=admin&sort=random'))).toEqual({ text: '', role: 'all', sort: 'updated' })
  })

  it('기본값은 주소에 안 싣는다 — 처음 연 목록의 주소는 `/` 그대로', () => {
    expect(searchOf({ text: '', role: 'all', sort: 'updated' }).toString()).toBe('')
    expect(searchOf({ text: '포털', role: 'viewer', sort: 'name' }).toString()).toBe(
      new URLSearchParams({ q: '포털', role: 'viewer', sort: 'name' }).toString(),
    )
  })
})

describe('역할 표지', () => {
  it('셋은 그 이름, 계약 밖 값은 빈 글(던지지 않는다)', () => {
    expect(['owner', 'editor', 'viewer'].map((role) => roleBadge(item({ role: role as ProjectListItem['role'] })))).toEqual([
      'owner',
      'editor',
      'viewer',
    ])
    expect(roleBadge(item({ role: 'admin' as ProjectListItem['role'] }))).toBe('')
  })
})

describe('relativeTime', () => {
  const NOW = Date.parse('2026-10-31T12:00:00.000Z')

  it.each([
    ['2026-10-31T11:59:30.000Z', '방금'],
    ['2026-10-31T11:55:00.000Z', '5분 전'],
    ['2026-10-31T09:00:00.000Z', '3시간 전'],
    ['2026-10-29T12:00:00.000Z', '2일 전'],
    ['2026-10-02T12:00:00.000Z', '29일 전'],
  ])('%s → %s', (iso, text) => {
    expect(relativeTime(iso, NOW)).toBe(text)
  })

  it('30일 넘으면 날짜, 읽을 수 없는 값이면 빈 글', () => {
    expect(relativeTime('2026-09-30T12:00:00.000Z', NOW)).toBe('2026-09-30')
    expect(relativeTime('2026-09-01T12:00:00.000Z', NOW)).toBe('2026-09-01')
    expect(relativeTime('어제', NOW)).toBe('')
  })

  it('미래 시각(시계가 어긋난 판)은 «방금»', () => {
    expect(relativeTime('2026-10-31T12:10:00.000Z', NOW)).toBe('방금')
  })
})
