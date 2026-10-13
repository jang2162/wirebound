/**
 * WebSocket이 나르는 프레임의 모양. **여기가 그 계약의 단일 지점이다** — 서버가 만들고
 * `apps/web`의 수신부가 같은 이름으로 읽는다.
 *
 * `apps/web`은 이 파일을 import할 수 없다(`apps/*`는 서로 의존하지 않는다). 그래서
 * 그쪽에 같은 모양의 파서가 따로 있고, **`apps/web/test/realtime/protocol-parity.test.ts`가
 * 두 벌이 갈라지지 않는 것을 소스에서 세어 고정한다** — 그 파일이 이 파일을 `readFileSync`로
 * 읽어 `type` 리터럴을 맞대 본다. 이름을 손으로 맞추면 한쪽만 바뀐다.
 *
 * **검사는 거울을 든 쪽(`apps/web`)에 있다 — `apps/api/test/`에서 찾지 마라.**
 *
 * **`type`이 판별자다.** 새 프레임을 더할 때 `type` 없이 필드만 늘리지 마라 — 받는 쪽이
 * 모양으로 갈래를 추측하게 되고, 그 추측은 조용히 틀린다.
 */
import { MAX_OPS_PER_EDIT, NODE_ID_PATTERN, type PatchOp, type ValidationIssue } from '@wirebound/schema'
import { z } from 'zod'
import type { ProjectRole } from '../db/types'
import type { ApiErrorCode, ApiErrorIssue } from '../errors'
import { ClientOpId, OpsBody } from '../http/patch-ops'
import type { LiveLock } from '../lock/store'

/**
 * 룸에 들어와 있는 연결 하나.
 *
 * **설계서 「소프트 잠금」의 잠금은 이 목록 위에 서지 않는다.** 이 목록은
 * 회수된 연결이 pruning 직전 한 프레임 동안 남으므로, 배지를 그 위에 세우면
 * 그 창에서 **없는 사람의 이름을 그리거나** 잠금이 **이름 없이 사라진다.** 그래서 잠금
 * 프레임이 `userName`을 직접 나른다(`LiveLock`) — 화면은 이 목록을 아예 안 본다
 * (`apps/web/src/realtime/use-realtime.ts`의 표가 그렇게 적혀 있다).
 *
 * **그래서 이 목록을 그리는 화면은 없다.** *"지금 이 페이지를 누가 보고 있다"*를 그리는
 * 화면이 생기면 그것이 첫 소비자다.
 */
export interface Participant {
  connectionId: string
  userId: string
  userName: string
}

/**
 * 변경을 일으킨 사람. `revisions.actor_*`와 같은 값이다(설계서 「LLM 편집 경로」의 `mcp` 표시가 이 자리를 쓴다).
 *
 * **`RevisionActorType`과 같은 셋이다.** `wireb`도 자기 종류를 말하므로
 * `'cli'`가 실제로 이 자리에 온다 — 좁게 두면 CLI가
 * 낸 편집의 프레임이 컴파일에서 막힌다.
 *
 * **웹의 거울은 `type: string`이라 여기를 넓혀도 안 갈린다**(`apps/web/src/realtime/protocol.ts`). `protocol-parity.test.ts`는 `ServerFrame` 선언 안만 세므로 이 선언을 안 본다.
 */
export interface EventActor {
  type: 'user' | 'mcp' | 'cli'
  label: string
}

