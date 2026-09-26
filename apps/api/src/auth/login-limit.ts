/**
 * **로그인 시도 제한.** `POST /api/auth/login`(`routes/auth.ts`) 하나가 쓴다 — 미인증 상태에서 비밀번호를 맞혀 볼 수 있는 표면이 그것뿐이다
 * (`wireb login` 도 그 라우트로 온다). 비밀번호 재설정 명령(`db/reset-password.ts`)은 DB 에 손이 닿는 사람이 도는 것이라 맞혀 보는
 * 표면이 아니고, API 토큰 · 세션 쿠키는 무작위 값이라 맞혀 볼 것이 없다.
 *
 * **무엇을 막나.** 제한이 없으면 같은 계정에 틀린 비밀번호가 끝없이 401 로 곧바로 돈다 — 한 번에 scrypt 가 한 번(ASCII)에서 세 번(꼴이
 * 셋으로 갈리는 글자 — `auth/password.ts` 머리말 «NFC»)이다. 동시에 몰리면 libuv 스레드 풀(기본 4)을 scrypt 가 쥐어, 풀을 쓰는 다른
 * 일(다른 사람의 로그인 · fs · zlib)이 그 뒤에 줄 선다. 잰 값(`PASSWORD_SCRYPT_N` 32768 · 실포트 · 이 모듈을 뗀 판): 틀린 로그인 30 번
 * 연속 모두 401 · 한 번 41ms(ASCII) · 122ms(세 꼴) · 없는 계정 119ms. 세 꼴 틀린 로그인 64 개를 한꺼번에 보내면 그동안 들어온 옳은
 * 로그인이 54 → 682ms, 풀을 안 쓰는 `GET /api/auth/me` 는 p50 1.5 → 2.1ms 로 거의 그대로다.
 *
 * **키는 둘이다 — 계정(정규화한 이메일)과 주소.** 어느 한쪽이 한도에 닿으면 막는다.
 * - 계정만이면 한 주소가 계정을 바꿔 가며 흔한 비밀번호 하나씩을 대 보는 것(비밀번호 뿌리기)과 없는 이메일로 scrypt 만 돌리는 것을
 *   못 막는다.
 * - 주소만이면 주소 여럿에서 한 계정을 두드리는 것을 못 막는다.
 * - 주소는 IPv6 면 /64 로 묶는다(`addressKey`) — 한 회선이 흔히 /64 하나를 통째로 받아, 주소를 바꿔 가며 한도를 비켜 간다. IPv4 를
 *   담는 IPv6(`::ffff:1.2.3.4` 따위)은 그 IPv4 로 센다.
 *
 * **방식 — 검증 전에 자리를 잡고, 한도에 닿으면 429 + `Retry-After`.** 지연(실패 수만큼 늦게 답함)은 동시에 몰린 요청을 못 막는다 —
 * 늦추는 동안에도 scrypt 는 돈다. 그래서 **비밀번호를 견주기 전에** 그 시도를 두 키에 기록하고(한 틱 안이라 동시에 온 요청도 차례로
 * 센다), 한도에 닿은 키가 있으면 DB 도 scrypt 도 안 거치고 429 로 끝낸다 — 한 키가 한 번에 돌릴 수 있는 scrypt 가 한도 수로 묶인다.
 * 기록은 창(`windowMs`) 안의 시각 목록이고, 가장 오래된 기록이 창을 벗어나면 한 번 더 받는다.
 * - **성공은 두 키에서 이 시도의 자리만 걷는다 — 앞선 실패는 계정 · 주소 어느 쪽에서도 안 지운다.**
 *   - 주소의 실패를 지우면 자기 계정 하나를 가진 사람이 남의 계정을 두드리는 사이사이 자기 계정으로 로그인해 주소의 실패를 씻는다.
 *   - 계정의 실패를 지우면 그 지움이 남의 다음 답에 보인다 — 한도 − 1 까지 채워 둔 쪽이 뒤 두 번의 답(`401,401` 대 `401,429`)으로
 *     «그 사이 주인이 로그인했다 = 있는 계정»을 읽고(아래 «없는 계정도 같은 판정이다»), 주인이 로그인할 때마다 한도만큼 더 대 본다.
 *     «같은 주소에서 온 실패만 지운다»도 고르지 않았다 — 주인과 주소를 나누는 쪽(같은 NAT · `TRUST_PROXY` 없이 앞단 뒤라 모두가 한
 *     주소)에게는 같은 신호가 선다.
 *   - **대가: 주인의 오타도 창 동안 남는다.** 틀린 뒤 로그인한 사람이 창 안에서 다시 틀리면 앞의 오타까지 세어 더 일찍 막힌다(한도
 *     10 가운데 그 오타 수만큼).
 *   - 성공의 자리도 걷으므로 성공만 거듭하는 사람은 막히지 않는다. 그 자리는 비밀번호를 견주는 동안(scrypt 한 번)만 차 있다.
 * - **요청이 비밀번호를 견주지 못하고 끝나면(DB 오류) 두 자리를 다 걷는다** — 맞혀 본 것이 아니다.
 * - **막힌 동안은 옳은 비밀번호도 429 다.** 옳으면 받아 주면 막힌 키에서도 200 · 429 가 갈려 비밀번호를 맞혀 보는 창구가 그대로 남는다.
 *   그 대가로 **남이 내 계정을 막을 수 있다** — 창마다 틀린 비밀번호를 한도만큼 보내면 그 창 동안 주인도 새로 로그인하지 못한다.
 *   이미 로그인한 세션 · API 토큰은 그대로 돈다. 계정 발급을 서버에 손이 닿는 사람이 하는 자체 호스팅 도구라(설계서 「권한 모델」) 그
 *   값을 치른다. 풀 수단은 창이 지나는 것 · 아래 «막힘을 푸는 명령» · 서버 재기동(모두의 기록을 비운다)이다.
 * - **막힘을 푸는 명령** — 서버에 손이 닿는 사람이 `unlock-login` 으로 키 하나(계정 또는 주소)의 기록을 다 걷는다(`unlock`). 명령이
 *   메모리에 닿는 입구와 그 인가는 `auth/unlock-socket.ts` 머리말이 소유한다. 대가:
 *   - **푼 것이 두드리는 쪽의 다음 답에 보인다** — 한도에서 429 를 받던 쪽이 401 을 받으면 «누가 이 이메일을 풀었다»를 읽고, 사람은
 *     주인이 청한 계정만 풀므로 «있는 계정»의 신호가 된다. 사람이 친 명령 한 번에 한 번 서고 두드리는 쪽이 제 뜻으로 세우지 못한다 —
 *     아래 «없는 계정도 같은 판정이다»가 닫은 신호(주인이 로그인할 때마다 선다)와 다르다. 명령이 없으면 주인이 창을 기다리거나 서버를
 *     다시 띄워야 하고, 재기동은 같은 신호를 내면서 두드리는 쪽의 기록까지 모두 비운다 — 명령은 그보다 좁아 이 값을 치른다.
 *   - **두드리는 쪽도 한도만큼 다시 댄다** — 계정 키를 걷으므로, 아직 보내고 있으면 곧 다시 막힌다. 풀기 앞에 들어와 풀기 뒤에
 *     끝난 시도는 풀기 뒤의 기록을 안 걷는다 — 시도가 넣은 키의 세대에서만 제 자리를 걷는다(`AttemptLog.removeOne`).
 *   - **계정을 풀어도 주소 키는 그대로다**(그 반대도) — 429 문장이 두 키를 가르지 않으므로(`routes/auth.ts` 의 `loginLimitedMessage`)
 *     명령이 그렇다고 말한다.
 *   - 로그인 판정에는 닿지 않는다 — 막힌 판은 그대로 DB 도 scrypt 도 안 거치고, 푼 뒤의 판정도 기록이 없는 키의 것과 같다.
 * - **없는 계정도 같은 판정이다.** 키는 이메일 글자이지 계정 행이 아니다 — 막힌 판은 DB 를 읽기 전에 끝나므로 있는 계정과 없는 계정의
 *   429 가 코드 · 문장 · 시간까지 같고, 막히기 전의 401 은 원래대로 같다(`routes/auth.ts` 의 더미 해시). 주인의 성공은 남의 다음 답을
 *   안 바꾼다 — 성공이 제 자리만 걷으므로 남은 횟수가 주인이 안 온 계정 · 없는 계정과 같다. **남는 창:** 주인의 비밀번호를 견주는
 *   동안(scrypt 한 번) 그 자리가 차 있어, 한도 − 1 에서 그 틈에 닿은 시도는 429 를 보고 성공이 자리를 걷은 뒤에는 다시 401 을 본다.
 *   없는 계정에서는 안 나는 차례다. 한도 − 1 에서 보낸 시도는 받아지면 한도를 채우므로, 그 틈을 한 번에 맞혀야 선다. 잰 값(실포트 ·
 *   `PASSWORD_SCRYPT_N` 32768 · 주인의 로그인을 보낸 뒤 0–30ms 에 틀린 시도 하나 · 판마다 새 앱): 주인이 있는 계정 40/40 판이
 *   `429,401`, 60ms 뒤(주인의 답 p50 45ms 뒤)면 10/10 이 `401,429`, 없는 계정은 50/50 이 `401,429`. 틈은 주인의 scrypt 한 번 폭이다.
 *   **닫지 않았다 — 닫는 길마다 더 큰 신호나 구멍을 연다.**
 *   - 성공도 자리를 남기면(성공을 실패처럼 셈) 주인의 로그인 한 번이 창 동안 남아 한도 − 1 의 뒤 두 번이 `429,429` 로 바뀐다 — 틈이
 *     아니라 창 전체의 신호이고, 주인은 제 로그인 10 번에 막힌다.
 *   - 견주는 중인 시도를 한도에서 빼고 따로 묶으면(끝난 실패로만 막음) 한도 − 1 에서 동시에 보낸 시도가 모두 받아져 한도를 넘겨 견준다.
 *   - 틈에 닿은 시도를 그 자리가 풀릴 때까지 기다리게 하면 답이 늦어지는 것 자체와 기다린 뒤의 `401`(주인이 성공했다)이 신호다.
 *   두드리는 쪽은 주인이 로그인하는 순간(약 45ms)을 모르고, 한도 − 1 에서 한 번 빗나가면(`401`) 가장 오래된 기록이 창을 벗어날 때까지
 *   다시 못 댄다.
 * - 본문이 틀린 요청(400)은 세지 않는다 — 검증 전에 끝나 scrypt 가 안 돈다.
 *
 * **저장소는 프로세스 메모리다.** api 는 한 프로세스라 이것으로 충분하다(실시간 층 · 잠금도 한 프로세스를 전제한다 — `ws/` 의
 * 룸과 `lock/store.ts`). **프로세스가 여럿이 되면 깨지는 것:** 기록이 프로세스마다 따로라 한도가 프로세스 수만큼 곱해지고, 앞단이 요청을 돌려
 * 나누면 한 키의 기록이 흩어진다. 그때는 기록을 DB(또는 공유 저장소)로 옮긴다. 재기동은 기록을 비운다.
 *
 * **키 수에 상한이 있다(`maxKeys`).** 없는 이메일마다 기록이 하나 생기므로 상한이 없으면 메모리가 는다. 새 키가 상한에 닿으면 **창 안의
 * 기록이 가장 적은 키**를 버린다(같으면 마지막 기록이 가장 오래된 키 · 그것도 같으면 키 글자가 앞선 키). 창을 벗어난 키는 따로 걷지 않고
 * 이렇게 밀려난다(기록이 0 이다).
 * - **기록이 적은 키부터 버리는 까닭** — 새 키(없는 이메일 하나씩 · 주소 약 330 개)로 상한을 채워 앞선 기록을 씻지 못하게. 넣은 차례로
 *   버리면 막힌 계정의 기록이 새 키 1만 개에 씻겨 한도만큼 더 대 보고, 막힌 키만 건너뛰어도 한도 − 1 까지 채운 키가 같은 값에 씻긴다(창
 *   하나에 9 번 더). 기록이 c 인 키를 밀어내려면 다른 키 모두가 c 이상이어야 한다 — 키 하나를 씻는 값이 한 창 안에 견준 비밀번호 약
 *   c × 1만 번이다(막힌 계정 키면 약 10만 번 · 주소 약 3300 개).
 * - **넣은 차례로 가르지 않는 까닭** — 주인의 성공은 기록을 안 남기지만(«성공은 두 키에서») 그 키를 다시 넣은 차례로 옮긴다. 넣은 차례로
 *   버리면 남이 한 번 틀려 둔 이메일이 채우기 뒤에 남는지로 «그 사이 주인이 로그인했다 = 있는 계정»을 읽는다. 마지막 기록의 시각은 성공이
 *   자리를 걷은 뒤 그 앞과 같다.
 * - **모든 키가 막혔어도 버린다** — 메모리 상한이 먼저다. 새 키를 안 받는(그 요청을 막는) 길은 고르지 않았다 — 표가 막힌 키로 차 있는
 *   동안 기록이 없는 모든 사람(처음 로그인하는 주인 · 새 주소)의 로그인이 막혀, 남의 계정 하나가 아니라 서버 전체가 막힌다.
 * - 버릴 키를 찾으려고 표를 한 번 훑는다 — 막힌 키 1만 개로 찬 표에 새 키 하나를 넣는 데 p50 0.34 · p99 0.77ms(이 기계). 훑는 것은
 *   상한에 닿은 뒤 받아 준 새 키뿐이다 — 막힌 요청(429)과 이미 있는 키는 안 훑는다.
 *
 * 계정 키는 이메일의 sha256 으로 둔다 — 이메일 규격이 길이를 묶지 않아(`auth/credentials.ts` 의 `NormalizedEmail`) 긴 글자가 그대로
 * 쌓이지 않게.
 *
 * **주소는 `request.ip` 다** — `TRUST_PROXY` 가 비면 소켓 주소, 차면 그 앞단이 적은 `X-Forwarded-For` 를 따른다(`config.ts` 의
 * `trustProxy`). 앞단이 적은 글자가 IP 가 아니면 소켓 주소로 센다(`requestAddressKey`). 앞단 뒤에서 그것을 안 채우면 모든 요청이 앞단 하나의 주소라 **주소 키가 서버 전체의 한도가 된다** — 아무나 틀린
 * 로그인 `perAddress` 번으로 창 동안 모두의 새 로그인을 막는다(최상위 `README.md` 「앞단(리버스 프록시)이 지킬 조건」).
 */
