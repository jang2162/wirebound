import { z } from 'zod'
import type { Interaction, WbNode } from './node'

/**
 * 노드 id로 허용하는 문자 집합.
 * JSON Pointer 이스케이프 문자(`/`, `~`)와 DOM 속성값에서 문제가 되는 문자(공백, 따옴표, `<`)를 배제한다.
 * `createNodeId()`가 만드는 `n_` + hex 12자 형식은 이 집합의 부분집합일 뿐, 이 패턴 자체가 그 형식을 강제하지는 않는다.
 * 설계 §4.4의 레이아웃 예시(`n_root`, `n_hdr`)나 §11.2의 JSON 가져오기가 실어 오는 외부 id도 통과해야 한다.
 */
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const SetPropActionSchema = z.strictObject({
  type: z.literal('setProp'),
  target: z.string(),
  prop: z.string(),
  // 임의 JSON 값. **z.unknown()은 키를 선택적으로 만들지 않는다** — 지금 zod에서
  // `.optional()`이 붙지 않은 필드는 그 타입이 undefined를 받아들이든 말든 키가
  // 없으면 거부된다(변이 검사 결과는 apps/api/src/http/patch-ops.ts의 PatchValue
  // 주석에 있다). 즉 이 키는 필수다. 액션의 의미상 value: undefined와 키 부재는
  // 같은 뜻이라 그 요구가 해롭지 않으므로 그대로 둔다.
  value: z.unknown(),
})

const SetVisibleActionSchema = z.strictObject({
  type: z.literal('setVisible'),
  target: z.string(),
  value: z.boolean(),
})

const SwitchTabActionSchema = z.strictObject({
  type: z.literal('switchTab'),
  target: z.string(),
  tab: z.number(),
})

const NavigateActionSchema = z.strictObject({
  type: z.literal('navigate'),
  target: z.string(),
})

const OpenModalActionSchema = z.strictObject({
  type: z.literal('openModal'),
  target: z.string(),
})

/** 상호작용 액션. 고정 5종이며 `type`으로 판별한다 — 그 밖의 타입(스크립트 등)은 허용하지 않는다. */
const InteractionActionSchema = z.discriminatedUnion('type', [
  SetPropActionSchema,
  SetVisibleActionSchema,
  SwitchTabActionSchema,
  NavigateActionSchema,
  OpenModalActionSchema,
])

/** 상호작용. `on`은 설계 §8.1의 4종 트리거로 고정한다. */
export const InteractionSchema: z.ZodType<Interaction> = z.strictObject({
  on: z.enum(['click', 'change', 'select', 'submit']),
  actions: z.array(InteractionActionSchema),
})

/**
 * 노드 봉투. 선언되지 않은 키는 거부한다 — "노드는 스타일을 갖지 않는다"(설계 §4.3)를
 * 런타임에서 강제하는 지점이다. props의 값 자체는 여기서 검사하지 않는다 —
 * 컴포넌트별 검증은 validate.ts가 카탈로그를 참조해 따로 한다.
 * 재귀는 zod 4의 getter 형태로 쓴다. `z.lazy`보다 타입 추론이 낫다.
 */
export const WbNodeSchema: z.ZodType<WbNode> = z.strictObject({
  id: z.string().regex(NODE_ID_PATTERN),
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  variant: z.string().optional(),
  // 설계 §9의 코멘트 번호는 1부터 시작한다.
  marker: z.int().positive().optional(),
  interactions: z.array(InteractionSchema).optional(),
  get children() {
    return z.array(WbNodeSchema).optional()
  },
})

/** 문서 봉투. `version`은 1부터 시작하는 정수다. */
export const DocumentEnvelopeSchema: z.ZodType<{ version: number; root: WbNode }> = z.strictObject({
  version: z.int().positive(),
  root: WbNodeSchema,
})
