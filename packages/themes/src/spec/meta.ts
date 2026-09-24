import { z } from 'zod'

/**
 * 테마 id로 허용하는 문자 집합. `schema`의 `NODE_ID_PATTERN`과 같은 부류다 —
 * 이 값이 `extends` 문자열과 내보낸 번들의 파일 이름에 그대로 실리므로,
 * 공백·따옴표·경로 구분자(`/`)·`.`을 배제한다. `.`을 뺀 이유는 토큰 참조 경로의
 * 구분자와 겹치지 않게 하려는 것이다.
 */
export const THEME_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * `extends`는 `system:<id>` 하나만 받는다.
 *
 * 근거는 설계서 「상속과 병합」·「테마 관리」 둘이다. 「테마 관리」의 표에서 상속의 출발점으로
 * 적힌 것은 **시스템 테마뿐**이고(파생 테마 = "시스템 테마 상속 + 부분 오버라이드"),
 * 「상속과 병합」은 *"상속 깊이는 1단계로 제한한다"*이다. 접두어를 요구하면 **가리킬 수 있는 대상 자체가 시스템 테마로 좁아지므로**, 깊이 제한이
 * 규격 층에서 절반 지켜진다 — 나머지 절반(시스템 테마가 스스로 `extends`를 갖는 경우)은
 * 병합(`mergeTheme`)이 막는다.
 */
export const EXTENDS_PATTERN = /^system:[A-Za-z0-9_-]{1,64}$/

export interface ThemeMeta {
  id: string
  name: string
  description?: string
  /** `system:<id>` 하나만. 상속 깊이는 1단계다(설계서 「상속과 병합」). */
  extends?: string
  version: string
  /** 갤러리용 썸네일. 생성물이므로 형식을 규격이 정하지 않는다(설계서 「meta」). */
  preview?: string
}

/**
 * `version`은 형식을 강제하지 않고 비어 있지 않은 문자열만 요구한다.
 * 설계서 「테마 관리」는 *"`meta.version`을 기록한다"*까지만 말하고 형식을 주지 않으며, 「스냅샷」이
 * *"스냅샷은 … 당시 테마 내용을 함께 얼린다"*이므로 **복원이 버전 비교에 기대지 않는다.**
 * 즉 이 값은 사람이 읽는 표시이지 해석 대상이 아니다. semver를 강제하면 규격이 근거 없이
 * 좁아진다.
 */
export const MetaSchema: z.ZodType<ThemeMeta> = z.strictObject({
  id: z.string().regex(THEME_ID_PATTERN),
  name: z.string().min(1),
  description: z.string().optional(),
  extends: z.string().regex(EXTENDS_PATTERN).optional(),
  version: z.string().min(1),
  preview: z.string().optional(),
})
