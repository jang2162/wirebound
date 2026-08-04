/**
 * Postgres의 text/jsonb가 NUL(U+0000)을 담지 못하는 제약을 애플리케이션 경계에서
 * 막는다. 브라우저에서도 도는 `@wirebound/schema`가 아니라 여기(Postgres를 아는
 * 계층)에 있는 이유이기도 하다.
 *
 * `db/`에 두는 이유: 이 함수의 존재 이유가 순전히 Postgres의 저장 제약이고,
 * 호출자는 `routes/`와 `services/` 양쪽이기 때문이다.
 */

/**
 * NUL(U+0000) 문자를 담은 상수. 이스케이프 시퀀스를 소스에 직접 타이핑하면 도구
 * 체인(에디터·JSON 파이프라인)에 따라 실제 제어 문자로 오인돼 조용히 치환되는
 * 사고가 나기 쉽다 — 이 파일에서 실제로 한 번 겪었다. `String.fromCharCode(0)`은
 * 소스 텍스트 어디에도 그 문자를 직접 적지 않고 런타임에 만들어 그 위험을 피한다.
 */
const NUL_CHAR = String.fromCharCode(0)

/**
 * 문서 트리 안 어딘가의 문자열에 NUL 문자(U+0000)가 있는지 재귀로 훑는다. **값뿐
 * 아니라 객체의 키도 검사한다** — `Object.values`만 훑으면 키에 박힌 NUL을
 * 놓친다. `props`(카탈로그가 `z.strictObject`로 키를 고정하므로 실제로는 막힌다)
 * 보다, `interactions[].actions[].value`(`SetPropActionSchema`의 `z.unknown()`,
 * `envelope.ts`)가 진짜 구멍이다 — `validateTree`(`validate.ts`)가 액션의
 * `value` 내용은 전혀 들여다보지 않으므로, `{ value: { "a<NUL>b": 1 } }`처럼
 * 키에 NUL을 심으면 봉투 검증도 카탈로그 검증도 통과해 버린다. `JSON.stringify`는
 * 객체 키도 값과 똑같이 이스케이프하므로, 키에 있든 값에 있든 저장 시
 * `schema::jsonb` 캐스팅이 `22P05`로 죽는 건 같다 — 이 함수가 검사하는 이유도
 * 같다. `props`가 `z.record(z.string(), z.unknown())`(패키지 schema)이라 임의로
 * 중첩된 값을 실을 수 있으므로, 문자열이 아닌 값(배열·객체)은 재귀로 계속
 * 내려가고 그 밖의 원시값(숫자·불리언·null 등)은 NUL을 가질 수 없으므로 그대로
 * 통과시킨다. 배열은 키가 숫자 인덱스뿐이라 NUL을 담을 수 없으므로 원소(값)만
 * 재귀한다.
 */
export function containsNulByte(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NUL_CHAR)
  if (Array.isArray(value)) return value.some(containsNulByte)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entryValue]) => key.includes(NUL_CHAR) || containsNulByte(entryValue),
    )
  }
  return false
}
