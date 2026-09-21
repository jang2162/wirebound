/**
 * 코멘트 라우트 — 설계 §9의 *"우측 코멘트 탭 + 캔버스 번호 마커"*의 서버 쪽이다.
 * `pageRoutes`와 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 분리하되
 * URL 네임스페이스는 공유한다(`routes/menu.ts`·`routes/revisions.ts`와 같은 관례).
 *
 * HTTP·zod 검증과 **번호 부여 규칙**만 다룬다. SQL은 `repos/comments.ts`, 문서를 실제로
 * 바꾸는 일은 `services/edit-pipeline.ts`가 한다. 권한 판정은 `projectGuard` 하나가
 * 전담한다 — 이 파일이 역할을 비교하는 자리는 **작성자 판정 하나뿐**이고 그것은
 * 역할이 아니라 소유권이다(아래 재라 #2).
 *
 * ---
 *
 * ## D1 — 번호는 문서가 들고 본문은 표가 든다
 *
 * §4.3: `"marker": 2, // 우측 코멘트 번호 (없으면 코멘트 없음)`. 문서만 봐도 마커를
 * 그릴 수 있어야 내보낸 HTML 번들(§11.3)이 그것을 그린다. 본문·작성자·시각은
 * `comments` 표다 — 문서에 넣으면 코멘트 한 줄이 revision을 만들고 undo 스택에 섞인다.
 *
 * **§11.2의 `comments: [{ marker, nodeId, body }]`와 함께 참이려면 같은 노드의 코멘트가
 * 같은 번호를 공유해야 한다**(D3). 그래서 번호는 *"이 노드에 말이 붙어 있다"*는 표시이고
 * 스레드가 그 아래 쌓인다.
 *
 * ## D2 — 번호 부여가 편집 파이프라인을 지난다 (이 슬라이스의 핵심 결정)
 *
 * `marker`는 페이지 문서의 일부다. 파이프라인 밖에서 바꾸면 셋이 깨진다:
 * revision이 안 남아 undo가 못 되돌리고(§7.3), P3의 WS가 그 변화를 안 알리고,
 * `head_seq`가 안 올라 **그 뒤 편집의 `baseSeq`가 틀어진다.** 그래서 `POST`·`DELETE`·
 * `renumber` 셋이 `applyEdit`을 부른다.
 *
 * **대가 1 — 코멘트를 달았을 뿐인데 undo가 그것을 되돌린다. 그래도 옳다.**
 * 번호는 문서의 값이므로 그것을 바꾼 사람의 이력에 남는 것이 §7.3과 일관된다. 대가의
 * 모양을 정확히 적으면 이렇다: undo가 `remove /…/marker`를 적용하면 **번호는 사라지고
 * 코멘트 행은 남는다**(재라 #6의 반대쪽 상태). 빠져나오는 길이 있다 — 그 노드에 코멘트를
 * 하나 더 달면 아래 규칙이 *"번호가 없으니 새로 준다"*로 번호를 되살린다.
 * **재번호(D4)로는 못 되살린다** — 그쪽은 번호가 **있는** 노드만 다시 매기기 때문이다.
 * 반대쪽(파이프라인을 안 타는 판)의 대가는 *"다음 편집이 전부 409"*라 성질이 다르다 —
 * 하나는 눈에 보이고 되돌릴 수 있는 어긋남이고, 하나는 편집 자체가 멈추는 고장이다.
 *
 * **대가 2 — `baseSeq`를 누가 주는가(재라 #1). 서버가 읽는다. 다만 잠그기 *전*에 읽는다.**
 *
 * 계획서는 *"서버가 읽으면 그 사이 남이 고쳤어도 밀어붙인다"*로 적었는데, 그것이 참인
 * 것은 **잠근 뒤에 읽을 때**다(그러면 `baseSeq === headSeq`가 항상 참이라 3단계가 죽는다).
 * 여기서는 요청이 도착한 시점에 `findPageById`로 읽어 그 값을 `baseSeq`로 넘기므로,
 * 그 사이 다른 편집이 커밋되면 파이프라인이 `stale`을 내고 **409가 나간다.**
 * `PUT .../schema`가 같은 모양이고(그 라우트의 주석에 경합 창이 적혀 있다), 재시도 루프를
 * 넣지 않는 것도 같다.
 *
 * **클라이언트가 주게 하지 않는 이유:** 클라이언트의 `baseSeq`는 *"내 낙관적 문서가 어느
 * revision 위에 서 있는가"*인데, 코멘트는 낙관적으로 앞서지 않는다 — 번호 값도 노드
 * 경로도 **서버가 자기 문서에서** 계산한다. 클라이언트가 주면 코멘트와 무관한 이유
 * (내 화면이 조금 뒤처졌다)로 코멘트가 거절된다.
 *
 * **그래도 낙관적 잠금이 필요한 이유는 번호의 유일성이다.** 없으면 서로 다른 두 노드에
 * 동시에 달린 첫 코멘트가 **둘 다 1번**을 받는다.
 *
 * ## 재라 #2 — 남의 코멘트를 고칠 수 있는가: 수정은 못 하고 삭제는 한다
 *
 * §10은 역할만 말하고 소유권을 말하지 않는다. 가른 근거는 **두 조작이 하는 일이 다르다**는
 * 것이다. 본문 수정은 남의 이름이 붙은 채로 내용이 바뀌는 것이라 **말을 지어내는 일**이
 * 된다(응답이 `authorName`을 싣는다 — 화면이 그것을 보인다). 삭제는 말을 없앨 뿐 없던
 * 말을 만들지 않는다. 그리고 D3 때문에 **삭제는 문서 위생의 일부**다 — 스레드를 정리해야
 * 번호가 사라진다. 그래서 `PATCH`는 작성자만(403), `DELETE`는 editor면 누구나다.
 *
 * ## 재라 #4 — 본문 길이 상한
 *
 * **수를 여기 적지 않는다** — 값은 `@wirebound/schema`의 `COMMENT_BODY_MAX_LENGTH` 하나이고
 * (아래 `Body`), 여기 적으면 그 상수가 바뀌는 날 이 문장만 낡는다.
 * `pages.description`과 같은 값으로 둔다(같은 결의 산문이다). 상한이 없으면 요청 하나가
 * 임의 크기의 텍스트를 실을 수 있고, §4.5의 스냅샷이 코멘트를 담게 되면(P6) 그 비용이
 * payload로 그대로 옮겨 간다. 하한은 1이다 — 빈 코멘트는 코멘트가 아니다.
 *
 * ## 재라 #5 — 하드 삭제
 *
 * 소프트 삭제를 두지 않는다. (1) D3의 *"마지막 코멘트를 지우면 번호가 사라진다"*가
 * **살아 있는 행의 수**를 세는데, 소프트면 *"마지막"*의 뜻이 두 벌(전체 행 / 산 행)이 되고
 * 둘이 갈리는 날 번호가 유령처럼 남는다. (2) 지운 코멘트를 보는 화면이 설계에 없다.
 * (3) 복원의 근거는 §4.5의 스냅샷이다 — 스냅샷을 뜬 시점의 payload가 그 코멘트를 담고
 * 있으므로 복원 경로는 이미 있다(그것을 만드는 것은 P6이다).
 *
 * ## 쓰기 셋이 지키는 트랜잭션 규칙 둘 (리뷰 B5·B3이 찾았다)
 *
 * **규칙 1 — 파이프라인이 실패하면 던진다. `return`하지 않는다.**
 *
 * `withTransaction`의 콜백이 **정상 종료하면 그 구간은 커밋된다**(`db/tx.ts`). 그래서
 * 실패를 `return`으로 내보내면 그 앞에서 이미 쓴 것이 **그대로 남는다.** `DELETE`가
 * 정확히 그랬다: 행을 먼저 지우고 `applyEdit` 실패를 `return`했더니 **409를 받았는데
 * 코멘트가 사라져 있었다**(리뷰 B5가 실측). *"실패했다고 말하는데 조작은 일어났다"* —
 * 이 저장소가 반복해 겪은 부류를 트랜잭션 층에서 다시 만난 것이다(P4c-3 이월 2번).
 *
 * **`POST`는 순서가 반대라 우연히 안전했다** — 삽입이 `applyEdit` **뒤**에 있어 실패
 * 시점에 쓴 것이 없었다. **그 순서에 기대지 않는다.** 셋 다 던지게 두면 *"순서가
 * 계약"*이 아니게 되고, 다음 사람이 순서를 뒤집어도 이 결함이 다시 나지 않는다.
 * (그래서 `POST`의 던지기는 **오늘 0 사망**이다 — 그 자리의 순서가 아직 지키고 있다.)
 *
 * **규칙 2 — 쓰기는 페이지를 먼저 잠그고, 잠그기 전에 읽은 `head_seq`가 아직 유효한지 본다.**
 *
 * `applyEdit`이 이미 `lockPageForEdit`을 갖고 있지만(그것이 D2가 성립한 이유다) **문서를
 * 안 바꾸는 갈래는 그 잠금을 지나지 않는다** — 그 갈래가 *"이 노드에 코멘트가 몇 개
 * 남았나"*를 세어 번호를 지울지 정하므로, 잠금 없이는 두 요청이 같은 답을 본다.
 * 리뷰 B3이 실측한 것: **같은 노드의 마지막 둘을 동시에 지우면 둘 다 *"마지막이 아니다"*로
 * 판정해 고아 번호가 남는다.**
 *
 * 그래서 `lockAndCheck`가 (1) 페이지 행을 `FOR UPDATE`로 잠가 **그 페이지의 코멘트 쓰기를
 * 직렬화**하고 (2) 잠근 뒤의 `head_seq`가 요청 시작에 읽은 값과 같은지 본다. 다르면
 * `stale`이다 — **문서를 안 바꾸는 갈래에도 낙관적 잠금을 적용하는 것이 요점이다.**
 * 없으면 이런 일이 난다: 남이 마지막 코멘트를 지워 번호를 없앤 직후에 내 `POST`가
 * *"번호가 이미 있으니 그대로 쓴다"*로 판단해 **번호 없는 코멘트**를 만든다.
 *
 * **비용은 쓰기 하나당 `SELECT … FOR UPDATE` 한 문장이다.** 코멘트 쓰기는 사람이 타이핑하는
 * 속도로 일어나므로 재지 않았다 — 재야 할 만큼 잦은 경로가 아니다.
 *
 * **`baseSeq`는 여전히 잠그기 *전*에 읽는다**(재라 #1). 잠근 뒤의 값을 쓰면 비교가 항상
 * 참이 되어 낙관적 잠금이 죽는다 — 잠금은 **직렬화**를 위한 것이고 `baseSeq`는 **충돌
 * 감지**를 위한 것이라 둘의 시점이 달라야 한다.
 *
 * ## 재라 #6 — 번호는 있는데 코멘트 행이 없는 노드
 *
 * **문서가 진실이다(D1).** 캔버스는 그 노드에 번호를 그리고, 코멘트 탭에는 그 번호 아래
 * 아무것도 없다. 흉내 내지 않는다 — 화면이 문서를 고쳐 주지도, 없는 행을 만들어 내지도
 * 않는다. 도달 경로 셋: 위 대가 1의 undo, JSON 가져오기(§11.2, P7), 사람이 `marker`를
 * 직접 편집하는 경우. **반대쪽(행은 있는데 노드가 문서에 없다)도 실재한다** — 코멘트가
 * 달린 노드를 지우면 그 행이 남는다(`node_id`에 FK가 없다 — 0008의 주석). 그 행은 GET에
 * 그대로 실려 나가고 화면이 *"사라진 노드"* 무리로 묶는다.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_BODY_MIN_LENGTH,
  findNodePath,
  migrateDocument,
  walkNodes,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
  type WbNode,
} from '@wirebound/schema'
import { requestActor, requestEventActor } from '../auth/actor'
import { projectGuard } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { badRequest, conflict, forbidden, notFound, unauthenticated } from '../errors'
import { editOutcomeToApiError } from '../http/edit-outcome'
import { parseBody, parseParams } from '../http/parse'
import {
  CommentNulByteError,
  countNodeComments,
  deleteComment,
  findCommentById,
  findCommentByIdempotencyKey,
  insertComment,
  listComments,
  updateCommentBody,
  type CommentRecord,
} from '../repos/comments'
import { findPageById, lockPageForEdit } from '../repos/pages'
import { applyEdit, type EditOutcome } from '../services/edit-pipeline'
import { notifyPageChanged, originConnectionId } from '../ws/notify'

/**
 * 파이프라인 실패를 **트랜잭션 밖으로 던져** 그 구간을 되돌린다(머리말의 규칙 1).
 *
 * **`return`이 아니라 예외인 것이 요점이다.** `withTransaction`의 콜백이 정상 종료하면
 * 그 구간은 커밋되므로, 실패를 값으로 내보내면 그 앞에서 쓴 것이 남는다 —
 * 리뷰 B5가 `DELETE`에서 실측한 결함이 정확히 그것이다.
 *
 * `edit-pipeline.ts`가 실패를 **값**으로 돌려주는 것과 어긋나지 않는다: 그쪽이 값으로
 * 두는 이유는 *"호출자가 두 경로를 모두 다루지 않게"*이고, 여기서 던지는 이유는
 * *"트랜잭션을 되돌리기 위해서"*다. 잡는 자리가 바로 아래 한 줄이라 두 경로가 되지 않는다.
 */
