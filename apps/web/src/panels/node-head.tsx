/**
 * **«컴포넌트» 탭의 머리 카드**(정본 설계서 「설계서 화면 구조」의 속성 패널) — 고른 노드가 무엇이고 어디 있는지를 칸들 위 한 자리에 모은다.
 *
 * | 줄 | 무엇 |
 * |---|---|
 * | 제목 | 타입 배지 + 별칭(`h2` — 글은 `nodeHeading` 그대로라 노드를 부르는 이름이 다른 자리와 같다) · 곁에 줄 요약(구조 트리 줄의 꼬리 — `nodeSummary`) |
 * | 위치 | 뿌리부터 부모까지의 사슬 — 누르면 그 조상을 고른다(`store.selectNode` — 남이 쥔 조상은 끈다. 고르기 판정은 스토어가 한다) |
 * | 별칭 | 맨 아래에 있던 칸을 여기로(`children` — 칸과 커밋 길은 속성 패널이 그대로 든다) |
 * | 꺼진 이유 | 역할 · 남의 잠금 한 줄(`blockedNotice`) |
 *
 * **«…» 줄 행동은 두지 않는다** — 구조 트리 줄의 메뉴는 그 트리가 든 상자(별칭 입력 줄 · 모듈 저장 · 종류 바꾸기)와 함께 서서 여기 같은 부품을
 * 세울 수 없다(`docs/superpowers/plans/2026-11-25-rp-report.md` 설계 결정 4).
 */
import type { ReactElement, ReactNode } from 'react'
import { nodeAlias, nodeRowLabel, nodeSummary, type CodeIndex, type WbNode } from '@wirebound/schema'
import { walkSafely } from '../edit/safe-walk'

/** 위치 사슬의 접근 이름 — 단추의 글(조상의 줄 이름)과 갈라, 같은 이름의 구조 트리 줄과 한 이름이 되지 않게 한다. */
export function pathButtonName(label: string): string {
  return `«${label}» 고르기`
}

/** 뿌리부터 그 노드의 부모까지 — 노드가 문서에 없으면 빈 목록. */
export function ancestorsOf(root: WbNode, nodeId: string): WbNode[] {
  const chain: WbNode[] = []
  for (const visit of walkSafely(root)) {
    while (chain.length > 0 && chain.at(-1) !== visit.parent) chain.pop()
    if (visit.node.id === nodeId) return [...chain]
    chain.push(visit.node)
  }
  return []
}

export function NodeHead(props: {
  node: WbNode
  type: string
  ancestors: readonly WbNode[]
  codes: CodeIndex | undefined
  /** 조상 하나를 고를 수 없는가(남이 쥠) — 그 단추를 끈다. */
  pickBlocked: (nodeId: string) => boolean
  onPick: (nodeId: string) => void
  notice: string | null
  /** 별칭 칸. */
  children?: ReactNode
}): ReactElement {
  const alias = nodeAlias(props.node)
  const summary = nodeSummary(props.node, props.codes)
  return (
    <div className="wb-shell-node-head">
      <div className="wb-shell-node-head-line">
        {/* 제목 글은 `nodeHeading`(«타입 (별칭)») 그대로다 — 타입을 배지로, 별칭을 곁에 둔다. 별칭은 사람 글이라 방향을 격리한다. */}
        <h2 className="wb-shell-panel-title wb-shell-node-head-title">
          <span className="wb-shell-node-head-type">{props.type}</span>
          {alias !== null && (
            <span className="wb-shell-node-head-alias">
              {' ('}
              <bdi>{alias}</bdi>
              {')'}
            </span>
          )}
        </h2>
        {summary !== null && (
          <span className="wb-shell-node-head-summary">
            <bdi>{summary}</bdi>
          </span>
        )}
      </div>
      {props.ancestors.length > 0 && (
        <nav className="wb-shell-node-head-path" aria-label="고른 노드의 위치">
          {props.ancestors.map((ancestor, at) => {
            const label = nodeRowLabel(ancestor, props.codes)
            return (
              <span className="wb-shell-node-head-step" key={ancestor.id}>
                {at > 0 && (
                  <span className="wb-shell-node-head-sep" aria-hidden="true">
                    ›
                  </span>
                )}
                <button
                  type="button"
                  className="wb-shell-node-head-crumb"
                  aria-label={pathButtonName(label)}
                  title={label}
                  disabled={props.pickBlocked(ancestor.id)}
                  onClick={() => props.onPick(ancestor.id)}
                >
                  <bdi>{label}</bdi>
                </button>
              </span>
            )
          })}
        </nav>
      )}
      {props.children}
      {props.notice !== null && <p className="wb-shell-panel-notice wb-shell-node-head-notice">{props.notice}</p>}
    </div>
  )
}
