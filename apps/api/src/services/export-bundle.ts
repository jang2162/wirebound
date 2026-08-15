/**
 * **프로젝트 하나를 §11.3의 정적 번들로 만든다**(P8-4 T2 · D1·D5).
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수를 조율할 뿐이다
 * (`snapshot-capture.ts`와 같은 자리). zod도 Fastify도 상태 코드도 이 파일에 없고,
 * zip도 여기서 만들지 않는다(`export-zip.ts`).
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다
 *
 * 1. `listMenuRows` · `listPages` — 메뉴와 페이지(문서 포함).
 * 2. `buildMenuTree` → `targetedPages` — **한 번의 순회가 번들의 순서이자 페이지마다의
 *    조상**이다. 둘을 따로 계산하면 *"남의 조상을 단 타겟"*이 생기는데, 그 문자열은
 *    그럴듯해서 아무도 못 걸러 낸다.
 * 3. `listProjectComments` — 코멘트를 **한 문장으로** 받아 페이지별로 가른다.
 * 4. `currentProjectTheme` → `resolveTheme` — 캔버스가 보는 것과 **같은 사슬**이다.
 * 5. `exportBundle` — 파일과 `errors`.
 * 6. 못 이은 링크를 센다.
 *
 * # D1 — 출처는 라이브 프로젝트다
 *
 * 페이지·문서는 `pages` 표의 **지금** 값이고, 코멘트는 `comments` 표의 **살아 있는**
 * 값이며, 테마는 프로젝트가 **지금** 쓰는 것이다. §15의 MVP가 *"설계서를 배포한다"*이고
 * 그것은 **지금 설계서**다. 스냅샷 번들은 이 함수의 입력을 payload에서 읽어 오는 것으로
 * 바뀔 뿐이라(입력이 이미 값이다) 그 위에 얹힌다.
 *
 * # `listComments`를 페이지마다 부르지 않는다
 *
 * `listProjectComments` 하나로 받는다 — `snapshot-capture.ts`가 같은 자리에서 같은
 * 판단을 했다. 페이지마다 왕복하면 그 사이에 다른 페이지의 코멘트가 바뀌어 **한 시점에
 * 존재한 적 없는 조합**이 번들에 담긴다.
 *
 * **지문(fingerprint)은 두지 않는다.** 캡처는 *"그때 그 화면"*을 약속하므로 그 검사가
 * 필요하지만(§4.5), 번들은 *"지금 설계서"*를 약속한다 — 수집 중에 누가 페이지를 고쳤다면
 * 그 편집이 실린 번들도 *"지금"*의 정직한 답이다. 필요해지면 캡처를 지나 스냅샷 번들을
 * 만드는 쪽이 옳고, 그것은 D1이 이월로 넘긴 자리다.
 */
import {
  exportBundle,
  type BundleComment,
  type BundleFile,
  type BundleNodeError,
  type BundlePage,
} from '@wirebound/exporter'
import {
  isPageTargetAction,
  migrateDocument,
  walkNodes,
  type PageDocument,
} from '@wirebound/schema'
import { resolveTheme, type ResolvedTheme } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import { listProjectComments } from '../repos/comments'
import { listMenuRows } from '../repos/menu'
import { listPages, type PageRecord } from '../repos/pages'
import { buildMenuTree } from './menu-tree'
import { duplicateTargets, targetedPages, type TargetedPage } from './page-target'
import { currentProjectTheme } from './project-theme'

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
 * **번들을 내지 않는 쪽을 골랐다.** `GET .../pages/:id`가 같은 상태에서 400이므로 그
 * 페이지는 이미 저작 화면에서도 안 열린다. 그리지 못한 채로 내보내면 **눈으로는
 * 그럴듯한 한 장**이 남에게 전달되고, 그것이 이 슬라이스가 반복해서 막아 온 부류다.
 */
export class UnsupportedDocumentError extends Error {
  constructor(readonly pageTitle: string, readonly reason: string) {
    super(`"${pageTitle}" 페이지의 문서를 이 서버가 처리할 수 없습니다: ${reason}`)
    this.name = 'UnsupportedDocumentError'
  }
}

