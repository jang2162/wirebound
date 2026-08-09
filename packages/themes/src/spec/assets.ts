import { z } from 'zod'

/**
 * §6.7의 *"내장 아이콘 세트 중 선택"*이 가리키는 목록.
 *
 * **이 목록은 손으로 적었다.** 아이콘 세트를 등록하는 코드가 없어 카탈로그 대조(Task 4가
 * `listComponents()`로 하는 것) 같은 것을 만들 수 없다. 대신 `test/spec-meta.test.ts`가
 * **§6.7 블록을 읽어 설계가 쓰는 세트 이름이 이 목록 안인지 본다** — 설계가 다른 세트를
 * 쓰기 시작하면 그 케이스가 죽는다. 처음에는 여기 *"설계 문서 전체에서 … 하나뿐"*이라고
 * 적었는데 기계가 지키지 않는 완결성 주장이었다.
 *
 * 자유 문자열로 두지 않은 이유: "내장"은 번들된 리소스를 뜻하므로, 세트가 늘 때 코드가
 * 함께 바뀌어야 한다. 열어 두면 오타가 통과해 렌더 시점까지 간다.
 */
export const ICON_SETS = ['lucide'] as const

/** §6.7. `Media`·`Placeholder`의 표현을 결정한다. */
export const PLACEHOLDER_STYLES = ['skeleton', 'blueprint', 'photo', 'solid'] as const

export interface ThemeFont {
  family: string
  src: string
  weights?: number[]
}

export interface ThemeAssets {
  fonts?: ThemeFont[]
  icons?: (typeof ICON_SETS)[number]
  placeholder?: { style: (typeof PLACEHOLDER_STYLES)[number] }
}

/**
 * `assets`는 **선언을 검증할 뿐 리소스를 가져오지 않는다.** `src`가 실제로 받아지는지,
 * 폰트 파일이 존재하는지는 이 패키지가 확인하지 않는다.
 *
 * `weights`를 선택으로 둔 것은 가중치를 선언하지 않은 폰트도 의미가 있기 때문이다
 * (브라우저가 합성한다). §6.7의 예시가 셋을 다 갖는 것은 예시가 그럴 뿐이다.
 */
export const AssetsSchema: z.ZodType<ThemeAssets> = z.strictObject({
  fonts: z
    .array(
      z.strictObject({
        family: z.string().min(1),
        src: z.string().min(1),
        weights: z.array(z.int().min(1).max(1000)).optional(),
      }),
    )
    .optional(),
  icons: z.enum(ICON_SETS).optional(),
  placeholder: z.strictObject({ style: z.enum(PLACEHOLDER_STYLES) }).optional(),
})