/**
 * 서버 → 클라이언트.
 *
 * | `type` | 언제 |
 * |---|---|
 * | `joined` | 핸드셰이크 직후, **그 연결에게만**. 자기 `connectionId`를 여기서 처음 안다 |
 * | `presence` | 누가 들어오거나 나갈 때, **룸 전체에** |
 * | `page-changed` | `applyEdit`이 성공했을 때 |
 * | `restored` | 스냅샷 복원이 성공했을 때 |
 * | `page-stale` | 답을 잃은 편집 · 게시의 COMMIT 이 확인 한도를 넘겨 **늦게** 커밋됐을 때, **룸 전체에**(낸 연결도) — 번호 프레임이 아니다. 그 revision 의 `seq` 를 **힌트로만** 싣는다(있을 때) |
 * | `pong` | `ping`에 대한 답. 클라이언트가 연결이 살아 있는지 재는 유일한 수단이다 |
 * | `patch-ack` | **낸 사람에게만.** `patch` 프레임이 성공했다(설계서 「정방향 흐름」의 *"[본인] ack(seq) 수신"*) |
 * | `patch-error` | **낸 사람에게만.** `patch` 프레임이 실패했다 |
 * | `locks` | 잠금 목록이 바뀌었을 때(그리고 누가 들어올 때), **룸 전체에** — 설계서 「소프트 잠금」 |
 * | `lock-denied` | **낸 사람에게만.** `lock` 프레임의 노드 가운데 받지 않은 것이 있다 — 겹치는 자리를 남이 쥐고 있다(`ws/lock.ts`) |
 * | `membership-changed` | 그 사람의 역할이 바뀌었거나 멤버에서 빠졌을 때, **그 사람의 연결에만**(`ws/notify.ts`) |
 * | `theme-changed` | 프로젝트의 테마 바인딩 · 토큰이 저장됐거나 판 3 스냅샷이 복원됐을 때, **룸 전체에**(낸 연결도) |
 */
