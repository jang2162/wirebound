/**
 * `PATCH .../ops` 본문의 zod 경계. 경로 제약·op 모양·ops 상한이 여기 있다.
 *
 * **라우트 파일이 아니라 `http/`에 있는 이유.** 이 서버의 원칙은 "규칙을 라우트에
 * 두면 두 진입점이 갈라진다"이고, 그래서 검증·적용·이력 기록을
 * `services/edit-pipeline.ts`의 `applyEdit` 하나로 모은다. 같은 이유가 zod 경계에도
 * 그대로 적용된다 — WebSocket 핸들러도 `applyEdit`을 부르기 전에 신뢰할 수 없는
 * 프레임을 걸러야 하는데, 그 규칙이 REST 라우트 파일 안에만 있으면 복제된다.
 * 복제하면 갈라지기 쉬운 값들이다: `ops`의 상한 200, 아래 `PatchPath` 술어, 그리고
 * **`value` 키 존재 요구**. 그 요구가 한쪽에서 빠지면 `undefined`가 문서에 심기고
 * `JSON.stringify`가 그 키를 조용히 지운다 — 서버가 ack한 편집과 저장된 문서가
 * 갈라지는 정확히 그 실패다.
 *
 * **`services/`가 아니라 `http/`인 이유.** 이것은 신뢰할 수 없는 외부 입력(HTTP 본문,
 * WS 프레임)의 모양 검사이지 도메인 로직이 아니다. `applyEdit`은 zod를 모르고
 * 이미 신뢰된 `PatchOp[]`를 받는다(`apps/api/README.md` 「계층 규칙」 절).
 */
import { z } from 'zod'

/**
 * ops의 경로 제약. `/root`이거나 `/root/`로 시작하거나, 정확히 `/version`이어야 한다.
 * `move`의 `from`도 같은 술어를 쓴다.
 *
 * **`/version`을 여는 이유.** 막아 두면 `PUT .../schema`가 만든 revision을 문서화된
 * undo 경로로 되돌릴 수 없다 — 그 경로가 파이프라인에 넘기는 ops는
 * `[replace /root, replace /version]`이고 `invertOps`가 만드는 inverse에도 `/version`이
 * 그대로 남으므로, `apps/api/README.md` 「편집 파이프라인」 절(4·5단계)이 정의한 대로 그
 * inverse를 `PATCH .../ops`로 되보내면 여기서 400으로 튕긴다. 되돌릴 수 없는 revision이 `GET .../revisions` 응답에 섞이는데
 * 응답만 봐서는 그것을 구분할 수 없다(`actorType`도 op 종류도 같다).
 *
 * **버전 변조를 막는 것은 이 술어가 아니라 파이프라인 7단계다**
 * (`after.version !== before.version`이면 `invalid` → 422). 다른 값으로 바꾸면 거기서
 * 막히고, 같은 값이면 무연산이므로 PUT의 inverse만 통과한다. 이 두 성질을 라우트를
 * 거쳐 못박는 테스트는 셋이다:
 *
 * - `revisions.test.ts`의 "`/version`을 다른 값으로 바꾸면 400이 아니라 422다"
 * - `revisions.test.ts`의 "`/version`을 지우거나 다른 곳으로 옮기는 편집도 200이
 *   아니다" — `replace` 말고 `remove`·`move`도 이 술어를 지나가므로 그 둘도
 *   422임을 고정한다(봉투 검증(6단계)이 `version` 없는 문서를 거부한다)
 * - `undo-redo.test.ts`의 "`PUT .../schema`가 만든 revision도 이력의 inverse로
 *   되돌릴 수 있다"
 *
 * **대가.** `/version`에 관한 한 400(본문이 계약을 어김)과
 * 422(문서 내용이 처리 불가)의 경계가 흐려진다(설계서 「에러 처리」). `/root`·`/version` 둘 다
 * 아닌 경로는 여전히 여기서 400이다.
 *
 * 문서 루트 자체(`""`)는 `applyOp`가 애초에 거부한다. 이 제약은 **HTTP 본문에만**
 * 건다 — `PUT .../schema`가 파이프라인을 부를 때 만드는
 * `replace /version`은 서버가 스스로 만든 것이라 이 zod를 거치지 않는다.
 */
export const PatchPath = z
  .string()
  .max(2000, '경로가 너무 깁니다')
  .refine((path) => path === '/root' || path.startsWith('/root/') || path === '/version', {
    message: '경로는 /root 아래이거나 /version이어야 합니다',
  })

