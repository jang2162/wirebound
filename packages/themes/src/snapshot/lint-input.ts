/**
 * **스냅샷 payload를 `lintProject`의 입력으로 옮기는 자리 하나**(P9-3 D3).
 *
 * P9-1 이월 §1이 *"payload와 lint 입력은 이름도 nullable도 다르다"*며 표를 값으로 남겼고,
 * 그 표를 `wireb lint`가 손으로 맞추면 **P9-4의 MCP `validate`가 같은 표를 다시 맞춘다.**
 * 그래서 함수 하나로 둔다 — 입력은 payload, 출력은 `ProjectLintInput`.
 *
 * ---
 *
 * # 이 함수가 드는 판정 넷 (P9-1 이월 §1·§4)
 *
 * **ⓐ 테마 절을 채우는 규칙.** `LintThemeEntry.id`는 필수 `string`인데 payload의 테마 절은
 * `{ layoutId, themeId, theme }`라 `id`도 `document`도 없다. 두 갈래를 가른다:
 *
 * | payload의 상태 | 무엇을 뜻하나 | 여기서 |
 * |---|---|---|
 * | `themeId === null` | 레이아웃이 테마를 안 골랐다 — 구조 기본 CSS만으로 그려진다(§4.5) | **넣지 않는다.** 검사할 문서가 없다 |
 * | `themeId`는 있는데 `theme === null` | **상속이 끊긴 파생 테마**(`payload.ts`가 적어 뒀다) | **넣지 않는다.** 병합 결과가 없어 lint에 줄 문서가 없다 |
 * | 둘 다 있다 | 병합이 끝난 문서다 | 넣는다 |
 *
 * **둘 다 `notes`로 말한다.** 넣지 않은 것을 조용히 두면 *"테마 이슈 0건"*이 *"테마를
 * 검사했고 깨끗하다"*로 읽힌다 — 이 저장소가 반복해서 막아 온 부류다.
 *
 * **ⓑ `layoutId`를 `id`에 싣는다.** ⑪의 짝짓기가 레이아웃 단위이므로(아래 ⑪ 절) 이슈가
 * *"어느 레이아웃의 테마"*를 말해야 한다. **대가:** `LintIssue.themeId`에 담기는 것이
 * 테마 행의 id가 아니라 레이아웃의 id다. 그 어긋남은 이월에 적는다.
 *
 * **ⓒ 문서를 `migrateDocument`에 지나게 한다.** payload는 저장된 문서를 **마이그레이션 없이**
 * 담는다(`payload.ts`의 D4). 안 지나게 하면 오래된 문서에서 `document-invalid`가 쏟아진다.
 *
 * **못 올리는 문서(이 wireb보다 높은 버전)를 만나도 페이지를 버리지 않는다.** 버리면 그
 * 페이지의 `target`이 목록에서 사라지고, 그것을 겨눈 **다른 페이지의 멀쩡한 링크가
 * 끊긴 것으로** 보고된다 — *"없는 결함을 말한다"*가 정확히 그것이다. 저장된 문서를 그대로
 * 넣고 `notes`가 그렇다고 말한다.
 *
 * **ⓓ 두 절의 페이지를 짝 맞춘다.** `themes[].pages`에만 있는 페이지의 문서 결함은
 * **아무도 말하지 않는다**(P9-1 이월 §4가 값과 함께 쟀다). 그래서 ⑪에 넣는 페이지는
 * `project.pages`와 **같은 목록**이다 — 걸러 넣는 최적화를 하지 않는다.
 *
 * # ⑪이 도는 조건 — 레이아웃이 하나일 때만 (P9-1 이월 §4의 선택지 둘 중 뒤)
 *
 * 규칙 ⑪(*"노드가 쓰는 `variant`를 테마가 정의하지 않음"*)은 *"이 테마로 그려지는 페이지"*를
 * 알아야 하는데 **모델에 그 연결이 없다** — 페이지는 레이아웃을 가리키지 않고(§4.3) 테마를
 * 드는 것은 레이아웃이다(§4.4).
 *
 * | 길 | 대가 |
 * |---|---|
 * | 레이아웃이 하나면 그 테마에 전 페이지를 매단다 | 둘 이상이면 **거짓 경고가 쏟아진다** |
 * | **레이아웃이 하나일 때만 돌리고 아니면 안 돈다고 말한다** | **골랐다.** 조용히 0건이 되지 않는다 |
 *
 * *"프로젝트에 레이아웃이 하나뿐"*에 기대지 않는다 — P6-1 재라 #2가 그 가정을 실측으로
 * 거짓임을 확인했다(`layouts`에 `project_id` 유니크가 없고 두 번째가 실제로 들어간다).
 * 그래서 **개수를 보고 판정하고 그 판정을 `notes`에 싣는다.**
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
import type { LintThemeEntry, LintThemePage } from '../lint/input'
import type { ProjectLintInput } from '../lint/project'
import type { SnapshotPayload } from './payload'

/**
 * 옮기는 도중에 **검사에서 빠진 것**과 그 이유.
 *
 * *"조용히 0건이 되지 않는다"*를 값으로 만드는 자리다. 소비자(`wireb lint`·MCP `validate`)는
 * 이슈 목록과 **함께** 이것을 내야 한다.
 */
