/**
 * **설계서를 내려받는 자리**(설계 §11.3 — P8-4 T5 · D6·D7). 에디터 셸 머리에 산다.
 *
 * ## 조용히 성공하면 안 된다 (D6)
 *
 * 내려받기가 **버튼 하나**이면 눌렀을 때 파일이 떨어지고 끝난다. 그런데 그 파일 안에는
 * 그리지 못한 노드가 폴백으로 들어 있을 수 있고, 아무 데도 가지 않는 링크가 있을 수 있다.
 * **폴백이 든 HTML도 눈으로는 그럴듯한 한 장이고 번들은 그것을 남에게 전달한다**
 * (P8-2 이월 §7). 그래서 누르면 먼저 **무엇이 실릴지**를 보이고, 내려받기는 그 다음이다.
 *
 * ## 열 때 미리 부르지 않는다
 *
 * `getExportPreview`는 번들을 **실제로 만들어 본다** — 프로젝트의 모든 페이지를 서버에서
 * 그린다. 셸이 뜰 때마다 그것을 부르면 설계서를 여는 비용이 그만큼 는다. 그래서 사람이
 * 누를 때 부른다.
 *
 * ## 내려받기는 앵커다 — `fetch` + blob이 아니다
 *
 * 이유 둘. 번들 전체가 페이지 수의 제곱이라(P8-2 이월 §4) 다 받아 메모리에 드는 것이
 * 그대로 비용이 되고, `URL.createObjectURL`이 이 저장소의 테스트 환경에 없어 그 경로는
 * 케이스가 닿지 못한다. 앵커는 브라우저가 곧장 디스크로 흘려보내고 세션 쿠키(`httpOnly`)도
 * 그대로 실린다.
 *
 * **주소는 `api.exportUrl()`이 만든다** — 화면이 `/api/…`를 적기 시작하면 경로가 두 곳이
 * 된다. 파일 이름도 서버가 준 것을 그대로 쓴다(같은 이유).
 *
 * ## 타겟을 보이는 것이 이 화면의 둘째 몫이다
 *
 * 상호작용 탭의 `navigate`·`openModal` 타겟은 **손으로 적는 자유 입력**이다(재서 확인했다 —
 * `panels/interaction-panel.tsx`에 고르개가 없고, 그 자리 주석이 *"페이지 경로는 목록에서
 * 고를 수 없다"*고 적혀 있다). 서버가 조립하는 문자열이 무엇인지 알 길이 오늘 여기뿐이라,
 * 페이지마다 그 문자열을 그대로 보인다.
 *
 * ## 닫는 방식은 공용이다
 *
 * 바깥 클릭·`Escape`로 닫는 장치는 `shell/use-popover-dismiss.ts`가 갖는다 — 스냅샷
 * 팝오버와 같은 것을 쓴다. **두 벌로 두지 않는 이유는 그 부류가 조용히 갈리기
 * 때문이다:** 한쪽만 `Escape`를 안 듣거나 한쪽만 리스너를 안 걷어도 화면에는 아무것도
 * 안 보인다.
 *
 * ## 새 런타임 의존이 없다
 *
 * `<button>`·`<a download>`·`useState`뿐이다.
 */
import { useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ExportPreview } from '../api/types'
import { usePopoverDismiss } from './use-popover-dismiss'

/** 조회 상태. 성공과 실패를 판별 유니온으로 가른다(`routes/editor.tsx`와 같은 이유). */
type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: ExportPreview }
  | { status: 'failed'; failure: Failure }

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '내보낼 것을 확인하지 못했습니다'

