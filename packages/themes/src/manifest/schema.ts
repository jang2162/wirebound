import { getComponent, getKoreanErrorMap, installCatalog, PAGE_LAYOUTS } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { z } from 'zod'
import { SDK_RANGE_PATTERN, VERSION_PATTERN } from './semver'
import { checkTokens } from './tokens'

export type ManifestIssueCode =
  | 'shape'
  | 'bad-version'
  | 'bad-sdk-range'
  | 'unknown-token-ref'
  | 'token-ref-type'
  | 'token-ref-cycle'
  | 'token-default-type'
  | 'token-select-default'
  | 'unknown-component'
  | 'variant-from-component'
  | 'duplicate-variant'
  | 'default-variant-missing'
  | 'unknown-hide-prop'
  /** 두 토큰 키가 같은 CSS 변수 이름이 된다(`a.b` · `a-b` → `--wb-a-b`). */
  | 'token-var-collision'
  /** `tokensCss` · `tokenValues` 에 받은 값의 키가 선언에 없다 — manifest 검증은 내지 않는다. */
  | 'unknown-token'
  /** 토큰 값(기본값 · 받은 값)에 C0 제어 글자 · U+007F · 짝 없는 서로게이트가 있다(`checkTokenValue`). */
  | 'token-value-char'
  /** `layouts` 의 키가 페이지 레이아웃(`PAGE_LAYOUTS`)이 아니다. */
  | 'unknown-layout'
  /** 레이아웃 영역 id 가 꼴(`LAYOUT_REGION_ID`) 밖이다. */
  | 'bad-region-id'
  /** 한 레이아웃 안에서 영역 id 가 겹친다. */
  | 'duplicate-region'
  /** 한 레이아웃의 영역이 `LAYOUT_REGIONS_MAX` 를 넘는다. */
  | 'too-many-regions'

export interface ManifestIssue {
  code: ManifestIssueCode
  /** manifest 안의 자리. `components.DataGrid.variants.1.hideProps.0` 처럼 점으로 잇는다. */
  path: string
  message: string
}

const TOKEN_KEY = /^[a-zA-Z0-9.-]+$/
const THEME_ID = /^[a-z0-9-]+$/

const tokenBase = { label: z.string().min(1), group: z.string().min(1).optional(), default: z.union([z.string(), z.number()]) }

/** `options` 는 `select` 에만 있다 — 다른 타입에 붙은 `options` 는 편집 GUI 가 안 읽어 조용히 버려진다. */
const TokenDeclSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['color', 'length', 'number', 'font', 'shadow']), ...tokenBase }),
  z.strictObject({ type: z.literal('select'), options: z.array(z.string().min(1)).min(1), ...tokenBase }),
])

/** 레이아웃 영역 id 의 꼴 — 표시 옵션 저장의 열쇠(`<레이아웃>.<id>`)에 들어간다. */
export const LAYOUT_REGION_ID = /^[a-z][A-Za-z0-9]{0,31}$/

/** 한 레이아웃이 선언할 수 있는 영역 수 — «보기» 메뉴가 한 화면에 담는 항목 수다. */
export const LAYOUT_REGIONS_MAX = 8

/** 레이아웃 선언의 모양. 키 셋 · id 꼴 · 겹침 · 수는 `checkLayouts` 가 이슈로 모은다(한 번에 다 고치게). */
const LayoutDeclSchema = z.strictObject({
  regions: z.array(z.strictObject({ id: z.string(), label: z.string().min(1).max(20), toggle: z.boolean().optional() })),
})

const VariantDeclSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  hideProps: z.array(z.string()).optional(),
})

/**
 * manifest 의 **모양**. 판 · 범위 · 참조 · 카탈로그 대조는 모양을 지난 값에 `validateManifest` 가 따로 돌린다 —
 * 모양 검사에 넣으면(`superRefine` · 정규식) 한 필드가 틀린 순간 나머지 검사가 안 돌아 작성자가 하나씩 고친다.
 */
export const ManifestSchema = z.strictObject({
  id: z.string().regex(THEME_ID),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string(),
  sdk: z.string(),
  preview: z.string().optional(),
  tokens: z.strictObject({
    groups: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1) })).optional(),
    items: z.record(z.string().regex(TOKEN_KEY), TokenDeclSchema),
  }),
  components: z.record(z.string(), z.strictObject({ variants: z.array(VariantDeclSchema).min(1), defaultVariant: z.string() })).optional(),
  layouts: z.record(z.string(), LayoutDeclSchema).optional(),
}) satisfies z.ZodType<ThemeManifest>

