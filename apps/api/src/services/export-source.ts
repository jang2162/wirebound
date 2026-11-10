/**
 * **내보내기 둘이 공유하는 수집.**
 *
 * 설계서 「HTML 정적 번들」의 HTML 번들과 「로드맵」의 PPTX가 **같은 프로젝트를 같은 순서로 같은 이름으로** 실어야
 * 한다. 수집을 두 벌 두면 *"어느 산출물이 무엇을 실었나"*가 갈리고, 그 갈림은 두 파일을
 * 나란히 열어 본 사람에게만 보인다.
 *
 * **`@wirebound/exporter`가 순수 함수 둘로 나뉘어 있는 것과 짝이다** — 거기서 `commentEntries`·
 * `pageSentences`를 한 자리에 두었고, 여기서는 **그 함수들이 받을 입력**을 한 자리에 둔다.
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다
 *
 * 1. `listMenuRows` · `listPages` — 메뉴와 페이지(문서 포함).
 * 2. `targetedPages` — **한 번의 순회가 순서이자 페이지마다의 조상**이다. 둘을 따로
 *    계산하면 *"남의 조상을 단 타겟"*이 생기는데, 그 문자열은 그럴듯해서 아무도 못 걸러 낸다.
 * 3. `listProjectComments` — 코멘트를 **한 문장으로** 받아 페이지별로 가른다. 페이지마다
 *    왕복하면 그 사이에 다른 페이지의 코멘트가 바뀌어 **한 시점에 존재한 적 없는 조합**이
 *    산출물에 담긴다.
 *
 * 4. `findProjectTheme` · `readThemePackageFiles` — 프로젝트가 고정한 `테마@판` 의 패키지 바이트와 저장한 토큰. **바이트로 읽기만 하고
 *    `theme.js` 를 실행하지 않는다** — 번들에 실어 브라우저가 돌린다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 *    「내보내기와 PPTX」 의 «테마 코드는 브라우저에서만 돈다»). 번들과 PPTX 화면이 같은 테마로 그린다.
 */
import type { BundleComment, BundleImage, BundleTheme } from '@wirebound/exporter'
import { imageIdsIn, migrateDocument, targetedPages, type CodeTable, type PageDocument, type TargetedPage } from '@wirebound/schema'
import { readWbtheme } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import { readProjectAssetsForBundle } from '../repos/assets'
import { readCodeTable } from '../repos/codes'
import { listProjectComments, type CommentRecord } from '../repos/comments'
import { listMenuRows } from '../repos/menu'
import { listPages, type PageRecord } from '../repos/pages'
import { findProjectTheme } from '../repos/projects'
import { findThemePackage, readThemePackageFiles } from '../repos/theme-packages'
import { extensionOf } from './asset-format'
import type { MenuRow } from './menu-tree'

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
 * 그럴듯한 한 장**이 남에게 전달되고, 그것이 이 저장소가 막는 부류다.
 */
