/**
 * `wireb codes …` — 프로젝트의 공통코드 표를 리포에서 읽고 고친다. REST 를 부르는 것은 `../codes.ts` 한 자리이고(MCP 도구 셋도 그것을 부른다)
 * 이 파일에는 글자와 인자 읽기만 있다.
 *
 * | 명령 | 하는 일 |
 * |---|---|
 * | `codes list [--json]` | 표(그룹 → 항목)와 사용 수 |
 * | `codes usage <키> [코드값] [--json]` | 그 그룹(· 항목)을 가리키는 노드 |
 * | `codes set-group <키> [--name …] [--order n]` | 없으면 만들고(이름 필수) 있으면 고친다 |
 * | `codes set-item <키> <코드값> [--name …] [--order n] [--active · --inactive]` | 같다 |
 * | `codes delete <키> [코드값]` | 그룹(항목째) · 항목 하나를 지운다 |
 *
 * **키 · 코드값은 고치지 않는다** — 서버가 받지 않는다(만든 뒤 못 바꾼다). 바꾸려면 새 항목을 만들고 다시 묶는다.
 */
import { fetchCodeTable, fetchCodeUsage, sendCodeEdit, type CodeEdit } from '../codes'
import { EXIT, usageError } from '../exit'
import type { Io } from '../io'
import { requireProject, type ProjectAccess } from '../project'

export async function runCodesList(io: Io, options: { json: boolean }): Promise<number> {
  const access = await requireProject(io)
  const listing = await fetchCodeTable(io, access)
  if (options.json) {
    io.out(JSON.stringify(listing, null, 2))
    return EXIT.ok
  }
  if (listing.groups.length === 0) {
    io.out('공통코드가 없습니다')
    return EXIT.ok
  }
  for (const group of listing.groups) {
    const counts = listing.counts[group.key]
    io.out(`${group.name} (${group.key}) · 항목 ${group.items.length}개 · 쓰는 노드 ${counts?.group ?? 0}개`)
    for (const item of group.items) {
      const uses = counts?.items[item.value] ?? 0
      io.out(`  ${item.value}  ${item.name}${item.active ? '' : ' (사용 안 함)'} · 쓰는 노드 ${uses}개`)
    }
  }
  return EXIT.ok
}

export async function runCodesUsage(
  io: Io,
  group: string | undefined,
  item: string | undefined,
  options: { json: boolean },
): Promise<number> {
  if (group === undefined) throw usageError('그룹 키를 주세요: wireb codes usage <키> [코드값]')
  const access = await requireProject(io)
  const usage = await fetchCodeUsage(io, access, group, item)
  if (options.json) {
    io.out(JSON.stringify(usage, null, 2))
    return EXIT.ok
  }
  const target = item === undefined ? group : `${group} › ${item}`
  if (usage.length === 0) {
    io.out(`${target} 을(를) 쓰는 곳이 없습니다`)
    return EXIT.ok
  }
  io.out(`${target} 을(를) 쓰는 곳 ${usage.length}개`)
  for (const hit of usage) {
    io.out(`  ${KIND_NAMES[hit.kind]} ${hit.title} · 노드 ${hit.nodes.length}개`)
    for (const node of hit.nodes) io.out(`    ${node.name}`)
  }
  return EXIT.ok
}

const KIND_NAMES = { page: '페이지', layout: '레이아웃', module: '모듈' } as const

export interface SetOptions {
  name: string | undefined
  order: string | undefined
  active?: boolean | undefined
}