/**
 * 걷은 `patterns`(테마가 싣던 구성 레시피)를 실은 manifest 의 이슈. 아는 키가 아니라 `ManifestSchema` 도 거절하지만 그 문장은 «알 수 없는 키» 라
 * 작성자가 까닭을 모른다 — 그래서 모양 검사 앞에서 따로 짚고, 그 키를 뺀 나머지로 모양 검사를 이어 이슈를 한 번에 모은다.
 */
export const PATTERNS_RETIRED =
  'patterns 는 더 지원하지 않습니다 — 테마는 구성 레시피를 싣지 않습니다. 되풀이해 넣을 묶음은 에디터에서 모듈로 저장하세요'

/**
 * manifest 를 검증한다 — 빌드(`wb-theme build`) · 업로드 · 호스트가 이 함수 하나를 부른다. 이슈를 모아서 돌려주고,
 * 하나라도 있으면 `manifest` 는 `null` 이다.
 */
/**
 * 카탈로그에 기대는 검사 — 선언한 컴포넌트 · prop 이 지금 카탈로그에 있는가. **저장된 패키지를 다시 읽을 때(`stored`)는 이 셋을 안 본다** —
 * 그 판은 올린 때의 카탈로그로 검사를 지났고, 뒤에 카탈로그가 타입 · prop 을 걷어도(문서 판 5 가 `List` 를 걷었다 — 기본테마 1.6.0 이 그 변형을
 * 선언한다) 그 판에 고정한 프로젝트의 내보내기가 테마 없이 나가면 안 된다. 걷힌 타입의 선언은 렌더러 · 패널이 안 읽는다(없는 타입이다).
 */
const CATALOG_CODES: ReadonlySet<ManifestIssueCode> = new Set(['unknown-component', 'variant-from-component', 'unknown-hide-prop'])

export function validateManifest(
  raw: unknown,
  options: { stored?: boolean } = {},
): { manifest: ThemeManifest | null; issues: ManifestIssue[] } {
  // 카탈로그를 안 깐 호출자(빌드 · 업로드)가 모든 컴포넌트를 «카탈로그에 없다» 로 거짓 거부받지 않게. 멱등이다.
  installCatalog()

  const protoKeys = protoKeyPaths(raw)
  if (protoKeys.length > 0) {
    return {
      manifest: null,
      issues: protoKeys.map((path) => ({ code: 'shape', path, message: '__proto__ 키는 쓸 수 없습니다' })),
    }
  }

  const { rest, issues } = withoutPatterns(raw)
  const parsed = ManifestSchema.safeParse(rest, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    return {
      manifest: null,
      issues: [...issues, ...parsed.error.issues.map((i) => ({ code: 'shape' as const, path: i.path.join('.'), message: i.message }))],
    }
  }
  const manifest = parsed.data

  if (!VERSION_PATTERN.test(manifest.version)) {
    issues.push({ code: 'bad-version', path: 'version', message: `판 ${JSON.stringify(manifest.version)} 이 x.y.z 가 아닙니다` })
  }
  if (!SDK_RANGE_PATTERN.test(manifest.sdk)) {
    issues.push({
      code: 'bad-sdk-range',
      path: 'sdk',
      message: `sdk 범위 ${JSON.stringify(manifest.sdk)} 가 ^x.y.z · ~x.y.z · x.y.z 가운데 하나가 아닙니다`,
    })
  }
  issues.push(...checkTokens(manifest.tokens.items))
  issues.push(...checkComponents(manifest.components ?? {}).filter((issue) => options.stored !== true || !CATALOG_CODES.has(issue.code)))
  issues.push(...checkLayouts(manifest.layouts ?? {}))

  return { manifest: issues.length === 0 ? manifest : null, issues }
}

/** 맨 위의 `patterns` 를 뺀 사본과 그 이슈(`PATTERNS_RETIRED`). 객체가 아니거나 그 키가 없으면 원문 그대로다. */
function withoutPatterns(raw: unknown): { rest: unknown; issues: ManifestIssue[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(raw, 'patterns')) return { rest: raw, issues: [] }
  const { patterns: _retired, ...rest } = raw as Record<string, unknown>
  return { rest, issues: [{ code: 'shape', path: 'patterns', message: PATTERNS_RETIRED }] }
}