/** 번들에 실린 페이지 하나. **파일 경로를 담지 않는다** — 아래 `brokenLinks` 주석 참고. */
export interface ExportedPageSummary {
  id: string
  title: string
  /** 이 페이지를 가리키는 §8.1의 타겟. 저작 화면이 손으로 적는 문자열이다. */
  target: string
}

/** 어느 페이지도 가리키지 못한 링크 하나. */
export interface BrokenLink {
  /** 문서에 적힌 타겟 문자열 그대로. */
  target: string
  /** 그것을 겨눈 페이지들의 제목. 번들 순서다. */
  from: string[]
  /** `missing`이면 그 타겟을 든 페이지가 없고, `ambiguous`면 둘 이상이다. */
  reason: 'missing' | 'ambiguous'
}

export interface ProjectBundle {
  files: BundleFile[]
  /** 그리지 못한 노드들. `title`이 붙어 있어 **어느 페이지인지** 말할 수 있다. */
  errors: BundleNodeError[]
  /** 번들에 실린 페이지들. 번들 순서다. */
  pages: ExportedPageSummary[]
  /** 둘 이상의 페이지가 든 타겟. 그 타겟을 겨눈 링크는 어디에도 안 생긴다. */
  duplicateTargets: string[]
  brokenLinks: BrokenLink[]
  /** 이 번들이 실은 테마. `null`이면 구조 기본 CSS만으로 그려진 것이다. */
  themeId: string | null
}

/**
 * 프로젝트의 번들을 값으로 만든다. **파일을 쓰지 않고 zip도 만들지 않는다** —
 * `exportBundle`이 파일 시스템을 모르는 것과 같은 이유다.
 */
export async function exportProjectBundle(db: DbHandle, projectId: string): Promise<ProjectBundle> {
  const menuRows = await listMenuRows(db, projectId)
  const pageRecords = await listPages(db, projectId)
  if (pageRecords.length === 0) throw new EmptyProjectError()

  const tree = buildMenuTree(
    menuRows,
    pageRecords.map((page) => ({
      id: page.id,
      menu_node_id: page.menuNodeId,
      title: page.title,
      sort_order: page.sortOrder,
    })),
  )
  const ordered = targetedPages(tree)

  /**
   * **`buildMenuTree`가 버린 페이지가 있으면 여기서 멈춘다.** 그 함수는 고아 노드와
   * 순환에 갇힌 노드를 조용히 버리는데(제 머리말이 그렇게 적혀 있다), 버려진 페이지는
   * 번들에서 **말없이 빠진다.** FK가 그 상태를 막고 있으므로 오늘 이 갈래는 닿지
   * 않지만, 닿으면 사람이 봐야 한다 — 조용히 빠지는 것이 이 산출물에서 가장 나쁜 실패다.
   */
  if (ordered.length !== pageRecords.length) {
    throw new Error(
      `메뉴 트리가 페이지를 잃었습니다: 페이지 ${pageRecords.length}장 중 ${ordered.length}장만 트리에 있습니다`,
    )
  }

  const documentById = documentsByPageId(pageRecords, ordered)
  const commentsById = await commentsByPageId(db, projectId)
  const { themeId, theme } = await currentProjectTheme(db, projectId)

  const bundlePages: BundlePage[] = ordered.map((page) => ({
    title: page.title,
    document: documentById.get(page.id)!,
    description: descriptionOf(pageRecords, page.id),
    comments: commentsById.get(page.id) ?? [],
    target: page.target,
  }))

  const { files, errors } = exportBundle({ pages: bundlePages, theme: resolvedTheme(theme) })

  return {
    files,
    errors,
    pages: ordered.map((page) => ({ id: page.id, title: page.title, target: page.target })),
    duplicateTargets: duplicateTargets(ordered),
    brokenLinks: brokenLinks(ordered, documentById),
    themeId,
  }
}