export class UnsupportedDocumentError extends Error {
  constructor(
    readonly pageTitle: string,
    readonly reason: string,
  ) {
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

/**
 * **DB 에서 읽은 그대로** — 조립 전의 행들. 메인 스레드가 읽고 내보내기 워커로 넘긴다(`export-worker.ts`).
 *
 * **읽기와 조립을 가른 이유:** 조립(`assembleExportSource` — 문서 마이그레이션)부터 그 뒤의 렌더·압축까지는 순수 CPU
 * 이고 크기에 비례해 이벤트 루프를 멈춘다. 그 몫을 워커로 보내려면 워커가 받을 값이 DB 를 모르는 값이어야 한다 —
 * 워커는 풀도 트랜잭션도 갖지 않는다.
 */
export interface ExportRows {
  menu: MenuRow[]
  /** `listPages` 그대로 — 문서는 **마이그레이션 전**이다. */
  pages: PageRecord[]
  comments: CommentRecord[]
  /**
   * 프로젝트 테마 — 패키지 파일(바이트에서 푼 그대로)과 서버 manifest · 저장한 토큰. 바인딩이 없거나 패키지를 못 읽었으면 `null` 이고
   * 번들은 기본 뷰로 그린다. 자산은 워커 경계를 넘도록 배열이다(`[패키지 안 경로, 바이트]`).
   */
  theme: BundleTheme | null
  /** 바인딩은 있는데 패키지를 못 읽은 까닭 — 미리보기가 한 줄로 말한다. 정상이면 `null`. */
  themeWarning: string | null
  /**
   * 페이지들이 든 그림 가운데 **그 프로젝트가 가진 것**(소유 행이 있는 것) — 번들의 `assets/images/` 에 실린다. 남의 그림 id 를 문서에 적어도
   * 그 바이트는 여기 안 든다(정본 「그림」 — 권한은 소유 행이 가른다). 워커 경계를 넘도록 배열이다.
   */
  images: BundleImage[]
  /** 프로젝트의 공통코드 표(`repos/codes.ts` 의 `readCodeTable`) — 번들이 묶인 노드를 표의 이름으로 그리고 «공통코드» 장을 싣는다. */
  codes: CodeTable
}

/**
 * 두 내보내기가 함께 쓰는 행을 읽는다. **페이지가 없으면 여기서 멈춘다**(`EmptyProjectError`) — 워커를 부를 일이 없다.
 *
 * 순서는 머리말 «아래 순서 자체가 규격이다»의 1 · 3 이다. 2 는 `assembleExportSource`가 한다.
 */
export async function readExportRows(db: DbHandle, projectId: string): Promise<ExportRows> {
  const menu = await listMenuRows(db, projectId)
  const pages = await listPages(db, projectId)
  if (pages.length === 0) throw new EmptyProjectError()
  const comments = await listProjectComments(db, projectId)
  const images = await readExportImages(db, projectId, pages)
  const codes = await readCodeTable(db, projectId)
  return { menu, pages, comments, ...(await readExportTheme(db, projectId)), images, codes }
}

/** 페이지 문서들이 든 그림 id 가운데 그 프로젝트가 가진 것의 바이트(`ExportRows.images`). */
async function readExportImages(db: DbHandle, projectId: string, pages: readonly PageRecord[]): Promise<BundleImage[]> {
  const ids = [...new Set(pages.flatMap((page) => imageIdsIn([(page.schema as { root?: unknown } | null)?.root])))]
  const rows = await readProjectAssetsForBundle(db, projectId, ids)
  return rows.map((row) => ({ id: row.id, ext: extensionOf(row.mime), bytes: new Uint8Array(row.bytes) }))
}

/**
 * 프로젝트 테마(머리말의 넷째 단계). 바인딩과 토큰은 프로젝트 행 하나에서 함께 읽는다 — 판과 토큰이 한 시점의 것이다. 패키지는
 * 지워지지 않고 행이 바뀌지 않으므로(spec 「저장」) 그 판의 manifest · 바이트는 바인딩을 읽은 뒤에 읽어도 같다.
 *
 * 패키지를 못 읽는 것은 업로드 검증을 지난 행이라 일어나지 않아야 하지만, 일어나면 **내보내기를 멈추지 않는다** — 기본 뷰로 내보내고
 * 까닭을 미리보기에 한 줄로 낸다(`themeWarning`).
 */
async function readExportTheme(db: DbHandle, projectId: string): Promise<Pick<ExportRows, 'theme' | 'themeWarning'>> {
  const binding = await findProjectTheme(db, projectId)
  if (binding === null || binding.themeId === null || binding.version === null) return { theme: null, themeWarning: null }
  const name = `${binding.themeId}@${binding.version}`
  const row = await findThemePackage(db, binding.themeId, binding.version)
  const bytes = row === null ? null : await readThemePackageFiles(db, binding.themeId, binding.version)
  if (row === null || bytes === null) return { theme: null, themeWarning: `테마 패키지를 찾지 못해 기본 뷰로 내보냅니다(${name})` }
  // 저장된 판이다 — 올린 뒤 카탈로그가 걷은 타입의 선언으로 패키지째 못 읽지 않게(`readWbtheme` 의 `stored`).
  const read = readWbtheme(bytes, { stored: true })
  if (read.files === null) {
    return { theme: null, themeWarning: `테마 패키지를 읽지 못해 기본 뷰로 내보냅니다(${name}): ${read.issues[0]?.message ?? '까닭 없음'}` }
  }
  return {
    theme: {
      ref: { themeId: binding.themeId, version: binding.version },
      manifest: row.manifest,
      tokens: binding.tokens,
      themeJs: read.files.themeJs,
      themeCss: read.files.themeCss,
      assets: [...read.files.assets.entries()],
    },
    themeWarning: null,
  }
}

/**
 * 읽은 행을 두 내보내기의 입력으로 조립한다. **DB 를 모른다** — 워커에서도 같은 스레드에서도 이 함수 하나다.
 */
export function assembleExportSource(rows: ExportRows): ExportSource {
  const { menu: menuRows, pages: pageRecords } = rows
  if (pageRecords.length === 0) throw new EmptyProjectError()

  /**
   * **평평한 행을 그대로 넘긴다.** `targetedPages`는 `packages/schema`에 있고 평평한 입력을
   * 받는다 — 그래야 CLI·MCP가 스냅샷 payload에서 트리를 다시 조립하지 않는다.
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
   * **FK가 이 상태를 막지 않는다.** `pages_menu_node_id_fkey`는
   * `menu_nodes(id)`만 참조하고 **프로젝트를 안 본다** — 프로젝트 A의 페이지가 프로젝트 B의
   * 메뉴를 가리켜도 FK는 통과하고, `listMenuRows(A)`가 그 메뉴를 안 내므로 페이지가 고아가
   * 된다. 그러므로 이 갈래는 *"실제로는 닿지 않는 것"*이 아니라 **닿는 것**이고 케이스가 든다.
   */
  if (ordered.length !== pageRecords.length) {
    throw new Error(`메뉴 트리가 페이지를 잃었습니다: 페이지 ${pageRecords.length}장 중 ${ordered.length}장만 트리에 있습니다`)
  }

  return {
    ordered,
    documentById: documentsByPageId(pageRecords, ordered),
    commentsById: commentsByPageId(rows.comments),
    descriptionById: new Map(pageRecords.map((record) => [record.id, record.description ?? null])),
  }
}

/**
 * 문서를 페이지 id로 찾을 수 있게 하고 **최신 버전으로 올린다**.
 *
 * `listPages`는 마이그레이션하지 않고 DB에 있는 그대로 낸다(그 함수의 머리말 — 캡처가
 * 그것을 요구한다). 내보내기는 **그리는** 쪽이므로 `GET .../pages/:id`와 같이 올려야 한다.
 */
function documentsByPageId(records: readonly PageRecord[], ordered: readonly TargetedPage[]): Map<string, PageDocument> {
  const byId = new Map(records.map((record) => [record.id, record]))
  const documents = new Map<string, PageDocument>()
  for (const page of ordered) {
    const record = byId.get(page.id)!
    try {
      documents.set(page.id, migrateDocument(record.schema))
    } catch (error) {
      // 이름은 **번들 이름**이다 — `errors[].title`·미리보기의 `pages[].title`과 한 벌이다.
      throw new UnsupportedDocumentError(page.bundleTitle, error instanceof Error ? error.message : String(error))
    }
  }
  return documents
}

/**
 * 프로젝트의 코멘트(**한 문장으로** 받은 것 — `readExportRows`)를 페이지별로 가른다.
 *
 * `createdAt`은 ISO 문자열로 낸다 — `BundleComment`가 문자열을 받고, 산출물은 그것을
 * 그대로 싣는다(정렬은 `listProjectComments`의 계약이 이미 정했다).
 */
function commentsByPageId(rows: readonly CommentRecord[]): Map<string, BundleComment[]> {
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