class EditRollback extends Error {
  readonly outcome: Extract<EditOutcome, { ok: false }>

  constructor(outcome: Extract<EditOutcome, { ok: false }>) {
    super(`편집 파이프라인이 실패했습니다: ${outcome.reason}`)
    this.name = 'EditRollback'
    this.outcome = outcome
  }
}

/**
 * 문서를 안 바꾼 갈래가 쓰는 빈 경고. **참조를 고정한다** — 매번 새 배열을 만들 이유가 없다.
 */
const NO_WARNINGS: ValidationIssue[] = []

/**
 * 코멘트 경로가 만든 **문서 변화**를 룸에 알린다(P3-1 D3·D4).
 *
 * **셋이 이것만 쓴다.** 세 자리가 각자 `notifyPageChanged`를 부르면 한 자리가 인자를 다르게
 * 조립해도 아무도 모른다 — `runWrite`를 하나로 둔 것과 같은 이유다.
 *
 * **`markerOps`가 비면 아무것도 안 보낸다.** 그때는 revision도 안 쌓였고 문서도 그대로라,
 * 프레임을 보내면 받는 쪽이 *"뭔가 바뀌었다"*로 읽고 헛일을 한다.
 *
 * **호출 자리가 트랜잭션 밖이어야 한다** — `runWrite`가 반환한 **뒤**다. 안에서 부르면 받는
 * 쪽이 그 프레임을 보고 다시 읽었을 때 아직 커밋되지 않은 것을 읽는다.
 *
 * 사실 4(P5-1 이월)가 *"번호는 실시간이고 본문은 아니다가 반만 관측된다"*고 적은 자리가
 * 여기다 — **번호는 문서에 살므로 문서 브로드캐스트가 그것을 나른다.** 코멘트 행 자체
 * (본문·작성자)는 이 슬라이스가 알리지 않는다(D4).
 */
