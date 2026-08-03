import { getComponent } from './component/registry'
import { DocumentEnvelopeSchema } from './envelope'
import type { LayoutDocument, PageDocument, WbNode } from './node'
import { walkNodes } from './tree'
import { getKoreanErrorMap } from './locale'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  | 'children-not-allowed'
  | 'unknown-variant'
  | 'duplicate-id'
  | 'bad-root'
  | 'slot-count'
  | 'bad-document'

export interface ValidationIssue {
  code: ValidationCode
  nodeId: string | null
  path: string
  message: string
}

export function validatePage(doc: PageDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots > 0) {
    issues.push({
      code: 'slot-count',
      nodeId: null,
      path: '/root',
      message: `페이지에는 Slot을 둘 수 없습니다 (${slots}개 발견)`,
    })
  }
  return issues
}

export function validateLayout(doc: LayoutDocument): ValidationIssue[] {
  const envelopeIssues = validateEnvelope(doc)
  if (envelopeIssues.length > 0) return envelopeIssues

  const issues = validateTree(doc.root)
  const slots = countSlots(doc.root)
  if (slots !== 1) {
    issues.push({
      code: 'slot-count',
      nodeId: null,
      path: '/root',
      message: `레이아웃에는 Slot이 정확히 하나여야 합니다 (${slots}개 발견)`,
    })
  }
  return issues
}

/**
 * 문서 봉투(버전·루트 형태)를 검사한다. 트리 순회(`walkNodes`)보다 먼저 돌아야 한다 —
 * root가 null이거나 형태가 깨져 있으면 walkNodes가 그대로 터지기 때문이다.
 * 실패하면 봉투 이슈만 담아 즉시 반환하고, 노드 단위 검증은 시도하지 않는다.
 */
function validateEnvelope(doc: unknown): ValidationIssue[] {
  const parsed = DocumentEnvelopeSchema.safeParse(doc, { error: getKoreanErrorMap() })
  if (parsed.success) return []

  return parsed.error.issues.map((issue) => ({
    code: 'bad-document',
    nodeId: resolveNodeId(doc, issue.path),
    path: `/${issue.path.join('/')}`,
    message: issue.message,
  }))
}

/**
 * zod 이슈 경로를 문서 루트부터 따라가며, 그 경로가 속한 노드의 id를 찾는다.
 * 경로 위에서 지나친 마지막 문자열 id를 쓴다 — 이슈가 id 필드 자체(예: `/root/id`)를 가리키면
 * 그 값은 아직 검증되지 않아 신뢰할 수 없으므로 반영하지 않는다. 알아낼 수 없으면 null.
 */
function resolveNodeId(doc: unknown, path: readonly PropertyKey[]): string | null {
  let current: unknown = doc
  let nodeId: string | null = null

  for (const key of path) {
    if (current === null || typeof current !== 'object') break
    const id = (current as Record<PropertyKey, unknown>).id
    if (typeof id === 'string') nodeId = id
    current = (current as Record<PropertyKey, unknown>)[key]
  }

  return nodeId
}

export function assertValidPage(doc: PageDocument): void {
  const issues = validatePage(doc)
  const first = issues[0]
  if (first) {
    throw new Error(`문서 검증 실패 [${first.code}] ${first.path}: ${first.message}`)
  }
}

function validateTree(root: WbNode): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  if (root.type !== 'Page') {
    issues.push({
      code: 'bad-root',
      nodeId: root.id,
      path: '/root',
      message: `루트는 Page여야 합니다 (현재: ${root.type})`,
    })
  }

  for (const { node, path } of walkNodes(root)) {
    if (seen.has(node.id)) {
      issues.push({
        code: 'duplicate-id',
        nodeId: node.id,
        path,
        message: `id가 중복됩니다: ${node.id}`,
      })
    }
    seen.add(node.id)

    const def = getComponent(node.type)
    if (!def) {
      issues.push({
        code: 'unknown-type',
        nodeId: node.id,
        path,
        message: `알 수 없는 컴포넌트 타입: ${node.type}`,
      })
      continue
    }

    const parsed = def.props.safeParse(node.props ?? {}, { error: getKoreanErrorMap() })
    if (!parsed.success) {
      issues.push({
        code: 'invalid-props',
        nodeId: node.id,
        path: `${path}/props`,
        message: `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join(', ')}`,
      })
    }

    if (def.children === 'none' && (node.children?.length ?? 0) > 0) {
      issues.push({
        code: 'children-not-allowed',
        nodeId: node.id,
        path: `${path}/children`,
        message: `${node.type}은 자식을 담을 수 없습니다`,
      })
    }

    if (node.variant !== undefined && !def.variants.includes(node.variant)) {
      issues.push({
        code: 'unknown-variant',
        nodeId: node.id,
        path: `${path}/variant`,
        message: `${node.type}에 정의되지 않은 variant입니다: ${node.variant}`,
      })
    }
  }

  return issues
}

function countSlots(root: WbNode): number {
  let count = 0
  for (const { node } of walkNodes(root)) {
    if (node.type === 'Slot') count += 1
  }
  return count
}
