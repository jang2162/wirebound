/**
 * **클립보드 봉투** — 노드(서브트리)를 OS 클립보드의 `text/plain` 한 벌로 주고받는 형식과, 받은 노드를 지금 문서에
 * 붙일 수 있게 다듬는 곳(설계서 「설계서 화면 구조」의 클립보드).
 *
 * **순수하다.** 클립보드 이벤트 · 편집 전송은 `apps/web/src/edit/use-clipboard.ts` 가 한다.
 *
 * 봉투:
 *
 * ```jsonc
 * { "wirebound": "nodes", "version": 2, "nodes": [ … ], "viewStates": [ … ] }   // version — 문서 봉투의 version(마이그레이션 진입점)
 * ```
 *
 * `viewStates` 는 노드를 꺼낸 페이지의 화면 상태 목록이다 — 목록이 있을 때만 싣는다(없는 페이지의 봉투는 그 키가 없는 옛 글자 그대로).
 * 상태 id 는 페이지 안의 이름이라 다른 페이지에서는 뜻이 없다 — 붙이는 쪽이 노드 보임의 상태를 **이름으로** 붙일 페이지의 상태에 맞추고
 * (`apps/web` 의 `edit/paste-states.ts`), 못 맞춘 것을 출처의 이름으로 말한다(«상태 "관리자" 보임 1곳을 뺐습니다»). 판 1 봉투는 이 목록을
 * 실은 채 판 2 로 옮긴다 — 목록 없이 옮기면 상태 가지가 «목록 밖»으로 읽혀 버려진다(`migrate-document.ts`).
 */
import { z } from 'zod'
import { DocumentEnvelopeSchema, ViewStatesSchema } from './envelope'
import { isPageTargetAction, isTargetlessAction, isViewStateAction } from './interaction/check'
import { CURRENT_DOCUMENT_VERSION, MIGRATIONS, migrateDocument, type Migration } from './migrate'
import { DEFAULT_VIEW_STATE, type Interaction, type InteractionAction, type PageDocument, type ViewState, type WbNode } from './node'
import { collectNodeIds, remapNodeIds } from './tree'
import { mapChildLists } from './zones'
import { partitionIssues, validatePage } from './validate'

/** 봉투의 `wirebound` 값. 페이지 JSON(`wireboundVersion`) · 테마 봉투와 갈리는 표지다. */
export const NODES_ENVELOPE_KIND = 'nodes'

/**
 * 편집 묶음 하나(`PATCH .../ops` · WS `edit`)의 연산 수 상한. **값의 소유자는 이 상수다** — 서버의 `OpsBody`
 * (`apps/api/src/http/patch-ops.ts`)가 이것을 읽고, 화면은 이것으로 보내기 전에 막는다. 두 자리가 값을 따로 적으면 한쪽만
 * 고쳐도 아무 케이스도 안 죽은 채 «화면은 보냈는데 서버가 400» 이 선다.
 */
export const MAX_OPS_PER_EDIT = 200

/**
 * 봉투의 겉. **노드는 여기서 보지 않는다** — 옛 version 의 노드는 지금 규격과 다를 수 있어, 마이그레이션 체인으로 올린
 * 뒤에야 지금 검증기로 볼 수 있다(`readNodesEnvelope`).
 */
const NodesEnvelopeSchema = z.strictObject({
  wirebound: z.literal(NODES_ENVELOPE_KIND),
  version: z.int().positive(),
  nodes: z.array(z.unknown()).min(1),
  viewStates: ViewStatesSchema.optional(),
  /**
   * 노드를 꺼낸 프로젝트 — 붙이는 쪽이 다른 프로젝트면 그림(자리표시자의 `image`)을 그 출처에서 가져온다(`claim`). 그림은 해시를 안다고 읽을 수
   * 없어(소유 행이 가른다) 출처를 실어야 붙이는 쪽 서버가 «출처에서 읽을 수 있는가» 를 본다. 없으면(옛 봉투 · 프로젝트 밖) 가져오지 않는다.
   */
  source: z.strictObject({ projectId: z.string().min(1) }).optional(),
})

