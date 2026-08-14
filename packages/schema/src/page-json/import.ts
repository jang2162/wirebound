/**
 * 가져오기의 **순수 부분**(§11.2 — P7-3 D5). 파일의 문서와 코멘트를 받아 *"저장할 수 있는
 * 모양"*으로 옮긴다.
 *
 * **던지지 않는다.** 부르는 자리가 둘이고(서버의 가져오기 라우트, 웹의 미리보기) 둘 다
 * 던지면 곤란한 층이다 — 서버는 500이 되고 웹은 오류 경계 밖이라 셸이 흰 화면이 된다.
 * **`migrateDocument`를 여기서 부르지 않는 이유가 그것이다** — 그 함수는 지원하지 않는
 * 버전에서 던지므로, 부르는 쪽이 자기 자리에서(400 / 문장) 잡아야 한다.
 *
 * ---
 *
 * # id를 재발급하고 참조 **셋**을 함께 옮긴다 (D5)
 *
 * §11.2가 명시한 둘(`comments[].nodeId` · 상호작용 `target`)에 **문서 안의 `marker`**가
 * 붙는다 — 다만 셋째는 옮길 것이 없다: 번호는 노드에 붙어 있으므로 노드가 그대로 실려
 * 오면 번호도 함께 온다(D6). **그래서 이 파일이 실제로 하는 일은 둘이다.**
 *
 * | 참조 | 누가 옮기나 |
 * |---|---|
 * | 상호작용 `target` | **`remapNodeIds`**(`../tree.ts`) — 트리 안을 가리키는 것만 바꾸고 `page:…`는 둔다 |
 * | `comments[].nodeId` | **여기** — P7-2 이월 §6: *"`remapNodeIds`는 코멘트를 모른다. 그 맵을 받는 쪽이 적용해야 하고 P7-3이 그 맵을 처음 쓰는 자리다"* |
 *
 * **값 공유를 끊는 것은 여기서 하지 않는다.** `remapNodeIds`의 계약이다(P7-2 리뷰가 그
 * 규칙을 아래층으로 내렸다) — 여기서 한 번 더 복사하면 규칙이 두 곳이 되고, 그 함수를
 * 쓰는 다음 소비자가 여전히 공유를 물려받는다.
 *
 * ---
 *
 * # 매핑에 없는 `nodeId` — 넣고, 갈라 센다 (D5)
 *
 * 파일의 코멘트가 **그 파일의 트리에 없는 노드**를 가리킬 수 있다. §11.2가 남의 파일을
 * 받는다는 것이 그런 뜻이다. 셋을 놓고 골랐다:
 *
 * | 후보 | 판정 |
 * |---|---|
 * | **버린다** | **안 한다.** 사용자가 적은 글이 소리 없이 사라진다 — 이 저장소가 반복해 닫아 온 부류다 |
 * | 파일 전체를 **거부한다** | **안 한다.** 나머지가 멀쩡한 파일을 코멘트 한 줄 때문에 못 쓰게 된다. 그리고 서버는 이 상태를 이미 정상으로 다룬다 — `comments.node_id`에 FK가 없다(0008) |
 * | **넣고 말한다** | **이것이다.** 들어간 뒤 화면은 그 무리를 *"사라진 노드"*로 갈라 보인다(P5-1이 이미 만든 자리). 부르는 쪽이 `dangling`을 세어 **넣기 전에** 말한다 |
 *
 * **P7-2 이월 §4가 이것을 예고했다** — *"고아 코멘트를 만드는 셋째 경로가 P7-3이다."*
 * 그 이월이 세는 단위를 못박아 두었고, 여기서는 그것이 **`dangling`의 길이**다.
 * `dangling`은 `comments`의 부분집합이고 **같은 객체**다 — 둘을 겹쳐 넣으면 코멘트가 두 번
 * 들어간다(케이스가 그 동일성을 잰다).
 *
 * ---
 *
 * # 검증은 여기서 하지 않는다 — **리매핑 *전* 문서로 하는 것이 D8이다**
 *
 * P7-2 이월 §3은 *"판정은 결과 문서 전체"*이고 가져오기는 root까지 바꾸므로 **실패 문장이
 * 가리킬 것이 파일뿐**이라고 적었다. 그런데 결과 문서로 `validatePage`를 돌리면 이슈의
 * `nodeId`가 **방금 발급한 새 id**라 사용자가 자기 파일에서 찾을 수 없다.
 *
 * **두 문서의 구조가 같다는 것이 그 문제를 푼다** — 이 파일은 id만 바꾸므로 두 판의 이슈는
 * `code`·`path`가 같고 `nodeId`만 다르다(케이스가 그것을 잰다). 그러니 **부르는 쪽은
 * 리매핑 전 문서로 판정한다.** 이 파일이 판정을 들지 않는 것은 그 선택을 부르는 쪽에
 * 남겨 두기 위해서다.
 */
import { migrateDocument } from '../migrate'
import type { PageDocument } from '../node'
import { remapNodeIds } from '../tree'
import { partitionIssues, validatePage, type ValidationIssue } from '../validate'
import type { PageJson, PageJsonComment } from './envelope'