export type ServerFrame =
  | { type: 'joined'; projectId: string; connectionId: string; userId: string; role: ProjectRole }
  | { type: 'presence'; projectId: string; participants: Participant[] }
  | {
      type: 'locks'
      projectId: string
      /**
       * **프로젝트의 살아 있는 잠금 전부다** — 바뀐 것만이 아니다. 받는 쪽은 자기가 연
       * 페이지의 것만 걸러 쓴다(`page-changed`가 `pageId`로 걸러지는 것과 같다).
       *
       * **전부를 싣는 것이 판정이다.** 증분으로 보내면 받는 쪽이 목록을 스스로 쌓아야 하고,
       * 프레임 하나를 놓치면 그 목록이 **조용히** 틀린 채 남는다 — 잠금은 30초면 만료되는데
       * 화면의 배지는 영영 남는다. 전부를 실으면 **다음 프레임이 언제나 그것을 고친다.**
       * 크기는 룸의 연결 수 × 연결의 집합 상한(`MAX_OPS_PER_EDIT`)으로 묶여 있다.
       *
       * **낸 사람도 받는다.** 자기 잠금이 실제로 섰다는 것을 아는 수단이 이 목록뿐이다
       * (잠금 프레임은 답을 짝지어 기다리지 않는다).
       */
      locks: LiveLock[]
    }
  /**
   * **그 `lock`의 `nodeIds` 가운데 이것들을 받지 않았다** — 실린 노드만 안 쥔다. 겹치는 서브트리를 다른 사람이 쥐고 있으면
   * 그 노드만 실리고 **나머지(새로 받은 것 · 앞서 쥔 것 가운데 집합에 남은 것)는 쥔다.** 자격을 보는 사이 멤버십이 바뀌었거나
   * 끝내지 못했으면(`ws/lock.ts`의 표) 프레임의 노드 전부가 실리고 이 연결은 아무것도 안 쥔다. 어느 판이든 **집합에서 빠진 것은
   * 놓였다**(`lock/store.ts`의 «집합째 갈아 끼운다»).
   *
   * **누가 쥐었는지는 싣지 않는다.** 배지는 `locks` 목록이 그리고(그 목록은 룸 전체에 이미 흐른다), 이 프레임이 이름을 실으면
   * «누가 잡았나»의 출처가 둘이 된다. 받는 쪽은 그 자리를 «잡지 않은 선택»으로 둔다(`apps/web`의 `lock-channel.ts`).
   */
  | {
      type: 'lock-denied'
      projectId: string
      pageId: string
      /** 받지 않은 노드 — 그 프레임의 `nodeIds`에서 온 것만, 그 차례대로. 비지 않는다. */
      nodeIds: string[]
      /**
       * **거절된 그 `lock` 프레임의 `lockId`** — 실어 왔을 때만 되돌려준다. 받는 쪽은 이것으로 «내가 마지막으로 보낸
       * `lock`의 거절인가»를 가린다. 자리로만 짝지으면 같은 자리를 다시 보낸 뒤 닿은 앞 거절을 뒤 것으로 읽는다.
       */
      lockId?: number
    }
  | {
      type: 'page-changed'
      projectId: string
      pageId: string
      /** 이 변경이 만든 revision의 seq. 받는 쪽의 `headSeq`가 이 값이 된다. */
      seq: number
      /**
       * **문서 전체가 아니라 `ops`다.** 받는 쪽에는 아직 보내지 않은 낙관적 편집이 있을 수
       * 있고, 서버 문서로 갈아 끼우면 그것이 화면에서 사라진다(`editor-store.ts`의
       * `applyMarkerChange` 머리말이 같은 이유를 적어 두었다).
       */
      ops: PatchOp[]
      /**
       * 저장을 막지 않은 이슈(`edit-pipeline.ts`의 성공 결과). **반드시 싣는다** —
       * REST 응답만 경고를 나르면 사용자가 보는 것이 접속 방식에 따라 갈린다.
       */
      warnings: ValidationIssue[]
      actor: EventActor
      /**
       * **낸 사람이 붙인 id. 있을 때만 실린다**(REST 본문이나 `patch` 프레임에 있었을 때).
       *
       * **받는 쪽이 *"이건 내가 낸 것"*을 알아보는 유일한 수단이다.** 보통은 서버가 발신자를
       * 제외하므로(`broadcast.ts`의 `except`) 그럴 일이 없지만, **제외가 성립하지 않는 창이 있다:**
       * 편집이 REST로 나가는 동안(소켓이 아직 안 열려 `x-wb-connection-id`가 없다) 그 소켓이
       * 열려 룸에 들어오면, 그 뒤에 나가는 브로드캐스트를 **낸 사람이 되받는다.**
       *
       * **리베이스는 그 프레임을 바탕에 얹고 내 pending을 그 위에 다시 올리므로, 알아보지 못하면
       * 같은 편집이 두 번 들어간다** — 그리고 조용하다. 그래서 받는 쪽이 그 프레임을 알아보고 건너뛸 수 있게 이 값을 싣는다.
       *
       * **멱등 키가 아니다.** 서버는 저장하지 않고 되돌려 줄 뿐이다.
       */
      clientOpId?: string
    }
  /**
   * **그 페이지가 서버에서 바뀌었는데 그 변경의 `page-changed`는 안 온다 — 다시 읽어라.** 답을 잃은 편집 · 게시의 COMMIT 이 확인 한도
   * (`LOST_COMMIT_PROBE_MS`)를 넘겨 커밋되면 응답은 503 «모름»이고 그 revision 의 번호 프레임은 나가지 않는다 — 늦게 옛 `seq` 를 내면
   * 받는 쪽이 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다(`services/lost-commit.ts`의 표). 그래서 **번호를 안 싣는다** —
   * 받는 쪽은 얹을 것이 없고 그 페이지가 낡았다고만 안다(`apps/web`의 `EditorStore.markPageStale`).
   *
   * **`seq`는 힌트다 — 비교에만 쓴다.** 그 쓰기가 남긴 revision 의 번호이고, 번호를 모르는 쓰기(게시 — `revisionOf` 가 «모름»)는 안 싣는다. 받는 쪽은
   * `seq <= headSeq`(이미 그 revision 을 품은 판을 읽었다)면 경보를 안 세우고, 그 밖에는 지금처럼 세운다. **번호를 얹는 데 쓰지 않는다** — 이 프레임은
   * «다음 번호»가 아니라 `page-changed` 의 이음에 끼지 않는다(늦은 옛 `seq` 를 얹으면 뒤 revision 이 빠진 화면이 최신으로 선다).
   *
   * **`actor`도 안 싣는다** — 읽는 자가 없다. **낸 사람의 연결도 받는다**(`restored`와 같은 판정) — 답을 잃은 낸 탭은 서버가 썼는지
   * 모르고, 그 탭의 다시 읽기보다 커밋이 늦으면 이 신호만이 화면이 낡았다는 것을 안다. **여러 번 올 수 있다**(늦은 커밋마다 하나) — 받는
   * 쪽은 멱등이다.
   */
  | { type: 'page-stale'; projectId: string; pageId: string; seq?: number }
  | {
      type: 'restored'
      projectId: string
      snapshotId: string
      actor: EventActor
      /**
       * 그 복원이 만든 안전망 스냅샷의 id — 복원 응답의 `safetySnapshot.id`와 같다. **낸 사람이 답을 받은 자기 복원을 알아보는 수단이다** —
       * 복원의 방송은 낸 연결도 빼지 않으므로(`notify.ts`의 `notifyRestored`) 낸 탭이 늘 되받는다. 서버가 지어 복원마다 새로 나므로 겹치지
       * 않고, 남이 흉내 낼 수 없다.
       */
      safetySnapshotId: string
      /**
       * **낸 탭이 그 요청에 붙인 id. 있을 때만 실린다**(`notify.ts`의 `RESTORE_ID_HEADER`). 답을 **아직 못 받았거나 잃은** 복원의 신호를
       * 낸 탭이 알아보는 수단이다 — 답이 오기 전의 신호는 답을 볼 때까지 미루고, 답을 잃은 복원의 신호는 «복원이 서버에 반영됐다»로 읽는다.
       * 넘기는(배너를 안 세우는) 판정에는 쓰지 않는다 — 룸의 모두에게 보이는 값이라 흉내 낼 수 있다(`apps/web`의 `EditorStore.markRestored`).
       * 탭이 지은 무작위 값이라 무엇도 드러내지 않는다. **멱등 키가 아니다** — 서버는 저장하지 않는다.
       */
      clientRestoreId?: string
    }
  /**
   * **이 연결의 주인의 멤버십이 바뀌었다 — 다시 읽어라.** 역할 변경 · 제거 · owner 넘기기(역할 변경의 한 판이다)가
   * 전부 이것이다.
   *
   * **역할 값을 싣지 않는다 — 판정이다.** 웹의 역할은 `GET /projects/:id`의 응답 하나에서 온다(`apps/web`의
   * `projects/project-actions.ts` · `test/role-access.test.ts`). 여기 값을 실으면 역할의 출처가 둘이 되고, 둘이 갈리는
   * 순간(이 프레임과 그 조회가 엇갈려 온다) 어느 쪽이 맞는지를 화면이 다시 판정해야 한다. 신호만 보내면 화면은 언제나
   * 조회 하나로 수렴한다 — 제거된 사람은 그 조회가 404 다. `joined`가 싣는 `role`을 웹이 안 읽는 것과 같은 까닭이다.
   */
  | { type: 'membership-changed'; projectId: string }
  /**
   * **프로젝트의 메뉴 · 페이지 트리가 바뀌었다 — `rev` 판보다 낡은 트리는 다시 받아라.** 트리 쓰기(메뉴 · 페이지의 생성 · 이름 · 자리 ·
   * 삭제 · 연쇄 삭제 · 가져오기 · 복원)가 커밋 뒤 하나씩 보낸다(`ws/notify.ts`의 `notifyMenuChanged`).
   *
   * **트리를 싣지 않는다 — 신호다.** 받는 쪽은 `GET …/tree`로 다시 받는다(그 응답도 `rev`를 싣는다). 바뀐 것만 실으면 받는 쪽이 트리를
   * 스스로 고쳐 쌓아야 하고, 하나를 놓치면 조용히 틀린 채 남는다 — `locks`가 전부를 싣는 것과 같은 판정이되, 트리는 커서(메뉴 500 ·
   * 페이지 2000 이면 수백 KB) 방송마다 연결마다 실을 수 없다.
   *
   * **낸 사람의 연결도 받는다 · 연결 id 를 싣지 않는다** — `restored`와 같은 판정(`notify.ts`의 `notifyMenuChanged`). 낸 탭은 제 쓰기의
   * 판을 `rev`로 알아보고 넘긴다 — 서버가 지은 값이라 흉내 낼 수 없다.
   */
  | { type: 'menu-changed'; projectId: string; rev: number; actor: EventActor }
  /**
   * **프로젝트의 테마가 바뀌었다** — 바인딩(`id@version`)이나 토큰 값. 받는 캔버스는 번들이 바뀌었으면 다시 싣고, 토큰만 바뀌었으면
   * CSS 변수 · `useToken` 값만 바꾼다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「실시간」). 값을 통째로 싣는다 —
   * 토큰은 작고(상한 16 KB — `routes/project-theme.ts`) 받는 쪽이 다시 읽지 않고 바로 칠한다. 놓친 탭은 `GET /projects/:id` 의
   * `themeRev` 로 따라잡는다.
   */
  | {
      type: 'theme-changed'
      projectId: string
      themeId: string
      version: string
      /** 기본값과 다른 값만(`projects.theme_tokens` 그대로). */
      tokens: Record<string, string | number>
      /** 바뀐 뒤의 `theme_rev`. 받는 쪽은 자기가 든 값보다 크지 않으면 버린다. */
      rev: number
      actor: EventActor
    }
  | { type: 'pong' }
  | {
      type: 'patch-ack'
      projectId: string
      pageId: string
      /** 보낸 프레임의 `clientOpId`를 그대로 되돌려 준다 — 짝을 짓는 것은 이 값뿐이다. */
      clientOpId: string
      seq: number
      revisionId: string
      /**
       * 서버가 적용 직전 상태를 보고 만든 역패치(설계서 「정방향 흐름」). undo 스택이 이것을 든다 —
       * REST 응답의 같은 필드와 같은 값이고, 그래서 두 경로의 undo가 갈리지 않는다.
       */
      inverse: PatchOp[]
      /** REST 응답의 `warnings`와 같다(한쪽만 나르면 접속 방식에 따라 갈린다). */
      warnings: ValidationIssue[]
    }
  | {
      type: 'patch-error'
      projectId: string
      pageId: string
      clientOpId: string
      /**
       * **REST가 내는 것과 같은 봉투다**(`errors.ts`의 `{ code, message, issues? }` +
       * `status`). 같은 실패를 두 벌로 이름 짓지 않으려고 `http/edit-outcome.ts`의 매핑을
       * 그대로 지나온 값을 싣는다 — 받는 쪽은 접속 방식과 무관하게 한 규칙으로 읽는다.
       */
      status: number
      code: ApiErrorCode
      message: string
      issues: ApiErrorIssue[]
    }

