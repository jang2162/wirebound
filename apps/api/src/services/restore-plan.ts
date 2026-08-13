/**
 * 복원 계획 — payload와 현재 상태를 견주어 **조작 목록**을 만든다(설계 §4.5의 되돌리는 쪽,
 * 계획서 T1).
 *
 * **이 파일은 DB를 모른다.** SQL도 트랜잭션도 HTTP도 없다 — 값을 받아 값을 낸다. 실제 쓰기는
 * `services/restore.ts`가 이 목록을 순서대로 실행하며 한다. 나눈 이유는 하나다: **판정을
 * DB 없이 잴 수 있게** 하는 것. FK 순서·삭제 순서·생성 순서가 전부 여기 있으므로
 * `test/restore-plan.test.ts`가 Postgres를 켜지 않고 그 순서를 통째로 본다.
 *
 * ---
 *
 * # `steps`가 **평평한 하나의 열**인 것이 요점이다
 *
 * 자원별로 묶어 내면(`{menu: {...}, pages: {...}}`) **그룹 사이의 순서가 이 파일 밖으로
 * 샌다** — 실행하는 쪽이 순서를 다시 정하게 되고, 그러면 이 파일의 케이스는 순서를 고정하지
 * 못한다. 평평한 열이면 `steps.map(s => s.kind)` 한 줄이 곧 규격이다.
 *
 * ## 순서 자체가 규격이다 — 각 줄이 어떤 제약 때문에 그 자리인가
 *
 * | # | 단계 | 왜 그 자리인가 |
 * |---|---|---|
 * | 1 | `delete-comment` | `comments.page_id`가 CASCADE라 페이지를 먼저 지우면 **말없이 함께 사라진다**. 순서를 CASCADE에 맡기지 않는다 |
 * | 2 | `delete-page` | `pages.menu_node_id`가 **RESTRICT**다 — 메뉴보다 먼저 지워야 한다 |
 * | 3 | `create-menu` | 아래 5(페이지 이동)가 **새로 만든 메뉴로** 옮길 수 있다. 부모가 자식보다 먼저다 |
 * | 4 | `update-menu` | 지울 메뉴 밑에 있던 **살아남는 자식**을 먼저 옮겨야 6이 RESTRICT에 안 걸린다 |
 * | 5 | `update-page-meta` | 같은 이유로 살아남는 **페이지**를 먼저 옮긴다 |
 * | 6 | `delete-menu` | 4·5가 끝나야 빈 메뉴가 된다. 자식이 부모보다 먼저다 |
 * | 7 | `create-page` | 메뉴가 다 선 뒤다 |
 * | 8 | `write-page-schema` | 페이지 행이 있어야 `applyEdit`이 잠글 수 있다 |
 * | 9 | `create-comment` | `comments.page_id` FK — 페이지가 먼저다 |
 * | 10 | `update-comment` | — |
 * | 11 | `set-layout-theme` | 다른 것과 얽히지 않는다. 마지막이다 |
 *
 * **4·5가 6보다 앞인 것이 이 표에서 가장 안 보이는 자리다.** *"지우는 것을 먼저"*라는
 * 직관대로 짜면 *"payload에 남아 있는 자식이 지울 부모 밑에 있는"* 프로젝트에서
 * `menu_nodes_parent_id_fkey`로 죽는다.
 *
 * ---
 *
 * # 만들어진 페이지는 `applyEdit`을 타지 않는다 — 판정이다
 *
 * `create-page`는 payload의 문서를 **그대로 담아** 행을 만들고 `head_seq`는 0이다
 * (재라 #4를 재서 확인했다: `insertPage`가 오늘 그렇게 한다). revision을 남기지 않는 것이
 * D1(*"모든 스키마 변경이 revision을 남긴다"*)과 어긋나지 않는 이유:
 *
 * - **`POST .../pages`가 이미 그렇게 한다.** 페이지 생성은 *"스키마 변경"*이 아니라 문서를
 *   들고 태어나는 일이고, 그 경로도 revision을 만들지 않는다.
 * - **되살릴 이력이 애초에 없다.** 그 페이지가 지워질 때 `revisions.page_id`의 CASCADE가
 *   이력을 함께 데려갔다(재라 #3을 재서 확인했다: 삭제 전 1 → 삭제 후 0). `head_seq`만
 *   payload의 값(예: 7)으로 심으면 **행이 없는 seq를 가리키는 페이지**가 되어 그 페이지의
 *   undo가 빈 이력 위에서 돈다.
 *
 * 그래서 **만들어진 페이지의 문서는 아무도 검증하지 않는 유일한 쓰기**가 된다(갱신 쪽은
 * `applyEdit` 6단계가 본다). 그 구멍을 여기서 `validatePage`로 막는다 — 카탈로그가 바뀌어
 * 옛 문서가 더 이상 유효하지 않을 수 있고, 그때 조용히 저장하면 그 페이지는 다음 편집에서
 * 422가 된다.
 *
 * ---
 *
 * # 막는 갈래 넷 — 전부 **쓰기 전에** 판정한다 (D1)
 *
 * D1이 *"부분 성공을 만들지 않는다"*이므로 거절은 첫 쓰기보다 앞서야 한다. 넷 다 값만 보고
 * 판정할 수 있어 여기 있다(작성자 존재 확인만은 DB 질문이라 `restore.ts`가 한다).
 *
 * | 갈래 | 뜻 |
 * |---|---|
 * | `layout-mismatch` | 레이아웃 id 집합이 다르다 (D7) |
 * | `unsupported-version` | 살아남는 페이지의 문서 버전이 이 프로세스보다 크다 (D5) |
 * | `invalid-document` | 만들 페이지의 문서가 카탈로그 검증에 걸린다 |
 * | `dangling-reference` | payload 안에서 참조가 끊겨 있다 — 그대로 쓰면 FK 위반으로 500이 된다 |
 */
