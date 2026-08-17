/**
 * **내보내기 둘이 공유하는 수집**(P10-1 D4 · P8-4 D1).
 *
 * §11.3의 HTML 번들과 §15의 PPTX가 **같은 프로젝트를 같은 순서로 같은 이름으로** 실어야
 * 한다. 수집을 두 벌 두면 *"어느 산출물이 무엇을 실었나"*가 갈리고, 그 갈림은 두 파일을
 * 나란히 열어 본 사람에게만 보인다.
 *
 * **`@wirebound/exporter`가 순수 함수 둘로 나뉘어 있는 것과 짝이다** — 거기서 `commentEntries`·
 * `pageSentences`를 한 자리에 두었고, 여기서는 **그 함수들이 받을 입력**을 한 자리에 둔다.
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다 (P8-4 D1을 그대로 이어받는다)
 *
 * 1. `listMenuRows` · `listPages` — 메뉴와 페이지(문서 포함).
 * 2. `targetedPages` — **한 번의 순회가 순서이자 페이지마다의 조상**이다. 둘을 따로
 *    계산하면 *"남의 조상을 단 타겟"*이 생기는데, 그 문자열은 그럴듯해서 아무도 못 걸러 낸다.
 * 3. `listProjectComments` — 코멘트를 **한 문장으로** 받아 페이지별로 가른다. 페이지마다
 *    왕복하면 그 사이에 다른 페이지의 코멘트가 바뀌어 **한 시점에 존재한 적 없는 조합**이
 *    산출물에 담긴다.
 *
 * **테마는 여기서 안 읽는다.** PPTX는 §6의 테마를 쓰지 않는다(§2.1이 도형 변환을 포기했고
 * 슬라이드에 실릴 화면이 래스터이므로 그 이미지가 이미 테마를 담는다). 쓰지 않는 쪽이
 * 질의를 하나 더 도는 것은 비용이지 계약이 아니다 — 읽는 쪽이 읽는다.
 */
import type { BundleComment } from '@wirebound/exporter'
import { migrateDocument, targetedPages, type PageDocument, type TargetedPage } from '@wirebound/schema'
import type { DbHandle } from '../db/tx'
import { listProjectComments } from '../repos/comments'
import { listMenuRows } from '../repos/menu'
import { listPages, type PageRecord } from '../repos/pages'

/** 페이지가 하나도 없는 프로젝트. 호출자가 409로 매핑한다. */
export class EmptyProjectError extends Error {
  constructor() {
    super('내보낼 페이지가 없습니다')
    this.name = 'EmptyProjectError'
  }
}

/**
 * 이 서버가 그릴 수 없는 문서 버전이 섞여 있다. 호출자가 409로 매핑한다.
 *
 * **산출물을 내지 않는 쪽을 골랐다.** `GET .../pages/:id`가 같은 상태에서 400이므로 그
 * 페이지는 이미 저작 화면에서도 안 열린다. 그리지 못한 채로 내보내면 **눈으로는
 * 그럴듯한 한 장**이 남에게 전달되고, 그것이 이 저장소가 반복해서 막아 온 부류다.
 */
export class UnsupportedDocumentError extends Error {
  constructor(readonly pageTitle: string, readonly reason: string) {
    super(`"${pageTitle}" 페이지의 문서를 이 서버가 처리할 수 없습니다: ${reason}`)
    this.name = 'UnsupportedDocumentError'
  }
}

export interface ExportSource {
  /** 번들 순서. `bundleTitle`이 **두 산출물이 페이지를 부르는 이름**이다. */
  ordered: TargetedPage[]
  /** 최신 버전으로 올린 문서. 키는 페이지 id. */
  documentById: Map<string, PageDocument>
  /** 페이지 id → 코멘트. 없는 페이지는 키가 없다. */
  commentsById: Map<string, BundleComment[]>
  /** 페이지 id → 설명. */
  descriptionById: Map<string, string | null>
}