function notifyMarkerChange(
  app: FastifyInstance,
  request: FastifyRequest,
  projectId: string,
  pageId: string,
  result: { seq: number; markerOps: PatchOp[]; warnings: ValidationIssue[] },
): void {
  if (result.markerOps.length === 0) return
  notifyPageChanged(app, {
    projectId,
    pageId,
    seq: result.seq,
    ops: result.markerOps,
    warnings: result.warnings,
    // **actor는 요청이 정한다**(P9-5 D1). 앞 판은 사람 이름을 인자로 받았는데, 그러면
    // 에이전트가 단 코멘트의 프레임이 사람이 단 것과 구별되지 않는다.
    actor: requestEventActor(request),
    originConnectionId: originConnectionId(request),
  })
}

/**
 * `withTransaction`을 돌리되 `EditRollback`을 HTTP 에러로 옮긴다. **쓰기 셋이 이것만 쓴다** —
 * `try/catch`를 자리마다 쓰면 한 자리가 빠졌을 때 500이 나간다.
 */
async function runWrite<T>(
  db: DbHandle,
  baseSeq: number,
  fn: (trx: DbHandle) => Promise<T>,
): Promise<T> {
  try {
    return await withTransaction(db, fn)
  } catch (error) {
    if (error instanceof EditRollback) throw editOutcomeToApiError(error.outcome, baseSeq)
    throw error
  }
}

/**
 * 페이지를 잠그고 **잠그기 전에 읽은 `baseSeq`가 아직 유효한지** 본다(머리말의 규칙 2).
 *
 * 잠금은 그 페이지의 코멘트 쓰기를 **직렬화**한다 — 문서를 안 바꾸는 갈래(코멘트 수를
 * 세어 번호를 지울지 정하는 자리)가 그 잠금을 안 지나면 두 요청이 같은 답을 본다.
 *
 * 실패를 **던진다** — 이 함수를 부르는 자리는 전부 이미 트랜잭션 안이고, 그 구간에서
 * 쓴 것이 있으면 되돌려야 하기 때문이다(규칙 1과 같은 근거).
 */
