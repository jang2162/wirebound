/**
 * **이 브라우저가 낸 노드 복사의 표지** — 붙이기가 봉투의 출처(`source.projectId`)를 믿어도 되는지 가른다(`shell/editor-keys.tsx` 의 `paste`).
 *
 * 봉투는 OS 클립보드의 글이라 누구나 짓는다. 출처를 글이 정하면, 해시와 프로젝트 id 를 아는 사람이 지은 글을 두 프로젝트에 다 든 사람이 붙이는
 * 순간 그 사람의 권한으로 그림이 옮겨진다(가져오기는 성공하면 말이 없다 — `edit/claim-images.ts`). 그래서 복사할 때 그 봉투 글의 sha256 을 적고,
 * 붙일 때 같은 글일 때만 출처를 쓴다. 맞지 않거나 못 읽으면 출처 없는 봉투와 같은 길(가져오기 없음)이다.
 *
 * | 고른 것 | 까닭 |
 * |---|---|
 * | `localStorage` | 같은 브라우저의 다른 탭 · 다른 창에서 낸 복사를 붙이는 정상 판을 지킨다 — `sessionStorage` 는 탭마다 따로라 그 판이 끊긴다 |
 * | 글의 해시를 적는다(글 안에 표지를 싣지 않는다) | 글에 실은 표지는 글을 지은 사람이 그대로 베낀다. 해시는 그 글 그대로일 때만 맞아, 한 글자를 바꾼 글도 안 믿는다. 저장소는 같은 origin 의 페이지만 쓴다 |
 * | 동기 sha256(`crypto.subtle` 아님) | `copy` 이벤트 안에서 적어야 곧바로 친 붙이기가 그 표지를 본다. `crypto.subtle` 은 비동기이고 보안 문맥(https · localhost)에만 있어 http 로 띄운 배포에서는 없다 |
 * | 최근 `COPY_MARKS_MAX` 개만 | 복사마다 쌓이므로 한도를 둔다. 넘으면 오래된 것부터 버린다 — 버린 복사를 다시 붙이면 그림을 안 가져온다(같은 프로젝트 · 그림 없는 노드는 표지가 필요 없다) |
 *
 * 저장소 접근이 던지는 판(사생활 창 · 막은 사이트 데이터)은 적기를 건너뛰고 읽기를 «안 믿음» 으로 둔다.
 */

/** 저장소 키 — 값은 최근 표지(sha256 소문자 16진)의 JSON 배열, 오래된 것이 앞이다. */
export const COPY_MARKS_KEY = 'wirebound:copied-envelopes'
export const COPY_MARKS_MAX = 20

/** 이 브라우저가 이 봉투 글을 복사했다고 적는다. */
export function markCopiedEnvelope(text: string): void {
  const mark = sha256Hex(text)
  try {
    const marks = readMarks().filter((one) => one !== mark)
    marks.push(mark)
    window.localStorage.setItem(COPY_MARKS_KEY, JSON.stringify(marks.slice(-COPY_MARKS_MAX)))
  } catch {
    // 못 적으면 이 복사의 출처를 안 믿는다 — 다른 프로젝트에 붙여도 그림을 안 가져온다.
  }
}

/** 이 봉투 글이 이 브라우저가 복사한 그대로인가. 못 읽으면 `false`. */
export function copiedHere(text: string): boolean {
  try {
    return readMarks().includes(sha256Hex(text))
  } catch {
    return false
  }
}

/** 던질 수 있다(저장소 접근) — 부르는 쪽이 받는다. 모양이 틀린 값은 빈 목록이다. */
function readMarks(): string[] {
  const raw = window.localStorage.getItem(COPY_MARKS_KEY)
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(parsed) ? parsed.filter((one): one is string => typeof one === 'string') : []
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** 글(UTF-8)의 sha256 — 소문자 16진 64 자. */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const length = bytes.length
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64)
  padded.set(bytes)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  // 비트 길이 — 2^53 아래라 위 32비트는 나눗셈으로 얻는다.
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x100000000))
  view.setUint32(padded.length - 4, (length * 8) >>> 0)

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!
      const b = w[i - 2]!
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!]
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + b) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
    h[5] = (h[5]! + f) >>> 0
    h[6] = (h[6]! + g) >>> 0
    h[7] = (h[7]! + hh) >>> 0
  }
  return [...h].map((word) => word.toString(16).padStart(8, '0')).join('')
}
