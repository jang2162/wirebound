/**
 * **문서 판 1 → 2 — 상태 영역(`StateSwitch` > `StateCase`)을 노드 보임(`WbNode.visibility`)으로 푼다**(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C4」). 판 1 에서 상태는 «영역 안에 상태마다 가지를 둔다»였고 판 2 는
 * «노드 하나에 어느 상태에서 보이는지»다. 문서가 들어오는 모든 경계가 이 단계를 탄다 — `migrate.ts`의 `MIGRATIONS` 첫 줄이고, DB 마이그레이션
 * (`apps/api` 의 `0025-state-visibility`)은 이 함수를 직접 부른다.
 *
 * **이 단계는 판 1 → 2 의 뜻으로 얼어 있다 — 고치지 않는다.** 뒤의 판이 모양을 또 바꾸면 새 단계(2 → 3)를 더한다. 그래서 DB 마이그레이션이
 * schema 를 import 해도 옛 DB 에서 다른 결과를 내지 않는다(이 파일이 아는 노드 키는 상태 영역 둘 · `visibility` · `children` 뿐이다).
 *
 * 규칙(영역 하나마다 · 안쪽 영역은 바깥 가지의 조건 안에서):
 *
 * | 판 1 | 판 2 |
 * |---|---|
 * | 기본 가지의 자식 | 영역 자리에 차례로 꺼낸다. 영역에 다른 상태의 가지가 있으면 `except [그 가지들의 상태]` |
 * | 상태 S 가지의 자식(S 는 목록에 있다) | 그 뒤에 가지 차례로 꺼내고 `only [S]` |
 * | 바깥 영역의 가지 안에서 꺼낸 노드 | 두 조건을 합친 집합을 `only [...]`(`default` 포함 · 목록 차례)로 |
 * | 목록 밖 상태의 가지 · 같은 상태의 둘째 가지 · 가지가 아닌 영역 자식 · 합친 집합이 빈 노드 | 버린다(판 1 에서 어느 상태에서도 안 그려졌다) — `dropped` 로 센다 |
 * | 영역 밖에 선 `StateCase` | 자식만 그 자리에 꺼낸다(판 1 렌더러가 투명 노드로 그렸다) |
 *
 * **성질:** 상태마다(기본 포함) 판 1 의 «그 상태에서 보이는 트리»(영역 · 가지 노드를 뺀 노드 id 차례)와 판 2 의 숨은 노드를 뺀 트리의 차례가
 * 같다(`test/migrate-document.test.ts` — 판 1 의 판정은 케이스 파일 안의 사본이다). 판 1 의 상태 목록은 평평하므로(`parent` 가 없다) 조건 집합이
 * 유한하고 물려받기가 끼지 않는다.
 *
 * 노드는 옮기기만 한다 — id 를 새로 짓지 않는다(판 1 의 가지 복사가 이미 새 id 였다). 그래도 상태 영역을 푼 문서에 같은 id 가 둘이면
 * `MigrationError` — 두 노드를 한 보임으로 합칠 수 없다. 상태 영역이 없는 문서는 옮길 것이 없어 겹침을 보지 않는다(검증의 `duplicate-id` 몫이다).
 */
import { DEFAULT_VIEW_STATE, type AnyDocument, type NodeVisibility, type WbNode } from './node'

const STATE_SWITCH = 'StateSwitch'
const STATE_CASE = 'StateCase'

/** 판 1 → 2 가 멈춘 까닭 — 같은 노드 id 가 둘이다(어느 상태에서 보이는지를 한 노드에 못 합친다). */
export class MigrationError extends Error {
  constructor(
    readonly nodeId: string,
    readonly pageId: string | null = null,
  ) {
    super(`문서를 판 2 로 옮기지 못했습니다${pageId === null ? '' : ` (페이지 ${pageId})`}: 노드 id 가 겹칩니다 — ${nodeId}`)
    this.name = 'MigrationError'
  }
}

interface Raw {
  id?: unknown
  type?: unknown
  props?: unknown
  children?: unknown
  [key: string]: unknown
}

