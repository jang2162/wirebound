/**
 * **프로젝트 하나를 설계서 「HTML 정적 번들」의 정적 번들로 만든다.**
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수를 조율할 뿐이다
 * (`snapshot-capture.ts`와 같은 자리). zod도 Fastify도 상태 코드도 이 파일에 없고,
 * zip도 여기서 만들지 않는다(`export-zip.ts`).
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다
 *
 * 1. `readExportRows` → `assembleExportSource` — 메뉴·페이지·문서·코멘트·설명. **PPTX와 공유한다.**
 *    `export-source.ts`의 머리말이 수집 순서와 근거를 든다.
 * 2. `exportBundle` — 파일과 `errors`. 프로젝트 테마의 패키지 파일 · 토큰을 **글자와 바이트로** 넘긴다 — 번들의 페이지가 브라우저에서
 *    그 테마로 그린다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「내보내기와 PPTX」). api 는 테마 코드를 실행하지
 *    않는다(`test/export-theme.test.ts` 가 `export-*` 소스를 센다).
 * 3. 못 이은 링크를 센다.
 *
 * # 출처는 라이브 프로젝트다
 *
 * 페이지·문서는 `pages` 표의 **지금** 값이고, 코멘트는 `comments` 표의 **살아 있는**
 * 값이다. 설계서 「로드맵」의 MVP가 *"설계서를 배포한다"*이고
 * 그것은 **지금 설계서**다. 스냅샷 번들은 이 함수의 입력을 payload에서 읽어 오는 것으로
 * 바뀔 뿐이라(입력이 이미 값이다) 그 위에 얹힌다.
 *
 * # 지문(fingerprint)은 두지 않는다
 *
 * 캡처는 *"그때 그 화면"*을 약속하므로 그 검사가
 * 필요하지만(설계서 「스냅샷」), 번들은 *"지금 설계서"*를 약속한다 — 수집 중에 누가 페이지를 고쳤다면
 * 그 편집이 실린 번들도 *"지금"*의 정직한 답이다. 필요해지면 캡처를 지나 스냅샷 번들을
 * 만드는 쪽이 옳다(위 「출처는 라이브 프로젝트다」 — 입력을 payload에서 읽는다).
 */
import { exportBundle, type BundleFile, type BundleNodeError, type BundlePage, type ExportedBundle } from '@wirebound/exporter'
import {
  duplicateTargets,
  isPageTargetAction,
  pageKindOf,
  pageTargetKey,
  walkNodes,
  type PageDocument,
  type PageKind,
  type TargetedPage,
} from '@wirebound/schema'
import type { DbHandle } from '../db/tx'
import { readExportRuntime } from './export-runtime'
import { assembleExportSource, readExportRows, type ExportRows, type ExportSource } from './export-source'

/**
 * **도메인 에러 둘을 `export-source`가 소유한다.** 두 내보내기가 같은 수집을
 * 지나므로 같은 상태에서 같은 예외가 나야 하고, 라우트는 그것을 한 자리에서 상태 코드로
 * 옮긴다. **여기서 다시 내는 것은 부르는 쪽이 그대로 쓰던 이름을 잃지 않게 하려는 것이다.**
 */
export { EmptyProjectError, UnsupportedDocumentError } from './export-source'

/** 번들에 실린 페이지 하나. **파일 경로를 담지 않는다** — 아래 `brokenLinks` 주석 참고. */
export interface ExportedPageSummary {
  id: string
  /**
   * **번들이 이 페이지를 부르는 이름**(`TargetedPage.bundleTitle` — 조상 메뉴가 붙어 있다).
   *
   * 맨 제목이 아니다. 맨 제목이면 서로 다른 메뉴의 같은 제목이 화면에서 `목록`·`목록`으로
   * 보이는데, **번들의 좌측 트리가 조상 메뉴를 붙이는 것이 바로 그 결함 때문이다.**
   * 같은 결함을 화면에 남겨 두면 *"이 응답을 읽는 사람"*이 겪는다.
   *
   * **그리고 이 응답 안에서 한 페이지는 한 이름으로 불린다.** `errors[].title`은
   * `exportBundle`이 낸 것이라 늘 이 이름이다 — 여기가 맨 제목이면 같은 패널의 위아래가
   * 같은 페이지를 다르게 부른다.
   */
  title: string
  /** 이 페이지를 가리키는 설계서 「상호작용」의 타겟. 상호작용 탭의 페이지 고르개가 같은 문자열을 짓는다 · 목록 밖이면 손으로 적는다. */
  target: string
  /** 페이지의 종류 — 문서 뿌리가 `Popup` 이면 `popup`(`pageKindOf`). 화면이 목록 줄에 «팝업» 표지를 단다. */
  kind: PageKind
}

/** 어느 페이지도 가리키지 못한 링크 하나. */
export interface BrokenLink {
  /** 문서에 적힌 타겟 문자열 그대로. */
  target: string
  /** 그것을 겨눈 페이지들의 **번들 이름**(`ExportedPageSummary.title`과 같은 자). 번들 순서다. */
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
  /** 이 번들이 실은 테마(`"id@판"`). 바인딩이 없거나 패키지를 못 읽었으면 `null` — 기본 뷰로 그린다. */
  themeId: string | null
  /** 바인딩은 있는데 패키지를 못 읽은 까닭(`ExportRows.themeWarning`). */
  themeWarning: string | null
}

