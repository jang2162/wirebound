/**
 * IP 주소 글자를 값으로 읽는 도구. 설정의 `TRUST_PROXY` 검사(`config.ts`)와 로그인 제한의 주소 키(`auth/login-limit.ts`)가 쓴다 —
 * 둘 다 **한 주소의 여러 꼴**(줄임 · 앞 0 · 대소문자 · 끝의 IPv4 · 영역)을 같은 값으로 봐야 한다. 글자로 견주면 `0:0:0:0:0:ffff:1.2.3.4`
 * 와 `::ffff:1.2.3.4` 가 갈린다.
 */
import { isIPv6 } from 'node:net'

/** IPv4 매핑 IPv6 의 앞 96비트(`::ffff:0:0/96`) — 여덟 묶음 가운데 앞 여섯. */
const MAPPED_PREFIX = [0, 0, 0, 0, 0, 0xffff] as const

/**
 * IPv6 주소를 여덟 묶음(16비트 수)으로 편다. 영역(`%eth0`)은 떼고 본다. IPv6 이 아니면 `undefined` — 펴기는 `isIPv6` 가 받은 글자에만
 * 한다(`::` 가 둘인 글자 · 묶음이 아홉인 글자는 여기 안 온다).
 */
export function ipv6Groups(address: string): number[] | undefined {
  const bare = address.split('%')[0] as string
  if (!isIPv6(bare)) return undefined
  let text = bare.toLowerCase()
  // 끝에 IPv4 가 붙은 꼴(`::ffff:1.2.3.4`)은 그 네 바이트를 두 묶음으로 바꾼다.
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (tail !== null) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, rest] = text.split('::') as [string, string | undefined]
  const left = head === '' ? [] : head.split(':')
  const right = rest === undefined || rest === '' ? [] : rest.split(':')
  const fill = rest === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0')
  return [...left, ...fill, ...right].map((group) => Number.parseInt(group, 16))
}

/** 편 IPv6 이 IPv4 매핑 주소(`::ffff:a.b.c.d`)면 그 IPv4 를 `a.b.c.d` 로 준다. */
export function mappedIPv4(groups: readonly number[]): string | undefined {
  if (!MAPPED_PREFIX.every((group, i) => groups[i] === group)) return undefined
  const high = groups[6] as number
  const low = groups[7] as number
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

/**
 * IPv6 대역(`groups`/`prefix`)이 IPv4 매핑 주소 전부(`::ffff:0:0/96`)를 덮는가. 덮으면 IPv4 로 붙는 클라이언트를 모두 그 대역 안으로 본다
 * — Fastify 의 `trustProxy`(proxy-addr)는 IPv4 클라이언트를 매핑 꼴로 바꿔 IPv6 대역과 견준다. `::ffff:10.0.0.0/8` 은 10/8 이 아니라
 * `::/8` 이고, `::/64` 도 그렇다.
 */
export function coversAllIPv4(groups: readonly number[], prefix: number): boolean {
  if (prefix > 96) return false
  for (let bit = 0; bit < prefix; bit++) {
    const shift = 15 - (bit % 16)
    const index = Math.floor(bit / 16)
    if ((((groups[index] as number) >> shift) & 1) !== (((MAPPED_PREFIX[index] as number) >> shift) & 1)) return false
  }
  return true
}
