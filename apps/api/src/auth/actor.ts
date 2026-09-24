/**
 * **요청 하나를 actor 하나로 바꾸는 자리.** 설계서 「LLM 편집 경로」의 *"`actor_type='mcp'`,
 * `actor_label='<토큰명>'`으로 구분 표시된다"*가 여기서 참이 된다.
 *
 * ---
 *
 * # 쓰기 라우트가 actor 를 손으로 적지 않는다
 *
 * `revisions.actor_type`은 `'user' | 'mcp' | 'cli'`를 담을 수 있다. 쓰기 라우트가
 * `{ type: 'user', … }`를 리터럴로 적으면 **토큰으로 편집해도 사람 이름이 남는다** — 감사
 * 기록이 조용히 틀린다. 그래서 actor 는 이 파일의 `requestActor` 하나가 만든다.
 *
 * **`actor_type`과 `actor_label`은 한 규칙으로 정한다.** 따로 정하면 이력에 *"누가
 * 고쳤나"*가 두 규칙으로 적힌 구간이 남고, 그 구간을 어느 쪽 규칙으로 읽어야
 * 하는지 아무도 모른다.
 *
 * # 무엇을 클라이언트가 말하고 무엇을 서버가 정하나
 *
 * | 값 | 누가 정하나 | 왜 |
 * |---|---|---|
 * | `actorType` | **요청 헤더**(`x-wb-client`) | **감사 기록이지 권한이 아니다.** 이 값으로 무엇도 막지 않으므로 자칭이 허용된다 |
 * | `actorLabel` | **서버**(`api_tokens.name`) | **「LLM 편집 경로」**가 *"토큰명"*을 정했고 그것은 서버만 안다. **자칭할 수 있는 것은 *"cli냐 mcp냐"*뿐이고 신원이 아니다** |
 * | `actorId` | **서버**(토큰 행의 id) | 마이그레이션 0005의 주석대로 `'mcp'`·`'cli'`의 `actor_id`는 `api_tokens.id`다 |
 *
 * **토큰에 종류를 담지 않는다.** 발급 시점에 정해지므로
 * 같은 토큰을 `wireb`와 MCP가 함께 쓰는 지금의 모양이 깨지고, 사람이 토큰을 두 벌 만들어야
 * 한다. 그리고 헤더 쪽은 **싣는 자리가 하나다** — MCP가 자기 HTTP 클라이언트를 안 갖고
 * `packages/cli`의 `callApi`를 부른다.
 *
 * # 세션은 사람 그대로다
 *
 * 쿠키로 들어오면 `user` + 사람 이름이다. **헤더를 실어도 안 바뀐다** — 세션은 사람이
 * 앉아 있다는 뜻이고 그 신원을 자칭으로 덮으면 감사 기록이 거짓말을 하게 된다.
 * 값이 무엇이든 무시하되 **모양은 검사한다**(아래).
 *
 * # 모르는 값은 400이다 — 조용히 접지 않는다
 *
 * `revisions_actor_type_check`가 `user|mcp|cli` 셋만 받으므로 지어낸 문자열은 어차피
 * 컬럼에 못 들어간다(넣으면 23514 → 500). 그래서 갈래는 둘뿐이다: **거절하거나 조용히
 * 다른 값으로 접거나.** 접는 쪽을 안 고른 이유는 `x-wb-client: MCP`(대문자) 같은 오타가
 * **영영 `cli`로 기록되기** 때문이다 — 감사 기록이 조용히 틀리는 것보다 요청 하나가
 * 400으로 죽는 편이 낫고, 고치는 법도 짧다(헤더를 빼거나 고친다).
 *
 * **우리 클라이언트는 이 400에 닿지 않는다** — 헤더를 싣는 것은 `wireb`와 MCP
 * 둘뿐이고 둘 다 이 목록의 값을 싣는다.
 *
 * ## **그 400은 조작보다 먼저 서야 한다**
 *
 * `requestClientKind`를 부르는 자리가 **둘**이다: `projectGuard`(preHandler)와 아래
 * `requestActor`. **앞엣것이 이 절을 참으로 만든다** — 프로젝트 라우트는 핸들러 본문이
 * 돌기 전에 이미 헤더를 지났다.
 *
 * 검사가 아래 하나뿐이면 조작 뒤에 `requestActor`를 부르는 라우트가 뚫린다. 대부분의 쓰기
 * 라우트는 `applyEdit` **앞에서** 부르지만 **복원은** 커밋한 뒤에 프레임 actor를 만든다 —
 * 거기서 400이 나면 **400을 받은 클라이언트 몰래 프로젝트가 통째로 되돌아간다.** *"실패했다고
 * 말하는데 조작은 일어났다"* 부류다.
 *
 * **여기 검사를 남겨 두는 이유:** 술어가 두 벌이 되면 안 되고, `projectGuard`가 없는
 * 자리에서 누가 `requestActor`를 부르면 그때는 여기가 유일한 방벽이다.
 *
 * # 헤더가 없는 토큰 요청은 `cli`다
 *
 * 헤더를 안 싣는 토큰 요청은 **우리 클라이언트가 아니다**(curl·남의 스크립트).
 * 그것을 `user`로 남기면 *"사람이 브라우저에서 고쳤다"*가 되는데 그것은 틀렸고, 남은 둘 중
 * 기계 클라이언트의 일반형이 `cli`다. **신원은 `actorLabel`이 든다** — 어느 토큰이
 * 했는지가 그 값에 그대로 남으므로 감사 기록이 잃는 것이 없다.
 */
