/**
 * **스냅샷 하나에서 페이지를 읽는 조립.** `wireb page get`과 §12.2의 `get_page`·`list_pages`가
 * **이 파일 하나**를 부른다(P9-4 D1).
 *
 * ---
 *
 * # 왜 명령 안이 아니라 여기인가
 *
 * P9-3은 이 조립을 `commands/page-get.ts`에 뒀고, 그 파일의 머리말이 *"§12.2의 MCP
 * `get_page`가 같은 것을 내야 하므로 조립을 여기 두면 P9-4가 두 벌을 만든다"*고 **미리
 * 적어 뒀다.** P9-4가 그 자리다 — 옮기지 않으면 MCP가 `targetedPages`→`matchPageTargets`→
 * 0·1·다 갈래→`pageView`를 다시 쓴다.
 *
 * **글자는 여기 없다.** 후보를 몇 개까지 보일지, 줄을 어떻게 들여쓸지는 부르는 쪽이 정한다 —
 * 터미널과 에이전트가 같은 것을 읽을 이유가 없다.
 *
 * # 못 찾은 것과 둘 이상을 **갈라 낸다**
 *
 * 겹치는 타겟은 실재한다(같은 메뉴 아래 같은 제목 · 제목에 든 `/` — P9-1 이월 §9).
 * **하나를 골라 주면 어느 쪽인지 아무도 모른다.**
 *
 * # `migrateDocument`를 지난다 — **P9-3이 남긴 구멍을 여기서 닫는다**
 *
 * P9-3 이월 §6이 *"`page get`이 `migrateDocument`를 안 지난다. `lint`는 지난다"*를 구멍으로
 * 적었다(리뷰 N8). 오늘 `MIGRATIONS = []`이라 무해하지만 **첫 마이그레이션이 생기는 날 두
 * 명령이 같은 페이지를 다르게 읽는다.**
 *
 * 그 이월이 *"고치는 자리는 부르는 쪽"*이라고 적었고, **부르는 쪽이 하나가 된 것이 지금이다.**
 * `snapshotToLintInput`과 같은 태도를 쓴다: **못 올리면 그대로 쓰고 말한다.** 막으면 새
 * 서버에 붙은 옛 판이 아무것도 못 읽는다(`snapshot/payload.ts`의 D3과 같은 근거).
 */
import {
  duplicateTargets,
  matchPageTargets,
  migrateDocument,
  pageTargetPath,
  pageView,
  targetedPages,
  type PageDocument,
  type PageView,
  type TargetedPage,
} from '@wirebound/schema'
import type { SnapshotPayload } from '@wirebound/themes'
import { prepareCatalog } from './catalog'

/** 목록에 실리는 페이지 하나. **경로가 앞에 온다** — 그것이 다른 두 도구의 인자다. */
export interface PageSummary {
  /** `관리자/회원/목록`. 접두를 벗긴 §8.1의 경로다. */
  path: string
  id: string
  title: string
  /** 조상 메뉴의 이름들. 뿌리가 앞이다. */
  menuPath: readonly string[]
}

/** 메뉴 노드 하나. **평평하다** — payload의 모양 그대로다(`parentId`가 구조를 나른다). */
export interface MenuSummary {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
}

export interface ProjectListing {
  menu: MenuSummary[]
  pages: PageSummary[]
  /**
   * 둘 이상의 페이지가 든 경로. **비어 있지 않으면 그 경로로는 페이지를 못 고른다** —
   * `duplicateTargets`가 이미 그 판정을 갖고 있다(P9-1 이월 §9).
   */
  duplicatePaths: string[]
}

/** 페이지 하나를 찾은 결과. **셋을 갈라 낸다** — 부르는 쪽이 그것을 글자로 만든다. */
export type PageLookup =
  | {
      kind: 'found'
      view: PageView
      notes: string[]
      /**
       * 이 페이지가 선 revision 번호. **`PageView` 안이 아니라 여기 있다** —
       * `pageView`가 만드는 것은 *"문서가 무엇인가"*이고 이것은 *"저장소가 어디까지
       * 왔는가"*라 성질이 다르다(payload의 `SnapshotPage.headSeq`에서 그대로 온다).
       *
       * **§12.2가 *"`patch_page`(baseSeq 필수)"*라고 적었고 그 값을 에이전트가 알 길이
       * 여기뿐이다.** 없으면 도구가 스스로 읽어야 하고, 그러면 *"내가 읽은 문서 위에
       * 얹는다"*는 §7.4의 보증이 사라진다 — 도구가 자기가 방금 읽은 판으로 덮어쓴다.
       */
      headSeq: number
    }
  | { kind: 'none'; candidates: string[] }
  | { kind: 'ambiguous'; matches: PageSummary[] }