/**
 * `add`·`replace`가 싣는 임의의 JSON 값. **키 자체가 있어야 한다** — 값 없는 add는
 * 문서에 `undefined`를 심고, 그건 jsonb 직렬화에서 조용히 사라져 클라이언트가 보낸
 * 편집과 서버에 남은 문서가 말없이 갈라진다.
 *
 * **키 부재를 실제로 막는 것은 zod 4.4.3의 객체 파서다.** `.optional()`이 붙지 않은
 * 필드는 그 타입이 `undefined`를 받아들이든 말든 키가 없으면 `invalid_type`으로
 * 거부한다 — 변이 검사로 다시 잰다: 아래 술어를 `() => true`로 바꿔도 값 없는 add는
 * 여전히 400이고, `.optional()`을 붙여야 비로소 통과한다. 그러니 이 술어는 그 판정을
 * 대신하는 게 아니라 **그보다 먼저 걸려 사람이 읽을 메시지를 주는 층**이다. 술어 없이
 * `z.unknown()`만 두면 응답에 "잘못된 입력: 예상 타입은 nonoptional, 받은 타입은
 * undefined입니다"가 실려 zod 내부 용어가 그대로 클라이언트에게 새어 나간다.
 *
 * `null`은 통과한다 — 정당한 JSON 값이다. 막는 것은 값의 **부재**뿐이다.
 */
export const PatchValue = z.custom<unknown>((value) => value !== undefined, { message: 'value가 필요합니다' })

/**
 * ops 하나. `@wirebound/schema`의 `PatchOp`(add·remove·replace·move 넷)와 같은
 * 모양을 zod로 다시 쓴 것이다 — 그 패키지에는 대응하는 zod 스키마가 없다. 패치
 * 함수들은 이미 신뢰된 입력을 받는 순수 함수이고(브라우저에서도 돈다), 신뢰할 수
 * 없는 입력을 거르는 것은 이 파일의 몫이기 때문이다.
 *
 * **두 정의가 갈라지는 것을 컴파일러가 잡아 주는 방향은 하나뿐이다.** 여기가 `PatchOp`
 * 보다 **넓어지면** `applyEdit`(`PatchOp[]`를 받는다)에 대입할 수 없어 컴파일이 깨진다.
 * 반대로 **좁아지는** 쪽은 통과한다 — 예컨대 아래에서 `move` 변형을 통째로 지워도
 * `(add|remove|replace)[]`는 여전히 `PatchOp[]`에 대입 가능하다. 그쪽을 잡는 것은
 * 컴파일러가 아니라 `undo-redo.test.ts`다(*"세 번 편집한 뒤 inverse를 역순으로 보내면 최초
 * 문서로 정확히 돌아온다"*가 유효한 `move`를 HTTP로 보낸다).
 *
 * 네 종류 밖(예: RFC 6902의 `copy`)은 여기서 400이다. 파이프라인은 op 종류를 검사
 * 하지 않는다 — `applyOp`의 switch가 어느 분기도 타지 않아 문서가 그대로 남으므로,
 * 여기서 막지 않으면 "아무 일도 안 일어났는데 revision만 남는" 편집이 된다.
 */
export const PatchOpBody = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), path: PatchPath, value: PatchValue }),
  z.strictObject({ op: z.literal('remove'), path: PatchPath }),
  z.strictObject({ op: z.literal('replace'), path: PatchPath, value: PatchValue }),
  z.strictObject({ op: z.literal('move'), path: PatchPath, from: PatchPath }),
])

/**
 * 클라이언트의 pending 큐 식별자.
 *
 * **제약을 따로 뽑은 것은 두 진입점이 이 필드의 **필수 여부**만 다르기 때문이다**.
 * REST에서는 없어도 되고(서버가 응답에 그대로 되돌려 줄 뿐이다), WebSocket에서는 **반드시
 * 있어야 한다** — 그쪽의 ack는 응답이 아니라 프레임이라 짝을 지을 것이 이 값뿐이다.
 * 길이 제한까지 두 벌로 적으면 한쪽만 늘어나고, 그러면 REST로는 되는데 WS로는 안 되는
 * 입력이 생긴다.
 */
export const ClientOpId = z.string().min(1).max(64)

/** `PATCH .../ops`의 본문. */
export const OpsBody = z.strictObject({
  /** 클라이언트가 아는 마지막 seq. 새 페이지(이력 없음)는 0이다. */
  baseSeq: z.int().min(0),
  /**
   * 최대 200개. 상한을 두는 이유는 요청 하나가 임의로 큰 문서 변형을 일으켜
   * 메모리·CPU를 소진하는 것을 막기 위해서다 — 파이프라인은 ops마다 문서를
   * structuredClone하므로 비용이 ops 수에 선형이다. 사람의 한 동작이 만드는
   * ops는 많아야 몇 개이고, 큰 변형은 `PUT .../schema`(통째 교체)의 몫이다.
   *
   * 빈 배열은 허용한다(`.min(1)`을 걸지 않는다) — 파이프라인이 빈 ops에도 revision을
   * 남기도록 정의돼 있고, 그 성질에 기대는 호출자가 생길 수 있다.
   */
  ops: z.array(PatchOpBody).max(200, 'ops는 200개 이하여야 합니다'),
  /**
   * 서버는 저장하지 않고 응답에 그대로 되돌려 준다 — 멱등 키가 아니다.
   * 중복 적용은 baseSeq가 막는다. **여기서는 선택이다**(위 `ClientOpId` 참고).
   */
  clientOpId: ClientOpId.optional(),
})