export interface SnapshotLintNote {
  kind: SnapshotLintNoteKind
  /** 그 레이아웃. 레이아웃 축이 아니면 `null`. */
  layoutId: string | null
  /** 그 페이지. 페이지 축이 아니면 `null`. */
  pageId: string | null
  message: string
}

export type SnapshotLintNoteKind =
  /** 레이아웃이 테마를 안 골랐다. 테마 규칙이 그 레이아웃에서 안 돈다. */
  | 'theme-unset'
  /** 테마를 골랐는데 병합 결과가 payload에 없다(상속이 끊긴 파생). */
  | 'theme-unresolved'
  /** 레이아웃이 둘 이상이라 ⑪(variant 대조)을 돌리지 않았다. */
  | 'variant-rule-off'
  /** 이 wireb가 올릴 수 없는 문서 버전. 저장된 그대로 검사했다. */
  | 'document-version'
  /** 소속 메뉴가 payload에 없어 조상 없는 타겟을 붙였다. */
  | 'menu-detached'

/** `snapshotToLintInput`이 내는 것. **입력과 빠진 것을 함께 낸다.** */
export interface SnapshotLintPlan {
  input: ProjectLintInput
  notes: SnapshotLintNote[]
}

/**
 * payload 하나를 `lintProject`가 받는 모양으로 옮긴다.
 *
 * **`installCatalog()`는 이 함수가 부르지 않는다.** 카탈로그 설치는 프로세스 전역의 상태이고
 * (`validatePage`·`checkThemeComponents`와 같은 자리) 순수 변환 함수가 전역을 만지면 부르는
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
      // `targetedPages`가 버린 페이지다 — 소속 메뉴가 payload에 없다. **버리지 않는다**(위 ⓒ).
      target = pageTarget([], page.title)
      notes.push({
        kind: 'menu-detached',
        layoutId: null,
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

  // **⑪에 넣는 페이지는 `project.pages`와 같은 목록이다**(위 ⓓ). 마이그레이션까지 끝난
  // 문서를 그대로 다시 쓴다 — 두 절이 다른 문서를 보면 같은 페이지에 두 판정이 선다.
  const themePages: LintThemePage[] = pages.map((page) => ({ id: page.id, document: page.document }))
  const runVariantRule = payload.layouts.length <= 1
  if (!runVariantRule) {
    notes.push({
      kind: 'variant-rule-off',
      layoutId: null,
      pageId: null,
      message: `레이아웃이 ${payload.layouts.length}개라 어느 페이지가 어느 테마로 그려지는지 알 수 없습니다 — 노드 variant 대조를 돌리지 않았습니다`,
    })
  }

  const themes: LintThemeEntry[] = []
  for (const entry of payload.themes) {
    if (entry.themeId === null) {
      notes.push({
        kind: 'theme-unset',
        layoutId: entry.layoutId,
        pageId: null,
        message: `레이아웃 ${entry.layoutId}은 테마를 고르지 않았습니다 — 테마 규칙을 돌리지 않았습니다`,
      })
      continue
    }
    if (entry.theme === null) {
      notes.push({
        kind: 'theme-unresolved',
        layoutId: entry.layoutId,
        pageId: null,
        message: `레이아웃 ${entry.layoutId}의 테마(${entry.themeId})를 스냅샷이 병합된 문서로 싣지 못했습니다 — 상속이 끊긴 파생 테마입니다`,
      })
      continue
    }
    // **`id`가 `layoutId`다**(위 ⓑ).
    themes.push(
      runVariantRule
        ? { id: entry.layoutId, document: entry.theme, pages: themePages }
        : { id: entry.layoutId, document: entry.theme },
    )
  }

  return { input: { project: { menu, pages, comments }, themes, config }, notes }
}

/**
 * 저장된 문서를 지금 버전으로 올린다. **못 올리면 그대로 쓰고 말한다**(위 ⓒ).
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
      layoutId: null,
      pageId,
      message: `"${title}" 페이지의 문서를 이 버전이 올릴 수 없습니다: ${error instanceof Error ? error.message : String(error)} — 저장된 그대로 검사했습니다`,
    })
    return document
  }
}
