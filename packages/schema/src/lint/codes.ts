/**
 * 공통코드 규칙 다섯(설계서 「lint 규칙」) — 노드 하나의 참조를 표로 푼 결과를 이슈로 낸다. 푸는 판정은 `../codes-resolve.ts` 한 벌이다 — 렌더러가
 * 그리는 것과 lint 가 말하는 것이 갈리지 않게. 받지 않는 타입 · 꼴이 어긋난 참조는 검증의 `invalid-code-ref` 가 이미 말하므로 여기서 다시 안 본다.
 */
import { resolveChoices, resolveLabel, type CodeIndex } from '../codes-resolve'
import { OPTIONS_MAX } from '../component/catalog/input'
import { CATALOG_DEFS } from '../component/catalog/index'
import { nodeDisplayName } from '../interaction/describe'
import type { WbNode } from '../node'
import { lintIssue, type LintIssue } from './issue'

const BINDINGS = new Map(CATALOG_DEFS.flatMap((def) => (def.code === undefined ? [] : [[def.type, def.code] as const])))

export function codeIssues(node: WbNode, path: string, where: { pageId: string }, index: CodeIndex): LintIssue[] {
  const ref = node.code
  if (ref === undefined) return []
  const binding = BINDINGS.get(node.type)
  if (binding === undefined) return []
  const at = { ...where, nodeId: node.id }
  const name = nodeDisplayName(node)
  const codePath = `${path}/code`
  if (binding.kind === 'label') {
    if (ref.item === undefined) return []
    const label = resolveLabel(index, ref)
    if (label === null)
      return [lintIssue('broken-code-ref', at, codePath, `${name}이 가리키는 공통코드가 표에 없습니다: ${ref.group} › ${ref.item}`)]
    return label.inactive
      ? [lintIssue('inactive-code-ref', at, codePath, `${name}이 사용 안 함 공통코드를 가리킵니다: ${ref.group} › ${ref.item}`)]
      : []
  }
  const choices = resolveChoices(index, ref)
  if (choices.brokenGroup)
    return [lintIssue('broken-code-ref', at, codePath, `${name}이 가리키는 공통코드 그룹이 표에 없습니다: ${ref.group}`)]
  const issues: LintIssue[] = []
  if (choices.brokenSelected.length > 0) {
    issues.push(
      lintIssue(
        'broken-code-selected',
        at,
        `${codePath}/selected`,
        `${name}이 고른 코드값이 표에 없거나 사용 안 함입니다: ${ref.group} › ${choices.brokenSelected.join(', ')}`,
      ),
    )
  }
  if (choices.truncated) {
    issues.push(
      lintIssue(
        'code-choices-truncated',
        at,
        codePath,
        `${name}의 공통코드 ${ref.group} 는 사용 중 항목이 ${OPTIONS_MAX}개를 넘어 앞 ${OPTIONS_MAX}개만 그립니다`,
      ),
    )
  }
  if (choices.options.length === 0) {
    issues.push(lintIssue('code-choices-empty', at, codePath, `${name}의 공통코드 ${ref.group} 에 사용 중 항목이 없습니다`))
  }
  return issues
}
