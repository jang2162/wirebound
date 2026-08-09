import { z } from 'zod'
import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import { own } from '../own'
import { MetaSchema, type ThemeMeta } from '../spec/meta'
import { ThemeSchema, type Theme } from '../spec/theme'

/**
 * 파생 테마 문서. **`Theme`이 아니다.**
 *
 * 재라 #5의 답은 *"규격이 `null`을 받지 않는다"*다 — `tokens.semantic.danger`·`tokens`·
 * `assets.fonts`·`components.List` 어디에 넣어도 `ThemeSchema`가 거부하는 것을 쟀다.
 * 그런데 §6.9는 *"`null`을 명시하면 상속된 키를 삭제한다"*이므로 파생 문서는 `Theme`이
 * 될 수 없다. **그래서 규격을 따로 둔다.**
 *
 * 다만 `Theme`을 통째로 베껴 `null`을 허용하는 평행 규격은 만들지 않는다. 그 형태는
 * 두 규격이 손으로 맞춰야 하고 어긋나도 아무것도 알려 주지 않는다 — 이 저장소가
 * 반복해서 겪은 부류다. 대신 **`null`을 병합 지시로 보고 절 안쪽 검사를 병합 뒤로 미룬다**:
 * 여기서는 최상위 절 이름과 `meta`만 보고, 나머지는 `unknown`으로 통과시킨 뒤
 * **병합 결과를 `ThemeSchema`가 검사한다.** 그러면 `null`은 결과에 남지 않으므로
 * 규격을 손댈 이유가 없고, 파생 문서의 오타도 결과 검사에서 잡힌다.
 *
 * 두 규격이 같은 절을 선언하는지는 `test/merge.test.ts`가 두 스키마의 shape를 대조한다.
 */
export interface ThemePatch {
  meta: ThemeMeta
  tokens?: unknown
  primitives?: unknown
  components?: unknown
  patterns?: unknown
  assets?: unknown
}

export const ThemePatchSchema: z.ZodType<ThemePatch> = z.strictObject({
  meta: MetaSchema,
  // `.optional()`이 필요하다. `z.unknown()`만으로는 키가 **없을 때** 거부된다 —
  // `schema/src/envelope.ts`가 같은 자리를 실측해 적어 뒀고 여기서도 케이스가 그것을 잡았다.
  tokens: z.unknown().optional(),
  primitives: z.unknown().optional(),
  components: z.unknown().optional(),
  patterns: z.unknown().optional(),
  assets: z.unknown().optional(),
})

/**
 * §6.9의 상속을 적용한다. **던지지 않는다** — 이슈를 모아서 낸다.
 *
 * 규칙 넷은 §6.9 그대로다. 객체는 깊은 병합, 배열은 교체, `null`은 삭제, 깊이는 1단계.
 *
 * **`meta`는 병합하지 않고 파생의 것을 그대로 쓴다.** §6.2·6.9를 대조해 정했다.
 * (1) `MetaSchema`가 `id`·`name`·`version`을 필수로 두므로 파생 문서에 늘 있고 병합할 빈자리가
 * 없다. (2) `preview`는 *"갤러리용 썸네일(생성물)"*이라 물려받으면 **다른 테마의 그림을 자기
 * 것이라 말하게 된다.** (3) `extends`까지 병합하면 결과가 다시 파생 테마처럼 보여 깊이 1
 * 규칙이 흐려진다.
 *
 * **결과가 `base`·`patch`와 구조를 공유하지 않아야 하는 이유**는 시스템 테마가 읽기
 * 전용(§6.10)이고 P4b가 그것을 모듈 상수로 둘 것이기 때문이다. 결과의 하위 객체가 base의
 * 것이면 한 번의 실수가 그 상수를 오염시킨다.
 *
 * **무엇이 그것을 막는지 재서 갈랐다.** 대부분은 `ThemeSchema.safeParse`가 막는다 —
 * 파싱이 객체 그래프를 새로 지어 `tokens`·`assets.fonts`·`fonts[0]`·`components.List.base`·
 * 패턴 노드까지 입력과 다른 참조가 나왔다. **다만 `z.unknown()` 잎은 참조로 그대로
 * 지나간다** — 패턴 노드의 `props` 값이 그 자리이고, 거기서만 공유가 남는다.
 * 그 한 자리를 아래 `copy`가 막는다(케이스가 base·patch 양쪽으로 그것을 잰다).
 *
 * `structuredClone`을 부르지 않는 이유는 병합이 지나는 마디를 그 자리에서 복사해 한 번 더 훑는 것이
 * 잉여이고, `themes`의 tsconfig가 `lib: ["ES2022"]`·`types: []`이라 그 전역이 타입에 없어
 * `schema`처럼 `globals.d.ts`를 또 만들어야 하기 때문이다.
 */
