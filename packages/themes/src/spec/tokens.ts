import { z } from 'zod'

/**
 * 토큰 이름. `palette`의 키가 `"blue.500"`이므로(설계서 「tokens — 3단 분리」) 점을 허용한다 —
 * 즉 **참조 경로의 마디 수와 토큰 이름의 마디 수는 같지 않다.**
 * 참조 `palette.blue.500`은 이름공간 `palette` + 이름 `blue.500`이다.
 */
const TOKEN_NAME = /^[A-Za-z0-9_.-]+$/

/** 참조가 아니라 값으로 실리는 것. `lineHeight: 1.1`·`fontWeight: 700`이 수다(「tokens — 3단 분리」). */
const TokenValue = z.union([z.string(), z.number()])

export interface ThemeTokens {
  palette?: Record<string, string>
  semantic?: Record<string, string>
  scale?: {
    /**
     * `unit` 하나만 받는다. 「tokens — 3단 분리」: *"`space.unit`만 정의하면 `space.1`~`space.24`가
     * 배수로 파생되므로 간격 토큰을 나열할 필요가 없다."* 개별 단계를 덮어쓰는 문법이
     * 설계에 없으므로 열지 않는다 — 열면 파생과 나열이 섞여 무엇이 이기는지를
     * 이 단계가 근거 없이 정하게 된다.
     */
    space?: { unit: string }
    radius?: Record<string, string>
    shadow?: Record<string, string>
    /** 항목 하나가 객체다 — `h1: { fontSize, lineHeight, … }`·`family: { sans, … }`. */
    typography?: Record<string, Record<string, string | number>>
    motion?: Record<string, string>
  }
}

export const TokensSchema: z.ZodType<ThemeTokens> = z.strictObject({
  palette: z.record(z.string().regex(TOKEN_NAME), z.string()).optional(),
  semantic: z.record(z.string().regex(TOKEN_NAME), z.string()).optional(),
  scale: z
    .strictObject({
      space: z.strictObject({ unit: z.string() }).optional(),
      radius: z.record(z.string().regex(TOKEN_NAME), z.string()).optional(),
      shadow: z.record(z.string().regex(TOKEN_NAME), z.string()).optional(),
      typography: z
        .record(z.string().regex(TOKEN_NAME), z.record(z.string().regex(TOKEN_NAME), TokenValue))
        .optional(),
      motion: z.record(z.string().regex(TOKEN_NAME), z.string()).optional(),
    })
    .optional(),
})
