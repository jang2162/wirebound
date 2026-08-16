/**
 * lint 이슈 하나의 모양과 그것을 만드는 자리 **둘**.
 *
 * 자리가 둘인 것이 D4를 실행으로 지키는 방식이다:
 *
 * | 함수 | 언제 | severity |
 * |---|---|---|
 * | `lintIssue` | lint가 **새로 판정한** 결함 | 표(`LINT_RULES`)에서 파생한다 |
 * | `relayLintIssue` | 이미 있는 판정기가 낸 이슈를 **나를 때** | 날라 온 값을 **그대로** 쓴다 |
 *
 * 둘을 하나로 합치면 나르는 자리에서 severity를 고를 수 있게 되고, 그러면 `validatePage`가
 * `warning`이라 한 것을 lint가 `error`로 올리는 일이 가능해진다 — *"두 화면이 같은 문서에
 * 다른 말을 한다."* 타입도 갈라 둔다: `lintIssue`는 표가 severity를 든 규칙만 받고
 * `relayLintIssue`는 relay 규칙만 받는다.
 *
 * **자리(`pageId`·`themeId`·`nodeId`)를 평평하게 둔다.** lint의 소비자는 CLI의 `--json`과
 * MCP의 응답이라(§12.2·§12.3) 중첩된 판별 유니온보다 평평한 필드가 다루기 쉽다. 없으면
 * `null`이고 *"모른다"*가 아니라 *"그 축이 없다"*이다 — 프로젝트 전체를 두고 나는 이슈는
 * 셋 다 `null`이다.
 */
import type { IssueSeverity } from '../validate'
import type { LintRuleId, OwnSeverityRuleId, RelayRuleId } from './rules'
import { lintRule } from './rules'

export interface LintIssue {
  /** 어느 규칙이 냈는가. `LINT_RULES`의 id다. */
  rule: LintRuleId
  severity: IssueSeverity
  /** 이 이슈가 난 페이지. 페이지 밖이면 `null`. */
  pageId: string | null
  /** 이 이슈가 난 테마. 테마 밖이면 `null`. */
  themeId: string | null
  /** 이 이슈가 난 노드. 노드 단위가 아니면 `null`. */
  nodeId: string | null
  /**
   * 문서 안의 자리. 페이지 문서면 JSON 포인터(`/root/children/0`), 테마 문서면 점으로 이은
   * 경로(`tokens.semantic.primary`)다 — **날라 온 이슈의 것을 그대로 쓴다.**
   */
  path: string
  message: string
}

/** 이슈가 난 자리. 안 준 축은 `null`이 된다. */
export interface LintWhere {
  pageId?: string
  themeId?: string
  nodeId?: string
}

/**
 * lint가 **새로 판정한** 결함 하나. severity를 표에서 파생시킨다 — 호출자가 고르면 같은
 * 규칙이 자리마다 다른 severity를 달 수 있고, 그러면 표가 진실이 아니게 된다
 * (`validate.ts`의 `makeIssue`와 같은 이유다).
 */
export function lintIssue(
  rule: OwnSeverityRuleId,
  where: LintWhere,
  path: string,
  message: string,
): LintIssue {
  const severity = requireRule(rule).severity
  if (severity === null) {
    throw new Error(`${rule}은 날라 온 이슈의 severity를 쓰는 규칙입니다 — relayLintIssue를 쓰세요`)
  }
  return { rule, severity, ...place(where), path, message }
}

/**
 * 이미 있는 판정기가 낸 이슈를 lint 목록으로 **나른다.** severity·path·message는 그대로다 —
 * 바꾸면 저장 화면과 lint가 같은 문서를 다르게 말한다(D4).
 */
export function relayLintIssue(
  rule: RelayRuleId,
  where: LintWhere,
  source: { severity: IssueSeverity; path: string; message: string },
): LintIssue {
  if (requireRule(rule).severity !== null) {
    throw new Error(`${rule}은 표가 severity를 든 규칙입니다 — lintIssue를 쓰세요`)
  }
  return {
    rule,
    severity: source.severity,
    ...place(where),
    path: source.path,
    message: source.message,
  }
}

function requireRule(id: string) {
  const rule = lintRule(id)
  if (rule === undefined) throw new Error(`lint 규칙 표에 없는 id입니다: ${id}`)
  return rule
}

function place(where: LintWhere): Pick<LintIssue, 'pageId' | 'themeId' | 'nodeId'> {
  return {
    pageId: where.pageId ?? null,
    themeId: where.themeId ?? null,
    nodeId: where.nodeId ?? null,
  }
}