function isNode(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function caseState(node: Raw): unknown {
  return node.type === STATE_CASE && isNode(node.props) ? node.props.state : undefined
}

/** 판 1 → 2 의 결과 — 옮긴 문서와 버린 노드 id(버린 가지 안의 노드 전부 · 문서 차례 · 영역 · 가지 노드 자신은 빼고). */
export interface LiftResult<T extends AnyDocument> {
  doc: T
  dropped: string[]
}

/**
 * 판 1 문서를 판 2 로(`version` 은 부르는 쪽 — `migrateDocument` — 이 올린다). 입력을 고치지 않는다. 레이아웃 · 목록 없는 문서는 상태가 없으므로
 * 기본 가지만 남는다(모든 상태의 가지가 목록 밖이다).
 */
export function liftStateRegions<T extends AnyDocument>(doc: T): LiftResult<T> {
  const listed: unknown = (doc as { viewStates?: unknown }).viewStates
  const universe = [
    DEFAULT_VIEW_STATE,
    ...(Array.isArray(listed)
      ? listed.flatMap((entry: unknown) =>
          isNode(entry) && typeof entry.id === 'string' && entry.id !== DEFAULT_VIEW_STATE ? [entry.id] : [],
        )
      : []),
  ]
  const all = new Set(universe)
  const dropped: string[] = []
  const drop = (node: unknown): void => {
    if (!isNode(node)) return
    if (node.type !== STATE_SWITCH && node.type !== STATE_CASE && typeof node.id === 'string') dropped.push(node.id)
    if (Array.isArray(node.children)) node.children.forEach(drop)
  }
  const ordered = (set: ReadonlySet<string>): string[] => universe.filter((state) => set.has(state))
  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x))

  /**
   * `children` 을 판 2 로 — `cond` 는 이 자리의 노드가 보이는 상태 집합, `parentSet` 은 새 트리에서 이 자리의 부모가 보이는 집합(`cond ⊆
   * parentSet`). `fromDefault` 는 `cond` 가 «온 집합에서 다른 가지들을 뺀» 기본 가지의 집합인가(그때만 `except` 로 적는다).
   */
  const liftList = (
    children: readonly unknown[],
    cond: ReadonlySet<string>,
    parentSet: ReadonlySet<string>,
    fromDefault: boolean,
  ): unknown[] => children.flatMap((child) => liftOne(child, cond, parentSet, fromDefault))

  const liftOne = (child: unknown, cond: ReadonlySet<string>, parentSet: ReadonlySet<string>, fromDefault: boolean): unknown[] => {
    if (!isNode(child)) return [child]
    if (child.type === STATE_CASE) {
      // 영역 밖에 선 가지 — 판 1 렌더러는 자식만 그렸다.
      return liftList(Array.isArray(child.children) ? child.children : [], cond, parentSet, fromDefault)
    }
    if (child.type === STATE_SWITCH) return liftSwitch(child, cond, parentSet)
    if (cond.size === 0) {
      drop(child)
      return []
    }
    const next: Raw = { ...child }
    if (!same(cond, parentSet)) {
      const visibility: NodeVisibility = fromDefault
        ? { mode: 'except', states: universe.filter((state) => !cond.has(state)) }
        : { mode: 'only', states: ordered(cond) }
      next.visibility = visibility
    }
    if (Array.isArray(child.children)) next.children = liftList(child.children, cond, cond, false)
    return [next]
  }

  const liftSwitch = (sw: Raw, cond: ReadonlySet<string>, parentSet: ReadonlySet<string>): unknown[] => {
    const children: unknown[] = Array.isArray(sw.children) ? sw.children : []
    let fallback: Raw | null = null
    const branches: { state: string; node: Raw }[] = []
    for (const child of children) {
      const state = isNode(child) ? caseState(child) : undefined
      if (!isNode(child) || typeof state !== 'string') {
        drop(child)
        continue
      }
      if (state === DEFAULT_VIEW_STATE) {
        if (fallback === null) fallback = child
        else drop(child)
        continue
      }
      if (!all.has(state) || branches.some((branch) => branch.state === state)) {
        drop(child)
        continue
      }
      branches.push({ state, node: child })
    }
    const out: unknown[] = []
    if (fallback !== null) {
      const own = new Set(branches.map((branch) => branch.state))
      const set = new Set([...cond].filter((state) => !own.has(state)))
      // `except` 는 집합이 «모든 상태 − 이 영역의 가지들»일 때만 — 바깥 조건이 끼면 합친 집합을 `only` 로 적는다.
      const whole = same(cond, all)
      out.push(...liftList(Array.isArray(fallback.children) ? fallback.children : [], set, parentSet, whole))
    }
    for (const branch of branches) {
      const set = new Set(cond.has(branch.state) ? [branch.state] : [])
      out.push(...liftList(Array.isArray(branch.node.children) ? branch.node.children : [], set, parentSet, false))
    }
    return out
  }

  const root = doc.root as unknown as Raw
  let regions = false
  const scan = (node: unknown): void => {
    if (!isNode(node)) return
    if (node.type === STATE_SWITCH || node.type === STATE_CASE) regions = true
    if (Array.isArray(node.children)) node.children.forEach(scan)
  }
  scan(root)
  if (!regions) return { doc: { ...doc }, dropped }
  const lifted: Raw = { ...root }
  if (Array.isArray(root.children)) lifted.children = liftList(root.children, all, all, false)

  const seen = new Set<string>()
  const check = (node: unknown): void => {
    if (!isNode(node)) return
    if (typeof node.id === 'string') {
      if (seen.has(node.id)) throw new MigrationError(node.id)
      seen.add(node.id)
    }
    if (Array.isArray(node.children)) node.children.forEach(check)
  }
  check(lifted)
  return { doc: { ...doc, root: lifted as unknown as WbNode }, dropped }
}
