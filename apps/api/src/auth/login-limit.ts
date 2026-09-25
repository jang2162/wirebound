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
 * - 주소는 IPv6 면 /64 로 묶는다(`addressKey`) — 한 회선이 흔히 /64 하나를 통째로 받아, 주소를 바꿔 가며 한도를 비켜 간다.
 *
 * **방식 — 검증 전에 자리를 잡고, 한도에 닿으면 429 + `Retry-After`.** 지연(실패 수만큼 늦게 답함)은 동시에 몰린 요청을 못 막는다 —
 * 늦추는 동안에도 scrypt 는 돈다. 그래서 **비밀번호를 견주기 전에** 그 시도를 두 키에 기록하고(한 틱 안이라 동시에 온 요청도 차례로
 * 센다), 한도에 닿은 키가 있으면 DB 도 scrypt 도 안 거치고 429 로 끝낸다 — 한 키가 한 번에 돌릴 수 있는 scrypt 가 한도 수로 묶인다.
 * 기록은 창(`windowMs`) 안의 시각 목록이고, 가장 오래된 기록이 창을 벗어나면 한 번 더 받는다.
 * - **성공하면 그 계정의 기록을 지우고, 주소에서는 이 시도의 자리만 걷는다.** 주소의 앞선 실패는 남는다 — 지우면 자기 계정 하나를
 *   가진 사람이 남의 계정을 두드리는 사이사이 자기 계정으로 로그인해 주소의 실패를 씻는다. 계정의 기록을 지워도 남는 틈은, 주인이
 *   로그인할 때마다 두드리는 쪽이 한도만큼 더 대 볼 수 있다는 것이다(주인의 성공이 드문 한 작다).
 * - **요청이 비밀번호를 견주지 못하고 끝나면(DB 오류) 두 자리를 다 걷는다** — 맞혀 본 것이 아니다.
 * - **막힌 동안은 옳은 비밀번호도 429 다.** 옳으면 받아 주면 막힌 키에서도 200 · 429 가 갈려 비밀번호를 맞혀 보는 창구가 그대로 남는다.
 *   그 대가로 **남이 내 계정을 막을 수 있다** — 창마다 틀린 비밀번호를 한도만큼 보내면 그 창 동안 주인도 새로 로그인하지 못한다.
 *   이미 로그인한 세션 · API 토큰은 그대로 돈다. 계정 발급을 서버에 손이 닿는 사람이 하는 자체 호스팅 도구라(설계서 「권한 모델」) 그
 *   값을 치른다. 풀 수단은 창이 지나는 것과 서버 재기동이다(기록이 메모리에만 있다).
 * - **없는 계정도 같은 판정이다.** 키는 이메일 글자이지 계정 행이 아니다 — 막힌 판은 DB 를 읽기 전에 끝나므로 있는 계정과 없는 계정의
 *   429 가 코드 · 문장 · 시간까지 같고, 막히기 전의 401 은 원래대로 같다(`routes/auth.ts` 의 더미 해시). 성공이 계정 기록을 지우는
 *   것은 비밀번호를 아는 사람에게만 보인다.
 * - 본문이 틀린 요청(400)은 세지 않는다 — 검증 전에 끝나 scrypt 가 안 돈다.
 *
 * **저장소는 프로세스 메모리다.** api 는 한 프로세스라 이것으로 충분하다(실시간 층 · 잠금도 한 프로세스를 전제한다 — `ws/` 의
 * 룸과 `lock/store.ts`). **프로세스가 여럿이 되면 깨지는 것:** 기록이 프로세스마다 따로라 한도가 프로세스 수만큼 곱해지고, 앞단이 요청을 돌려
 * 나누면 한 키의 기록이 흩어진다. 그때는 기록을 DB(또는 공유 저장소)로 옮긴다. 재기동은 기록을 비운다.
 *
 * **키 수에 상한이 있다(`maxKeys`).** 없는 이메일마다 기록이 하나 생기므로 상한이 없으면 메모리가 는다. 상한에 닿으면 가장 오래
 * 기록한 키를 버린다 — 창이 모두 같으므로 먼저 창을 벗어나는 키가 그것이다(창을 벗어난 키는 따로 걷지 않고 이렇게 밀려난다). **주소를 상한 ÷ 주소 한도(약 330)개 넘게 가진 쪽은 새 키로 밀어내
 * 남의 계정 기록을 씻을 수 있다.** 그런 쪽은 주소 키를 이미 비켜 가므로 이 모듈이 막는 범위 밖이다. 계정 키는 이메일의 sha256 으로
 * 둔다 — 이메일 규격이 길이를 묶지 않아(`auth/credentials.ts` 의 `NormalizedEmail`) 긴 글자가 그대로 쌓이지 않게.
 *
 * **주소는 `request.ip` 다** — `TRUST_PROXY` 가 비면 소켓 주소, 차면 그 앞단이 적은 `X-Forwarded-For` 를 따른다(`config.ts` 의
 * `trustProxy`). 앞단 뒤에서 그것을 안 채우면 모든 요청이 앞단 하나의 주소라 **주소 키가 서버 전체의 한도가 된다** — 아무나 틀린
 * 로그인 `perAddress` 번으로 창 동안 모두의 새 로그인을 막는다(최상위 `README.md` 「앞단(리버스 프록시)이 지킬 조건」).
 */
