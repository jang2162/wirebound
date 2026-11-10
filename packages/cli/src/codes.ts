/**
 * **공통코드 REST 를 부르는 한 자리** — `wireb codes …` 명령과 MCP 도구 셋(`list_codes` · `code_usage` · `edit_codes`)이 이 함수들을 부른다.
 * 자리가 둘이면 같은 표를 두 도구가 다르게 말한다(`read/page.ts` 머리말과 같은 자세). 사용 수 · 사용처를 세는 것은 서버다(`apps/api/README.md`
 * 「공통코드」 — `codeUsage` 한 벌) — 여기서 다시 세지 않는다.
 *
 * 쓰기 묶음(`CodeEdit[]`)은 **차례대로 하나씩** 보내고 첫 거절에서 멈춘다. 표에는 revision 이 없어 묶음을 한 트랜잭션으로 보낼 길이 없다 —
 * 그래서 앞에서 이미 된 것을 결과가 말한다(`applied`).
 */
import type { CodeGroup } from '@wirebound/schema'
import { callApi, parseJson } from './client'
import { CliError, usageError } from './exit'
import type { Io } from './io'
import type { ProjectAccess } from './project'

/** 그룹 키 → 사용 수(그룹 · 코드값마다). 서버의 `GET …/codes/usage-counts` 그대로. */
export type CodeUsageCounts = Record<string, { group: number; items: Record<string, number> }>

export interface CodeTableListing {
  groups: CodeGroup[]
  counts: CodeUsageCounts
}

export interface CodeUsageHit {
  kind: 'page' | 'layout' | 'module'
  id: string
  title: string
  nodes: { nodeId: string; name: string }[]
}

/** 쓰기 하나. MCP `edit_codes` 의 `ops[]` 원소와 같은 꼴이다. */
export type CodeEdit =
  | { op: 'add-group'; group: string; name: string }
  | { op: 'update-group'; group: string; name?: string; sortOrder?: number }
  | { op: 'delete-group'; group: string }
  | { op: 'add-item'; group: string; item: string; name: string; active?: boolean }
  | { op: 'update-item'; group: string; item: string; name?: string; sortOrder?: number; active?: boolean }
  | { op: 'delete-item'; group: string; item: string }

export const CODE_EDIT_OPS = ['add-group', 'update-group', 'delete-group', 'add-item', 'update-item', 'delete-item'] as const

function base(access: ProjectAccess): string {
  return `/api/projects/${access.binding.projectId}/codes`
}

const seg = (value: string): string => encodeURIComponent(value)

/** 표와 사용 수. */
export async function fetchCodeTable(io: Io, access: ProjectAccess): Promise<CodeTableListing> {
  const { server } = access.binding
  const table = parseJson(await callApi(io, server, { method: 'GET', path: base(access), token: access.token }), '공통코드 표') as {
    groups: CodeGroup[]
  }
  const counts = parseJson(
    await callApi(io, server, { method: 'GET', path: `${base(access)}/usage-counts`, token: access.token }),
    '공통코드 사용 수',
  ) as { counts: CodeUsageCounts }
  return { groups: table.groups, counts: counts.counts }
}

/** 그 그룹(· 항목)을 가리키는 노드. */
export async function fetchCodeUsage(io: Io, access: ProjectAccess, group: string, item?: string): Promise<CodeUsageHit[]> {
  const query = `group=${seg(group)}${item === undefined ? '' : `&item=${seg(item)}`}`
  const response = await callApi(io, access.binding.server, { method: 'GET', path: `${base(access)}/usage?${query}`, token: access.token })
  return (parseJson(response, '공통코드 사용처') as { usage: CodeUsageHit[] }).usage
}

/** 쓰기 하나를 보낸다. 서버가 거절하면 `CliError`(상태 코드를 든다)를 던진다. */
export async function sendCodeEdit(io: Io, access: ProjectAccess, edit: CodeEdit): Promise<void> {
  const group = `${base(access)}/${seg(edit.group)}`
  const send = (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: Record<string, unknown>) =>
    callApi(io, access.binding.server, { method, path, token: access.token, ...(body === undefined ? {} : { body }) })
  switch (edit.op) {
    case 'add-group':
      await send('POST', base(access), { key: edit.group, name: edit.name })
      return
    case 'update-group':
      await send('PATCH', group, pick(edit, ['name', 'sortOrder']))
      return
    case 'delete-group':
      await send('DELETE', group)
      return
    case 'add-item':
      await send('POST', `${group}/items`, { value: edit.item, name: edit.name, ...pick(edit, ['active']) })
      return
    case 'update-item':
      await send('PATCH', `${group}/items/${seg(edit.item)}`, pick(edit, ['name', 'sortOrder', 'active']))
      return
    case 'delete-item':
      await send('DELETE', `${group}/items/${seg(edit.item)}`)
      return
  }
}