/** 두 내보내기가 함께 쓰는 입력을 모은다. */
export async function collectExportSource(
  db: DbHandle,
  projectId: string,
): Promise<ExportSource> {
  const menuRows = await listMenuRows(db, projectId)
  const pageRecords = await listPages(db, projectId)
  if (pageRecords.length === 0) throw new EmptyProjectError()

  /**
   * **평평한 행을 그대로 넘긴다**(P9-3 T2). 승격 전에는 `buildMenuTree`로 트리를 만들어
   * 넘겼는데, `targetedPages`가 `packages/schema`로 올라가며 입력이 평평해졌다 — 그래야
   * CLI·MCP가 스냅샷 payload에서 트리를 다시 조립하지 않는다.
   */
  const ordered = targetedPages({
    menu: menuRows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      title: row.title,
      sortOrder: row.sort_order,
    })),
    pages: pageRecords.map((page) => ({
      id: page.id,
      menuNodeId: page.menuNodeId,
      title: page.title,
      sortOrder: page.sortOrder,
    })),
  })

  /**
   * **`targetedPages`가 버린 페이지가 있으면 여기서 멈춘다.** 그 함수는 고아 노드와
   * 순환에 갇힌 노드를 조용히 버리는데, 버려진 페이지는 산출물에서 **말없이 빠진다.**
   * 조용히 빠지는 것이 이 산출물에서 가장 나쁜 실패다.
   *
   * **FK가 이 상태를 막지 않는다**(P8-4 리뷰가 재서 보였다). `pages_menu_node_id_fkey`는
   * `menu_nodes(id)`만 참조하고 **프로젝트를 안 본다** — 프로젝트 A의 페이지가 프로젝트 B의
   * 메뉴를 가리켜도 FK는 통과하고, `listMenuRows(A)`가 그 메뉴를 안 내므로 페이지가 고아가
   * 된다. 그러므로 이 갈래는 *"오늘 닿지 않는 것"*이 아니라 **닿는 것**이고 케이스가 든다.
   */
  if (ordered.length !== pageRecords.length) {
    throw new Error(
      `메뉴 트리가 페이지를 잃었습니다: 페이지 ${pageRecords.length}장 중 ${ordered.length}장만 트리에 있습니다`,
    )
  }

  return {
    ordered,
    documentById: documentsByPageId(pageRecords, ordered),
    commentsById: await commentsByPageId(db, projectId),
    descriptionById: new Map(pageRecords.map((record) => [record.id, record.description ?? null])),
  }
}

/**
 * 문서를 페이지 id로 찾을 수 있게 하고 **최신 버전으로 올린다**.
 *
 * `listPages`는 마이그레이션하지 않고 DB에 있는 그대로 낸다(그 함수의 머리말 — 캡처가
 * 그것을 요구한다). 내보내기는 **그리는** 쪽이므로 `GET .../pages/:id`와 같이 올려야 한다.
 */
function documentsByPageId(
  records: readonly PageRecord[],
  ordered: readonly TargetedPage[],
): Map<string, PageDocument> {
  const byId = new Map(records.map((record) => [record.id, record]))
  const documents = new Map<string, PageDocument>()
  for (const page of ordered) {
    const record = byId.get(page.id)!
    try {
      documents.set(page.id, migrateDocument(record.schema))
    } catch (error) {
      // 이름은 **번들 이름**이다 — `errors[].title`·미리보기의 `pages[].title`과 한 벌이다.
      throw new UnsupportedDocumentError(
        page.bundleTitle,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  return documents
}

/**
 * 프로젝트의 코멘트를 **한 문장으로** 받아 페이지별로 가른다.
 *
 * `createdAt`은 ISO 문자열로 낸다 — `BundleComment`가 문자열을 받고, 산출물은 그것을
 * 그대로 싣는다(정렬은 `listProjectComments`의 계약이 이미 정했다).
 */
async function commentsByPageId(
  db: DbHandle,
  projectId: string,
): Promise<Map<string, BundleComment[]>> {
  const rows = await listProjectComments(db, projectId)
  const byPage = new Map<string, BundleComment[]>()
  for (const row of rows) {
    const entries = byPage.get(row.pageId) ?? []
    entries.push({
      nodeId: row.nodeId,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt.toISOString(),
    })
    byPage.set(row.pageId, entries)
  }
  return byPage
}