import { createHash } from 'node:crypto'
import { isIPv4, isIPv6 } from 'node:net'

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

  add(key: string, stamp: number): void {
    const stamps = this.live(key, stamp) ?? []
    // 맨 뒤로 옮겨 «가장 오래 기록한 키»가 맨 앞에 오게 한다(`Map` 은 넣은 차례를 지킨다).
    this.entries.delete(key)
    while (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    stamps.push(stamp)
    this.entries.set(key, stamps)
  }

  /** 이 시도의 자리 하나를 걷는다. 같은 시각의 다른 시도가 있어도 하나만 걷는다. */
  removeOne(key: string, stamp: number): void {
    const stamps = this.entries.get(key)
    if (stamps === undefined) return
    const at = stamps.indexOf(stamp)
    if (at >= 0) stamps.splice(at, 1)
    if (stamps.length === 0) this.entries.delete(key)
  }

  clear(key: string): void {
    this.entries.delete(key)
  }
}

export type LoginAdmission =
  | { kind: 'limited'; retryAfterSeconds: number }
  | {
      kind: 'admitted'
      /** 비밀번호가 맞았다 — 계정 기록을 지우고 주소에서 이 자리를 걷는다. */
      succeeded(): void
      /** 비밀번호를 견주지 못하고 끝났다 — 두 자리를 다 걷는다. */
      abandoned(): void
    }

export interface LoginLimiter {
  /** 비밀번호를 견주기 **전에** 부른다. 받아 주면 그 시도를 두 키에 기록해 둔다 — 틀리면 그대로 실패로 남는다. */
  begin(email: string, address: string): LoginAdmission
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
      accounts.add(account, at)
      addresses.add(address, at)
      return {
        kind: 'admitted',
        succeeded() {
          accounts.clear(account)
          addresses.removeOne(address, at)
        },
        abandoned() {
          accounts.removeOne(account, at)
          addresses.removeOne(address, at)
        },
      }
    },
  }
}

function accountKey(email: string): string {
  return createHash('sha256').update(email).digest('base64url')
}

/**
 * 주소를 키로 만든다. IPv4 에 매핑된 IPv6(`::ffff:1.2.3.4`)는 IPv4 로, IPv6 은 앞 64비트로 묶는다(머리말 «키는 둘이다»). 둘 다 아니면
 * 받은 글자 그대로다.
 */
export function addressKey(address: string): string {
  const bare = address.split('%')[0] as string
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare)
  if (mapped !== null && isIPv4(mapped[1] as string)) return mapped[1] as string
  if (!isIPv6(bare)) return address
  const groups = expandIPv6(bare)
  return `${groups.slice(0, 4).join(':')}::/64`
}

/** 줄인 IPv6(`2001:db8::1`)을 여덟 묶음으로 편다. 끝에 IPv4 가 붙은 꼴(`::1.2.3.4`)은 두 묶음으로 바꾼다. */
function expandIPv6(address: string): string[] {
  let text = address.toLowerCase()
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (tail !== null) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, rest] = text.split('::') as [string, string | undefined]
  const left = head === '' ? [] : head.split(':')
  const right = rest === undefined || rest === '' ? [] : rest.split(':')
  const fill = rest === undefined ? [] : Array(8 - left.length - right.length).fill('0')
  return [...left, ...fill, ...right].map((group) => group.replace(/^0+(?=.)/, ''))
}