export function ExportPanel(props: { projectId: string }): ReactElement {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<PreviewState>({ status: 'idle' })
  /**
   * **토글까지 감싸는 상자에 건다.** 그래야 토글 위의 `mousedown`이 *"바깥"*이 아니고,
   * 닫는 일을 토글의 `onClick` 하나가 한다(그 훅의 머리말).
   */
  const rootRef = usePopoverDismiss(open, () => setOpen(false))

  async function load(): Promise<void> {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', preview: await api.getExportPreview(props.projectId) })
    } catch (caught) {
      setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
    }
  }

  return (
    <div className="wb-shell-export" ref={rootRef}>
      <button
        type="button"
        className="wb-shell-export-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open
          setOpen(next)
          // **열 때마다 다시 본다.** 그 사이 페이지를 고쳤을 수 있고, 이 화면이 말하는 것은
          // 전부 *"지금 내보내면 무엇이 나오는가"*다 — 낡은 답을 보이면 D6이 뒤집힌다.
          if (next) void load()
        }}
      >
        내보내기
      </button>

      {open && (
        <div className="wb-shell-export-body" role="group" aria-label="내보내기">
          {state.status === 'loading' && <p role="status">내보낼 것을 확인하는 중…</p>}
          {/* 세션이 끊겼으면 문장이 아니라 로그인이다(`api/failure.tsx`의 D5) — 이
              화면만 다르게 굴면 사용자는 *"내보내기가 고장 났다"*로 읽는다. */}
          {state.status === 'failed' &&
            (state.failure.kind === 'signed-out' ? (
              <SignedOut />
            ) : (
              <p role="alert">{state.failure.message}</p>
            ))}
          {state.status === 'ready' && <Summary preview={state.preview} projectId={props.projectId} />}
        </div>
      )}
    </div>
  )
}

function Summary(props: { preview: ExportPreview; projectId: string }): ReactElement {
  const api = useApi()
  const { preview } = props

  return (
    <>
      <p className="wb-shell-export-count">페이지 {preview.pages.length}장을 내보냅니다</p>

      {/* **경고가 먼저다.** 내려받기 링크 아래 두면 사람이 누르고 나서 본다. */}
      {preview.errors.length > 0 && (
        <section className="wb-shell-export-warning" aria-label="그리지 못한 노드">
          <h3 className="wb-shell-export-heading">그리지 못한 노드가 있습니다</h3>
          {/* **파일 경로가 아니라 페이지 제목으로 말한다.** `errors[].path`는 번들 안의
              파일 이름이고 `index.html`이 담는 첫 페이지의 오류에도 `pages/….html`이
              붙는다(P8-3 이월 §1) — 아직 압축을 풀지 않은 사람에게 뜻이 없다. */}
          <ul className="wb-shell-export-list">
            {preview.errors.map((error, index) => (
              <li key={`${error.title}-${index}`}>
                {error.title} — {error.error.message ?? '알 수 없는 오류'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.duplicateTargets.length > 0 && (
        <section className="wb-shell-export-warning" aria-label="겹친 페이지 경로">
          <h3 className="wb-shell-export-heading">페이지 경로가 겹칩니다</h3>
          {/* 겹치면 **둘 다** 링크를 잃는다. 먼저 온 것을 이기게 두면 조용히 첫 페이지로
              가는데, 읽는 사람이 그것을 알아챌 방법이 없다. */}
          <p>같은 경로를 가리키는 페이지가 둘 이상이라 그 경로로 가는 링크가 생기지 않습니다.</p>
          <ul className="wb-shell-export-list">
            {preview.duplicateTargets.map((target) => (
              <li key={target}>
                <code className="wb-shell-export-path">{target}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.brokenLinks.length > 0 && (
        <section className="wb-shell-export-warning" aria-label="이어지지 않는 링크">
          <h3 className="wb-shell-export-heading">이어지지 않는 링크가 있습니다</h3>
          <ul className="wb-shell-export-list">
            {preview.brokenLinks.map((link) => (
              <li key={link.target}>
                <code className="wb-shell-export-path">{link.target}</code> — {link.from.join(', ')}에서 가리키는데{' '}
                {link.reason === 'missing' ? '그 경로의 페이지가 없습니다' : '그 경로의 페이지가 둘 이상입니다'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* **페이지마다의 경로.** 상호작용 탭의 `페이지 경로`에 그대로 적는 문자열이다. */}
      <section className="wb-shell-export-targets" aria-label="페이지 경로">
        <h3 className="wb-shell-export-heading">페이지 경로</h3>
        <ul className="wb-shell-export-list">
          {preview.pages.map((page) => (
            <li key={page.id}>
              {page.title} — <code className="wb-shell-export-path">{page.target}</code>
            </li>
          ))}
        </ul>
      </section>

      {/* 파일 이름도 주소도 서버가 준 것을 그대로 쓴다 — 지어내면 두 벌이 된다. */}
      <a
        className="wb-shell-export-download"
        href={api.exportUrl(props.projectId)}
        download={preview.fileName}
      >
        {preview.fileName} 내려받기
      </a>
    </>
  )
}
