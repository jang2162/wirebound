import { z } from 'zod'
import { hasRejectedAliasChar, isBlankAlias } from './alias'
import {
  DEFAULT_CASE,
  NODE_ALIAS_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type Interaction,
  type ViewState,
  type WbNode,
} from './node'

/**
 * 노드 id로 허용하는 문자 집합.
 * JSON Pointer 이스케이프 문자(`/`, `~`)와 DOM 속성값에서 문제가 되는 문자(공백, 따옴표, `<`)를 배제한다.
 * `createNodeId()`가 만드는 `n_` + hex 12자 형식은 이 집합의 부분집합일 뿐, 이 패턴 자체가 그 형식을 강제하지는 않는다.
 * 설계서 「레이아웃」의 예시(`n_root`, `n_hdr`)나 설계서 「페이지 JSON」의 가져오기가 실어 오는 외부 id도 통과해야 한다.
 */
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const SetPropActionSchema = z.strictObject({
  type: z.literal('setProp'),
  target: z.string(),
  prop: z.string(),
  // 임의 JSON 값. **z.unknown()은 키를 선택적으로 만들지 않는다** — 지금 zod에서
  // `.optional()`이 붙지 않은 필드는 그 타입이 undefined를 받아들이든 말든 키가
  // 없으면 거부된다(그 근거와 다시 재는 법은 apps/api/src/http/patch-ops.ts의 PatchValue
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

/** 상호작용. `on`은 설계서 「모델」(상호작용)의 4종 트리거로 고정한다. */
export const InteractionSchema: z.ZodType<Interaction> = z.strictObject({
  on: z.enum(['click', 'change', 'select', 'submit']),
  actions: z.array(InteractionActionSchema),
})

/**
 * 별칭의 모양 — 앞뒤 공백 없음 · 1 ~ `NODE_ALIAS_MAX` 자(코드 포인트 — 이모지 하나가 한 글자) · 받지 않는 글자 없음 · 보이는
 * 글자 있음. 받지 않는 글자와 «보이는 글자»는 화면의 다듬기와 한 벌이다(`alias.ts` 머리말의 표). 앞뒤 공백은 **걷은 값만
 * 받는다** — 화면은 걷어서 보내고, 걷지 않은 값을 받으면 같은 별칭이 공백만 달라 둘로 갈린다.
 */
const AliasSchema = z
  .string()
  .refine((value) => value.trim() === value, { message: '별칭 앞뒤에 공백을 둘 수 없습니다' })
  .refine((value) => [...value].length >= 1 && [...value].length <= NODE_ALIAS_MAX, {
    message: `별칭은 1 ~ ${NODE_ALIAS_MAX}자입니다`,
  })
  .refine((value) => !hasRejectedAliasChar(value), {
    message: '별칭에 줄을 바꾸는 글자 · 제어 문자 · 방향 제어 글자 · 짝 없는 서로게이트를 둘 수 없습니다',
  })
  .refine((value) => !isBlankAlias(value), { message: '별칭에 보이는 글자가 없습니다' })

/**
 * 노드 봉투. 선언되지 않은 키는 거부한다 — "노드는 스타일을 갖지 않는다"(설계서 「페이지 스키마 노드」)를
 * 런타임에서 강제하는 지점이다. props의 값 자체는 여기서 검사하지 않는다 —
 * 컴포넌트별 검증은 validate.ts가 카탈로그를 참조해 따로 한다.
 * 재귀는 zod 4의 getter 형태로 쓴다. `z.lazy`보다 타입 추론이 낫다.
 */
export const WbNodeSchema: z.ZodType<WbNode> = z.strictObject({
  id: z.string().regex(NODE_ID_PATTERN),
  type: z.string().min(1),
  alias: AliasSchema.optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  variant: z.string().optional(),
  weight: z.int().min(WEIGHT_MIN).max(WEIGHT_MAX).optional(),
  // 설계서 「설계서 화면 구조」의 코멘트 번호는 1부터 시작한다.
  marker: z.int().positive().optional(),
  interactions: z.array(InteractionSchema).optional(),
  get children() {
    return z.array(WbNodeSchema).optional()
  },
})

/**
 * 문서 봉투. `version`은 1부터 시작하는 정수다. **레이아웃 문서의 봉투다** — 페이지는 상태 목록을 더한 `PageEnvelopeSchema`를
 * 쓴다. 레이아웃에는 화면 상태가 없어 `viewStates`를 든 레이아웃은 여기서 모르는 키로 거절된다.
 */
export const DocumentEnvelopeSchema: z.ZodType<{ version: number; root: WbNode }> = z.strictObject({
  version: z.int().positive(),
  root: WbNodeSchema,
})

/**
 * 상태 이름의 모양 — 별칭과 같은 규칙에 상한만 다르다(`AliasSchema`의 머리말 · `alias.ts` 머리말의 표). 앞뒤 공백은 걷은 값만
 * 받는다: 화면이 걷어서 보내고, 걷지 않은 값을 받으면 같은 이름이 공백만 달라 둘로 갈린다(겹침 판정이 그 둘을 못 가른다).
 */
const ViewStateNameSchema = z
  .string()
  .refine((value) => value.trim() === value, { message: '상태 이름 앞뒤에 공백을 둘 수 없습니다' })
  .refine((value) => [...value].length >= 1 && [...value].length <= VIEW_STATE_NAME_MAX, {
    message: `상태 이름은 1 ~ ${VIEW_STATE_NAME_MAX}자입니다`,
  })
  .refine((value) => !hasRejectedAliasChar(value), {
    message: '상태 이름에 줄을 바꾸는 글자 · 제어 문자 · 방향 제어 글자 · 짝 없는 서로게이트를 둘 수 없습니다',
  })
  .refine((value) => !isBlankAlias(value), { message: '상태 이름에 보이는 글자가 없습니다' })

/**
 * 상태 하나. `id`는 노드 id 규칙이고 `default`(기본 가지의 표지 — `DEFAULT_CASE`)일 수 없다 — 그 id 의 상태가 있으면 그 상태의
 * 가지와 기본 가지가 한 값으로 겹쳐 «기본 가지 정확히 하나»가 그 상태의 가지를 막는다.
 */
const ViewStateSchema: z.ZodType<ViewState> = z.strictObject({
  id: z
    .string()
    .regex(NODE_ID_PATTERN)
    .refine((id) => id !== DEFAULT_CASE, { message: `상태 id 로 ${DEFAULT_CASE}를 쓸 수 없습니다` }),
  name: ViewStateNameSchema,
})

/**
 * 페이지의 상태 목록 — 많아야 `VIEW_STATES_MAX`개, id 와 이름이 각각 겹치지 않는다. 이름 겹침은 글자 그대로 견준다(대소문자 ·
 * 정규화를 접지 않는다 — 화면에 다르게 보이는 두 이름을 하나로 막지 않는다).
 */
export const ViewStatesSchema: z.ZodType<ViewState[]> = z
  .array(ViewStateSchema)
  .max(VIEW_STATES_MAX, `상태는 많아야 ${VIEW_STATES_MAX}개입니다`)
  .superRefine((states, ctx) => {
    const ids = new Set<string>()
    const names = new Set<string>()
    states.forEach((state, index) => {
      if (ids.has(state.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `상태 id 가 겹칩니다: ${state.id}` })
      if (names.has(state.name)) {
        ctx.addIssue({ code: 'custom', path: [index, 'name'], message: `상태 이름이 겹칩니다: ${state.name}` })
      }
      ids.add(state.id)
      names.add(state.name)
    })
  })

/** 페이지 문서의 봉투 — 레이아웃 봉투(`DocumentEnvelopeSchema`)에 상태 목록을 더한 것. 저장 경계 · 가져오기 · 스냅샷이 쓴다. */
export const PageEnvelopeSchema: z.ZodType<{ version: number; root: WbNode; viewStates?: ViewState[] }> = z.strictObject({
  version: z.int().positive(),
  root: WbNodeSchema,
  viewStates: ViewStatesSchema.optional(),
})
