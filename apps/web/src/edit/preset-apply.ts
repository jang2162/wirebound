/**
 * 프리셋을 페이지에 놓는 편집을 만드는 곳(P7-2 D3·D4·D5).
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다** — `./ops.ts`·`./pattern-insert.ts`와 같은
 * 층이다. **던지지 않는다**: 부르는 자리가 구조 툴바이고 거기는 오류 경계 밖이라 던지면
 * 셸 전체가 흰 화면이 된다(`panels/structure-toolbar.tsx` 머리말).
 *
 * ---
 *
 * # 패턴 삽입과 갈리는 것 셋
 *
 * | | 패턴(`pattern-insert.ts`) | 프리셋(여기) |
 * |---|---|---|
 * | 무엇을 답하나 | *"어디에 꽂나"* | *"무엇을 치우고 놓나"* |
 * | op | `add` 여럿 | **`replace /root/children` 하나** |
 * | 판정 | 전개된 노드만 담은 **프로브** | **결과 문서 전체** |
 *
 * **프리셋은 페이지 통째라 자리 규칙이 없다**(P7-1 이월 §5). 그래서 되돌리기의 모양도
 * 다르다 — **undo 하나가 페이지 전체를 되돌린다.**
 *
 * **판정을 결과 문서로 하는 것이 D5다.** 패턴이 조각 프로브를 쓴 이유는 *"이미 깨진
 * 문서에서 멀쩡한 패턴이 영영 막힌다"*였는데, **프리셋은 그 이유가 성립하지 않는다** —
 * 적용하면 기존 children이 통째로 사라지므로 깨진 부분이 결과에 남지 않는다. 그 덕에
 * P7-1 이월 §2가 지목한 `duplicate-id` 축(프로브가 **원리적으로** 못 보는 것)이 저절로
 * 덮인다 — 따로 검사를 짜지 않았고, 케이스가 그것을 잰다.
 *
 * ---
 *
 * # `replace`와 `add`가 갈린다 — 재서 알았다(재라 #1)
 *
 * 계획서 D3은 op이 `{ op: 'replace', path: '/root/children' }` 하나라고 적었다. **재 보니
 * 절반만 참이다:**
 *
 * | 문서의 root | `replace /root/children` | `add /root/children` |
 * |---|---|---|
 * | `children` 키가 **있다** | 된다 (역도 된다) | 된다 (역은 `replace 옛값`) |
 * | `children` 키가 **없다** | **`PatchError: 바꿀 키가 없습니다`** — `applyOp`도 `invertOps`도 던진다 | 된다 (역은 `remove`) |
 *
 * `applyOp`의 `replaceAt`이 `Object.hasOwn(record, key)`를 요구하고 `invertOps`의 `replace`
 * 갈래가 `getByPointer(...) === undefined`에서 던지기 때문이다(`packages/schema/src/patch/`).
 * **오늘 만들어지는 페이지의 root에는 `children: []`이 있으므로**(`routes/pages.ts`의 기본
 * 문서) 흔한 경로는 `replace`다. 그러나 `WbNodeSchema`는 `children`을 optional로 두고
 * `PUT .../schema`는 그런 문서를 받으므로, **키가 없는 문서가 저장될 수 있다.**
 *
 * **그래서 문서를 보고 op을 고른다.** 두 갈래 모두 편집 파이프라인의 4·5단계
 * (`invertOps` → `applyOps`)를 지나야 하고, 케이스가 그 왕복을 잰다.
 */
import {
  cloneNodes,
  partitionIssues,
  remapNodeIds,
  validatePage,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
  type WbNode,
} from '@wirebound/schema'
import { isNodeLike } from './safe-walk'

/**
 * 왜 놓지 못했는가. **`null`이 아니라 이유를 내는 것이 `patternInsert`와 같은 판단이다** —
 * 화면이 *"프리셋이 잘못됐다"*와 *"이 페이지에 놓을 수 없다"*를 갈라 말할 수 있어야 한다.
 *
 * | 값 | 무엇이 잘못됐나 | 되돌리는 것 |
 * |---|---|---|
 * | `'no-root'` | 문서의 root가 노드가 아니다(깨진 문서) | 없음 — 편집 0건 |
 * | `'invalid'` | 놓고 나면 문서가 저장될 수 없다(`error` 이슈) | 없음 — 편집 0건 |
 *
 * **성공 갈래가 되돌리는 것은 편집 하나다** — undo 하나가 페이지 전체를 되돌린다(D3).
 *
 * **`'empty'`가 없다.** 빈 프리셋은 실패가 아니라 *"치우기"*라는 정상 조작이다(D7) —
 * P7-1 이월 §3의 예측(*"P7-2가 `'empty'` 갈래를 도달시킨다"*)이 여기서 갈린다. 그 판정은
 * 보고서에 있다.
 */