import { createHash } from 'node:crypto'
import { isIPv4 } from 'node:net'
import { embeddedIPv4, ipv6Groups } from '../ip-address'

export interface LoginLimitRule {
  /** 기록을 세는 창(ms). */
  windowMs: number
  /** 한 계정이 창 안에 받는 시도 수. */
  perAccount: number
  /** 한 주소가 창 안에 받는 시도 수. 한 사무실이 앞단 없이 한 주소로 나오는 판을 위해 계정보다 넉넉하다. */
  perAddress: number
  /** 키 종류마다 기억하는 키 수의 상한 — 머리말 «키 수에 상한이 있다». */
  maxKeys: number
}

export const LOGIN_LIMIT: LoginLimitRule = {
  windowMs: 15 * 60 * 1000,
  perAccount: 10,
  perAddress: 30,
  maxKeys: 10_000,
}

/** 한 종류의 키(계정 또는 주소)의 기록. 값은 창 안의 시도 시각이고 오래된 것이 앞이다. */
class AttemptLog {
  private readonly entries = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  /** 창을 벗어난 기록을 걷고 남은 것을 준다. 비면 키째 걷는다. */
  private live(key: string, now: number): number[] | undefined {
    const stamps = this.entries.get(key)
    if (stamps === undefined) return undefined
    while (stamps.length > 0 && (stamps[0] as number) <= now - this.windowMs) stamps.shift()
    if (stamps.length === 0) {
      this.entries.delete(key)
      return undefined
    }
    return stamps
  }