/**
 * 클라이언트 → 서버. 하트비트(`ping`) · 편집 전송(`patch`) · 잠금(`lock`·`unlock`).
 *
 * `ping`이 있는 이유는 둘이다. 브라우저 `WebSocket`은 프로토콜 ping을 **보낼 수 없어**
 * (읽기 전용 API에 그 메서드가 없다) 클라이언트가 연결이 살아 있는지 재려면 앱 수준
 * 프레임이 필요하고, 설계서 「권한 모델」이 요구하는 *"프레임 수신 시 권한 재확인"*이 설 자리가 생긴다.
 *
 * # `patch`의 모양은 REST 본문에서 온다
 *
 * `http/patch-ops.ts`의 `OpsBody`를 **그대로 넓혀** 만든다. WebSocket 핸들러도 `applyEdit`을
 * 부르기 전에 신뢰할 수 없는 프레임을 걸러야 하는데, 그 규칙이 REST 라우트 파일 안에만 있으면
 * 복제된다(그 파일 머리말). 복제하면
 * *"REST로는 되는데 WS로는 안 되는"* 입력이 생기고, 그 어긋남은 **접속 방식에 따라 갈린다.**
 *
 * **넓히는 것은 셋뿐이다:** 판별자 `type`, REST에서는 URL이 나르던 `pageId`, 그리고
 * `clientOpId`를 **선택에서 필수로** 좁히는 것. 마지막이 갈리는 이유는 ack의 모양이다 —
 * REST의 응답은 요청과 짝이 지어져 오지만 `patch-ack`은 프레임이라 **이 값 말고는 짝지을
 * 것이 없다.**
 */