/** 봉투의 출처(`NodesEnvelopeSchema` 의 `source`). */
export interface NodesEnvelopeSource {
  projectId: string
}

/**
 * 노드들을 문서 검증기 · 마이그레이션 · id 재발급에 넣으려고 감싸는 임시 뿌리의 id. **결과에 남지 않는다.**
 *
 * 노드가 이 id 를 들고 오면 `duplicate-id` 로 읽기가 실패한다 — `NODE_ID_PATTERN` 안의 어떤 값도 남과 안 겹친다고
 * 보증할 수 없어 받아들인 대가다.
 */
const WRAPPER_ID = 'wb-clipboard-wrapper'

function wrap(nodes: readonly WbNode[], version: number, viewStates?: readonly ViewState[]): PageDocument {
  const doc: PageDocument = { version, root: { id: WRAPPER_ID, type: 'Page', children: [...nodes] } }
  if (viewStates !== undefined) doc.viewStates = [...viewStates]
  return doc
}

/**
 * 노드를 봉투 글자로. `version` 은 그 노드를 꺼낸 문서의 `version`, `viewStates` 는 그 문서의 상태 목록이다(머리말 — 비었거나 없으면
 * 키를 안 싣는다).
 */
export function writeNodesEnvelope(
  nodes: readonly WbNode[],
  version: number,
  viewStates?: readonly ViewState[],
  source?: NodesEnvelopeSource,
): string {
  return JSON.stringify({
    wirebound: NODES_ENVELOPE_KIND,
    version,
    nodes,
    ...(viewStates === undefined || viewStates.length === 0 ? {} : { viewStates }),
    ...(source === undefined ? {} : { source: { projectId: source.projectId } }),
  })
}

/** 봉투를 읽은 결과 — `rejected` 는 우리 봉투(`wirebound: "nodes"`)인데 지금 문서에 실을 수 없는 것이다(`reason` 은 사람이 읽는 한 줄). */
export type NodesEnvelopeRead =
  | { kind: 'ok'; nodes: WbNode[]; viewStates?: ViewState[]; source?: NodesEnvelopeSource }
  | { kind: 'rejected'; reason: string }
  | { kind: 'not-envelope' }

/**
 * 글자에서 봉투를 읽는다 — **봉투가 아닌 글(`not-envelope`)과 검증을 못 지난 봉투(`rejected`)를 가른다.** 던지지 않는다.
 *
 * - JSON 이 아니다 · `wirebound` 가 `"nodes"` 가 아니다 → `not-envelope` (브라우저의 붙여넣기가 그대로다 · 통지 없음)
 * - `wirebound: "nodes"` 인데 모르는 키가 있다 · 노드가 없다 · 옛 `version` 을 올릴 길이 없다(지금보다 높다 · 체인이 없다) · 올린 노드가
 *   문서 봉투(`DocumentEnvelopeSchema`)와 문서 검증(`validatePage` 의 `error`)을 못 지난다(없는 타입 · 중복 id · 틀린 props ·
 *   자식을 못 담는 타입에 자식) → `rejected` — 화면이 «붙이지 않았다» 와 까닭을 말한다. `warning`(끊긴 상호작용 대상)은 막지 않는다 —
 *   편집 파이프라인도 막지 않고, 끊긴 대상은 `prepareNodesForPaste` 가 다룬다.
 *
 * - 판 1 봉투의 상태 영역 · 가지(영역 없이 가지만 고른 복사 포함)는 출처의 목록으로 판 2 의 보임이 된다(머리말).
 * - `viewStates` 는 문서 봉투의 목록 규칙(`ViewStatesSchema`)을 지나야 한다 — 어기면 `rejected`.
 *
 * **「이 판에 없는 타입」도 `rejected` 다** — 봉투는 타입 이름을 담고 카탈로그는 이 판이 아는 것만 안다(`validatePage` 의 `unknown-type`).
 *
 * `migrations` · `target` 은 케이스가 마이그레이션 갈래를 재는 이음매다(`migrateDocument` 와 같은 꼴). 운영은 기본값.
 */
