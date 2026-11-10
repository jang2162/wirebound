/**
 * 공통코드 표의 모양 — 프로젝트마다 그룹(`key` · `name`) 여럿, 그룹마다 항목(`value` · `name` · `active`) 여럿. 노드는 DB id 가 아니라
 * «그룹 키 · 코드값»으로 항목을 가리킨다(`WbNode.code` — 정본 설계서 「페이지 스키마 노드」). 그래서 `key` · `value` 는 만든 뒤 못
 * 바꾼다 — 바꾸면 모든 페이지의 참조를 함께 고치는 프로젝트 전역 편집이 된다.
 *
 * `value` · `name` 의 받지 않는 글자는 별칭과 한 벌이다(`alias.ts` 머리말의 표) — 이름은 트리 줄 · 터미널 출력에 그대로 찍히므로 같은
 * 까닭이 그대로 선다. 서버 REST 와 노드 봉투가 이 스키마를 함께 읽는다.
 */
import { z } from 'zod'
import { hasRejectedAliasChar, isBlankAlias } from './alias'

export interface CodeItem {
  value: string
  name: string
  /** 꺼진 항목은 선택 위젯의 선택지에서 빠진다. 대표 글은 그대로 그리고 lint 가 알린다(`inactive-code-ref`). */
  active: boolean
}

export interface CodeGroup {
  key: string
  name: string
  /** 차례대로. */
  items: CodeItem[]
}

/** 그룹 차례대로. */
export type CodeTable = readonly CodeGroup[]

export const CODE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/
export const CODE_VALUE_MAX = 40
export const CODE_NAME_MAX = 60
export const CODE_ITEMS_MAX = 200
export const CODE_GROUPS_MAX = 500

export const CodeKeySchema = z.string().regex(CODE_KEY_PATTERN, '그룹 키는 대문자로 시작하는 대문자 · 숫자 · 밑줄 40자까지입니다')

/** 별칭과 같은 규칙(`envelope.ts` 의 `AliasSchema`)에 상한과 문구만 다르다. */
function codeText(label: string, max: number) {
  return z
    .string()
    .refine((value) => value.trim() === value, { message: `${label} 앞뒤에 공백을 둘 수 없습니다` })
    .refine((value) => [...value].length >= 1 && [...value].length <= max, { message: `${label}은 1 ~ ${max}자입니다` })
    .refine((value) => !hasRejectedAliasChar(value), {
      message: `${label}에 줄을 바꾸는 글자 · 제어 문자 · 방향 제어 글자 · 짝 없는 서로게이트를 둘 수 없습니다`,
    })
    .refine((value) => !isBlankAlias(value), { message: `${label}에 보이는 글자가 없습니다` })
}

export const CodeValueSchema = codeText('코드값', CODE_VALUE_MAX)
export const CodeNameSchema = codeText('코드 이름', CODE_NAME_MAX)

const CodeItemSchema: z.ZodType<CodeItem> = z.strictObject({
  value: CodeValueSchema,
  name: CodeNameSchema,
  active: z.boolean(),
})

const CodeGroupSchema: z.ZodType<CodeGroup> = z.strictObject({
  key: CodeKeySchema,
  name: CodeNameSchema,
  items: z
    .array(CodeItemSchema)
    .max(CODE_ITEMS_MAX, `그룹의 항목은 많아야 ${CODE_ITEMS_MAX}개입니다`)
    .superRefine((items, ctx) => {
      const seen = new Set<string>()
      items.forEach((item, index) => {
        if (seen.has(item.value)) ctx.addIssue({ code: 'custom', path: [index, 'value'], message: `코드값이 겹칩니다: ${item.value}` })
        seen.add(item.value)
      })
    }),
})

/** 표 전체 — 스냅샷 payload · `wireb pull` 덤프가 싣는 꼴이다. */
export const CodeTableSchema: z.ZodType<CodeGroup[]> = z
  .array(CodeGroupSchema)
  .max(CODE_GROUPS_MAX, `공통코드 그룹은 많아야 ${CODE_GROUPS_MAX}개입니다`)
  .superRefine((groups, ctx) => {
    const seen = new Set<string>()
    groups.forEach((group, index) => {
      if (seen.has(group.key)) ctx.addIssue({ code: 'custom', path: [index, 'key'], message: `그룹 키가 겹칩니다: ${group.key}` })
      seen.add(group.key)
    })
  })