const PatchFrame = OpsBody.extend({
  type: z.literal('patch'),
  /** REST에서는 URL 파라미터였다(`routes/pages.ts`의 `PageParams`와 같은 술어다). */
  pageId: z.uuid(),
  clientOpId: ClientOpId,
})

/**
 * 이 연결의 잠금을 **이 노드 집합으로** 한다(설계서 「소프트 잠금」의 *"노드를 선택하면 그 서브트리에 잠금을 건다"* — 고른 서브트리마다
 * 하나). 집합 전부를 판정해 막힌 것을 뺀 나머지를 쥐고, 빠지는 것은 놓는다(`ws/lock.ts` — 이미 쥔 것도 다시 판정한다). **빈 집합은
 * `unlock`과 같다.**
 *
 * **`nodeId`(하나)도 받는다** — `[nodeId]`로 읽는다(옛 화면 · 에이전트). 둘 다 싣거나 둘 다 없으면 규격 위반이다. 집합의 상한은
 * `MAX_OPS_PER_EDIT`다 — 고른 것을 한 번에 지우는 묶음(노드 하나에 연산 하나)이 그 상한을 넘으면 어차피 못 보낸다. 같은 노드를 두 번
 * 실으면 한 번 쥔다.
 *
 * **같은 집합을 다시 보내는 것이 하트비트다**(「소프트 잠금」의 *"편집 중 하트비트로 갱신"*) — 갱신용
 * 프레임을 따로 두지 않는다. 두면 *"잡기"*와 *"갱신"*이 갈래 둘이 되고, 잡지 않은 것을
 * 갱신하는 갈래가 생긴다.
 *
 * **답을 짝지어 기다리지 않는다.** 성공하면 `locks` 목록이 룸 전체에 흐르고 **낸 사람도
 * 그것을 받는다** — 그것이 답이다. **받지 않았으면 낸 사람에게만 `lock-denied`가 간다**(`ws/lock.ts`).
 * `patch`처럼 `clientOpId`로 짝짓지 않는 이유: 잠금은 끊겼을 때 할 일이 편집과
 * **반대**다(서버가 알아서 놓는다). **거절만은 짝이 필요하다** — 화면이 매긴 `lockId`를 실어 오면 `lock-denied`가
 * 그것을 되돌려준다. 서버는 그 값으로 아무 판정도 안 한다(차례는 받는 순간 서버가 따로 매긴다 — `ws/routes.ts`의 `lockTurns`).
 *
 * **`nodeId`가 문서에 있는지는 여기서 안 본다.** 문서를 읽는 것은 겹침을 판정할 때뿐이고(같은 페이지에 남의 잠금이 있을
 * 때 — `lock/check.ts`의 `selectionVerdict`), 문서에 없는 노드의 잠금은 **아무것도 막지 못한다**
 * (`@wirebound/schema`의 `findLockConflict`) — 그래서 받아들이고, 30초면 사라진다.
 */