export interface CodeEditOutcome {
  /** 서버가 받은 쓰기 수 — 앞에서부터 차례로. */
  applied: number
  /** 첫 거절. 없으면 `null`. 그 뒤의 쓰기는 보내지 않았다. */
  rejected: { index: number; status: number | null; code: number; message: string } | null
}

/** 쓰기 묶음을 차례로 보내고 첫 거절에서 멈춘다(머리말). 서버에 닿지 못한 것(연결 · 자격)은 그대로 던진다. */
export async function applyCodeEdits(io: Io, access: ProjectAccess, edits: readonly CodeEdit[]): Promise<CodeEditOutcome> {
  for (const [index, edit] of edits.entries()) {
    try {
      await sendCodeEdit(io, access, edit)
    } catch (error) {
      if (!(error instanceof CliError) || error.status === undefined) throw error
      return { applied: index, rejected: { index, status: error.status, code: error.code, message: error.message } }
    }
  }
  return { applied: edits.length, rejected: null }
}

/**
 * 받은 값을 쓰기 하나로 읽는다 — 모양만 본다(키 꼴 · 길이 · 상한은 서버가 본다 — 두 벌을 두지 않는다). 틀리면 `usageError` 를 던진다.
 * MCP 의 `edit_codes` 가 에이전트가 준 원소를 이것으로 읽는다.
 */
export function readCodeEdit(value: unknown, at: string): CodeEdit {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw usageError(`${at}: 객체여야 합니다`)
  const record = value as Record<string, unknown>
  const op = record.op
  if (typeof op !== 'string' || !(CODE_EDIT_OPS as readonly string[]).includes(op)) {
    throw usageError(`${at}.op: ${CODE_EDIT_OPS.join(' · ')} 가운데 하나여야 합니다`)
  }
  const text = (key: string, required: boolean): string | undefined => {
    const field = record[key]
    if (field === undefined && !required) return undefined
    if (typeof field !== 'string') throw usageError(`${at}.${key}: 글자여야 합니다`)
    return field
  }
  const flag = (key: string): boolean | undefined => {
    const field = record[key]
    if (field === undefined) return undefined
    if (typeof field !== 'boolean') throw usageError(`${at}.${key}: 참 · 거짓이어야 합니다`)
    return field
  }
  const order = (): number | undefined => {
    const field = record.sortOrder
    if (field === undefined) return undefined
    if (typeof field !== 'number' || !Number.isInteger(field) || field < 0) throw usageError(`${at}.sortOrder: 0 이상의 정수여야 합니다`)
    return field
  }
  const allowed: Record<CodeEdit['op'], string[]> = {
    'add-group': ['op', 'group', 'name'],
    'update-group': ['op', 'group', 'name', 'sortOrder'],
    'delete-group': ['op', 'group'],
    'add-item': ['op', 'group', 'item', 'name', 'active'],
    'update-item': ['op', 'group', 'item', 'name', 'sortOrder', 'active'],
    'delete-item': ['op', 'group', 'item'],
  }
  const extra = Object.keys(record).filter((key) => !allowed[op as CodeEdit['op']].includes(key))
  if (extra.length > 0) throw usageError(`${at}: ${op} 은(는) ${extra.join(' · ')} 을(를) 받지 않습니다`)
  const group = text('group', true)!
  switch (op as CodeEdit['op']) {
    case 'add-group':
      return { op: 'add-group', group, name: text('name', true)! }
    case 'update-group':
      return compact({ op: 'update-group', group, name: text('name', false), sortOrder: order() })
    case 'delete-group':
      return { op: 'delete-group', group }
    case 'add-item':
      return compact({ op: 'add-item', group, item: text('item', true)!, name: text('name', true)!, active: flag('active') })
    case 'update-item':
      return compact({
        op: 'update-item',
        group,
        item: text('item', true)!,
        name: text('name', false),
        sortOrder: order(),
        active: flag('active'),
      })
    case 'delete-item':
      return { op: 'delete-item', group, item: text('item', true)! }
  }
}

function pick<T extends object>(value: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const field = (value as Record<string, unknown>)[key]
    if (field !== undefined) out[key] = field
  }
  return out
}

/** 값이 `undefined` 인 칸을 걷는다 — 「없음」 과 「안 줌」 을 한 꼴로 둔다. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}