export type PresetApplyReason = 'no-root' | 'invalid'

export interface PresetApply {
  ops: PatchOp[]
  /**
   * 놓은 뒤 고를 노드. **첫 노드다.**
   *
   * 슬롯 규칙(P7-1 D5의 *"첫 슬롯"*)을 옮기지 않는 것은 이월 §4가 그러라고 했기
   * 때문이다 — 프리셋은 *"어디를 먼저 고치나"*의 답이 슬롯이 아니다. 위에서부터 읽는
   * 순서의 첫 노드가 사용자가 먼저 보는 것이다.
   *
   * **빈 프리셋이면 `null`이다** — 고를 것이 없다. 부르는 쪽이 선택을 그대로 두면 사라진
   * 노드를 가리키므로, 화면은 이 값이 `null`일 때 선택을 **비운다**(툴바가 그렇게 한다).
   */
  selectId: string | null
}

export interface PresetApplyResult {
  apply: PresetApply | null
  reason: PresetApplyReason | null
  /** `reason === 'invalid'`일 때만 비어 있지 않다. 화면이 그대로 보인다. */
  issues: ValidationIssue[]
}

/**
 * 프리셋을 놓는 편집을 만든다. 만들지 못하면 `apply`가 `null`이고 `reason`이 왜인지 말한다.
 *
 * **`marker`를 여기서 버리지 않는다**(D4). 버리는 자리는 **저장**이고(서버의
 * `POST .../presets`), 프리셋에 marker가 없으므로 이 경로가 그것을 다시 생각할 필요가
 * 없다. 케이스가 그 결정을 값으로 고정한다 — 여기서 몰래 버리기 시작하면 저장 쪽 규칙이
 * 느슨해져도 아무도 모른다.
 *
 * `generate`는 케이스가 id를 결정적으로 만들기 위한 이음매다. 운영은 기본값
 * (`createNodeId`)을 쓴다.
 */
export function presetApply(
  document: PageDocument,
  nodes: readonly WbNode[],
  generate?: () => string,
): PresetApplyResult {
  const root = document.root
  // **root가 노드가 아니면 놓을 자리가 없다.** `{...null}`이 던지지는 않지만 그렇게 만든
  // 문서는 봉투부터 깨져 있어 `'invalid'`로 뭉뚱그려지고, 그러면 화면이 *"프리셋이
  // 잘못됐다"*고 말하게 된다 — 잘못된 것은 문서다.
  if (!isNodeLike(root)) return { apply: null, reason: 'no-root', issues: [] }

  const placed = remapForPage(nodes, generate)
  const after: PageDocument = { version: document.version, root: { ...root, children: placed } }

  // **`error`만 본다**(P7-1 이월 §7). `warning`은 편집 파이프라인도 막지 않으므로 여기서
  // 막으면 화면만 서버보다 엄격해진다 — 끊긴 상호작용 `target`이 그 자리다(P5-2).
  const { errors } = partitionIssues(validatePage(after))
  if (errors.length > 0) return { apply: null, reason: 'invalid', issues: errors }

  return {
    apply: { ops: [childrenOp(root, placed)], selectId: placed[0]?.id ?? null },
    reason: null,
    issues: [],
  }
}

/**
 * 트리 전체에 새 id를 발급한다(§11.1 — *"프리셋 적용 시 노드 `id`를 새로 발급한다"*).
 *
 * **노드를 임시 root 하나에 담아 **한 번에** 리매핑한다.** 노드마다 따로 부르면 형제를
 * 가리키던 상호작용 `target`이 리매핑 대상 밖이 되어 **옛 id로 남는다** — 그러면 문서에
 * 없는 노드를 가리키고 `validatePage`가 `missing-interaction-target`(warning)을 낸다.
 * 케이스가 형제 사이를 가리키는 상호작용으로 그것을 잰다.
 *
 * **임시 root도 id를 하나 받아 가고 그것은 버려진다.** `generate`를 세는 케이스는 그
 * 한 번을 감안해야 한다 — 감추는 것보다 적어 두는 편이 싸다.
 */