/**
 * 문서를 페이지 id로 찾을 수 있게 하고 **최신 버전으로 올린다**.
 *
 * `listPages`는 마이그레이션하지 않고 DB에 있는 그대로 낸다(그 함수의 머리말 — 캡처가
 * 그것을 요구한다). 번들은 **그리는** 쪽이므로 `GET .../pages/:id`와 같이 올려야 한다.
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
      throw new UnsupportedDocumentError(page.title, error instanceof Error ? error.message : String(error))
    }
  }
  return documents
}

function descriptionOf(records: readonly PageRecord[], pageId: string): string | null {
  return records.find((record) => record.id === pageId)?.description ?? null
}

/**
 * 프로젝트의 코멘트를 **한 문장으로** 받아 페이지별로 가른다.
 *
 * `createdAt`은 ISO 문자열로 낸다 — `BundleComment`가 문자열을 받고, 번들은 그것을
 * 그대로 화면에 싣는다(정렬은 `listProjectComments`의 계약이 이미 정했다).
 */
async function commentsByPageId(db: DbHandle, projectId: string): Promise<Map<string, BundleComment[]>> {
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

/** `Theme`을 `exportBundle`이 받는 `ResolvedTheme`으로 바꾼다. **`currentProjectTheme`은 그 모양을 주지 않는다**(재라 #3). */
function resolvedTheme(theme: Parameters<typeof resolveTheme>[0] | null): ResolvedTheme | null {
  if (theme === null) return null
  return resolveTheme(theme).theme
}

/**
 * **어느 페이지도 가리키지 못한 링크를 센다**(D3.4).
 *
 * 값은 이미 번들 안에 있다 — 계획의 요청마다 `href`가 `null`인지 보면 된다. 그런데
 * `exportBundle`은 그 계획을 값으로 내지 않고 HTML 안에 심어 내보내므로, 화면이 **미리**
 * 말하려면 여기서 같은 셈을 한다. **판정 규칙은 한 문장이고 `exportBundle`의 것과 같다:**
 * 그 타겟을 든 페이지가 **정확히 하나**여야 링크가 생긴다.
 *
 * **파일 경로를 말하지 않고 페이지 제목으로 말한다.** `errors[].path`가 파일 이름이고
 * `index.html`이 담는 첫 페이지의 오류에도 `pages/….html`이 붙는데(P8-3 이월 §1),
 * 아직 압축을 풀지도 않은 사람에게 파일 이름은 아무것도 짚어 주지 못한다.
 *
 * **빈 타겟은 세지 않는다.** 그것은 *"아직 안 골랐다"*이고 `schema`의 `checkPageAction`이
 * 이미 저작 화면에서 말한다 — 같은 사실을 두 화면이 말하면 문제가 둘인 줄 안다.
 */
function brokenLinks(
  ordered: readonly TargetedPage[],
  documents: ReadonlyMap<string, PageDocument>,
): BrokenLink[] {
  const carriers = new Map<string, number>()
  for (const page of ordered) {
    carriers.set(page.target, (carriers.get(page.target) ?? 0) + 1)
  }

  const found = new Map<string, BrokenLink>()
  for (const page of ordered) {
    for (const target of referencedTargets(documents.get(page.id)!)) {
      const count = carriers.get(target) ?? 0
      if (count === 1) continue

      const link = found.get(target) ?? {
        target,
        from: [],
        reason: count === 0 ? ('missing' as const) : ('ambiguous' as const),
      }
      if (!link.from.includes(page.title)) link.from.push(page.title)
      found.set(target, link)
    }
  }
  return [...found.values()]
}

/**
 * 이 문서가 겨눈 페이지 타겟들. **문서 순서**이고 중복은 걷는다.
 *
 * `walkNodes`를 그대로 쓴다 — 저장을 지난 문서는 `DocumentEnvelopeSchema`를 통과했으므로
 * 노드가 아닌 자식이 없다(편집 파이프라인 6단계와 `PUT .../schema` 1단계). **견디는
 * 순회를 하나 더 만들지 않는다** — 이 저장소에 이미 넷이 있다(P8-3 이월 §12).
 */
function referencedTargets(document: PageDocument): string[] {
  const targets: string[] = []
  for (const visit of walkNodes(document.root)) {
    for (const interaction of visit.node.interactions ?? []) {
      for (const action of interaction.actions) {
        if (!isPageTargetAction(action)) continue
        const target = action.target.trim()
        if (target.length === 0) continue
        if (!targets.includes(target)) targets.push(target)
      }
    }
  }
  return targets
}