  /** 막혀 있으면 풀리는 시각, 아니면 `undefined`. */
  blockedUntil(key: string, now: number): number | undefined {
    const stamps = this.live(key, now)
    if (stamps === undefined || stamps.length < this.limit) return undefined
    return (stamps[stamps.length - this.limit] as number) + this.windowMs
  }

  /**
   * 기록을 하나 더한다. 준 배열이 그 키의 **세대**다 — 키를 걷으면(풀기 · 창 만료 · 상한에서 버림) 다시 설 때 새 배열이 선다.
   * `removeOne` 이 이것으로 제 세대의 기록만 걷는다.
   */
  add(key: string, stamp: number): readonly number[] {
    const stamps = this.live(key, stamp)
    if (stamps !== undefined) {
      stamps.push(stamp)
      return stamps
    }
    while (this.entries.size >= this.maxKeys && this.evictOne(stamp)) {}
    const fresh = [stamp]
    this.entries.set(key, fresh)
    return fresh
  }

  /**
   * 상한에서 키 하나를 버린다 — 기록이 가장 적은 키, 같으면 마지막 기록이 가장 오래된 키, 그것도 같으면 키 글자가 앞선 키(머리말 «키
   * 수에 상한이 있다»). 차례를 `Map` 의 넣은 차례로 가르지 않는다 — 주인의 성공이 기록을 남기지 않아도 넣은 차례는 바꾼다. 버렸으면 참.
   */
  private evictOne(now: number): boolean {
    let pick: { key: string; count: number; last: number } | undefined
    for (const key of this.entries.keys()) {
      const stamps = this.live(key, now)
      // 창을 벗어나 빈 키는 `live` 가 스스로 걷었다 — 한 자리가 비었다.
      if (stamps === undefined) return true
      const count = stamps.length
      const last = stamps[count - 1] as number
      if (
        pick === undefined ||
        count < pick.count ||
        (count === pick.count && (last < pick.last || (last === pick.last && key < pick.key)))
      ) {
        pick = { key, count, last }
      }
    }
    if (pick === undefined) return false
    this.entries.delete(pick.key)
    return true
  }