function remapForPage(nodes: readonly WbNode[], generate?: () => string): WbNode[] {
  // **`cloneNodes`를 먼저 지난다.** `remapNodeIds`는 노드를 새 객체로 만들지만 `props`는
  // 참조 그대로 옮기므로(`{ ...node }`), 그대로 놓으면 문서의 `props`가 프리셋 원본
  // (내장이면 모듈 상수)과 **같은 객체**가 된다 — P7-1 리뷰가 `expandPattern`에서 실증한
  // 결함과 같은 부류다. 케이스가 원본을 고쳐 그 공유를 잰다.
  const wrapper: WbNode = { id: 'wb-preset-wrapper', type: 'Page', children: cloneNodes(nodes) }
  const remapped = remapNodeIds(wrapper, generate)
  return remapped.root.children ?? []
}

/**
 * `children`을 바꾸는 op 하나(D3 — **root 자체는 안 바꾼다**).
 *
 * `replace`와 `add`가 갈리는 이유는 파일 머리말의 표에 있다. **`Object.hasOwn`으로 보는
 * 것이 요점이다** — `root.children`이 `undefined`인 것과 키가 없는 것을 값으로는 가를 수
 * 없는데, 패치 엔진은 그 둘을 다르게 다룬다(`getByPointer`가 둘 다 `undefined`를 내지만
 * `replaceAt`은 `hasOwn`을 본다).
 */
function childrenOp(root: WbNode, placed: WbNode[]): PatchOp {
  const op = Object.hasOwn(root, 'children') ? 'replace' : 'add'
  return { op, path: '/root/children', value: placed }
}

/**
 * 실패를 사용자에게 말하는 문장. **순수 함수라 화면 없이 잰다.**
 *
 * **P7-1 이월 §3이 지목한 모양을 여기서 피한다.** 그쪽은 툴바가
 * `${머리말} ${issues.map(...).join(' / ')}`로 문장을 만드는데, 머리말이 콜론으로 끝나고
 * `issues`가 비면 **콜론 뒤가 빈 채로** 문장이 끝난다. 그 갈래는 화면을 지나야만 도달해
 * 케이스를 쓸 수 없었고, 그래서 고치지 못한 채 이월됐다.
 *
 * **여기서는 이유 목록을 붙이는 것 자체가 조건이다** — 비면 콜론도 없다. 그리고 이
 * 함수가 순수하므로 **빈 목록을 직접 넣어 잴 수 있다**(케이스가 그것을 잰다). 이월이
 * 제안한 방식이 이것이다.
 *
 * `reason`이 `null`인(성공한) 결과를 넣으면 빈 문자열이다 — 부르는 쪽이 실패 갈래에서만
 * 부르므로 오늘 도달하지 않고, 던지지 않는 것이 이 층의 계약이다.
 */
export function presetFailureNotice(result: PresetApplyResult): string {
  if (result.reason === null) return ''
  if (result.reason === 'no-root') return BROKEN_DOCUMENT_NOTICE
  return withReasons(BROKEN_PRESET_NOTICE, result.issues.map((issue) => issue.message))
}

/**
 * *"문서가 깨졌다"* — 사용자가 할 일이 **프리셋을 고치는 것이 아니다.** 그래서 아래와
 * 갈라 적는다(P7-1 D9가 패턴에서 세운 구분과 같은 축이다).
 */
const BROKEN_DOCUMENT_NOTICE =
  '이 페이지의 문서를 읽지 못해 프리셋을 놓을 수 없습니다. 새로고침해 서버 상태를 확인하세요.'

/** *"프리셋이 잘못됐다"* — 뒤에 이유가 붙는다. 없으면 안 붙는다(위 머리말). */
const BROKEN_PRESET_NOTICE = '프리셋을 놓지 못했습니다'

/**
 * 머리말에 이유를 잇는다. **비면 구분자도 없다** — 이월 §3의 *"콜론 뒤가 빈 문장"*이
 * 성립하지 않는 형태다.
 */
function withReasons(head: string, reasons: string[]): string {
  return reasons.length === 0 ? `${head}.` : `${head}: ${reasons.join(' / ')}`
}
