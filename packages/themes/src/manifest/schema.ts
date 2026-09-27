import { getComponent, getKoreanErrorMap, installCatalog } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { z } from 'zod'
import { checkPatterns, PatternsSchema } from '../spec/patterns'
import { SDK_RANGE_PATTERN, VERSION_PATTERN } from './semver'
import { checkTokens } from './tokens'

export type ManifestIssueCode =
  | 'shape' | 'bad-version' | 'bad-sdk-range'
  | 'unknown-token-ref' | 'token-ref-type' | 'token-ref-cycle' | 'token-default-type' | 'token-select-default'
  | 'unknown-component' | 'variant-from-component' | 'duplicate-variant' | 'default-variant-missing' | 'unknown-hide-prop'
  | 'pattern'
  /** `tokensCss` · `tokenValues` 에 받은 값의 키가 선언에 없다 — manifest 검증은 내지 않는다. */
  | 'unknown-token'

export interface ManifestIssue {
  code: ManifestIssueCode
  /** manifest 안의 자리. `components.List.variants.1.hideProps.0` 처럼 점으로 잇는다. */
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
  components: z
    .record(z.string(), z.strictObject({ variants: z.array(VariantDeclSchema).min(1), defaultVariant: z.string() }))
    .optional(),
  patterns: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<ThemeManifest>

/**
 * manifest 를 검증한다 — 빌드(`wb-theme build`) · 업로드 · 호스트가 이 함수 하나를 부른다. 이슈를 모아서 돌려주고,
 * 하나라도 있으면 `manifest` 는 `null` 이다.
 */
export function validateManifest(raw: unknown): { manifest: ThemeManifest | null; issues: ManifestIssue[] } {
  // 카탈로그를 안 깐 호출자(빌드 · 업로드)가 모든 컴포넌트를 «카탈로그에 없다» 로 거짓 거부받지 않게. 멱등이다.
  installCatalog()

  const parsed = ManifestSchema.safeParse(raw, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    return {
      manifest: null,
      issues: parsed.error.issues.map((i) => ({ code: 'shape', path: i.path.join('.'), message: i.message })),
    }
  }
  const manifest = parsed.data
  const issues: ManifestIssue[] = []

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
  issues.push(...checkComponents(manifest.components ?? {}))
  if (manifest.patterns !== undefined) issues.push(...checkManifestPatterns(manifest.patterns))

  return { manifest: issues.length === 0 ? manifest : null, issues }
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

/** 카탈로그의 props 는 `z.strictObject` 다 — 그 `shape` 의 키가 prop 이름이다. */
function propKeys(props: z.ZodType): Set<string> {
  const shape = (props as { shape?: Record<string, unknown> }).shape
  return new Set(shape ? Object.keys(shape) : [])
}

function checkManifestPatterns(patterns: Readonly<Record<string, unknown>>): ManifestIssue[] {
  const parsed = PatternsSchema.safeParse(patterns, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      code: 'pattern' as const,
      path: ['patterns', ...i.path].join('.'),
      message: i.message,
    }))
  }
  return checkPatterns(parsed.data).issues.map((i) => ({ code: 'pattern' as const, path: i.path, message: i.message }))
}