  /** 키의 기록을 다 걷는다 — 걷기 전 창 안의 기록 수와, 막혀 있었으면 풀리기까지 남았던 시간을 준다(머리말 «막힘을 푸는 명령»). */
  clear(key: string, now: number): KeyClearance {
    const until = this.blockedUntil(key, now)
    const cleared = this.live(key, now)?.length ?? 0
    this.entries.delete(key)
    return { cleared, blockedForMs: until === undefined ? undefined : until - now }
  }

  /**
   * 이 시도의 자리 하나를 걷는다. 같은 시각의 다른 시도가 있어도 하나만 걷는다. **넣은 세대(`add` 가 준 배열)가 아니면 안 걷는다** —
   * 자리를 시각 값으로 찾으므로, 키가 걷힌 뒤 같은 ms 에 선 새 기록을 옛 시도가 걷게 된다(풀기 앞에 들어온 시도가 풀기 뒤에 끝난 판).
   */
  removeOne(key: string, stamp: number, generation: readonly number[]): void {
    const stamps = this.entries.get(key)
    if (stamps === undefined || stamps !== generation) return
    const at = stamps.indexOf(stamp)
    if (at >= 0) stamps.splice(at, 1)
    if (stamps.length === 0) this.entries.delete(key)
  }
}

export type LoginAdmission =
  | { kind: 'limited'; retryAfterSeconds: number }
  | {
      kind: 'admitted'
      /** 비밀번호가 맞았다 — 두 키에서 이 자리만 걷는다(앞선 실패는 남는다 — 머리말 «성공은 두 키에서»). */
      succeeded(): void
      /** 비밀번호를 견주지 못하고 끝났다 — 두 자리를 다 걷는다. */
      abandoned(): void
    }