export function mergeTheme(
  base: Theme,
  patch: ThemePatch,
): { theme: Theme | null; issues: ThemeIssue[] } {
  const relation = checkExtends(base, patch)
  if (relation !== null) return { theme: null, issues: [relation] }

  const merged: Record<string, unknown> = {}
  for (const section of SECTIONS) {
    if (section === 'meta') continue
    const next = mergeValue(own(base as unknown as Record<string, unknown>, section), own(patch as unknown as Record<string, unknown>, section))
    if (next !== DELETED) merged[section] = next
  }
  merged['meta'] = copy(patch.meta)

  const parsed = ThemeSchema.safeParse(merged)
  if (!parsed.success) {
    return {
      theme: null,
      issues: parsed.error.issues.map((entry) =>
        issue('bad-spec', entry.path.join('.'), `병합 결과가 규격을 지키지 않습니다: ${entry.message}`),
      ),
    }
  }
  return { theme: parsed.data, issues: [] }
}

/** `ThemeSchema`가 선언한 절. 손으로 적지 않고 반사로 읽는다 — 두 곳이 어긋날 자리를 없앤다. */
const SECTIONS: readonly string[] = Object.keys(
  (ThemeSchema as unknown as { shape: Record<string, unknown> }).shape,
)

function checkExtends(base: Theme, patch: ThemePatch): ThemeIssue | null {
  if (patch.meta.extends === undefined) {
    return issue(
      'bad-extends',
      'meta.extends',
      '상속을 선언하지 않은 문서는 병합 대상이 아닙니다',
    )
  }
  if (base.meta.extends !== undefined) {
    return issue(
      'bad-extends',
      'meta.extends',
      `상속 깊이는 1단계입니다 — 상속받은 테마(${base.meta.id})를 다시 상속할 수 없습니다`,
    )
  }
  const expected = `system:${base.meta.id}`
  if (patch.meta.extends !== expected) {
    return issue(
      'bad-extends',
      'meta.extends',
      `상속 대상과 주어진 테마가 다릅니다: ${patch.meta.extends}를 선언했는데 ${expected}가 왔습니다`,
    )
  }
  return null
}

/** `null`이 지시하는 삭제. `undefined`와 갈라야 해서 따로 둔다. */
const DELETED = Symbol('deleted')

function mergeValue(baseValue: unknown, patchValue: unknown): unknown {
  if (patchValue === null) return DELETED
  if (patchValue === undefined) return baseValue === undefined ? DELETED : copy(baseValue)
  if (!isPlainObject(baseValue) || !isPlainObject(patchValue)) return copy(patchValue)

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(baseValue)) {
    const next = mergeValue(own(baseValue, key), own(patchValue, key))
    if (next !== DELETED) out[key] = next
  }
  for (const key of Object.keys(patchValue)) {
    if (Object.hasOwn(out, key)) continue
    const next = mergeValue(undefined, own(patchValue, key))
    if (next !== DELETED) out[key] = next
  }
  return out
}

/**
 * 배열은 §6.9에 따라 **교체**한다 — 여기서 원소를 병합하지 않는 것이 그 규칙이다.
 * 다만 담긴 객체까지 복사해 원본과 구조를 공유하지 않게 한다.
 */
function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy)
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) out[key] = copy(own(value, key))
  return out
}

/**
 * 깊은 병합의 대상이 되는 것. 배열·`null`·클래스 인스턴스를 뺀다 —
 * §6.9가 병합한다고 말한 것은 객체이고 배열은 따로 적었다.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
