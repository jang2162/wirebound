/**
 * 프로젝트 목록의 **검색 · 역할 거름 · 정렬**과 그 값을 나르는 주소 질의(`?q=&role=&sort=`), 카드의 역할 표지 · 상대 시각. 순수 함수다 —
 * 화면(`routes/project-list.tsx`)은 결과를 그리기만 한다.
 *
 * **역할을 읽지만 판정이 아니다.** 거름과 표지는 «내가 이 프로젝트에서 무엇인가» 를 보이고 고르는 일이지 무엇을 열지 정하는 일이 아니다 — 권한
 * 판정은 그대로 `projects/project-actions.ts` 의 `projectAbilities` 하나다. 이 파일의 `item.role` 읽기는 `test/role-access.test.ts` 가 예외로
 * 적어 두고 센다(같은 파일의 다른 `.role` 읽기는 거기서 죽는다).
 *
 * **던지지 않는다** — 목록은 오류 경계 밖이다(`projects/project-actions.ts` 머리말과 같은 계약). 계약 밖 역할은 표지가 비고, 읽을 수 없는
 * 시각은 정렬에서 같은 값으로 · 상대 시각에서 빈 글로 접힌다.
 */
import type { ProjectListItem, ProjectRole } from '../api/types'

export type ProjectSort = 'updated' | 'name'

export interface ProjectQuery {
  text: string
  role: ProjectRole | 'all'
  sort: ProjectSort
}

const ROLES: readonly ProjectRole[] = ['owner', 'editor', 'viewer']

/** 기본값 — 정렬은 «최근 수정»(설계 「프로젝트 목록」 — 자주 만지는 것이 위로). 기본값은 주소에 안 싣는다(`searchOf`). */
export const DEFAULT_QUERY: ProjectQuery = { text: '', role: 'all', sort: 'updated' }

const byName = (a: ProjectListItem, b: ProjectListItem): number => a.name.localeCompare(b.name, 'ko')

/** 읽을 수 없는 시각은 0 — 정렬이 `NaN` 비교로 차례를 잃지 않게. */
function timeOf(item: ProjectListItem): number {
  const t = Date.parse(item.updatedAt)
  return Number.isNaN(t) ? 0 : t
}

export function filterProjects(items: ProjectListItem[], q: ProjectQuery): ProjectListItem[] {
  const needle = q.text.trim().toLocaleLowerCase()
  const kept = items.filter(
    (item) =>
      (q.role === 'all' || item.role === q.role) &&
      (needle === '' || [item.name, item.slug, item.description ?? ''].some((text) => text.toLocaleLowerCase().includes(needle))),
  )
  return kept.sort(q.sort === 'name' ? byName : (a, b) => timeOf(b) - timeOf(a) || byName(a, b))
}

/** 카드의 역할 표지 — 셋은 그 이름(멤버 절의 역할 글과 같다), 계약 밖 값은 빈 글. */
export function roleBadge(item: ProjectListItem): string {
  return ROLES.find((role) => role === item.role) ?? ''
}

/** 주소 질의 → 거름 값. 모르는 역할 · 정렬은 기본값이다. */
export function queryOf(params: URLSearchParams): ProjectQuery {
  const role = params.get('role')
  const sort = params.get('sort')
  return {
    text: params.get('q') ?? '',
    role: ROLES.find((r) => r === role) ?? 'all',
    sort: sort === 'name' ? 'name' : 'updated',
  }
}

/** 거름 값 → 주소 질의. 기본값인 칸은 싣지 않는다 — 처음 연 목록의 주소가 `/` 그대로다. */
export function searchOf(q: ProjectQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (q.text !== '') params.set('q', q.text)
  if (q.role !== DEFAULT_QUERY.role) params.set('role', q.role)
  if (q.sort !== DEFAULT_QUERY.sort) params.set('sort', q.sort)
  return params
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 카드의 «최근 수정» — 1분 안 «방금», 시간 · 일 단위로 «N분 전» · «N시간 전» · «N일 전», 30일부터는 날짜(그 기계의 지역 날짜). */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const ago = now - t
  if (ago < MINUTE) return '방금'
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}분 전`
  if (ago < DAY) return `${Math.floor(ago / HOUR)}시간 전`
  if (ago < 30 * DAY) return `${Math.floor(ago / DAY)}일 전`
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