/**
 * 프로젝트의 번들을 값으로 만든다 — **같은 스레드에서** 읽고 조립한다. **파일을 쓰지 않고 zip도 만들지 않는다** —
 * `exportBundle`이 파일 시스템을 모르는 것과 같은 이유다.
 *
 * 라우트는 이것을 안 부른다 — 읽기만 메인에서 하고 조립부터는 워커가 한다(`export-worker.ts`). 조립은 둘 다
 * `buildProjectBundle` 하나를 지난다.
 */
export async function exportProjectBundle(db: DbHandle, projectId: string): Promise<ProjectBundle> {
  const rows = await readExportRows(db, projectId)
  return buildProjectBundle(rows)
}

/** 읽은 행으로 번들을 조립한다. **DB 를 모른다** — 워커에서도 같은 스레드에서도 이 함수 하나다. */
export function buildProjectBundle(rows: ExportRows): ProjectBundle {
  const source = assembleExportSource(rows)
  const { ordered, documentById } = source
  const { files, errors } = projectBundle(rows, source)

  return {
    files,
    errors,
    // **`bundleTitle`이다.** 맨 제목을 내면 화면의 페이지 목록이 `목록`·`목록`으로 보인다 —
    // 번들의 좌측 트리가 조상을 붙여 피하는 것과 같은 결함이고, 여기는 `errors[].title`(늘 번들 이름)과
    // 같은 응답이라 두 벌이 되기까지 한다.
    pages: ordered.map((page) => ({
      id: page.id,
      title: page.bundleTitle,
      target: page.target,
      kind: pageKindOf(documentById.get(page.id)),
    })),
    duplicateTargets: duplicateTargets(ordered),
    brokenLinks: brokenLinks(ordered, documentById),
    themeId: rows.theme === null ? null : `${rows.theme.ref.themeId}@${rows.theme.ref.version}`,
    themeWarning: rows.themeWarning,
  }
}

/**
 * 조립한 수집 → **번들 그 자체**. HTML 번들과 PPTX 화면이 이 함수 하나를 지난다 — PPTX 의 그리는 자가 이 번들의 페이지를
 * 그대로 연다(`export-pptx.ts`). 두 벌을 두면 화면에 찍힌 것과 내려받은 번들이 갈린다.
 */
export function projectBundle(rows: ExportRows, source: ExportSource): ExportedBundle {
  const { ordered, documentById, commentsById, descriptionById } = source

  const bundlePages: BundlePage[] = ordered.map((page) => ({
    /**
     * **조상 메뉴가 붙은 이름을 넘긴다.** `BundlePage.title`은
     * `<title>`·좌측 트리의 이름·파일 이름 셋의 재료이고, 조상을 안 붙이면 서로 다른
     * 메뉴의 같은 제목이 좌측 트리에서 **똑같은 두 줄**이 된다.
     * 붙이면 「HTML 정적 번들」의 예시 파일 이름(`관리자-회원-목록.html`)과도 같아진다.
     */
    title: page.bundleTitle,
    document: documentById.get(page.id)!,
    description: descriptionById.get(page.id) ?? null,
    comments: commentsById.get(page.id) ?? [],
    target: page.target,
  }))

  return exportBundle({ pages: bundlePages, runtimeJs: readExportRuntime(), theme: rows.theme, images: rows.images, codes: rows.codes })
}

/**
 * **어느 페이지도 가리키지 못한 링크를 센다.**
 *
 * 값은 이미 번들 안에 있다 — 계획의 요청마다 `href`가 `null`인지 보면 된다. 그런데
 * `exportBundle`은 그 계획을 값으로 내지 않고 HTML 안에 심어 내보내므로, 화면이 **미리**
 * 말하려면 여기서 같은 셈을 한다. **판정 규칙은 한 문장이고 `exportBundle`의 것과 같다:**
 * 그 타겟을 든 페이지가 **정확히 하나**여야 링크가 생긴다. 견주는 것도 같은 열쇠(`pageTargetKey` — 공백 · 접두를 걷는다)다.
 *
 * **파일 경로를 말하지 않고 페이지의 번들 이름으로 말한다.** `errors[].path`가 파일 이름이고
 * `index.html`이 담는 첫 페이지의 오류에도 `pages/….html`이 붙는데,
 * 아직 압축을 풀지도 않은 사람에게 파일 이름은 아무것도 짚어 주지 못한다.
 *
 * **빈 타겟은 세지 않는다.** 그것은 *"아직 안 골랐다"*이고 `schema`의 `checkPageAction`이
 * 이미 저작 화면에서 말한다 — 같은 사실을 두 화면이 말하면 문제가 둘인 줄 안다.
 */
function brokenLinks(ordered: readonly TargetedPage[], documents: ReadonlyMap<string, PageDocument>): BrokenLink[] {
  const carriers = new Map<string, number>()
  for (const page of ordered) {
    const key = pageTargetKey(page.target)
    carriers.set(key, (carriers.get(key) ?? 0) + 1)
  }

  const found = new Map<string, BrokenLink>()
  for (const page of ordered) {
    for (const target of referencedTargets(documents.get(page.id)!)) {
      const count = carriers.get(pageTargetKey(target)) ?? 0
      if (count === 1) continue

      const link = found.get(target) ?? {
        target,
        from: [],
        reason: count === 0 ? ('missing' as const) : ('ambiguous' as const),
      }
      if (!link.from.includes(page.bundleTitle)) link.from.push(page.bundleTitle)
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
 * 순회를 하나 더 만들지 않는다** — 이 저장소에 이미 여럿 있다.
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