import {
  CURRENT_DOCUMENT_VERSION,
  partitionIssues,
  validatePage,
  type PageDocument,
  type ValidationIssue,
} from '@wirebound/schema'
import { canonicalJson } from '../canonical-json'
import type { SnapshotComment, SnapshotMenuNode, SnapshotPage, SnapshotPayload } from './snapshot-payload'

/**
 * 계획이 견줄 **현재 상태**. `repos/`의 레코드 타입을 그대로 받지 않고 **필요한 필드만**
 * 선언한다 — 구조적으로 호환되므로 호출자는 레코드를 그대로 넘길 수 있고, 이 파일은
 * 저장소가 필드를 늘려도 흔들리지 않는다.
 */
export interface RestoreCurrentState {
  menu: Array<{ id: string; parentId: string | null; title: string; sortOrder: number }>
  pages: Array<{
    id: string
    menuNodeId: string
    title: string
    description: string | null
    sortOrder: number
    schemaVersion: number
    schema: PageDocument
  }>
  layouts: Array<{ id: string; themeId: string | null }>
  comments: Array<{ id: string; pageId: string; body: string }>
}

export type RestoreStep =
  // `pageId`를 함께 든다 — `deleteComment`가 `(pageId, commentId)`로 지운다(남의 페이지의
  // 코멘트 id를 실은 요청이 통하지 않게 하는 그 repo의 계약).
  | { kind: 'delete-comment'; id: string; pageId: string }
  | { kind: 'delete-page'; id: string }
  | { kind: 'create-menu'; node: SnapshotMenuNode }
  | { kind: 'update-menu'; node: SnapshotMenuNode }
  | { kind: 'update-page-meta'; page: SnapshotPage }
  | { kind: 'delete-menu'; id: string }
  | { kind: 'create-page'; page: SnapshotPage }
  | { kind: 'write-page-schema'; page: SnapshotPage }
  | { kind: 'create-comment'; comment: SnapshotComment }
  | { kind: 'update-comment'; comment: SnapshotComment }
  | { kind: 'set-layout-theme'; layoutId: string; themeId: string | null }

/**
 * 무엇이 얼마나 바뀌는가. **응답이 이것을 그대로 싣는다**(D4 — *"바뀐 수와 그대로인 수를
 * 따로 센다"*, D11 — 화면이 말할 것 넷 중 둘).
 */
export interface RestoreSummary {
  menu: { created: number; updated: number; deleted: number }
  pages: { created: number; metaUpdated: number; schemaChanged: number; schemaUnchanged: number; deleted: number }
  comments: { created: number; updated: number; deleted: number }
  layouts: { themeRefChanged: number }
}

export interface RestorePlan {
  steps: RestoreStep[]
  summary: RestoreSummary
}

/** 미지원 버전에 걸린 페이지 하나. **`source`가 어느 쪽 문서인지 가른다**(D5의 두 방향). */
export interface UnsupportedVersionPage {
  id: string
  title: string
  version: number
  source: 'stored' | 'snapshot'
}