/** 한 키를 푼 결과. */
export interface KeyClearance {
  /** 걷은 창 안의 기록 수. */
  cleared: number
  /** 막혀 있었으면 그대로 두었을 때 풀리기까지 남았던 시간(ms) — 제한기의 시계로 잰다. 아니면 `undefined`. */
  blockedForMs: number | undefined
}

export interface LoginLimiter {
  /** 비밀번호를 견주기 **전에** 부른다. 받아 주면 그 시도를 두 키에 기록해 둔다 — 틀리면 그대로 실패로 남는다. */
  begin(email: string, address: string): LoginAdmission
  /**
   * 관리자가 막힘을 푼다 — 준 키의 기록을 다 걷는다(머리말 «막힘을 푸는 명령»). `email` 은 로그인 본문과 같은 정규화를 지난 값,
   * `address` 는 `addressKey` 가 낸 키다. 준 쪽만 걷고 결과를 준다.
   */
  unlock(target: { email?: string; address?: string }): { account?: KeyClearance; address?: KeyClearance }
}

/** `now` 의 기본값은 부를 때마다 `Date` 를 찾는다 — 가짜 시계(`vi.useFakeTimers`)가 앱을 세운 뒤에 바꾼 `Date` 도 읽게. */
export function createLoginLimiter(rule: LoginLimitRule = LOGIN_LIMIT, now: () => number = () => Date.now()): LoginLimiter {
  const accounts = new AttemptLog(rule.perAccount, rule.windowMs, rule.maxKeys)
  const addresses = new AttemptLog(rule.perAddress, rule.windowMs, rule.maxKeys)

  return {
    begin(email, address) {
      const at = now()
      const account = accountKey(email)
      const until = Math.max(accounts.blockedUntil(account, at) ?? 0, addresses.blockedUntil(address, at) ?? 0)
      if (until > 0) {
        return { kind: 'limited', retryAfterSeconds: Math.max(1, Math.ceil((until - at) / 1000)) }
      }
      const accountGeneration = accounts.add(account, at)
      const addressGeneration = addresses.add(address, at)
      const release = () => {
        accounts.removeOne(account, at, accountGeneration)
        addresses.removeOne(address, at, addressGeneration)
      }
      return {
        kind: 'admitted',
        succeeded: release,
        abandoned: release,
      }
    },
    unlock(target) {
      const at = now()
      return {
        ...(target.email === undefined ? {} : { account: accounts.clear(accountKey(target.email), at) }),
        ...(target.address === undefined ? {} : { address: addresses.clear(target.address, at) }),
      }
    },
  }
}

