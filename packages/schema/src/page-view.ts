/**
 * **페이지 하나를 "읽을 수 있는 값"으로 만든다.**
 *
 * 설계서 「MCP 도구」의 `get_page`가 내야 하는 것이 *"페이지 스키마 + 코멘트 + 상호작용 문장"*
 * 이고, 설계서 「CLI」의 `wireb page get`이 내야 하는 것도 같은 셋이다. **둘이 같은 것을 낸다** —
 * CLI나 MCP 안에서 각자 조립하면 두 벌이 되고, 갈리는 날 두 도구가 같은 페이지를 다르게 말한다.
 *
 * ## 무엇이 여기 있고 무엇이 없나
 *
 * - **여기 있는 것:** 무엇을 실을지. 노드 이름을 어떻게 부를지. 문장을 어느 순서로 낼지.
 * - **여기 없는 것:** 줄바꿈·들여쓰기·색·`--json`. **CLI는 글자만 만든다.**
 *
 * **사람이 읽는 판과 기계가 읽는 판이 같은 값에서 나온다.** `--json`이 이 값을 그대로 내고
 * 사람이 읽는 판도 이 값만 읽는다 — 둘이 다른 재료를 보면 갈린다.
 *
 * ## 문장을 다시 짜지 않는다
 *
 * `listInteractionSentences`가 이미 설계서 「자동 문장화」의 문장을 만든다(그 파일이 소비자를 *"우측 패널,
 * HTML 번들, PPTX"*로 적었고 여기가 넷째다). **카탈로그가 설치돼 있어야 문장이 온전하다** —
 * 설치 전에 부르면 `setProp`의 라벨이 `로딩 상태`가 아니라 `loading`으로 나온다(던지지는
 * 않는다 — `describe.ts`의 `propLabel`이 레지스트리에서 못 찾으면 prop 이름을 쓴다). 설치는 **부르는 쪽**이 한다(`installCatalog`).
 */
import type { NodeVisibility, PageDocument, ViewState, WbNode } from './node'
import { nodeAlias, nodeRowLabel } from './display'
import { MISSING_NODE_NAME, describeNode, listInteractionSentences, namingContexts, type InteractionSentence } from './interaction/describe'
import { pageTargetPath } from './page-target'
import { BODY_ZONE } from './component/define'
import { walkNodes } from './tree'

/**
 * 코멘트 하나. **어느 노드에 달렸는지를 이름으로도 말한다** — id만 내면 읽는 사람이 그것을
 * 문서에서 손으로 찾아야 한다.
 */
export interface PageViewComment {
  nodeId: string
  /**
   * 그 노드를 부르는 이름(`① 검색 버튼`). **문서에 없으면 `사라진 노드`다** —
   * 상호작용 문장이 같은 상태를 부르는 말과 같다(`interaction/describe.ts`).
   */
  nodeName: string
  body: string
  authorName: string
  createdAt: string
}

/**
 * 문서의 노드 하나를 **읽는 순서로** 편 것. 트리를 그리는 데 필요한 것만 담는다.
 *
 * **JSON 문서 전문을 사람에게 쏟지 않기 위한 자리다.** `--json`은 `document`를 그대로
 * 내지만 터미널에 그것을 쏟으면 아무도 안 읽는다 — 무엇을 보일지는 여기서 정하고
 * CLI는 `depth`만큼 들여쓴다.
 */
export interface PageViewNode {
  id: string
  type: string
  /** 뿌리가 0. 구역 안 노드도 노드 마디로 센다(구역은 깊이를 더하지 않는다). */
  depth: number
  /** 부모의 이름 붙은 구역에 선 노드면 그 구역 이름(`headEnd` · `actions` …). 몸통 · 뿌리는 키가 없다. */
  zone?: string
  /** 문장이 이 노드를 부르는 이름과 **같은 이름**이다(`describeNode`). */
  name: string
  /** 사람이 붙인 별칭. 없으면 키가 없다. */
  alias?: string
  /** 구조 트리 줄과 같은 글 `타입 (별칭) 요약`(`nodeRowLabel`). 같은 타입이 여럿일 때 어느 것인지 가른다. */
  rowLabel: string
  /** 문서 안의 자리(JSON 포인터). 편집 경로와 같다. */
  path: string
  /**
   * 이 노드 자신의 상태 보임(`WbNode.visibility` 그대로 — 상태 id 는 `viewStates` 의 id, 기본은 `default`). 없으면 키가 없다 — 그 노드는
   * 부모가 보이는 모든 상태에 있다(부모가 숨으면 자손도 숨는다).
   */
  visibility?: NodeVisibility
}

