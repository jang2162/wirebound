/**
 * **스냅샷 payload를 `lintProject`의 입력으로 옮기는 자리 하나.**
 *
 * payload와 lint 입력은 이름도 nullable도 다르다. 그 차이를 `wireb lint`가 손으로 맞추면
 * **MCP `validate`가 같은 것을 다시 맞춘다.**
 * 그래서 함수 하나로 둔다 — 입력은 payload, 출력은 `ProjectLintInput`.
 *
 * ---
 *
 * # 이 함수가 드는 판정
 *
 * **문서를 `migrateDocument`에 지나게 한다.** payload는 저장된 문서를 **마이그레이션 없이**
 * 담는다(`payload.ts`의 「저장된 문서를 그대로 담는다」 절). 안 지나게 하면 오래된 문서에서 `document-invalid`가 쏟아진다.
 *
 * **못 올리는 문서(이 wireb보다 높은 버전)를 만나도 페이지를 버리지 않는다.** 버리면 그
 * 페이지의 `target`이 목록에서 사라지고, 그것을 겨눈 **다른 페이지의 멀쩡한 링크가
 * 끊긴 것으로** 보고된다 — *"없는 결함을 말한다"*가 정확히 그것이다. 저장된 문서를 그대로
 * 넣고 `notes`가 그렇다고 말한다.
 */
import {
  migrateDocument,
  pageTarget,
  targetedPages,
  type LintComment,
  type LintConfig,
  type LintMenuNode,
  type LintPage,
  type PageDocument,
} from '@wirebound/schema'
import type { ProjectLintInput } from '../lint/index'
import type { SnapshotPayload } from './payload'

/**
 * 옮기는 도중에 **검사에서 빠진 것**과 그 이유.
 *
 * *"조용히 0건이 되지 않는다"*를 값으로 만드는 자리다. 소비자(`wireb lint`·MCP `validate`)는
 * 이슈 목록과 **함께** 이것을 내야 한다.
 */
export interface SnapshotLintNote {
  kind: SnapshotLintNoteKind
  /** 그 페이지. 페이지 축이 아니면 `null`. */
  pageId: string | null
  message: string
}

export type SnapshotLintNoteKind =
  /** 이 wireb가 올릴 수 없는 문서 버전. 저장된 그대로 검사했다. */
  | 'document-version'
  /** 소속 메뉴가 payload에 없어 조상 없는 타겟을 붙였다. */
  | 'menu-detached'
  /**
   * 프로젝트가 고정한 테마의 manifest 를 못 받아 테마 규칙(`theme-variant`)을 안 돌렸다. 이 함수가 아니라 manifest 를 받는 자리가 낸다
   * (`packages/cli`의 `read/lint.ts`) — payload 에는 manifest 가 없다.
   */
  | 'theme-unavailable'

/** `snapshotToLintInput`이 내는 것. **입력과 빠진 것을 함께 낸다.** */
export interface SnapshotLintPlan {
  input: ProjectLintInput
  notes: SnapshotLintNote[]
}

/**
 * payload 하나를 `lintProject`가 받는 모양으로 옮긴다.
 *
 * **`installCatalog()`는 이 함수가 부르지 않는다.** 카탈로그 설치는 프로세스 전역의 상태이고
 * (`validatePage`와 같은 자리) 순수 변환 함수가 전역을 만지면 부르는
 * 쪽이 그것을 모른 채 지나간다. **부르는 것은 소비자다** — 안 부르면 모든 노드가
 * *"알 수 없는 컴포넌트 타입"*이 되어 결과가 통째로 거짓이 된다(실측).
 */
export function snapshotToLintInput(payload: SnapshotPayload, config?: LintConfig): SnapshotLintPlan {
  const notes: SnapshotLintNote[] = []

  const targets = new Map(
    targetedPages({ menu: payload.menu, pages: payload.pages }).map((page) => [page.id, page.target]),
  )

  const menu: LintMenuNode[] = payload.menu.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    title: node.title,
  }))

  const pages: LintPage[] = payload.pages.map((page) => {
    let target = targets.get(page.id)
    if (target === undefined) {
      // `targetedPages`가 버린 페이지다 — 소속 메뉴가 payload에 없다. **버리지 않는다**(머리말).
      target = pageTarget([], page.title)
      notes.push({
        kind: 'menu-detached',
        pageId: page.id,
        message: `"${page.title}" 페이지의 메뉴(${page.menuNodeId})가 스냅샷에 없습니다 — 조상 없는 타겟(${target})으로 검사했습니다`,
      })
    }
    return {
      id: page.id,
      menuNodeId: page.menuNodeId,
      title: page.title,
      target,
      document: currentDocument(page.schema, page.id, page.title, notes),
    }
  })

  const comments: LintComment[] = payload.comments.map((comment) => ({
    pageId: comment.pageId,
    nodeId: comment.nodeId,
  }))

  return { input: { project: { menu, pages, comments }, config }, notes }
}

/**
 * 저장된 문서를 지금 버전으로 올린다. **못 올리면 그대로 쓰고 말한다**(머리말).
 *
 * `migrateDocument`는 문서의 `version`을 보고 판정한다 — payload의 `schemaVersion`은 DB
 * 컬럼의 사본이라 여기서 다시 읽지 않는다. 둘이 갈리면 검사가 보는 것은 문서 쪽이다.
 */
function currentDocument(
  document: PageDocument,
  pageId: string,
  title: string,
  notes: SnapshotLintNote[],
): PageDocument {
  try {
    return migrateDocument(document)
  } catch (error) {
    notes.push({
      kind: 'document-version',
      pageId,
      message: `"${title}" 페이지의 문서를 이 버전이 올릴 수 없습니다: ${error instanceof Error ? error.message : String(error)} — 저장된 그대로 검사했습니다`,
    })
    return document
  }
}