function accountKey(email: string): string {
  return createHash('sha256').update(email).digest('base64url')
}

/**
 * 주소를 키로 만든다(머리말 «키는 둘이다»). IPv4 는 그대로, IPv4 를 담는 IPv6(매핑 · 변환 · NAT64 · 호환 — `ip-address.ts` 의
 * `embeddedIPv4`)은 그 IPv4 로, 그 밖의 IPv6 은 앞 64비트로 묶는다 — 담긴 IPv4 를 안 풀면 그 꼴로 오는 IPv4 클라이언트 전부가 /64
 * 하나(`::1` 과 같은 `0:0:0:0::/64` · `64:ff9b:0:0::/64`)의 한도를 나눠 쓴다. 믿는 앞단이
 * 적은 글자(`request.ip`)는 꼴이 제각각이라 값으로 편 뒤 가르고(`ip-address.ts`), 포트(`1.2.3.4:5678` · `[2001:db8::1]:443`)는 뗀다 —
 * 안 떼면 연결마다 새 키다. **IP 가 아니면 `undefined`** — 받은 글자로 세면 `unknown` 하나가 모두의 키가 되고, 글자를 바꿔 가며 새 키를
 * 얻는다. 부르는 쪽이 소켓 주소로 되돌린다(`requestAddressKey`).
 */
export function addressKey(address: string): string | undefined {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address)
  const withPort = /^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(address)
  const text = bracketed?.[1] ?? withPort?.[1] ?? address
  if (isIPv4(text)) return text
  const groups = ipv6Groups(text)
  if (groups === undefined) return undefined
  const embedded = embeddedIPv4(groups)
  if (embedded !== undefined) return embedded
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`
}

/**
 * 요청의 주소 키. `request.ip` 가 IP 가 아니면(믿는 앞단이 `X-Forwarded-For` 에 `unknown` 같은 글자를 적었다) 소켓 주소 — 그 앞단의 주소
 * — 로 센다. 소켓 주소도 없으면(끊긴 소켓) 빈 글자 한 키다.
 */
export function requestAddressKey(ip: string, socketAddress: string | undefined): string {
  return addressKey(ip) ?? addressKey(socketAddress ?? '') ?? ''
}