export function inspectNodesEnvelope(
  text: string,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_DOCUMENT_VERSION,
): NodesEnvelopeRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'not-envelope' }
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { wirebound?: unknown }).wirebound !== NODES_ENVELOPE_KIND) {
    return { kind: 'not-envelope' }
  }

  const envelope = NodesEnvelopeSchema.safeParse(parsed)
  if (!envelope.success) return { kind: 'rejected', reason: '봉투의 모양이 맞지 않습니다.' }

  let document: PageDocument
  try {
    document = migrateDocument(wrap(envelope.data.nodes as WbNode[], envelope.data.version, envelope.data.viewStates), migrations, target)
  } catch {
    return { kind: 'rejected', reason: '이 판이 읽을 수 없는 버전입니다.' }
  }

  const checked = DocumentEnvelopeSchema.safeParse({ version: document.version, root: document.root })
  if (!checked.success) return { kind: 'rejected', reason: '노드의 모양이 맞지 않습니다.' }
  // 맨 위 노드가 설 자리(`misplaced-component` — `TabPanel`)는 감싼 뿌리가 아니라 붙일 자리가 정한다 — 붙인 뒤 문서의 검증이 본다.
  // 감싼 뿌리가 `Page` 라 빈 레이아웃으로 잰다 — 판 7 봉투가 `layout` 을 묻는다(노드 묶음은 레이아웃과 무관하다).
  const first = partitionIssues(validatePage({ ...checked.data, layout: 'blank' })).errors.find(
    (issue) => !(issue.code === 'misplaced-component' && /^\/root\/children\/\d+$/.test(issue.path)),
  )
  if (first !== undefined) return { kind: 'rejected', reason: first.message }

  const nodes = checked.data.root.children ?? []
  return {
    kind: 'ok',
    nodes,
    ...(envelope.data.viewStates === undefined ? {} : { viewStates: envelope.data.viewStates }),
    ...(envelope.data.source === undefined ? {} : { source: envelope.data.source }),
  }
}

/** `inspectNodesEnvelope` 의 `ok` 만 — 봉투가 아니거나 못 지난 봉투는 둘 다 `null` 이다(둘을 가르려면 `inspectNodesEnvelope`). */
export function readNodesEnvelope(
  text: string,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_DOCUMENT_VERSION,
): { nodes: WbNode[]; viewStates?: ViewState[] } | null {
  const read = inspectNodesEnvelope(text, migrations, target)
  if (read.kind !== 'ok') return null
  return read.viewStates === undefined ? { nodes: read.nodes } : { nodes: read.nodes, viewStates: read.viewStates }
}

/**
 * 붙일 노드를 짓는다 — id 를 새로 짓고, 붙이는 노드 밖을 가리키는 동작 가운데 붙이는 문서에서 대상이 없는 것을 빼고, 상태 보임을 붙일
 * 페이지의 상태에 맞춘다. 모듈 넣기 · 붙여넣기 · 복제가 이 함수 하나를 쓴다.
 *
 * **노드들을 임시 뿌리 하나에 담아 한 번에 id 를 새로 짓는다.** 노드마다 따로 `remapNodeIds` 를 부르면 형제를
 * 가리키던 상호작용 `target` 이 리매핑 밖이 되어 **옛 id 로 남는다** — 문서에 없는 노드를 가리키고 `validatePage` 가
 * `missing-interaction-target`(warning)을 낸다. **임시 뿌리도 `generate` 를 한 번 받아 가고 그것은 버려진다** —
 * `generate` 를 세는 케이스는 그 한 번을 감안한다.
 *
 * **남기는 동작:**
 *
 * | 대상 | 남기는 때 |
 * |---|---|
 * | 붙이는 노드(자손 포함) | 늘 — 새 id 로 따라간다 |
 * | 그 밖의 노드 id | `keep.node(id)` 가 참(붙이는 문서에 그 노드가 있다) |
 * | 페이지 대상(`navigate` · `openModal`) | `keep.page(target)` 가 참(지금 프로젝트에 그 페이지가 있다) |
 * | 화면 상태 대상(`setViewState`) | 기본이거나 `keep.state(target)` 가 참(붙일 페이지에 그 상태가 있다) |
 * | 빈 대상(아직 안 고름) · 대상 없는 동작(팝업 닫기) | 늘 — 밖을 가리키는 것이 아니다 |
 *
 * 뺀 동작은 `droppedActions` 로 센다. **동작이 다 빠진 상호작용은 상호작용째 빼고**, 그래서 상호작용이 하나도 안 남으면
 * `interactions` 키도 걷는다. 처음부터 동작이 없던 상호작용은 건드리지 않는다 — 사용자가 짓다 만 것이다.
 *
 * **상태 보임**(`keep.state` — 붙일 페이지에 그 상태가 있다 · 없으면 모든 상태를 남긴다): 보임의 상태 가운데 `keep.state` 가 거짓인 것을
 * 빼고 상태마다 센다(`droppedStates` — 기본은 늘 남는다). 다 빠진 보임은 걷는다 — `only` 가 비면 그 노드는 모든 상태에서 보이게 되므로
 * 따로 센다(`clearedOnly` — 화면이 «보임을 걷었다»고 말한다). `except` 가 비면 원래 보이던 곳에서 그대로 보인다.
 *
 * **입력을 바꾸지 않고 입력과 값을 공유하지 않는다** — 거르기는 새 객체를 짓고, `props` · `setProp.value` 의 깊은 복사는
 * `remapNodeIds` 의 계약이다(그 머리말).
 */
