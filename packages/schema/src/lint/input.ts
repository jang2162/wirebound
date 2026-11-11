/**
 * lint가 받는 **값**. DB도 파일도 HTTP도 모른다.
 *
 * ## 왜 값인가
 *
 * 소비자가 셋이다 — 웹·CLI·MCP(설계서 「lint 규칙」). 순수 패키지가 저장소를 알면 그 셋이 각자 다른 경로로
 * 같은 것을 읽게 되고, 자리가 하나여야 하는 판정이 셋으로 갈린다. `exportBundle`이 같은
 * 이유로 파일 시스템을 모른다.
 *
 * ## 스냅샷 payload와의 관계
 *
 * 설계서 「스냅샷」의 스냅샷 payload가 이미 **프로젝트 전체를 값으로 나르는 모양**을 갖는다
 * (`@wirebound/themes`의 `snapshot/payload.ts` — 메뉴·페이지·레이아웃·코멘트).
 * **모양은 그대로 따르고 타입은 쓰지 않는다.** 그 타입은 `themes` 패키지에 있어 `schema`가 그것을 import하면
 * `schema → themes` 역방향 의존이 생긴다.
 *
 * payload를 이 모양으로 옮기는 자리는 `themes` 쪽 하나다(`snapshotToLintInput`) — `schema`는
 * payload를 모른다.
 *
 * 그래서 필드는 **lint가 실제로 읽는 것만** 둔다. `sortOrder`·`headSeq`·`schemaVersion`·
 * `createdAt`은 어느 규칙도 보지 않으므로 없다 — 넣으면 호출자가 못 채울 때 못 부른다.
 */
import type { CodeTable } from '../codes'
import type { PageDocument } from '../node'

/** 메뉴 노드 하나. 트리로 접지 않고 **평평하게** 받는다 — 스냅샷 payload와 같은 모양이다. */
export interface LintMenuNode {
  id: string
  parentId: string | null
  title: string
}

export interface LintPage {
  id: string
  menuNodeId: string
  title: string
  /**
   * 이 페이지를 가리키는 설계서 「모델」(상호작용)의 타겟 문자열(`'page:관리자/회원/목록'`).
   *
   * **여기서 만들지 않고 받는다.** 조립 규칙(조상 메뉴 이름 + 페이지 제목)은 `../page-target.ts`의
   * `pageTarget`·`targetedPages` 하나가 갖고, lint 입력을 만드는 쪽(`snapshotToLintInput`)이
   * 그것으로 채운다. 같은 규칙을 여기 한 벌 더 두면 두 벌이 되고, 갈리는 날 lint가
   * **멀쩡한 링크를 끊겼다고** 말한다.
   */
  target: string
  document: PageDocument
}

/** 코멘트 하나. **번호는 없다** — 번호는 노드가 든다. lint가 읽는 것은 자리와 본문(토큰 — `comment-token-broken`)이다. */
export interface LintComment {
  pageId: string
  nodeId: string
  body: string
}

/** 설계서 규칙이 보는 프로젝트 하나. */
export interface LintProject {
  menu: readonly LintMenuNode[]
  pages: readonly LintPage[]
  comments: readonly LintComment[]
  /** 공통코드 표. 없으면 공통코드 규칙(`broken-code-ref` 등 다섯)이 안 돈다 — 표를 못 받은 소비자가 모든 참조를 «끊겼다» 고 말하지 않게. */
  codes?: CodeTable
}

/**
 * 설정으로 켜지는 규칙의 값.
 *
 * **출처는 `.wirebound.json`이다**(`packages/cli`의 `binding.ts`). 여기 있는 것은 *"규칙 엔진이 설정을 인자로
 * 받는 모양"* 하나뿐이고 **기본값은 없다** — 안 주면 그 규칙이 안 도는 것이 옳다. 기본값을
 * 두면 아무도 정하지 않은 규칙이 프로젝트마다 위반을 쏟아 낸다.
 */
export interface LintConfig {
  /** 이름이 지켜야 하는 정규식의 **원문**(`'^[가-힣 ]+$'`). 안 주면 그 축이 안 돈다. */
  naming?: {
    page?: string
    menu?: string
  }
}