export type RestorePlanOutcome =
  | { kind: 'plan'; plan: RestorePlan }
  | { kind: 'layout-mismatch'; snapshot: string[]; current: string[] }
  | { kind: 'unsupported-version'; pages: UnsupportedVersionPage[] }
  | { kind: 'invalid-document'; pageId: string; title: string; issues: ValidationIssue[] }
  | { kind: 'dangling-reference'; references: string[] }

/**
 * 문서 두 개가 **내용으로** 같은가. `headSeq`가 아니라 이것으로 비교하는 이유는 D4에 있다 —
 * 편집했다가 되돌리면 `headSeq`는 달라져 있는데 문서는 같다.
 *
 * **`JSON.stringify`가 아니라 `canonicalJson`이다 — 처음엔 전자로 짰고 틀렸다.** 같은 상태를
 * 재는데 매번 *"다르다"*가 나왔다: payload 쪽은 `jsonb`가 정렬한 키 순서(`root`→`version`)를
 * 들고 있고, 지금 쪽은 `SnapshotPayloadSchema.parse`가 만든 zod 선언 순서(`version`→`root`)를
 * 들고 있다. 실측과 두 경계의 표는 `src/canonical-json.ts`에 있다.
 *
 * **문서는 이 비교로 잃는 것이 없다** — 문서에서 순서를 나르는 것은 `children` 배열이고
 * 배열 순서는 정규화가 건드리지 않는다.
 */
function sameDocument(a: PageDocument, b: PageDocument): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

/**
 * 부모가 자식보다 먼저 오도록 늘어놓는다. 부모가 이 집합 밖(이미 있는 노드)이면 곧바로
 * 나올 수 있다. **payload의 배열 순서에 기대지 않는다** — `listMenuNodes`가 `parent_id
 * nulls first`로 정렬하므로 대개는 이미 맞지만, 그것은 다른 파일의 성질이다.
 */
function parentsFirst(nodes: SnapshotMenuNode[]): SnapshotMenuNode[] {
  const pending = new Map(nodes.map((node) => [node.id, node]))
  const ordered: SnapshotMenuNode[] = []
  const emitted = new Set<string>()

  let progressed = true
  while (pending.size > 0 && progressed) {
    progressed = false
    for (const [id, node] of [...pending]) {
      if (node.parentId === null || !pending.has(node.parentId) || emitted.has(node.parentId)) {
        ordered.push(node)
        emitted.add(id)
        pending.delete(id)
        progressed = true
      }
    }
  }
  // 남은 것은 순환뿐이다(payload가 만들어질 수 없는 모양). 순서를 보장하지 못하므로 그대로
  // 뒤에 붙인다 — 여기서 던지면 이 파일이 값만 보는 함수라는 성질이 깨지고, 실제 쓰기는
  // 어차피 FK에서 죽는다.
  return [...ordered, ...pending.values()]
}

/** 자식이 부모보다 먼저 오도록 늘어놓는다(= `parentsFirst`의 역순). 삭제가 쓴다. */
function childrenFirst(nodes: Array<{ id: string; parentId: string | null }>): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depth = (id: string, seen: Set<string>): number => {
    const node = byId.get(id)
    if (!node || node.parentId === null || !byId.has(node.parentId) || seen.has(id)) return 0
    seen.add(id)
    return 1 + depth(node.parentId, seen)
  }
  return [...byId.keys()].sort((a, b) => depth(b, new Set()) - depth(a, new Set()))
}