export async function runCodesSetGroup(io: Io, group: string | undefined, options: SetOptions): Promise<number> {
  if (group === undefined) throw usageError('그룹 키를 주세요: wireb codes set-group <키> --name <이름>')
  const access = await requireProject(io)
  const listing = await fetchCodeTable(io, access)
  const sortOrder = readOrder(options.order)
  const exists = listing.groups.some((entry) => entry.key === group)
  let edit: CodeEdit
  if (exists) {
    if (options.name === undefined && sortOrder === undefined) throw usageError('고칠 것을 주세요: --name · --order')
    edit = { op: 'update-group', group, ...defined({ name: options.name, sortOrder }) }
  } else {
    if (options.name === undefined) throw usageError(`그룹 ${group} 이(가) 없습니다 — 만들려면 --name 을 주세요`)
    if (sortOrder !== undefined) throw usageError('만들 때는 --order 를 받지 않습니다 — 만든 뒤 다시 부르세요')
    edit = { op: 'add-group', group, name: options.name }
  }
  return finish(io, access, edit, exists ? `그룹 ${group} 을(를) 고쳤습니다` : `그룹 ${group} 을(를) 만들었습니다`)
}

export async function runCodesSetItem(io: Io, group: string | undefined, item: string | undefined, options: SetOptions): Promise<number> {
  if (group === undefined || item === undefined)
    throw usageError('그룹 키와 코드값을 주세요: wireb codes set-item <키> <코드값> --name <이름>')
  const access = await requireProject(io)
  const listing = await fetchCodeTable(io, access)
  const sortOrder = readOrder(options.order)
  const found = listing.groups.find((entry) => entry.key === group)
  if (found === undefined) throw usageError(`그룹 ${group} 이(가) 없습니다 — 먼저 wireb codes set-group ${group} --name <이름>`)
  const exists = found.items.some((entry) => entry.value === item)
  let edit: CodeEdit
  if (exists) {
    if (options.name === undefined && sortOrder === undefined && options.active === undefined) {
      throw usageError('고칠 것을 주세요: --name · --order · --active · --inactive')
    }
    edit = { op: 'update-item', group, item, ...defined({ name: options.name, sortOrder, active: options.active }) }
  } else {
    if (options.name === undefined) throw usageError(`항목 ${group} › ${item} 이(가) 없습니다 — 만들려면 --name 을 주세요`)
    if (sortOrder !== undefined) throw usageError('만들 때는 --order 를 받지 않습니다 — 만든 뒤 다시 부르세요')
    edit = { op: 'add-item', group, item, name: options.name, ...defined({ active: options.active }) }
  }
  return finish(io, access, edit, exists ? `항목 ${group} › ${item} 을(를) 고쳤습니다` : `항목 ${group} › ${item} 을(를) 만들었습니다`)
}

export async function runCodesDelete(io: Io, group: string | undefined, item: string | undefined): Promise<number> {
  if (group === undefined) throw usageError('그룹 키를 주세요: wireb codes delete <키> [코드값]')
  const access = await requireProject(io)
  const edit: CodeEdit = item === undefined ? { op: 'delete-group', group } : { op: 'delete-item', group, item }
  // 노드의 참조는 끊긴 참조로 남는다 — 지우기 전에 사용처를 보라고 말한다.
  const done = item === undefined ? `그룹 ${group} 을(를) 항목째 지웠습니다` : `항목 ${group} › ${item} 을(를) 지웠습니다`
  return finish(io, access, edit, `${done} — 그것을 가리키던 노드는 끊긴 참조로 남습니다`)
}

/** `--active` · `--inactive` 를 하나의 값으로. 둘 다 주면 쓰임 오류다. */
export function readActive(active: boolean, inactive: boolean): boolean | undefined {
  if (active && inactive) throw usageError('--active 와 --inactive 는 함께 줄 수 없습니다')
  return active ? true : inactive ? false : undefined
}

function readOrder(order: string | undefined): number | undefined {
  if (order === undefined) return undefined
  if (!/^\d+$/.test(order)) throw usageError(`--order 는 0 이상의 정수입니다: ${order}`)
  return Number(order)
}

/** 쓰기 하나를 보내고 한 줄로 말한다. **거절은 그대로 던진다** — `run` 이 서버의 문장 · 종료 코드(자격 · 거절)를 고른다. */
async function finish(io: Io, access: ProjectAccess, edit: CodeEdit, done: string): Promise<number> {
  await sendCodeEdit(io, access, edit)
  io.out(done)
  return EXIT.ok
}

function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>
}