export function prepareNodesForPaste(
  nodes: readonly WbNode[],
  keep: { node: (id: string) => boolean; page: (target: string) => boolean; state?: (id: string) => boolean },
  generate?: () => string,
): { nodes: WbNode[]; droppedActions: number; droppedStates: DroppedStates[]; clearedOnly: number } {
  const inside = new Set(nodes.flatMap((node) => collectNodeIds(node)))
  const keepState = keep.state ?? (() => true)
  const counts = new Map<string, number>()
  let droppedActions = 0
  let clearedOnly = 0

  const keepAction = (action: InteractionAction): boolean => {
    if (isTargetlessAction(action)) return true
    if (action.target.trim() === '') return true
    if (isPageTargetAction(action)) return keep.page(action.target)
    if (isViewStateAction(action)) return action.target === DEFAULT_VIEW_STATE || keepState(action.target)
    return inside.has(action.target) || keep.node(action.target)
  }

  const filter = (node: WbNode): WbNode => {
    const next: WbNode = { ...node }
    if (node.interactions) {
      const interactions: Interaction[] = []
      for (const interaction of node.interactions) {
        const actions = interaction.actions.filter(keepAction)
        const dropped = interaction.actions.length - actions.length
        droppedActions += dropped
        if (dropped === 0) interactions.push(interaction)
        else if (actions.length > 0) interactions.push({ ...interaction, actions })
      }
      if (interactions.length > 0 || node.interactions.length === 0) next.interactions = interactions
      else delete next.interactions
    }
    if (node.visibility) {
      const states = node.visibility.states.filter((state) => {
        if (state === DEFAULT_VIEW_STATE || keepState(state)) return true
        counts.set(state, (counts.get(state) ?? 0) + 1)
        return false
      })
      if (states.length > 0) next.visibility = { mode: node.visibility.mode, states }
      else {
        delete next.visibility
        if (node.visibility.mode === 'only') clearedOnly += 1
      }
    }
    return mapChildLists(next, filter)
  }

  const remapped = remapNodeIds(wrap(nodes.map(filter), CURRENT_DOCUMENT_VERSION).root, generate)
  return {
    nodes: remapped.root.children ?? [],
    droppedActions,
    droppedStates: [...counts].map(([state, count]) => ({ state, count })),
    clearedOnly,
  }
}

/** 붙여넣기가 보임에서 뺀 상태 — 상태 id 마다 그 상태를 뺀 노드 수. 통지(«상태 "X" 보임 N곳을 뺐습니다»)는 상태 이름을 아는 화면이 짓는다. */
export interface DroppedStates {
  state: string
  count: number
}