export function planRestore(payload: SnapshotPayload, current: RestoreCurrentState): RestorePlanOutcome {
  const snapshotMenuIds = new Set(payload.menu.map((node) => node.id))
  const snapshotPageIds = new Set(payload.pages.map((page) => page.id))

  // ── payload 안의 참조가 끊겨 있으면 쓰기 전에 막는다. 그대로 쓰면 FK 위반이고,
  //    그 예외는 `pg`의 raw 에러라 500이 된다.
  const dangling: string[] = []
  for (const node of payload.menu) {
    if (node.parentId !== null && !snapshotMenuIds.has(node.parentId)) {
      dangling.push(`메뉴 ${node.id}의 상위 메뉴 ${node.parentId}`)
    }
  }
  for (const page of payload.pages) {
    if (!snapshotMenuIds.has(page.menuNodeId)) dangling.push(`페이지 ${page.id}의 메뉴 ${page.menuNodeId}`)
  }
  for (const comment of payload.comments) {
    if (!snapshotPageIds.has(comment.pageId)) dangling.push(`코멘트 ${comment.id}의 페이지 ${comment.pageId}`)
  }
  if (dangling.length > 0) return { kind: 'dangling-reference', references: dangling }

  // ── 레이아웃 id 집합이 다르면 복원하지 않는다(D7). 개수를 조용히 맞추려 들지 않는다.
  const snapshotLayoutIds = [...payload.layouts.map((layout) => layout.id)].sort()
  const currentLayoutIds = [...current.layouts.map((layout) => layout.id)].sort()
  if (snapshotLayoutIds.join(',') !== currentLayoutIds.join(',')) {
    return { kind: 'layout-mismatch', snapshot: snapshotLayoutIds, current: currentLayoutIds }
  }

  // ── 페이지의 문서를 **쓸 것인가**부터 정한다. 아래 버전 검사(D5)와 7·8단계가 이 판정
  //    하나를 공유한다 — 두 번 판정하면 *"막는 기준"*과 *"쓰는 기준"*이 갈린다.
  const currentPageById = new Map(current.pages.map((page) => [page.id, page]))
  type PageWrite = 'create' | 'rewrite' | 'skip'
  const writeByPage = new Map<string, PageWrite>()
  for (const page of payload.pages) {
    const stored = currentPageById.get(page.id)
    if (!stored) {
      writeByPage.set(page.id, 'create')
    } else {
      // **내용으로 비교한다 — `headSeq`가 아니다**(D4).
      writeByPage.set(page.id, sameDocument(stored.schema, page.schema) ? 'skip' : 'rewrite')
    }
  }

  // ── 문서 버전(D5). **문서를 실제로 쓰는 페이지만 본다.**
  //
  // 좁힘이 두 칸이다. 첫째, **지워질 페이지는 안 본다** — 지우는 데 마이그레이션이 필요 없다.
  // 둘째(리뷰가 잡았다), **양쪽 문서가 같아 쓸 것이 없는 페이지도 안 본다.**
  //
  // 둘째를 빠뜨렸을 때 무엇이 나빴나: 미지원 버전 페이지가 하나 생긴 프로젝트는 그 페이지가
  // 스냅샷과 **똑같아서 아무도 그것을 건드리지 않는데도** 모든 복원이 400으로 막혔다. 즉
  // **그 프로젝트는 어떤 스냅샷으로도 되돌아갈 수 없게** 된다 — §13.1이 걱정하는 것은
  // *"그 페이지를 복구하려는 순간"*이지 *"그 페이지와 무관한 복원"*이 아니다.
  //
  // 그리고 D4가 이미 *"내용이 같으면 아무것도 쓰지 않는다"*이므로, **쓰지 않는 페이지를
  // 버전 때문에 막는 것은 그 결정과 일관되지 않는다.**
  //
  // **여기서 막는 것이 무엇을 대신하는지는 그대로다** — 이 검사가 없어도 파이프라인이
  // 두 방향 모두 거부한다(`unsupported-version` / 7단계 `invalid`). 이 검사는 그 거절을
  // **쓰기 전으로 당기고 어느 페이지가 어떤 버전인지 말하게** 할 뿐이다.
  const unsupported: UnsupportedVersionPage[] = []
  for (const page of payload.pages) {
    if (writeByPage.get(page.id) === 'skip') continue
    if (page.schema.version > CURRENT_DOCUMENT_VERSION) {
      unsupported.push({ id: page.id, title: page.title, version: page.schema.version, source: 'snapshot' })
    }
    const stored = currentPageById.get(page.id)
    if (stored && stored.schema.version > CURRENT_DOCUMENT_VERSION) {
      unsupported.push({ id: page.id, title: stored.title, version: stored.schema.version, source: 'stored' })
    }
  }
  if (unsupported.length > 0) return { kind: 'unsupported-version', pages: unsupported }

  const steps: RestoreStep[] = []
  const summary: RestoreSummary = {
    menu: { created: 0, updated: 0, deleted: 0 },
    pages: { created: 0, metaUpdated: 0, schemaChanged: 0, schemaUnchanged: 0, deleted: 0 },
    comments: { created: 0, updated: 0, deleted: 0 },
    layouts: { themeRefChanged: 0 },
  }

  // 1. 코멘트 삭제 — 페이지보다 먼저(CASCADE에 순서를 맡기지 않는다).
  const snapshotCommentIds = new Set(payload.comments.map((comment) => comment.id))
  for (const comment of current.comments) {
    if (!snapshotCommentIds.has(comment.id)) {
      steps.push({ kind: 'delete-comment', id: comment.id, pageId: comment.pageId })
      summary.comments.deleted += 1
    }
  }

  // 2. 페이지 삭제 — 메뉴보다 먼저(`pages.menu_node_id`가 RESTRICT).
  for (const page of current.pages) {
    if (!snapshotPageIds.has(page.id)) {
      steps.push({ kind: 'delete-page', id: page.id })
      summary.pages.deleted += 1
    }
  }

  // 3. 메뉴 생성 — 부모가 자식보다 먼저.
  const currentMenuById = new Map(current.menu.map((node) => [node.id, node]))
  for (const node of parentsFirst(payload.menu.filter((node) => !currentMenuById.has(node.id)))) {
    steps.push({ kind: 'create-menu', node })
    summary.menu.created += 1
  }

  // 4. 메뉴 갱신 — 지울 부모 밑의 살아남는 자식을 여기서 옮긴다(6보다 먼저여야 하는 이유).
  for (const node of payload.menu) {
    const stored = currentMenuById.get(node.id)
    if (!stored) continue
    if (stored.parentId !== node.parentId || stored.title !== node.title || stored.sortOrder !== node.sortOrder) {
      steps.push({ kind: 'update-menu', node })
      summary.menu.updated += 1
    }
  }

  // 5. 페이지 메타 갱신 — 같은 이유로 6보다 먼저다.
  for (const page of payload.pages) {
    const stored = currentPageById.get(page.id)
    if (!stored) continue
    if (
      stored.menuNodeId !== page.menuNodeId ||
      stored.title !== page.title ||
      stored.description !== page.description ||
      stored.sortOrder !== page.sortOrder
    ) {
      steps.push({ kind: 'update-page-meta', page })
      summary.pages.metaUpdated += 1
    }
  }

  // 6. 메뉴 삭제 — 자식이 부모보다 먼저(`menu_nodes.parent_id`가 RESTRICT).
  const doomedMenu = current.menu.filter((node) => !snapshotMenuIds.has(node.id))
  for (const id of childrenFirst(doomedMenu)) {
    steps.push({ kind: 'delete-menu', id })
    summary.menu.deleted += 1
  }

  // 7·8. 페이지 생성과 스키마 쓰기. **판정은 위 `writeByPage`가 이미 했다.**
  for (const page of payload.pages) {
    switch (writeByPage.get(page.id)) {
      case 'create': {
        // 만들어지는 문서는 아무도 검증하지 않는 유일한 쓰기다(머리말) — 여기서 본다.
        const { errors } = partitionIssues(validatePage(page.schema))
        if (errors.length > 0) {
          return { kind: 'invalid-document', pageId: page.id, title: page.title, issues: errors }
        }
        steps.push({ kind: 'create-page', page })
        summary.pages.created += 1
        break
      }
      case 'rewrite':
        steps.push({ kind: 'write-page-schema', page })
        summary.pages.schemaChanged += 1
        break
      default:
        summary.pages.schemaUnchanged += 1
        break
    }
  }

  // 9·10. 코멘트 생성·갱신 — 페이지가 다 선 뒤다.
  const currentCommentById = new Map(current.comments.map((comment) => [comment.id, comment]))
  for (const comment of payload.comments) {
    const stored = currentCommentById.get(comment.id)
    if (!stored) {
      steps.push({ kind: 'create-comment', comment })
      summary.comments.created += 1
    } else if (stored.body !== comment.body) {
      steps.push({ kind: 'update-comment', comment })
      summary.comments.updated += 1
    }
  }

  // 11. 레이아웃의 테마 **참조만** 되돌린다(D6 — 테마 문서는 건드리지 않는다).
  const currentLayoutById = new Map(current.layouts.map((layout) => [layout.id, layout]))
  for (const layout of payload.layouts) {
    const stored = currentLayoutById.get(layout.id)
    // 위 `layout-mismatch` 검사를 통과했으므로 `stored`는 반드시 있다.
    if (stored && stored.themeId !== layout.themeId) {
      steps.push({ kind: 'set-layout-theme', layoutId: layout.id, themeId: layout.themeId })
      summary.layouts.themeRefChanged += 1
    }
  }

  return { kind: 'plan', plan: { steps, summary } }
}
