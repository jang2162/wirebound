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
 * 사고가 나기 쉽다. `String.fromCharCode(0)`은
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

/** 문자열에 짝 없는 서로게이트(높은 쪽 D800–DBFF 뒤에 낮은 쪽 DC00–DFFF 가 안 오거나, 낮은 쪽이 홀로 선 것)가 있는가. */
function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/**
 * 문서 트리 안 어딘가의 문자열(값 · 객체 키)에 **짝 없는 서로게이트**가 있는지 훑는다 — `containsNulByte` 와 같은 모양의 훑기다.
 * `JSON.stringify` 는 외짝을 이스케이프 글자로 그대로 내보내고 Postgres 의 `::jsonb` 캐스팅이 `22P02`(invalid input syntax for type
 * json)로 죽어 **500** 이 된다. 텍스트 칸(`text`)에는 `pg` 가 UTF-8 로 옮기며 U+FFFD 로 바꿔 쓰므로 죽지 않는다 — 이 함수가 지키는 것은
 * **jsonb 로 가는 입구**(편집 ops · 문서 · 프리셋 · 스냅샷)다.
 */
export function containsLoneSurrogate(value: unknown): boolean {
  if (typeof value === 'string') return hasLoneSurrogate(value)
  if (Array.isArray(value)) return value.some(containsLoneSurrogate)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entryValue]) => hasLoneSurrogate(key) || containsLoneSurrogate(entryValue),
    )
  }
  return false
}

/**
 * **사용자가 보낸 글자에 NUL 이 있어 쓰기 전에 거절한다** — `http/error-handler.ts`가 400 `bad-request`로
 * 낸다(그 자리가 이 클래스의 유일한 번역자다 — 라우트가 따로 잡지 않는다).
 *
 * # 무엇을 막나
 *
 * 판정이 한 라우트에만 있으면 같은 칸을 쓰는 다른 라우트가 NUL 을 DB 까지 흘려 **500** 을 낸다 — 가져오기만
 * 제목·설명을 보면 같은 칸을 쓰는 `PATCH .../pages/:pageId`가 500 이다. 같은 부류(검증 없이 DB 에 닿는
 * 텍스트 입력)로 이 클래스가 지키는 칸:
 *
 * | 라우트 | 칸 |
 * |---|---|
 * | `POST /api/projects` · `PATCH /api/projects/:id` | `name` · `description` |
 * | `POST …/menu` · `PATCH …/menu/:nodeId` | `title` |
 * | `POST …/pages` · `PATCH …/pages/:pageId` | `title` · `description` |
 * | `POST …/pages/import` | `title`(본문 · 파일) · `description`(파일) |
 *
 * 자기 자리에서 막는 것: 코멘트 본문(`repos/comments.ts`) · 토큰 이름(`routes/tokens.ts`) ·
 * 프리셋(`repos/presets.ts`) · 스냅샷 태그·설명(`repos/snapshots.ts`) · 문서
 * (`PUT .../schema` · 편집 파이프라인 8단계). **닿지 않는 것**: 로그인·초대의 이메일(zod 의 이메일 형식이 400) ·
 * 로그인 비밀번호(해시와 비교할 뿐 저장하지 않는다 — 401) · 슬러그(정규식) · 멱등 키(정규식) · 쿠키·토큰
 * (해시만 질의에 실린다) · 경로의 id(uuid).
 *
 * **막는 자리는 저장소의 쓰기 함수다** — 라우트가 아니라. 가져오기 · 생성 · 수정이 **같은 `insertPage`·
 * `updatePage`를 지나므로** 판정이 한 벌이 된다(가져오기가 앞에서 따로 보지 않는다). 코멘트·프리셋·스냅샷의
 * «마지막 방벽»과 같은 층이다.
 */
export class NulByteError extends Error {
  constructor(what: string) {
    super(`${what}에 NUL 문자(U+0000)를 포함할 수 없습니다`)
    this.name = 'NulByteError'
  }
}

/** `values` 중 하나라도 NUL 을 담으면 `NulByteError`를 던진다. 판정은 `containsNulByte` 하나다. */
export function assertNoNulBytes(what: string, ...values: unknown[]): void {
  if (values.some(containsNulByte)) throw new NulByteError(what)
}
