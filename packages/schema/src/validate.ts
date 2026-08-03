import { getComponent } from './component/registry'
import { DocumentEnvelopeSchema, NODE_ID_PATTERN } from './envelope'
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
 *
 * - 이슈가 id 필드 자체를 가리키면(예: `/root/id`) 그 지점의 값은 반영하지 않는다 —
 *   그 값이 바로 이 이슈가 문제 삼는 대상이므로 검증되지 않은 채 새어 나가면 안 된다.
 * - 지나친 조상 노드의 id가 `NODE_ID_PATTERN`을 만족하지 않으면(문자열이 아니거나 패턴에
 *   맞지 않으면) 그 자체를 앵커로 쓰지 않는다. 뿐만 아니라 그 지점부터는 더 안쪽에서
 *   찾아낸 id도 신뢰하지 않는다 — 경로 위 한 지점의 정체성이 이미 깨졌다면, 그 밑에서
 *   찾은 id가 실제로 이 이슈를 가리키는 노드의 것인지 보장할 수 없기 때문이다.
 *
 * 알아낼 수 없으면 null.
 */
function resolveNodeId(doc: unknown, path: readonly PropertyKey[]): string | null {
  let current: unknown = doc
  let nodeId: string | null = null
  let poisoned = false

  for (const key of path) {
    if (current === null || typeof current !== 'object') break

    if (key !== 'id') {
      const id = (current as Record<PropertyKey, unknown>).id
      if (id !== undefined) {
        if (typeof id === 'string' && NODE_ID_PATTERN.test(id)) {
          if (!poisoned) nodeId = id
        } else {
          poisoned = true
        }
      }
    }

    current = (current as Record<PropertyKey, unknown>)[key]
  }

  return nodeId
}

export function assertValidPage(doc: PageDocument): void {
  throwOnFirstIssue(validatePage(doc))
}

/** `assertValidPage`와 대칭인 레이아웃 버전. */
export function assertValidLayout(doc: LayoutDocument): void {
  throwOnFirstIssue(validateLayout(doc))
}

/** 이슈 목록의 첫 항목을 메시지로 만들어 던진다. 이슈가 없으면 아무 일도 하지 않는다. */
function throwOnFirstIssue(issues: ValidationIssue[]): void {
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
