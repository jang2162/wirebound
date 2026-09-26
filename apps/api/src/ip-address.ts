/**
 * IP 주소 글자를 값으로 읽는 도구. 로그인 제한의 주소 키(`auth/login-limit.ts` 의 `addressKey`)가 쓴다 — **한 주소의 여러 꼴**(줄임 ·
 * 앞 0 · 대소문자 · 끝의 IPv4 · 영역)을 같은 값으로 봐야 한다. 글자로 견주면 `0:0:0:0:0:ffff:1.2.3.4` 와 `::ffff:1.2.3.4` 가 갈린다.
 *
 * 설정의 `TRUST_PROXY` 검사(`config.ts`)는 이것을 안 쓴다 — 믿을지를 정하는 것은 Fastify 의 판독기(`@fastify/proxy-addr` · ipaddr.js)라
 * 그 판독기로 잰다. 둘은 같은 글자를 다르게 읽는다: ipaddr.js 는 글자 `::a.b.c.d` 를 IPv4 매핑(`::ffff:a.b.c.d`)으로 읽고, 값이 같은
 * `0:0:0:0:0:0:a.b.c.d` 는 IPv6 으로 읽는다. 여기의 손 판독기로 믿음을 재면 그 틈으로 `::0.0.0.0/96`(= IPv4 전부)이 샌다.
 */
import { isIPv6 } from 'node:net'

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

/**
 * 끝 32비트에 IPv4 를 담는 IPv6 대역의 앞 96비트(여덟 묶음 가운데 앞 여섯) — 이 대역의 주소는 한 IPv4 클라이언트다.
 * - IPv4 매핑(`::ffff:0:0/96`) — 듀얼스택 소켓이 IPv4 연결을 내는 꼴.
 * - IPv4 변환(`::ffff:0:0:0/96` — RFC 6145) · NAT64 잘 알려진 접두(`64:ff9b::/96` — RFC 6052) — 변환기 뒤의 IPv4 클라이언트.
 * - IPv4 호환(`::/96` — RFC 4291 이 폐기한 꼴). 첫 바이트가 0 인 것(`::` · `::1` — `0.0.0.0/8` 은 클라이언트 주소가 아니다)은 뺀다.
 * 운영자가 고른 NAT64 접두(`2001:db8:64::/96` 따위)는 모른다 — 그 뒤의 IPv4 클라이언트는 /64 하나로 뭉친다.
 */
const IPV4_CARRIERS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0xffff],
  [0, 0, 0, 0, 0xffff, 0],
  [0x64, 0xff9b, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
]

/** 편 IPv6 이 IPv4 를 담는 꼴(`IPV4_CARRIERS`)이면 그 IPv4 를 `a.b.c.d` 로 준다. */
export function embeddedIPv4(groups: readonly number[]): string | undefined {
  const carrier = IPV4_CARRIERS.find((prefix) => prefix.every((group, i) => groups[i] === group))
  if (carrier === undefined) return undefined
  const high = groups[6] as number
  const low = groups[7] as number
  if (carrier === IPV4_CARRIERS[3] && high >> 8 === 0) return undefined
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}