/** `pageView`가 받는 코멘트. 이름은 이 함수가 붙인다. */
export interface PageViewCommentInput {
  nodeId: string
  body: string
  authorName: string
  createdAt: string
}

export interface PageViewInput {
  id: string
  title: string
  description: string | null
  /** 설계서 「모델」(상호작용)의 타겟(`page:관리자/회원/목록`). `targetedPages`가 만든 것을 받는다. */
  target: string
  /** 조상 메뉴의 이름들. 뿌리가 앞이다. */
  menuPath: readonly string[]
  document: PageDocument
  comments: readonly PageViewCommentInput[]
}

export interface PageView {
  id: string
  title: string
  description: string | null
  target: string
  /** 접두를 벗긴 「모델」(상호작용)의 경로. **사람이 치는 것이 이 모양이다**(`wireb page get 관리자/회원/목록`). */
  path: string
  menuPath: readonly string[]
  /** 화면 상태 목록(`document.viewStates` — `parent` 로 트리다). 없으면 빈 목록 — «기본»은 늘 있어 목록에 없다. */
  viewStates: ViewState[]
  /** 문서의 노드 수. **뿌리를 센다** — 빈 페이지도 1이다. */
  nodeCount: number
  /** 노드를 읽는 순서로 편 것. `nodeCount`와 길이가 같다. */
  nodes: PageViewNode[]
  document: PageDocument
  comments: PageViewComment[]
  /** 「자동 문장화」의 문장들. 노드 순서다. */
  interactions: InteractionSentence[]
}

/**
 * 페이지 하나를 값으로 만든다.
 *
 * **코멘트 순서를 바꾸지 않는다.** 서버가 낸 순서(`created_at`)가 대화의 순서이고, 여기서
 * 다시 정렬하면 화면·번들·CLI가 같은 페이지를 다른 순서로 읽는다.
 */
export function pageView(input: PageViewInput): PageView {
  // 이름은 그 노드가 보이는 상태를 붙인다(`namingContexts`) — 문장(`listInteractionSentences`)과 같은 이름이다.
  const naming = namingContexts(input.document)
  const viewStates = Array.isArray(input.document.viewStates) ? input.document.viewStates : []
  const nodes = new Map<string, WbNode>()
  const outline: PageViewNode[] = []
  const depths = new Map<WbNode, number>()
  for (const { node, path, parent, zone } of walkNodes(input.document.root)) {
    nodes.set(node.id, node)
    const depth = parent === null ? 0 : (depths.get(parent) ?? 0) + 1
    depths.set(node, depth)
    outline.push({
      id: node.id,
      type: node.type,
      depth,
      ...(zone !== null && zone !== BODY_ZONE ? { zone } : {}),
      name: describeNode(node, naming.get(node.id)),
      ...aliasEntry(node),
      rowLabel: nodeRowLabel(node),
      path,
      ...(node.visibility === undefined ? {} : { visibility: node.visibility }),
    })
  }

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    target: input.target,
    path: pageTargetPath(input.target),
    menuPath: input.menuPath,
    viewStates,
    nodeCount: outline.length,
    nodes: outline,
    document: input.document,
    comments: input.comments.map((comment) => {
      const node = nodes.get(comment.nodeId)
      return {
        nodeId: comment.nodeId,
        nodeName: node === undefined ? MISSING_NODE_NAME : describeNode(node, naming.get(comment.nodeId)),
        body: comment.body,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
      }
    }),
    interactions: listInteractionSentences(input.document),
  }
}

function aliasEntry(node: WbNode): { alias?: string } {
  const alias = nodeAlias(node)
  return alias === null ? {} : { alias }
}