async function lockAndCheck(
  trx: DbHandle,
  projectId: string,
  pageId: string,
  baseSeq: number,
): Promise<void> {
  const locked = await lockPageForEdit(trx, projectId, pageId)
  if (locked === null) throw new EditRollback({ ok: false, reason: 'not-found' })
  if (locked.headSeq !== baseSeq) {
    throw new EditRollback({ ok: false, reason: 'stale', headSeq: locked.headSeq })
  }
}

const PageParams = z.object({ projectId: z.uuid(), pageId: z.uuid() })
const CommentParams = z.object({ projectId: z.uuid(), pageId: z.uuid(), commentId: z.uuid() })

/**
 * 코멘트 본문. 상한 근거는 머리말의 재라 #4에 있다.
 *
 * **경계를 `@wirebound/schema`에서 가져온다(P7-3 리뷰가 잡았다).** §11.2의 봉투가 같은
 * 상한을 걸어야 하는데(가져오기가 이 라우트를 지나지 않으므로 — P7-3 재라 #7), 앞 판은
 * 그쪽에 상수를 두고 **여기는 `2000`을 그대로 박아** 값이 두 자리였다. 실측: 봉투의
 * 상수를 3000으로 바꿔도 이 파일의 케이스가 전부 통과했다.
 *
 * **이 라우트가 `schema`를 참조하는 것이 방향에 맞는다** — `apps/api`는 이미 그 패키지에
 * 의존하고(반대는 금지다), 봉투는 브라우저에서도 도는 순수 층이라 **웹의 미리보기와
 * 서버가 같은 값을 본다.** 값이 한 자리라는 것은 아래 두 문장이 아니라
 * `comments.test.ts`의 경계 케이스가 지킨다(그 케이스가 숫자를 박지 않고 상수에서 만든다).
 *
 * **`node_id`에 형식 제약을 걸지 않는다.** 노드 id의 진짜 관문은 *"이 문서에 그 노드가
 * 있는가"*이고 아래 핸들러가 그것을 본다 — 패턴을 여기 한 번 더 적으면
 * `@wirebound/schema`의 `NODE_ID_PATTERN`과 갈릴 자리가 생기고, 갈려도 결과가 같아
 * (둘 다 거절) 아무도 모른다.
 */
const Body = z
  .string()
  .min(COMMENT_BODY_MIN_LENGTH, '코멘트를 입력하세요')
  .max(COMMENT_BODY_MAX_LENGTH, `코멘트는 ${COMMENT_BODY_MAX_LENGTH}자 이하여야 합니다`)

/**
 * 게시의 멱등 키(`0012-comment-idempotency-key`). **클라이언트가 짓는다** — 웹은 초안을 처음
 * 보낼 때 `crypto.randomUUID()`로 짓고 그 초안이 성공할 때까지 같은 키를 싣는다
 * (`apps/web/src/panels/comment-panel.tsx`의 `POST_KEYS`).
 *
 * **글자를 좁힌다** — `PATCH .../ops`의 `clientOpId`(`http/patch-ops.ts`)는 길이만 보는데, 이
 * 키는 **컬럼에 저장된다.** 아무 문자열이나 받으면 NUL 이 Postgres 에서 500 이 되는 길을 하나
 * 더 연다(`routes/pages.ts`의 NUL 절이 적은 부류). uuid 와 흔한 키 형식이 다 들어가는 영숫자·
 * `-`·`_` 1~64자로 두면 그 길이 봉투에서 400 으로 끝난다.
 */
const IdempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, '멱등 키는 영숫자·`-`·`_` 1~64자여야 합니다')

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(이 저장소의 관례). */
const CreateCommentBody = z.strictObject({
  nodeId: z.string().min(1),
  body: Body,
  idempotencyKey: IdempotencyKey.optional(),
})

/**
 * 키가 `body` 하나라 `.refine(빈 본문 금지)`를 걸지 않는다 — 그 키가 없는 것은
 * *"바꿀 값이 없다"*가 아니라 **본문이 없는 것**이고, zod가 그것을 이미 400으로 낸다
 * (`routes/themes.ts`의 `ThemeBody`와 같은 자리).
 */
const UpdateCommentBody = z.strictObject({ body: Body })

/** API 계약이 노출하는 필드만 담는다 — `pageId`는 응답에 싣지 않는다(경로에 이미 있다). */
/**
 * **같은 키로 이미 달린 게시에 답한다 — 앞 행을 그대로 돌려준다.** 새 행도, 새 번호도,
 * revision 도 없다(번호가 두 번 오르면 안 된다). 그래서:
 *
 * - `markerOps`는 **빈 배열**이고 `seq`는 **지금의** `head_seq`다 — 이 요청이 문서에 낸 변화가
 *   없다. 웹의 `applyMarkerChange`는 빈 `markerOps`면 아무것도 안 건드린다(`headSeq`도).
 * - `marker`는 그 노드의 **지금** 번호다. 그 사이 노드가 지워졌거나 번호가 사라졌으면 `null`이다 —
 *   게시는 있는데 번호가 없는 상태를 지어낸 번호로 덮지 않는다.
 * - 상태는 **200**이다(새로 만든 것이 없다). 201 은 이 요청이 행을 만들었을 때만이다.
 *
 * **같은 키에 다른 글(노드·본문)이 오면 409다.** 웹은 초안을 고치면 새 키를 짓는다(키가 초안의
 * **그 글**에 매인다 — `comment-panel.tsx`의 `POST_KEYS`) — 그러니 이 갈래는 클라이언트의 잘못이다.
 * 앞 행을 돌려주면 새 글이 **조용히 버려지고**, 새 행을 만들면 한 키 아래 게시가 둘이 되어
 * 키가 멱등이 아니게 된다. 둘 다 사용자가 모르는 채 일어나므로 실패로 말한다.
 */