/**
 * 원문 어디든 자기 속성 `__proto__` 가 있는 자리. `JSON.parse` 는 그 키를 자기 속성으로 만드는데(업로드 경로) zod 의 record 는
 * 조용히 떨군다 — 떨군 선언은 검사 없이 지나고 저장되는 `manifest.json` 원문에는 남는다. 그래서 모양 검사 **전에** 본다.
 */
function protoKeyPaths(value: unknown, path: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return []
  const found: string[] = []
  if (Object.hasOwn(value, '__proto__')) found.push([...path, '__proto__'].join('.'))
  for (const [key, child] of Object.entries(value)) found.push(...protoKeyPaths(child, [...path, key]))
  return found
}

function checkComponents(components: NonNullable<ThemeManifest['components']>): ManifestIssue[] {
  const issues: ManifestIssue[] = []
  for (const [type, decl] of Object.entries(components)) {
    const path = `components.${type}`
    const def = getComponent(type)
    if (!def) {
      issues.push({ code: 'unknown-component', path, message: `카탈로그에 없는 컴포넌트입니다: ${type}` })
      continue
    }
    if (def.variantFrom !== undefined) {
      // 이 컴포넌트는 `data-wb-variant` 를 prop 에서 짓는다 — 선언한 variant 는 렌더에서 버려진다.
      issues.push({
        code: 'variant-from-component',
        path,
        message: `${type} 은 ${def.variantFrom} prop 에서 변형을 짓습니다 — variants 를 선언할 수 없습니다`,
      })
      continue
    }
    const propNames = propKeys(def.props)
    const seen = new Set<string>()
    decl.variants.forEach((variant, index) => {
      if (seen.has(variant.id)) {
        issues.push({
          code: 'duplicate-variant',
          path: `${path}.variants.${index}.id`,
          message: `${type} 의 variant id ${variant.id} 가 겹칩니다`,
        })
      }
      seen.add(variant.id)
      variant.hideProps?.forEach((prop, propIndex) => {
        if (!propNames.has(prop)) {
          issues.push({
            code: 'unknown-hide-prop',
            path: `${path}.variants.${index}.hideProps.${propIndex}`,
            message: `${prop} 는 ${type} 의 prop 이 아닙니다`,
          })
        }
      })
    })
    if (!seen.has(decl.defaultVariant)) {
      issues.push({
        code: 'default-variant-missing',
        path: `${path}.defaultVariant`,
        message: `defaultVariant ${decl.defaultVariant} 가 ${type} 의 variants 에 없습니다`,
      })
    }
  }
  return issues
}

const LAYOUT_KEYS: ReadonlySet<string> = new Set(PAGE_LAYOUTS)

function checkLayouts(layouts: NonNullable<ThemeManifest['layouts']>): ManifestIssue[] {
  const issues: ManifestIssue[] = []
  for (const [layout, decl] of Object.entries(layouts)) {
    const path = `layouts.${layout}`
    if (!LAYOUT_KEYS.has(layout)) {
      issues.push({
        code: 'unknown-layout',
        path,
        message: `${layout} 은 페이지 레이아웃이 아닙니다 — ${PAGE_LAYOUTS.join(' · ')} 가운데 하나입니다`,
      })
      continue
    }
    if (decl === undefined) continue
    if (decl.regions.length > LAYOUT_REGIONS_MAX) {
      issues.push({
        code: 'too-many-regions',
        path: `${path}.regions`,
        message: `${layout} 의 영역이 ${decl.regions.length} 개입니다 — ${LAYOUT_REGIONS_MAX} 개까지 선언합니다`,
      })
    }
    const seen = new Set<string>()
    decl.regions.forEach((region, index) => {
      const at = `${path}.regions.${index}.id`
      if (!LAYOUT_REGION_ID.test(region.id)) {
        issues.push({
          code: 'bad-region-id',
          path: at,
          message: `영역 id ${JSON.stringify(region.id)} 가 꼴(영문 소문자로 시작하는 영숫자 32 자 이내) 밖입니다`,
        })
      }
      if (seen.has(region.id)) issues.push({ code: 'duplicate-region', path: at, message: `${layout} 의 영역 id ${region.id} 가 겹칩니다` })
      seen.add(region.id)
    })
  }
  return issues
}

/** 카탈로그의 props 는 `z.strictObject` 다 — 그 `shape` 의 키가 prop 이름이다. */
function propKeys(props: z.ZodType): Set<string> {
  const shape = (props as { shape?: Record<string, unknown> }).shape
  return new Set(shape ? Object.keys(shape) : [])
}