/** `@wirebound/schema`의 봉투가 노드 id에 쓰는 그 술어다 — 모양을 두 벌로 적지 않는다. */
const LockNodeId = z.string().regex(NODE_ID_PATTERN)

const LockFrame = z
  .strictObject({
    type: z.literal('lock'),
    pageId: z.uuid(),
    nodeIds: z.array(LockNodeId).max(MAX_OPS_PER_EDIT).optional(),
    nodeId: LockNodeId.optional(),
    /** 화면이 매긴 이 프레임의 차례(위). **선택이다** — 없으면 거절도 싣지 않는다(에이전트 · `lockId`를 모르는 화면). */
    lockId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .refine((frame) => (frame.nodeId === undefined) !== (frame.nodeIds === undefined), 'nodeId 와 nodeIds 가운데 하나만 싣는다')

/**
 * 잡고 있는 것을 전부 놓는다. **`pageId`도 노드도 없다** — 연결의 집합 전부를 놓으므로 가리킬 값이 필요 없고, 실으면 *"그 연결이
 * 실제로 든 것"*과 어긋날 수 있는 값이 하나 늘어난다.
 */
const UnlockFrame = z.strictObject({ type: z.literal('unlock') })

const ClientFrameSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('ping') }), PatchFrame, LockFrame, UnlockFrame])