function replayOf(
  existing: CommentRecord,
  request: { nodeId: string; body: string },
  document: PageDocument,
  headSeq: number,
) {
  if (existing.nodeId !== request.nodeId || existing.body !== request.body) {
    throw conflict('같은 멱등 키로 다른 코멘트가 이미 달렸습니다')
  }
  const marker = nodeAt(document, existing.nodeId)?.marker
  return {
    comment: toResponse(existing),
    marker: typeof marker === 'number' ? marker : null,
    seq: headSeq,
    markerOps: [] as PatchOp[],
  }
}

function toResponse(comment: CommentRecord) {
  return {
    id: comment.id,
    nodeId: comment.nodeId,
    body: comment.body,
    authorId: comment.authorId,
    authorName: comment.authorName,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
}

/**
 * 문서에서 쓰이고 있는 가장 큰 번호 + 1. 하나도 없으면 1이다(§9: 번호는 1부터).
 *
 * **최댓값 + 1이지 개수 + 1이 아니다.** 개수로 매기면 3번만 지운 뒤 새 코멘트가 3번을
 * 다시 받아 **옛 번호를 가리키던 말이 다른 노드를 가리키게 된다.** 번호를 촘촘하게
 * 만드는 일은 사용자가 명시적으로 누르는 재번호(D4)의 몫이다.
 *
 * `marker`가 정수가 아닌 값인 노드는 세지 않는다 — 봉투 검증(`z.int().positive()`)이
 * 막으므로 정상 경로에는 없지만, 여기서 `NaN`이 최댓값이 되면 그 뒤 모든 번호가 `NaN`이 된다.
 */
function nextMarker(document: PageDocument): number {
  let max = 0
  for (const visit of walkNodes(document.root)) {
    const marker = visit.node.marker
    if (typeof marker === 'number' && Number.isInteger(marker) && marker > max) {
      max = marker
    }
  }
  return max + 1
}

/**
 * 그 노드의 번호를 `marker`로 놓는 op. 이미 그 값이면 빈 배열이다.
 *
 * **`add`와 `replace`가 갈리는 이유는 `applyOps`가 그렇게 던지기 때문이다** —
 * 없는 키를 `replace`하면 `바꿀 키가 없습니다`로 던진다(`apps/web/src/edit/ops.ts`의
 * `variantOps`가 같은 자리에서 같은 표를 들고 있다).
 */
function setMarkerOps(node: WbNode, nodePath: string, marker: number): PatchOp[] {
  const path = `${nodePath}/marker`
  if (!Object.hasOwn(node, 'marker')) return [{ op: 'add', path, value: marker }]
  if (node.marker === marker) return []
  return [{ op: 'replace', path, value: marker }]
}

/** 그 노드의 번호를 지우는 op. 번호가 없으면 빈 배열이다(`remove`는 없는 키에서 던진다). */
function clearMarkerOps(node: WbNode, nodePath: string): PatchOp[] {
  return Object.hasOwn(node, 'marker') ? [{ op: 'remove', path: `${nodePath}/marker` }] : []
}

/**
 * **D4 — 문서 순서대로 재번호.** 전위 순회하며 `marker`가 있는 노드에 1부터 다시 매긴다.
 *
 * **여러 노드를 한 patch로 바꾼다.** 노드마다 따로 부르면 중간 상태에 번호가 겹치고
 * (2번을 1번으로 바꾼 순간 1번이 둘이다), revision도 노드 수만큼 쌓여 undo가 한 번의
 * 재번호를 여러 번 눌러야 되돌리게 된다.
 *
 * **표는 안 건드린다.** 코멘트 행은 `nodeId`로만 매여 있어 번호를 모른다(D1) —
 * 번호가 바뀌어도 어느 코멘트가 어느 노드에 붙었는지는 그대로다.
 *
 * **번호가 없는 노드에 새로 주지 않는다.** *"코멘트가 있는데 번호가 없는 노드"*(대가 1의
 * undo가 만드는 상태)를 여기서 채우려면 이 함수가 표를 읽어야 하고, 그러면 같은 버튼이
 * 가져온 문서(§11.2, 표가 아직 없다)와 편집 중인 문서에서 다르게 동작한다.
 */
function renumberOps(document: PageDocument): PatchOp[] {
  const ops: PatchOp[] = []
  let next = 1

  for (const visit of walkNodes(document.root)) {
    if (!Object.hasOwn(visit.node, 'marker')) continue
    if (visit.node.marker !== next) {
      ops.push({ op: 'replace', path: `${visit.path}/marker`, value: next })
    }
    next += 1
  }

  return ops
}

/** `app.ts`가 `app.register(commentRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function commentRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 그 페이지의 코멘트 전부(설계 §9의 목록이 **전부**를 보인다 — 재라 #3).
     * 정렬은 저장소의 계약이다(`created_at` 오름차순). 번호 순으로 묶는 것은 문서를
     * 든 화면의 일이다 — 이 표는 번호를 모른다(D1).
     */
    app.get('/:projectId/pages/:pageId/comments', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)

      // **페이지 존재를 먼저 확인한다.** `comments`에는 `project_id`가 없어 `page_id`만으로
      // 좁히므로, 이 확인이 없으면 남의 프로젝트 페이지 id로 그 페이지의 코멘트가 그대로
      // 나간다 — `routes/revisions.ts`가 같은 이유로 같은 확인을 한다(설계 §10).
      const page = await findPageById(app.db, projectId, pageId)
      if (!page) {
        throw notFound()
      }

      // 배열을 그대로 낸다 — `/members`·`/menu`·`/revisions`가 전부 그렇다.
      return (await listComments(app.db, pageId)).map(toResponse)
    })

    /**
     * 코멘트를 만든다. **번호가 없는 노드면 번호도 함께 부여한다**(D2·D3).
     *
     * 응답의 `markerOps`가 **이 요청이 문서에 낸 변화**다. 클라이언트는 자기 문서(낙관적
     * 편집이 이미 얹혀 있을 수 있다)에 같은 ops를 적용하고 `headSeq`를 `seq`로 맞춘다 —
     * 문서를 통째로 돌려주면 아직 보내지 않은 낙관적 편집이 화면에서 사라진다.
     * 문서가 안 바뀐 경우(이미 번호가 있는 노드)에는 빈 배열이고 `seq`는 그대로다.
     *
     * **`idempotencyKey`가 있으면 같은 게시를 두 번 커밋하지 않는다** — 같은 (페이지, 작성자, 키)로
     * 이미 달렸으면 앞 행을 200 으로 돌려준다(`replayOf`, `0012-comment-idempotency-key`).
     */
    app.post('/:projectId/pages/:pageId/comments', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      const body = parseBody(CreateCommentBody, request.body)

      // **NUL을 잠그기 전에 끊는다.** `repos/comments.ts`도 같은 검사를 하지만(마지막
      // 방벽), 여기서 걸러야 이 요청이 페이지 잠금도 트랜잭션도 열지 않고 끝난다 —
      // `routes/pages.ts`의 `PUT .../schema` 3.5단계와 같은 판단이다.
      if (containsNulByte(body.body)) {
        throw badRequest('코멘트에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      // `projectGuard('editor')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
      // 있다. `as`로 좁히지 않고 던지는 것은 아래에서 `.id`를 **반드시** 읽기 때문이다 —
      // 가드가 빠지는 순간 `as` 버전은 미인증 요청에 `null` 역참조로 500을 낸다
      // (`routes/pages.ts`의 같은 자리와 같은 근거).
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      const { document, page } = await loadDocument(app, projectId, pageId)
      const key = body.idempotencyKey

      // **같은 키로 이미 달렸으면 앞 행을 돌려준다**(`replayOf`). **노드를 보기 전에 본다** — 첫
      // 게시 뒤 그 노드가 지워졌어도 게시는 있다. 여기서 404 를 내면 «달렸는데 안 달렸다»가 된다.
      // 잠그지 않고 본다 — 이미 커밋된 게시는 이것으로 충분하다. **아직 커밋 중인** 같은 키는 아래
      // 잠금 안에서 한 번 더 본다.
      if (key !== undefined) {
        const existing = await findCommentByIdempotencyKey(app.db, pageId, currentUser.id, key)
        if (existing !== null) {
          reply.code(200)
          return replayOf(existing, body, document, page.headSeq)
        }
      }

      const nodePath = findNodePath(document.root, body.nodeId)
      const node = nodePath === undefined ? undefined : nodeAt(document, body.nodeId)
      if (nodePath === undefined || node === undefined) {
        // 페이지가 없는 것과 같은 404다 — 둘 다 *"가리킨 것이 없다"*이고, 코멘트를 달
        // 대상이 없다는 점에서 사용자가 할 일도 같다(다시 고른다).
        throw notFound('그 노드가 이 페이지에 없습니다')
      }

      const marker = node.marker ?? nextMarker(document)
      const ops = setMarkerOps(node, nodePath, marker)

      // **문서 변경과 행 삽입이 한 트랜잭션 안에서 일어난다.** `withTransaction`은 이미
      // 트랜잭션 안이면 SAVEPOINT로 감싸므로(`db/tx.ts`), 안쪽의 `applyEdit`이 여는
      // 트랜잭션은 이 구간의 세이브포인트가 된다. 나누면 *"번호는 붙었는데 코멘트가
      // 없다"*(재라 #6의 상태)가 실패 경로에서 실제로 만들어진다.
      const result = await runWrite(app.db, page.headSeq, async (trx) => {
        // **잠근다.** 그리고 **낡았는지 보기 전에** 같은 키를 한 번 더 본다 — 같은 키가 동시에
        // 왔으면 앞 요청이 방금 커밋했다. 그 요청이 번호를 붙였으면 `head_seq`가 올라 있어,
        // 순서를 바꾸면 이 요청이 재생 대신 **409(stale)** 를 받는다(같은 게시를 두 번 보낸 사람이
        // «실패»를 듣는다). 페이지 행을 잠갔으므로 같은 페이지의 게시는 여기서 한 줄로 선다.
        const locked = await lockPageForEdit(trx, projectId, pageId)
        if (locked === null) throw new EditRollback({ ok: false, reason: 'not-found' })
        if (key !== undefined) {
          const existing = await findCommentByIdempotencyKey(trx, pageId, currentUser.id, key)
          if (existing !== null) return { replay: replayOf(existing, body, migrateDocument(locked.schema), locked.headSeq) }
        }
        // **그 사이 문서가 바뀌지 않았는지 본다**(규칙 2 — `lockAndCheck`와 같은 판정). `ops`가
        // 비어도 지난다 — 남이 마지막 코멘트를 지워 번호를 없앤 직후라면 아래 *"이미 번호가
        // 있다"*는 판단이 낡은 것이고, 그대로 두면 **번호 없는 코멘트**가 만들어진다.
        if (locked.headSeq !== page.headSeq) {
          throw new EditRollback({ ok: false, reason: 'stale', headSeq: locked.headSeq })
        }

        if (ops.length === 0) {
          // 이미 번호가 있는 노드다 — 문서를 안 바꾸므로 revision도 만들지 않는다.
          // 빈 `ops`로 `applyEdit`을 부르면 **아무것도 안 바꾼 revision**이 쌓이고
          // `head_seq`가 올라, 이력이 코멘트 수만큼 부풀고 다른 클라이언트가 이유 없이
          // 재조회하게 된다.
          const comment = await insertComment(trx, {
            pageId,
            nodeId: body.nodeId,
            body: body.body,
            authorId: currentUser.id,
            ...(key === undefined ? {} : { idempotencyKey: key }),
          })
          return { comment, seq: page.headSeq, marker, markerOps: [] as PatchOp[], warnings: NO_WARNINGS }
        }

        const outcome = await applyEdit(trx, {
          projectId,
          pageId,
          baseSeq: page.headSeq,
          ops,
          actor: requestActor(request),
        })
        // **던진다 — `return`이 아니다**(규칙 1). 이 자리는 아직 아무것도 안 썼으므로
        // `return`으로도 오늘은 안전하지만(그래서 이 던지기는 **0 사망**이다), 그 안전이
        // **삽입이 아래에 있다는 순서**에만 기대고 있다. 셋이 같은 규칙을 쓰면 순서가
        // 계약이 아니게 된다 — 리뷰 B5가 `DELETE`에서 그 순서가 뒤집혔을 때를 실측했다.
        if (!outcome.ok) throw new EditRollback(outcome)

        const comment = await insertComment(trx, {
          pageId,
          nodeId: body.nodeId,
          body: body.body,
          authorId: currentUser.id,
          ...(key === undefined ? {} : { idempotencyKey: key }),
        })
        return { comment, seq: outcome.seq, marker, markerOps: ops, warnings: outcome.warnings }
      })

      // 잠금 안에서 같은 키를 찾았다 — 이 요청은 아무것도 안 바꿨다(알릴 것도 없다).
      if ('replay' in result) {
        reply.code(200)
        return result.replay
      }

      notifyMarkerChange(app, request, projectId, pageId, result)

      reply.code(201)
      return {
        comment: toResponse(result.comment),
        marker: result.marker,
        seq: result.seq,
        markerOps: result.markerOps,
      }
    })

    /**
     * 본문을 고친다. **문서를 안 바꾼다** — 번호는 노드에 매여 있고 본문 수정은 그것을
     * 건드리지 않으므로 revision도 `seq`도 없다. 그래서 응답이 코멘트 하나뿐이다
     * (*"없는 것을 흉내 내지 마라"* — `seq: 그대로`를 실으면 읽는 쪽이 그것을 변화로 읽는다).
     *
     * **작성자만 고칠 수 있다**(재라 #2). 남이면 403이다 — 프로젝트 멤버인 것은 맞고
     * 이 조작에 대한 권리가 없는 것이므로 §10의 403 자리다(404는 존재를 숨길 때다).
     */
    app.patch(
      '/:projectId/pages/:pageId/comments/:commentId',
      { preHandler: projectGuard('editor') },
      async (request) => {
        const { projectId, pageId, commentId } = parseParams(CommentParams, request.params)
        const body = parseBody(UpdateCommentBody, request.body)

        if (containsNulByte(body.body)) {
          throw badRequest('코멘트에 NUL 문자(U+0000)를 포함할 수 없습니다')
        }

        const currentUser = request.currentUser
        if (!currentUser) {
          throw unauthenticated()
        }

        const page = await findPageById(app.db, projectId, pageId)
        if (!page) {
          throw notFound()
        }

        const existing = await findCommentById(app.db, pageId, commentId)
        if (!existing) {
          throw notFound()
        }
        if (existing.authorId !== currentUser.id) {
          throw forbidden('다른 사람의 코멘트는 고칠 수 없습니다')
        }

        // 저장소도 NUL을 막으므로 던질 수 있다. 위에서 이미 걸렀지만 그 검사가 빠지는
        // 날 500이 되지 않도록 여기서 400으로 옮긴다(`routes/themes.ts`와 같은 관례).
        let updated
        try {
          updated = await updateCommentBody(app.db, pageId, commentId, body.body)
        } catch (error) {
          if (error instanceof CommentNulByteError) throw badRequest(error.message)
          throw error
        }

        if (!updated) {
          // 위에서 찾았는데 갱신에서 사라졌다면 그 사이에 지워진 것이다.
          throw notFound()
        }
        return toResponse(updated)
      },
    )

    /**
     * 코멘트를 지운다. **그 노드의 마지막 코멘트였으면 번호도 함께 지운다**(D3 — §4.3의
     * *"없으면 코멘트 없음"*).
     *
     * **204가 아니라 200이다.** 다른 `DELETE` 셋(프로젝트·메뉴·페이지)은 204인데 여기만
     * 갈리는 이유는 이 삭제가 **문서를 바꿀 수 있기** 때문이다 — 클라이언트가 자기 문서와
     * `headSeq`를 맞추려면 `markerOps`·`seq`를 받아야 하고, 204에는 그것을 실을 자리가
     * 없다. 마지막이 아니어서 문서가 안 바뀐 경우에도 같은 모양을 낸다(`markerOps: []`) —
     * 갈래마다 상태 코드가 다르면 클라이언트가 두 경로를 갖게 된다.
     */
    app.delete(
      '/:projectId/pages/:pageId/comments/:commentId',
      { preHandler: projectGuard('editor') },
      async (request) => {
        const { projectId, pageId, commentId } = parseParams(CommentParams, request.params)

        const currentUser = request.currentUser
        if (!currentUser) {
          throw unauthenticated()
        }

        const { document, page } = await loadDocument(app, projectId, pageId)

        const result = await runWrite(app.db, page.headSeq, async (trx) => {
          // **지우기 전에 잠그고 본다**(규칙 2). 두 가지를 함께 닫는다:
          //
          // - **B3** — 같은 노드의 마지막 둘을 동시에 지우면 잠금 없이는 둘 다
          //   *"마지막이 아니다"*로 판정해 **고아 번호**가 남는다. 잠그면 뒤의 요청이
          //   앞의 삭제를 보고 센다.
          // - **B5** — 앞의 요청이 번호를 지워 `head_seq`가 올랐으면 여기서 `stale`로
          //   끊긴다. **행을 지우기 전에** 끊기므로 *"409를 받았는데 코멘트가 사라져
          //   있다"*가 성립하지 않는다.
          await lockAndCheck(trx, projectId, pageId, page.headSeq)

          // **삭제와 세기가 같은 트랜잭션 안이다.** 나누면 그 사이에 들어온 새 코멘트를
          // 못 보고 번호를 지워, *"코멘트는 있는데 번호가 없는 노드"*가 만들어진다.
          const deleted = await deleteComment(trx, pageId, commentId)
          if (deleted === 'not-found') return 'not-found' as const

          const remaining = await countNodeComments(trx, pageId, deleted.nodeId)
          if (remaining > 0) {
            return { seq: page.headSeq, markerOps: [] as PatchOp[], warnings: NO_WARNINGS }
          }

          // 마지막이었다. 문서에서 그 노드를 찾아 번호를 지운다. **노드가 문서에 없을 수
          // 있다** — 코멘트가 달린 노드를 지우면 행이 남기 때문이다(머리말의 재라 #6).
          // 그때는 지울 번호도 없으므로 문서를 안 바꾼다.
          const nodePath = findNodePath(document.root, deleted.nodeId)
          const node = nodePath === undefined ? undefined : nodeAt(document, deleted.nodeId)
          const ops = nodePath !== undefined && node !== undefined ? clearMarkerOps(node, nodePath) : []
          if (ops.length === 0) {
            return { seq: page.headSeq, markerOps: [] as PatchOp[], warnings: NO_WARNINGS }
          }

          const outcome = await applyEdit(trx, {
            projectId,
            pageId,
            baseSeq: page.headSeq,
            ops,
            actor: requestActor(request),
          })
          // **던진다 — `return`이 아니다**(규칙 1). 여기가 리뷰 B5의 자리다: 위에서 행을
          // 이미 지웠으므로 `return`하면 `withTransaction`이 그 삭제를 **커밋한 채**
          // 409를 낸다.
          if (!outcome.ok) throw new EditRollback(outcome)

          return { seq: outcome.seq, markerOps: ops, warnings: outcome.warnings }
        })

        if (result === 'not-found') throw notFound()

        notifyMarkerChange(app, request, projectId, pageId, result)

        // 응답에서 `warnings`를 뺀다 — 이 라우트의 계약은 `{ seq, markerOps }`이고
        // (README의 표), 그것을 넓히는 것은 이 슬라이스가 하는 일이 아니다.
        return { seq: result.seq, markerOps: result.markerOps }
      },
    )

    /**
     * **문서 순서대로 재번호**(§9의 버튼, D4). 바꿀 것이 없으면 문서를 안 건드리고
     * `markerOps: []`를 낸다 — 눌러도 revision이 안 쌓인다.
     *
     * **경로가 `.../comments/renumber`인데 `:commentId`와 겹치지 않는다.** `renumber`에
     * 오는 메서드는 `POST`뿐이고 `:commentId` 쪽은 `PATCH`·`DELETE`뿐이라, 같은 메서드로
     * 두 패턴이 맞붙는 자리가 애초에 없다.
     */
    app.post(
      '/:projectId/pages/:pageId/comments/renumber',
      { preHandler: projectGuard('editor') },
      async (request) => {
        const { projectId, pageId } = parseParams(PageParams, request.params)

        const currentUser = request.currentUser
        if (!currentUser) {
          throw unauthenticated()
        }

        const { document, page } = await loadDocument(app, projectId, pageId)
        const ops = renumberOps(document)
        if (ops.length === 0) {
          return { seq: page.headSeq, markerOps: [] as PatchOp[] }
        }

        const outcome = await applyEdit(app.db, {
          projectId,
          pageId,
          baseSeq: page.headSeq,
          ops,
          actor: requestActor(request),
        })
        if (!outcome.ok) {
          throw editOutcomeToApiError(outcome, page.headSeq)
        }

        notifyMarkerChange(app, request, projectId, pageId, {
          seq: outcome.seq,
          markerOps: ops,
          warnings: outcome.warnings,
        })

        return { seq: outcome.seq, markerOps: ops }
      },
    )
  }
}

