/**
 * manifest 의 `version` · `sdk` 가 쓰는 semver 의 좁은 부분집합. 라이브러리를 들이지 않는다 — 받는 꼴이 셋뿐이라
 * 범위 문법 전체(`>=` · `||` · 선행 판 꼬리표)를 들이면 검증이 받는 것이 이 표보다 넓어진다.
 *
 * **0.x 의 `^` 도 «같은 major» 로 읽는다** — npm 은 `^0.3.0` 을 `<0.4.0` 으로 읽지만 여기서는 `0.9.0` 도 든다.
 * 작성자 지침(템플릿 `SKILL.md` 「sdk 범위」)이 같은 뜻을 적는다.
 */
export const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/
export const SDK_RANGE_PATTERN = /^([~^]?)(\d+)\.(\d+)\.(\d+)$/

function parts(v: string): [number, number, number] {
  const m = VERSION_PATTERN.exec(v)
  if (!m) throw new Error(`판이 x.y.z 가 아닙니다: ${v}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}

/** `range` 가 세 꼴(`^x.y.z` · `~x.y.z` · `x.y.z`) 밖이면 거짓이다 — 모르는 범위를 받아 주지 않는다. */
export function satisfiesSdk(range: string, version: string): boolean {
  const m = SDK_RANGE_PATTERN.exec(range)
  if (!m) return false
  const base = `${m[2]}.${m[3]}.${m[4]}`
  const [vMajor, vMinor] = parts(version)
  if (m[1] === '') return compareVersions(version, base) === 0
  if (vMajor !== Number(m[2])) return false
  if (m[1] === '~' && vMinor !== Number(m[3])) return false
  return compareVersions(version, base) >= 0
}