import type { FastifyRequest } from 'fastify'
import { badRequest, unauthenticated } from '../errors'
import type { RevisionActor } from '../repos/revisions'
import type { EventActor } from '../ws/protocol'

/**
 * 클라이언트가 자기 종류를 말하는 헤더. **글자를 한 자리에 둔다** — 훅과 케이스와
 * `packages/cli`의 거울이 같은 이름을 봐야 한다.
 *
 * **`packages/cli/src/client.ts`에 같은 글자가 있다.** `apps/*`와 `packages/*`는 서로
 * 의존하지 않으므로(`CLAUDE.md`) 거울 하나를 손으로 맞추는 자리이고,
 * `test/actor-census.test.ts`가 두 소스에서 그 글자를 읽어 맞댄다 —
 * `ws/protocol.ts`의 프레임 이름을 `protocol-parity.test.ts`가 맞대는 것과 같은 자세다.
 */
export const CLIENT_KIND_HEADER = 'x-wb-client'

/** 자칭할 수 있는 종류. **`RevisionActorType`에서 `'user'`를 뺀 것이다** — 사람은 자칭이 아니다. */
export const CLIENT_KINDS = ['cli', 'mcp'] as const

export type ClientKind = (typeof CLIENT_KINDS)[number]

/** 헤더가 없는 토큰 요청이 되는 값(위 머리말의 마지막 절). */
export const DEFAULT_CLIENT_KIND: ClientKind = 'cli'

/**
 * 헤더가 말하는 종류. 없으면 `null`, 모르는 값이면 **400을 던진다.**
 *
 * **자격 종류를 안 본다** — 검사는 세션 요청에도 걸린다(그래야 규칙이 하나다). 쓰는지
 * 마는지는 아래 `requestActor`가 정한다.
 *
 * **부르는 자리가 둘이다.** `projectGuard`가 **핸들러 본문 앞에서** 부르고(위 머리말의
 * *"조작보다 먼저"*), 아래 `requestActor`가 값을 만들며 다시 부른다. 두 번 불러도
 * 같은 답이고 부수효과가 없다 — 헤더 하나를 읽는 순수 함수다.
 */
export function requestClientKind(request: FastifyRequest): ClientKind | null {
  const raw = request.headers[CLIENT_KIND_HEADER]
  if (raw === undefined) return null
  if (typeof raw !== 'string' || !(CLIENT_KINDS as readonly string[]).includes(raw)) {
    throw badRequest(
      `${CLIENT_KIND_HEADER} 헤더는 ${CLIENT_KINDS.join(' 또는 ')} 여야 합니다: ${JSON.stringify(raw)}`,
    )
  }
  return raw as ClientKind
}

/**
 * `revisions`에 남을 actor 하나. **인증되지 않았으면 401을 던진다.**
 *
 * 던지는 것은 라우트가 `currentUser`를 손으로 확인하던 자리를 대신한다 —
 * `as`로 좁히면 가드가 빠지는 순간 미인증 요청이 `null` 역참조로 500을 낸다
 * (`routes/pages.ts`의 그 자리에 같은 근거가 적혀 있다).
 */
export function requestActor(request: FastifyRequest): RevisionActor {
  const kind = requestClientKind(request)
  const user = request.currentUser
  if (!user) throw unauthenticated()

  // **세션은 사람 그대로다.** 헤더를 실어도 사람 신원을 덮지 않는다.
  if (request.authKind !== 'token' || request.tokenActor === null) {
    return { type: 'user', id: user.id, label: user.name }
  }

  return {
    type: kind ?? DEFAULT_CLIENT_KIND,
    // 마이그레이션 0005: `'mcp'`·`'cli'`의 `actor_id`는 `users.id`가 아니라 `api_tokens.id`다.
    id: request.tokenActor.tokenId,
    label: request.tokenActor.tokenName,
  }
}

/**
 * 룸에 흐르는 프레임이 나르는 actor(`page-changed`·`restored`).
 *
 * **`revisions`의 actor와 같은 물음에 답한다** — *"지금 이걸 누가 했나"*. 그래서 같은
 * 함수에서 만들고 `id`만 뺀다(프레임은 그것을 안 나른다).
 */
export function requestEventActor(request: FastifyRequest): EventActor {
  const actor = requestActor(request)
  return { type: actor.type, label: actor.label }
}
