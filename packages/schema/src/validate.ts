import './locale'
import { getComponent } from './component/registry'
import type { LayoutDocument, PageDocument, WbNode } from './node'
import { walkNodes } from './tree'

export type ValidationCode =
  | 'unknown-type'
  | 'invalid-props'
  | 'children-not-allowed'
  | 'unknown-variant'
  | 'duplicate-id'
  | 'bad-root'
  | 'slot-count'

export interface ValidationIssue {
  code: ValidationCode
  nodeId: string | null
  path: string
  message: string
}

export function validatePage(doc: PageDocument): ValidationIssue[] {
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

    const parsed = def.props.safeParse(node.props ?? {})
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
