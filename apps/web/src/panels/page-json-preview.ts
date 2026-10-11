/**
 * **페이지 JSON 미리보기** — 가져오기 상자(`panels/page-import-dialog.tsx`)가 고른 파일 · 붙여 넣은 글자를 읽어 무엇이 들어갈지 말한다
 * (설계서 「페이지 JSON」). **순수하고 던지지 않는다** — 상자는 메뉴 트리 안에 그려지고 그 자리는 오류 경계 밖이라, 여기서 부르는
 * 것은 전부 **값으로 답하는** 것들이다: `readPageJson`은 던지지 않고, 미리보기의 수는 봉투를 지난 트리에서 센다.
 *
 * # 읽기 실패를 **갈라 말한다**
 *
 * 파일은 읽었는데 그 안의 문서를 못 읽은 상태가 있다. 접으면 화면이 **겪지 않은 실패**를
 * 말한다.
 *
 * | 상태 | 무엇이 일어났나 | 사용자가 할 일 |
 * |---|---|---|
 * | `file-failed` | **파일 자체를 못 읽었다**(권한·삭제) | 다시 고른다 |
 * | `unreadable` | 파일은 읽었는데 JSON이 아니다 | 파일을 확인한다 |
 * | `not-envelope` | JSON은 맞는데 wirebound 페이지 파일이 아니다 | **다른 파일을 고른다** |
 * | `unknown-version` | 봉투는 맞는데 모르는 버전이다 | **wirebound를 올린다** |
 * | `bad-shape` | 봉투인데 **그 안의 내용**이 규격이 아니다 | **파일의 그 자리를 고친다**(자리를 보인다) |
 *
 * 첫 줄은 상자가 가른다(파일을 읽는 것이 상자다 — `FILE_FAILED`). 뒤 넷은 `@wirebound/schema`의 `readPageJson`이 가르고 **서버도
 * 같은 함수를 쓴다.**
 *
 * > ***"화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일이 없다"*고 단언하지 않는다.**
 * > 봉투 게이트 하나만 보면 그렇게 보이지만, 문서 버전 999 · 카탈로그에 없는 타입 ·
 * > `duplicate-id`는 봉투를 지나고도 서버가 400/422로 거절한다. 미리보기는 게이트 셋을 다
 * > 지나고(`previewPageJson`의 표), **그래도 서버만 아는 것 넷이 남는다** — 그것을 화면이
 * > 말한다(`SERVER_ONLY`). 단언을 줄이고 남는 것을 적는다.
 */
import { collectNodeIds, gatePageImport, partitionIssues, readPageJson, type PageJson, type ValidationIssue } from '@wirebound/schema'
// **카탈로그가 실려 있어야 `validatePage`가 참말을 한다.** import만으로 설치된다
// (`catalog-setup.ts`의 머리말) — 안 싣고 부르면 모든 타입이 *"없는 타입"*이 되어
// **미리보기가 멀쩡한 파일을 전부 막는다.**
import '../catalog-setup'

/** 봉투는 맞는데 그 안의 **문서 버전**을 이 wirebound가 모를 때. 서버도 같은 이유로 400이다. */
const UNSUPPORTED_VERSION = '이 파일의 문서 버전을 읽을 수 없습니다 —'
/** 봉투도 버전도 맞는데 **카탈로그 규칙**을 어겼을 때. 서버는 같은 이유로 422다. */
const INVALID_DOCUMENT = '이 문서는 페이지로 서지 않습니다 — 파일의 아래 자리를 고치세요.'
/**
 * 미리보기가 **볼 수 없는 것**. 아래 `previewPageJson`의 표를 한 줄로 옮긴 것이고,
 * *"미리보기가 다 걸러 준다"*는 거짓을 화면이 말하지 않게 하는 자리다.
 */
export const SERVER_ONLY = '보내 봐야 아는 것: 대상 메뉴가 아직 있는지 · NUL 문자 · 본문 크기 · 권한.'

/** 미리보기가 가리키는 파일의 한 자리. 봉투 이슈와 카탈로그 이슈를 같은 모양으로 담는다. */
export interface PreviewIssue {
  path: string
  message: string
  /** 카탈로그 이슈에만 있다. **파일의 id다** — 리매핑 전 문서로 보기 때문이다. */
  nodeId?: string | null
}

/** 대기 글자를 읽은 결과. */
export type Preview =
  | { kind: 'none' }
  | { kind: 'failed'; message: string; issues: readonly PreviewIssue[] }
  | {
      kind: 'ready'
      file: PageJson
      nodes: number
      comments: number
      dangling: number
      /** 막지 않는 이슈. **알리되 막지 않는다** — 서버도 이것으로 막지 않는다. */
      warnings: readonly PreviewIssue[]
    }