type ParsedClientFrame = z.infer<typeof ClientFrameSchema>

/**
 * 읽은 프레임. **`lock`은 집합 하나로 읽힌 뒤다** — `nodeId`(하나)는 `[nodeId]`가 되고 중복은 걷혔다(`parseClientFrame`). 받는 쪽은
 * 갈래를 둘로 보지 않는다.
 */
export type ClientFrame =
  | Exclude<ParsedClientFrame, { type: 'lock' }>
  | { type: 'lock'; pageId: string; nodeIds: string[]; lockId?: number }

/**
 * 프레임 하나를 받으려면 지금 무슨 역할이어야 하는가. **설계서 「권한 모델」의 *"각 patch 수신 시 한 번"*이
 * 실제로 서는 자리다.**
 *
 * **`viewer`와 `editor`가 갈리는 것이 이 표의 전부다.** *"받을 자격"*(`broadcast.ts`의
 * `MIN_ROLE_TO_RECEIVE`)을 프레임 수신에도 그대로 쓰면 **WS 경로 어디에도 `editor` 판정이 없다** —
 * 그러면 「권한 모델」이 *"조회 전용 — 편집·코멘트 모두 불가"*로 못박은 viewer가 `patch`로 편집을 낸다.
 *
 * **`Record<ClientFrame['type'], ProjectRole>`인 것이 계약이다** — 프레임을 하나 더하면
 * 여기서 컴파일이 막힌다. 빠뜨린 갈래가 `undefined`로 새어 나가면 `roleAtLeast`가 무엇과
 * 비교하는지 알 수 없게 되고, 그 자리는 조용하다(`editor-store.ts`의 `STALE_RANK`가 같은
 * 이유로 같은 모양이다).
 */
export const MIN_ROLE_FOR_FRAME: Record<ClientFrame['type'], ProjectRole> = {
  ping: 'viewer',
  patch: 'editor',
  // **잠금도 `editor`다.** 뷰어는 편집을 못 하므로 잠글 것이 없고, 잠글 수 있게 두면
  // 조회 전용 사용자가 남의 편집을 막는다 — 설계서 「권한 모델」이 열어 준 것은 조회뿐이다.
  lock: 'editor',
  // **놓는 것도 `editor`다.** 뷰어가 든 잠금이 있을 수 없으므로 놓을 것도 없다.
  // **권한이 editor에서 viewer로 깎인 연결의 잠금은 이 프레임으로 놓이지 않는다** — 그 연결은 룸에
  // 남고(뷰어는 계속 받는다) 이 프레임이 거절되므로, 멤버십을 바꾼 서버가 놓는다(`ws/notify.ts`의
  // `notifyMembershipChanged` — 멤버에서 빠진 연결도 거기서 놓는다).
  unlock: 'editor',
}

