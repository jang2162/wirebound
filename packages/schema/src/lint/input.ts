/**
 * lint가 받는 **값**. DB도 파일도 HTTP도 모른다 (D3).
 *
 * ## 왜 값인가
 *
 * 소비자가 셋이다 — 웹·CLI·MCP(§12.4). 순수 패키지가 저장소를 알면 그 셋이 각자 다른 경로로
 * 같은 것을 읽게 되고, 자리가 하나여야 하는 판정이 셋으로 갈린다. `exportBundle`이 같은
 * 이유로 파일 시스템을 모른다.
 *
 * ## 스냅샷 payload와의 관계 (재라 #3)
 *
 * §4.5의 스냅샷 payload가 이미 **프로젝트 전체를 값으로 나르는 모양**을 갖는다
 * (`@wirebound/themes`의 `snapshot/payload.ts` — 메뉴·페이지·레이아웃·테마·코멘트).
 * **모양은 그대로 따랐고 타입은 쓰지 않았다.** 그 타입이 `PageDocument`와 `Theme`을 동시에
 * 참조하므로 `schema`가 그것을 import하면 `schema → themes` 역방향 의존이 생긴다.
 *
 * **P9-3이 그 규격을 `apps/api`에서 `themes`로 올렸고**, payload를 이 모양으로 옮기는
 * 자리도 거기 하나로 두었다(`snapshotToLintInput`). 여기의 판정은 그대로다 — `schema`는
 * payload를 모른다.
 *
 * 그래서 필드는 **lint가 실제로 읽는 것만** 둔다. `sortOrder`·`headSeq`·`schemaVersion`·
 * `createdAt`은 어느 규칙도 보지 않으므로 없다 — 넣으면 호출자가 못 채울 때 못 부른다.
 */
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
   * 이 페이지를 가리키는 §8.1의 타겟 문자열(`'page:관리자/회원/목록'`).
   *
   * **여기서 만들지 않고 받는다.** 조립 규칙(조상 메뉴 이름 + 페이지 제목)은 이미 있고
   * (`apps/api/src/services/page-target.ts`의 `pageTarget` — P8-4) **그것이 순수 함수인데
   * `apps/api`에 산다.** 같은 규칙을 여기 한 벌 더 두면 두 벌이 되고, 갈리는 날 lint가
   * **멀쩡한 링크를 끊겼다고** 말한다. 옮기는 것은 이 슬라이스 밖이다(이월).
   */
  target: string
  document: PageDocument
}

/** 코멘트 하나. **번호는 없다** — 번호는 노드가 든다(P5-1 D1). lint가 읽는 것은 자리뿐이다. */
export interface LintComment {
  pageId: string
  nodeId: string
}

/** 설계서 규칙이 보는 프로젝트 하나. */
export interface LintProject {
  menu: readonly LintMenuNode[]
  pages: readonly LintPage[]
  comments: readonly LintComment[]
}

/**
 * 설정으로 켜지는 규칙의 값 (D5).
 *
 * **출처는 `.wirebound.json`이고 그것은 P9-2다.** 여기 있는 것은 *"규칙 엔진이 설정을 인자로
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