/**
 * 봉투를 지난 파일이 **저장될 수 있는가**. 봉투 다음의 게이트 둘을 한 함수로 묶는다.
 *
 * ---
 *
 * # 왜 함수가 하나여야 하나 (P7-3 리뷰 ③)
 *
 * 서버(`services/page-import.ts`)와 화면의 미리보기가 **같은 물음에 답한다.** 앞 판은
 * 서버만 이 둘을 돌렸고 미리보기는 봉투에서 멈췄다 — 그래서 **미리보기가 통과시킨 파일을
 * 서버가 거절했다**(리뷰가 셋을 실측했다: 문서 버전 999 · 카탈로그에 없는 타입 ·
 * `duplicate-id`). P7-1 이월 §2가 이름 붙인 *"화면은 괜찮다고 했는데 저장이 거부됐다"*이다.
 *
 * **미리보기 쪽에 같은 순서를 한 벌 더 짜는 것으로 고치지 않았다.** 그러면 같은 물음에
 * 답하는 자리가 둘이 되고 언젠가 갈린다 — 이 저장소가 반복해 닫아 온 모양이다
 * (`partitionIssues` 하나가 severity의 선을 긋는 것과 같은 근거). **여기 하나를 양쪽이
 * 부른다.**
 *
 * # 순서가 규격이다
 *
 * 1. `migrateDocument` — §13.1이 *"가져오기와 스냅샷 복원도 같은 경로를 탄다"*고 적은 자리.
 *    지원하지 않는 버전이면 **던지는 것을 여기서 잡아** 값으로 바꾼다(이 층은 던지지 않는다).
 * 2. `validatePage` — **`error`만 막는다.** 경고는 편집 파이프라인도 막지 않으므로 그것으로
 *    막으면 가져오기만 다른 쓰기 경로보다 엄격해진다(P7-1 이월 §7).
 *
 * **리매핑 *전* 문서로 본다**(D8). 두 판의 이슈는 `code`·`path`가 같고 `nodeId`만 다른데,
 * 사용자에게 남는 것은 파일뿐이라 **파일에서 찾을 수 있는 id**를 말해야 한다.
 *
 * # 이 게이트가 **보지 않는** 것
 *
 * 대상 메뉴의 존재 · NUL(U+0000) · 본문 크기 · 권한. 넷 다 **서버만 아는 것**이고, 그래서
 * 미리보기를 지난 파일도 서버에서 거절될 수 있다 — 화면은 그것을 단언하지 않고 말한다.
 */
export type PageImportGate =
  | { ok: true; document: PageDocument; warnings: ValidationIssue[] }
  | { ok: false; reason: 'unsupported-version'; message: string }
  /** **경고까지 함께 싣는다** — `PUT .../schema`·파이프라인과 같은 관례다. */
  | { ok: false; reason: 'invalid-document'; issues: ValidationIssue[] }

export function gatePageImport(file: PageJson): PageImportGate {
  let document: PageDocument
  try {
    document = migrateDocument(file.schema)
  } catch (error) {
    return {
      ok: false,
      reason: 'unsupported-version',
      message: error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다',
    }
  }

  const issues = validatePage(document)
  const { errors, warnings } = partitionIssues(issues)
  if (errors.length > 0) return { ok: false, reason: 'invalid-document', issues }

  return { ok: true, document, warnings }
}

export interface PageImportPlan {
  /** 저장할 문서. 모든 노드가 새 id를 갖는다. */
  document: PageDocument
  /** 넣을 코멘트 전부. `nodeId`는 옮겨진 값이다(옮길 곳이 없으면 파일의 값 그대로). */
  comments: PageJsonComment[]
  /**
   * 그중 **파일의 트리에 없는 노드**를 가리키던 것. `comments`의 부분집합이고 같은
   * 객체다 — 부르는 쪽은 `comments`만 넣고 이 목록은 **세어 말하는 데**만 쓴다.
   */
  dangling: PageJsonComment[]
  /** 옛 id → 새 id. 부르는 쪽이 더 옮길 것이 생기면 이 맵을 쓴다. */
  mapping: Map<string, string>
}

/**
 * 파일의 문서·코멘트를 저장할 모양으로 옮긴다.
 *
 * `generate`는 케이스가 id를 결정적으로 만들기 위한 이음매다(`presetApply`와 같은 자리).
 * 운영은 기본값(`createNodeId`)을 쓴다.
 */
export function planPageImport(
  document: PageDocument,
  comments: readonly PageJsonComment[],
  generate?: () => string,
): PageImportPlan {
  const remapped = remapNodeIds(document.root, generate)
  const dangling: PageJsonComment[] = []

  const moved = comments.map((comment) => {
    const nodeId = remapped.mapping.get(comment.nodeId)
    // **옮길 곳이 없으면 파일의 값을 그대로 든다.** 새 id를 지어내면 문서에 없는 노드를
    // 가리키는 것은 같은데 사용자가 원래 무엇을 가리켰는지까지 잃는다.
    const entry = { nodeId: nodeId ?? comment.nodeId, body: comment.body }
    if (nodeId === undefined) dangling.push(entry)
    return entry
  })

  return {
    document: { version: document.version, root: remapped.root },
    comments: moved,
    dangling,
    mapping: remapped.mapping,
  }
}