/**
 * 닫을 때 쓰는 코드. 1000·1001은 표준이고 4000번대는 애플리케이션 몫이다(RFC 6455).
 *
 * **`unauthorized`와 `revoked`를 가른다.** 붙을 때부터 권한이 없던 것과 붙어 있는 동안
 * 권한이 사라진 것은 클라이언트가 할 일이 다르다 — 앞의 것은 다시 시도해도 같고, 뒤의
 * 것은 로그인 화면으로 가야 한다.
 */
export const WS_CLOSE = {
  /** 붙을 때 인증·권한이 없었다. 핸드셰이크가 HTTP 401/403/404로 끝나므로 실제로는 드물다. */
  unauthorized: 4401,
  /** 붙어 있는 동안 세션이나 멤버십이 사라졌다(설계서 「권한 모델」의 *"즉시 회수"*). */
  revoked: 4403,
  /** 읽을 수 없는 프레임을 받았다. */
  badFrame: 4400,
} as const

/**
 * 신뢰할 수 없는 문자열을 `ClientFrame`으로 읽는다. **zod로 읽는다** — 갈래가 여럿인 모양을
 * 손으로 검사하면 `http/patch-ops.ts`의 zod 규격과 두 벌이 된다.
 *
 * **모양이 어긋나면 `null`이다.** 부르는 쪽이 그것을 `WS_CLOSE.badFrame`으로 옮긴다 —
 * 읽을 수 없는 프레임은 편집 실패가 아니라 계약 위반이라 되돌려 줄 `clientOpId`조차 없다.
 *
 * **그 근거가 덮지 못하는 판이 있다.** `clientOpId`는 멀쩡한데 `ops` 하나가 규격을
 * 어긴 프레임도 같은 취급을 받는다 — REST로 같은 입력을 내면 400 봉투가 오는데 여기서는
 * **연결이 끊긴다.** 스키마는 한 벌인데 **거절의 결말**이 두 벌이다.
 *
 * **그래도 두 단계로 읽지 않는다** — *"누구에게 답할지"*만 먼저 뽑는 파서를 두면 프레임을 읽는
 * 자리가 둘이 되고, 그것이 「`patch`의 모양은 REST 본문에서 온다」가 막는 형태다. 대가는 작다: 끊긴
 * 클라이언트는 기다리던 편집을 실패로 끝내고 다시 붙으며, 다시 붙는 것 자체가 재조회 신호다. **지금 웹
 * 클라이언트는 그런 `ops`를 만들지 못한다**(로컬 `applyOps`가 먼저 막는다) — 도달하는 것은 설계서 「LLM 편집 경로」의 MCP나
 * 다른 클라이언트다.
 *
 * **잠금 프레임에도 같은 정책이다.** 근거 둘:
 *
 * 1. **두 단계로 읽지 않는다는 근거가 그대로다.** 잠금 프레임에는 `clientOpId`조차 없어
 *    *"누구에게 답할지"*를 먼저 뽑아 봐야 되돌려 줄 짝이 없다.
 * 2. **끊기는 대가가 작다.** 다시 붙으면 서버가 룸에 **지금 살아 있는 잠금
 *    전부**를 흘리므로(`ws/routes.ts`의 참가 알림) 배지가 스스로 되찾아지고, 잠금 자체는
 *    닫힘이 곧 해제라 남지 않는다(「소프트 잠금」).
 *
 * **그래도 값은 그대로다:** 잠금 프레임 하나가 규격을 어기면 **편집 채널까지 함께 끊긴다.**
 * 연결이 하나이기 때문이고, 그것이 이 정책의 대가로 남는다.
 */
export function parseClientFrame(raw: string): ClientFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = ClientFrameSchema.safeParse(value)
  if (!parsed.success) return null
  const frame = parsed.data
  if (frame.type !== 'lock') return frame
  return {
    type: 'lock',
    pageId: frame.pageId,
    nodeIds: [...new Set(frame.nodeIds ?? (frame.nodeId === undefined ? [] : [frame.nodeId]))],
    ...(frame.lockId !== undefined ? { lockId: frame.lockId } : {}),
  }
}