/**
 * 페이지와 **최신 버전으로 올린 문서**를 함께 읽는다. 없으면 404, 지원하지 않는 버전이면
 * 400이다 — `routes/pages.ts`의 GET이 같은 두 갈래를 갖고 근거도 같다.
 *
 * **파이프라인과 같은 기준으로 올려야 경로가 맞는다.** `applyEdit` 2단계가 저장된 문서를
 * `migrateDocument`에 태우므로, 여기서 안 올린 문서로 `findNodePath`를 하면 마이그레이션이
 * 트리 모양을 바꾸는 날 두 경로가 갈린다.
 *
 * **읽기와 잠금 사이에 경합 창이 있다** — 그 사이 다른 편집이 커밋되면 `applyEdit`이
 * `stale`을 내고 409가 된다(머리말의 대가 2).
 */
async function loadDocument(
  app: FastifyInstance,
  projectId: string,
  pageId: string,
): Promise<{ document: PageDocument; page: { headSeq: number } }> {
  const page = await findPageById(app.db, projectId, pageId)
  if (!page) {
    throw notFound()
  }

  try {
    return { document: migrateDocument(page.schema), page: { headSeq: page.headSeq } }
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다')
  }
}

/**
 * 문서에서 id로 노드를 찾는다.
 *
 * **`findNode`가 아니라 `walkNodes`를 직접 도는 이유는 없다** — 같은 것이다. 여기서
 * 따로 감싸는 것은 `findNodePath`와 **같은 순회를 두 번 도는 것**을 한 자리에 모아
 * 두기 위해서다(호출부가 둘 다 필요로 한다).
 */
function nodeAt(document: PageDocument, nodeId: string): WbNode | undefined {
  for (const visit of walkNodes(document.root)) {
    if (visit.node.id === nodeId) return visit.node
  }
  return undefined
}