/**
 * 대기 글자를 미리보기로 옮긴다. **순수하고 던지지 않는다.**
 *
 * ---
 *
 * # 서버와 **같은 함수**로 게이트 셋을 지난다
 *
 * **봉투만 보면 미리보기가 통과시킨 파일을 서버가 거절한다** — 문서 버전 999 · 카탈로그에
 * 없는 타입 · `duplicate-id`가 그렇다. *"화면은 괜찮다고 했는데 저장이 거부됐다"*는 부류다.
 *
 * | 게이트 | 서버 | 여기 | 왜 같을 수 있나 |
 * |---|---|---|---|
 * | 봉투 | `parsePageJson` | `readPageJson` | 같은 모듈의 두 입구 |
 * | 문서 버전 | `migrateDocument` | 같은 함수 | 순수하고 브라우저에서 돈다 |
 * | 카탈로그 | `validatePage` | 같은 함수 | 〃. 카탈로그도 같은 패키지가 싣는다(`catalog-setup`) |
 *
 * **`error`만 막는다.** 경고는 서버도 막지 않으므로 여기서 막으면 **화면이 서버보다
 * 엄격해진다** — 그쪽 손해가 더 크다: 할 수 있는 일을 못 하게 된다.
 *
 * **검증을 리매핑 전 문서로 하는 것도 서버와 같다**. 사용자에게 남는 것은 파일뿐이라
 * 이슈의 `nodeId`가 **파일에서 찾을 수 있는 값**이어야 한다.
 *
 * # 서버만 아는 것 넷 — **미리보기가 다 걸러 준다고 말하지 않는다**
 *
 * | 무엇 | 왜 여기서 못 보나 |
 * |---|---|
 * | 대상 메뉴가 아직 있는가 | 트리가 낡았을 수 있다(고른 뒤 남이 지운다) |
 * | NUL(U+0000) | 그 규칙은 **Postgres를 아는 계층**의 것이다(`db/nul-guard.ts`) — 여기로 옮기면 브라우저에서도 도는 패키지가 DB 제약을 알게 된다 |
 * | 본문 크기 | 상한이 **서버 설정**이다(Fastify 기본 1MiB) |
 * | 권한 | 서버만 판정한다(설계서 「권한 모델」) |
 *
 * **그리고 배포 편차가 있다** — 서버가 다른 판의 `@wirebound/schema`를 돌리면 위 셋도
 * 갈릴 수 있다. 그래서 화면은 *"보내 봐야 아는 것"*이 남아 있다고 **말한다.**
 *
 * ---
 *
 * **끊긴 코멘트를 여기서 센다**. 세는 단위는 *"파일의 트리에 없는 노드를 가리키는
 * 코멘트 하나당 하나"*이고, 그것이 서버가 내는 `comments.dangling`과 같은 값이어야 한다 —
 * 같지 않으면 미리보기가 **일어나지 않을 일**을 말한다. 리매핑을 여기서 돌리지 않는 것은
 * 그것이 id를 태우기 때문이고, 셈에는 파일의 id 집합만 있으면 된다.
 *
 * `collectNodeIds`가 던지지 않는 것은 봉투를 지난 트리이기 때문이다 — `PageJsonSchema`가
 * `children`을 재귀로 검사하므로 노드가 아닌 원소가 있을 수 없다.
 */
export function previewPageJson(text: string): Preview {
  if (text.trim() === '') return { kind: 'none' }

  const result = readPageJson(text)
  if (result.status === 'failed') {
    return { kind: 'failed', message: result.message, issues: result.issues }
  }

  // **게이트 둘을 여기서 짜지 않는다 — 서버와 같은 함수를 부른다**.
  // 한 벌 더 짜면 같은 물음에 답하는 자리가 둘이 되고, 갈리는 날 이 미리보기가 다시
  // *"괜찮다"*고 거짓을 말한다. 순서·판정의 근거는 `gatePageImport`의 머리말에 있다.
  const gate = gatePageImport(result.file)
  if (!gate.ok) {
    return gate.reason === 'unsupported-version'
      ? { kind: 'failed', message: `${UNSUPPORTED_VERSION} ${gate.message}`.trim(), issues: [] }
      : {
          kind: 'failed',
          message: INVALID_DOCUMENT,
          // **막은 것만 보인다** — 게이트는 경고까지 함께 싣는데(서버 응답과 같은 관례),
          // 화면에서 둘을 섞으면 사용자가 무엇을 고쳐야 막힘이 풀리는지 모른다.
          issues: partitionIssues(gate.issues).errors.map(toPreviewIssue),
        }
  }

  const ids = new Set(collectNodeIds(result.file.schema.root))
  return {
    kind: 'ready',
    file: result.file,
    nodes: ids.size,
    comments: result.file.comments.length,
    dangling: result.file.comments.filter((comment) => !ids.has(comment.nodeId)).length,
    warnings: gate.warnings.map(toPreviewIssue),
  }
}

function toPreviewIssue(issue: ValidationIssue): PreviewIssue {
  return { path: issue.path, message: issue.message, nodeId: issue.nodeId }
}