/**
 * 트리 순서로 편 페이지 목록과 메뉴. `targetedPages`가 순서와 조상을 **한 번에** 만든다 —
 * 둘을 따로 계산하면 *"남의 조상을 단 타겟"*이 생긴다(그 파일의 머리말).
 */
export function listProject(payload: SnapshotPayload): ProjectListing {
  const ordered = orderedPages(payload)
  return {
    menu: payload.menu.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      sortOrder: node.sortOrder,
    })),
    pages: ordered.map(summarize),
    // **판정을 다시 짜지 않는다** — `duplicateTargets`가 이미 그것을 갖고 있다
    // (P9-1 이월 §9). 접두만 벗겨 목록의 `path`와 같은 말로 만든다.
    duplicatePaths: duplicateTargets(ordered).map(pageTargetPath),
  }
}

/** 트리 순서로 편 페이지들. `lookupPage`와 `listProject`가 같은 것을 본다. */
export function orderedPages(payload: SnapshotPayload): TargetedPage[] {
  return targetedPages({ menu: payload.menu, pages: payload.pages })
}

/** 사람이 칠 수 있는 경로 목록. 못 찾았을 때 후보로 낸다. */
export function projectPaths(payload: SnapshotPayload): string[] {
  return orderedPages(payload).map((page) => pageTargetPath(page.target))
}

/**
 * 경로 하나로 페이지를 찾아 `PageView`까지 만든다.
 *
 * **카탈로그를 여기서 세운다.** 안 부르면 상호작용 문장의 prop 라벨이 카탈로그 없이 나온다
 * (*"로딩 상태"* → *"loading"*, 실측 — `read/catalog.ts`의 표). **부르는 것을 부르는 쪽에
 * 맡기면 하나를 빠뜨린 소비자가 조용히 거짓을 낸다** — 소비자가 둘(`wireb`·MCP)이 된 것이
 * 이 슬라이스이고, 셋째가 생겨도 같다.
 *
 * `listProject`는 안 부른다 — 그것이 내는 것은 제목과 경로뿐이고 둘 다 payload에서 온다
 * (쟀다: 카탈로그 유무로 `nodes[].name`·`comments[].nodeName`이 안 바뀐다).
 */
export function lookupPage(payload: SnapshotPayload, path: string): PageLookup {
  prepareCatalog()
  const ordered = orderedPages(payload)
  const matched = matchPageTargets(ordered, path)

  if (matched.length === 0) {
    return { kind: 'none', candidates: ordered.map((page) => pageTargetPath(page.target)) }
  }
  if (matched.length > 1) {
    return { kind: 'ambiguous', matches: matched.map(summarize) }
  }

  const found = matched[0]!
  const record = payload.pages.find((page) => page.id === found.id)!
  const notes: string[] = []
  const document = currentDocument(record.schema, record.title, notes)

  return {
    kind: 'found',
    notes,
    headSeq: record.headSeq,
    view: pageView({
      id: record.id,
      title: record.title,
      description: record.description,
      target: found.target,
      menuPath: found.menuPath,
      document,
      comments: payload.comments
        .filter((comment) => comment.pageId === record.id)
        .map((comment) => ({
          nodeId: comment.nodeId,
          body: comment.body,
          authorName: comment.authorName,
          createdAt: comment.createdAt,
        })),
    }),
  }
}

function summarize(page: TargetedPage): PageSummary {
  return { path: pageTargetPath(page.target), id: page.id, title: page.title, menuPath: page.menuPath }
}

/**
 * 저장된 문서를 지금 버전으로 올린다. **못 올리면 그대로 쓰고 말한다**(위 머리말).
 *
 * `snapshotToLintInput`이 lint 쪽에서 같은 것을 하고 `document-version` 노트를 낸다 —
 * **같은 태도를 쓰는 것이 요점이다.** 여기서 던지면 옛 문서 하나가 페이지 조회 전체를
 * 막고, 여기서 조용히 넘어가면 lint와 이 도구가 같은 페이지를 다르게 읽는다.
 */
function currentDocument(document: PageDocument, title: string, notes: string[]): PageDocument {
  try {
    return migrateDocument(document)
  } catch (error) {
    notes.push(
      `"${title}" 페이지의 문서를 이 판이 올릴 수 없습니다: ${error instanceof Error ? error.message : String(error)} — 저장된 그대로 읽었습니다`,
    )
    return document
  }
}
