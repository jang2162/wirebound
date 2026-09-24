/**
 * **설계서를 내려받는 자리**(설계서 「HTML 정적 번들」 · PPTX).
 * 에디터 셸 머리에 산다.
 *
 * ## 조용히 성공하면 안 된다
 *
 * 내려받기가 **버튼 하나**이면 눌렀을 때 파일이 떨어지고 끝난다. 그런데 그 파일 안에는
 * 그리지 못한 노드가 폴백으로 들어 있을 수 있고, 아무 데도 가지 않는 링크가 있을 수 있다.
 * **폴백이 든 HTML도 눈으로는 그럴듯한 한 장이고 번들은 그것을 남에게 전달한다.**
 * 그래서 누르면 먼저 **무엇이 실릴지**를 보이고, 내려받기는 그 다음이다.
 *
 * **pptx도 같은 자리를 쓴다.** 브라우저나 한글 글꼴이 없는 서버에서 pptx를 내보내면
 * 파일은 200으로 나오고 슬라이드가 *"화면 이미지가 실리지 않았습니다"*만 말한다 —
 * **왜 없는지는 `export/preview`를 부르는 사람에게만 간다.** 이 화면이 그 이유가 사람에게 닿는 유일한 길이다.
 *
 * ## 형식은 토글이고, 한 번에 하나만 부른다
 *
 * 상자의 맨 위에 `HTML 번들`·`PPTX` 버튼 둘이 있고, 고른 쪽의 미리보기만 부른다.
 * **둘을 동시에 부르지 않는 이유는 이 조회가 싸지 않기 때문이다** — 위 *"열 때 미리 부르지
 * 않는다"*와 **같은 근거**다. `getExportPreview`는 번들을 실제로 만들어 보고, pptx는 거기에
 * 더해 **페이지를 한 장씩 그린다**(미리보기와 내려받기가 같은 판정을 쓴다).
 * 여는 순간 둘을 다 부르면 아무도 안 볼 형식의 값을 매번 치른다.
 *
 * **여는 순간엔 HTML 번들이다.** 형식을 기억해 두면
 * *"저번에 pptx를 봤다"*는 사실이 다음 번 여는 비용을 정하게 된다.
 *
 * **토글의 장치는 셸 머리의 `모드`(편집/뷰)와 같다** — `role="group"` 안의 버튼 둘에
 * `aria-pressed`를 **둘 다** 단다. 눌린 쪽만 표시하면 보조 기술은 나머지 버튼이 토글인지
 * 알 수 없다(`routes/editor.tsx`의 `ShellTools`가 같은 이유로 그렇게 한다). 새 어휘를
 * 만들지 않는다.
 *
 * ## 형식을 바꾸면 앞 형식의 결과가 남지 않는다
 *
 * 두 갈래는 **다른 것**을 말한다(`api/types.ts`의 판별 유니온). 앞 형식의 경고가 남은 채
 * 새 형식의 내려받기 링크가 서면 화면이 거짓을 말한다. `load()`가 부르기 **전에**
 * `loading`으로 갈아 끼우는 것이 그 자리다.
 *
 * **늦게 온 답도 막는다.** pptx는 페이지를 그리느라 html보다 오래 걸리므로, pptx를 눌렀다
 * html로 되돌리면 **먼저 보낸 pptx가 나중에 도착한다.** 표를 하나 들고 마지막 것이 아니면
 * 버린다 — 이것이 `useRef` 하나가 여기 있는 이유다.
 *
 * **앞 요청은 끊는다.** 표는 늦은 답을 **화면에서** 버릴 뿐 요청은 그대로 둔다 — 서버는 연결이 닫힐 때까지 그
 * 내보내기를 끝까지 돌고(pptx 는 페이지를 한 장씩 그린다), 그동안 이 사람의 다음 미리보기가 그 뒤에 선다(`apps/api`의
 * `services/export-worker.ts` «칸이 둘이다»). 그래서 새로 부를 때 · 닫을 때 · 화면이 내려갈 때 앞 요청을 끊는다
 * (`api/client.ts`의 `ReadOptions` «`cancel`»). 새로 불러 끊은 요청의 거절은 표가 버리고, 닫아 끊은 요청의 거절은
 * 닫힌 상자에 떨어졌다가 다시 열 때의 `loading`이 덮는다.
 *
 * **늦게 온 실패도 같은 표로 버린다** — `catch` 쪽의 표 검사가 `try` 쪽과 한 쌍이지 사족이
 * 아니다. 버리지 않으면 새 형식이 이미 그려진 자리를 **앞 형식의 오류 문장**이 덮는다:
 * 실패는 상자 전체를 `role="alert"` 하나로 바꾸므로 보고 있던 미리보기가 통째로 사라지고,
 * 사람은 방금 고른 형식이 실패했다고 읽는다. **형식으로 가르지 않는 것도 규칙이다** —
 * 버리는 근거는 표이지 형식이 아닌데, `catch`에는 `preview`가 없어도 `next`가 손에 있어
 * *"html 실패는 표를 안 보고 띄운다"*가 쉽게 쓰인다. 그것을 심으면 늦은 pptx 실패만 재는
 * 케이스는 전부 통과한다. 그래서 케이스가 **양쪽 방향**으로 있다.
 *
 * ## 내려받기는 받아 온 뒤 저장한다 — 앵커가 아니다
 *
 * 앵커(`<a download href>`)로 받으면 **실패를 화면이 모른다.** 미리보기가 된 뒤 내려받기가 503(내보내기가 밀려 있다 · 내 것이
 * 이미 돈다) · 409(그 사이 페이지가 다 지워졌다)로 끝나도 브라우저의 내려받기 목록에만 `canceled`가 남고 이 상자는 말이 없다
 * (실브라우저 — 독립 헤드리스 Chrome 으로 셋 다 쟀다: `download.failure()`가 `canceled` · 상자의 `alert` 0). 그래서
 * `api.downloadExport()`로 **받아 오고**, 되면 저장하고, 안 되면 그 문장을 이 상자에 적는다. 받는 동안은 버튼을 잠근다 —
 * 두 번 누르면 서버의 일이 둘이 되고 사람마다의 한도(`apps/api`의 `services/export-worker.ts` «한 사람이 줄을 다 쥐지
 * 않는다»)를 혼자 채운다.
 *
 * **대가 — 파일이 저장되기 전에 한 벌 통째로 브라우저에 든다.** 앵커는 디스크로 흘려보낸다. 잰 값은 `DownloadButton`의
 * 머리말이 갖는다. 서버는 어차피 파일을 다 만든 뒤에 보내므로(압축을 워커가 한 번에 한다) 흘려보내도 첫 바이트가 빨라지지
 * 않는다 — 잃는 것은 메모리뿐이다.
 *
 * 파일 이름은 서버가 준 것(`preview.fileName`)을 그대로 쓴다 — 화면이 지으면 두 벌이 된다.
 *
 * ## 타겟을 보이는 것이 이 화면의 둘째 몫이다 — **HTML 번들에서만**
 *
 * 상호작용 탭의 `navigate`·`openModal` 타겟은 **손으로 적는 자유 입력**이다
 * (`panels/interaction-panel.tsx`에 고르개가 없고, 그 자리 주석이 *"페이지 경로는 목록에서
 * 고를 수 없다"*고 적혀 있다). 서버가 조립하는 문자열이 무엇인지 알 길이 지금 여기뿐이라,
 * 페이지마다 그 문자열을 그대로 보인다.
 *
 * **pptx에는 그 목록을 안 보인다.** 슬라이드 사이에는 링크가 생기지 않으므로(설계서
 * 「명시적으로 제외한 것」이 도형 변환을 뺐다) 그 경로는 pptx 안에서 **아무것도 가리키지
 * 않는다.** 값이 있는데 그 값이 아무것도 안 가리키는 것은 `routes/export.ts`의 «미리보기가
 * 형식마다 다른 것을 말한다»가 응답에서 막은 바로 그 부류다. 대신 *"어느 페이지가
 * 실리는가"*는 제목 목록으로 말한다 — «조용히 성공하면 안 된다»의 첫 몫은 형식과 무관하다.
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
 * `<button>`·`URL.createObjectURL`·`useState`·`useRef`뿐이다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type {
  ExportFormat,
  ExportPreview,
  HtmlExportPreview,
  PptxExportPreview,
} from '../api/types'
import { usePopoverDismiss } from './use-popover-dismiss'

/** 조회 상태. 성공과 실패를 판별 유니온으로 가른다(`routes/editor.tsx`와 같은 이유). */
type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: ExportPreview }
  | { status: 'failed'; failure: Failure }

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '내보낼 것을 확인하지 못했습니다'

/** 내려받기가 서버의 이유 없이 실패했을 때의 문장. */
const DOWNLOAD_FAILURE = '파일을 내려받지 못했습니다'

/** 열 때의 형식. **기억하지 않는다** — 위 머리말의 근거. */
const DEFAULT_FORMAT: ExportFormat = 'html'

export function ExportPanel(props: { projectId: string }): ReactElement {
  const api = useApi()
  const [open, setOpen] = useState(false)
  /** **고른** 형식. 토글의 눌림이 이것을 따른다 — 부르는 동안에도 무엇을 고른 상태인지 보인다. */
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_FORMAT)
  const [state, setState] = useState<PreviewState>({ status: 'idle' })
  /**
   * 마지막으로 보낸 조회의 표. **늦게 온 앞 형식의 답을 버리는 자리다**(위 머리말).
   * `useState`가 아니라 `useRef`인 것은 이 값이 화면을 다시 그릴 이유가 아니기 때문이다.
   */
  const latest = useRef(0)
  /** 부르는 중인 조회를 끊는 자 — 위 머리말 «앞 요청은 끊는다». */
  const inflight = useRef<AbortController | null>(null)

  function abandon(): void {
    inflight.current?.abort()
    inflight.current = null
  }

  function close(): void {
    abandon()
    setOpen(false)
  }

  // 화면이 내려가면(프로젝트를 떠남) 부르던 조회도 끊는다.
  useEffect(() => abandon, [])

  /**
   * **토글까지 감싸는 상자에 건다.** 그래야 토글 위의 `mousedown`이 *"바깥"*이 아니고,
   * 닫는 일을 토글의 `onClick` 하나가 한다(그 훅의 머리말).
   */
  const rootRef = usePopoverDismiss(open, close)

  async function load(next: ExportFormat): Promise<void> {
    const ticket = (latest.current += 1)
    abandon()
    const controller = new AbortController()
    inflight.current = controller
    setFormat(next)
    // **여기서 앞 형식의 결과가 사라진다.** 두 갈래는 다른 것을 말하므로 섞여 보이면 안 된다.
    setState({ status: 'loading' })
    try {
      const preview = await api.getExportPreview(props.projectId, next, { cancel: controller.signal })
      if (latest.current !== ticket) return
      setState({ status: 'ready', preview })
    } catch (caught) {
      if (latest.current !== ticket) return
      setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
    }
  }

  /**
   * **이미 고른 형식을 다시 눌러도 다시 부르지 않는다** — 이 조회는 번들을 실제로 만들어
   * 보는 요청이라 비싸고, 같은 것을 누르는 것은 *"다시 보자"*가 아니라 잘못 누른 것이다.
   * 다시 보려면 닫았다 연다(열 때마다 다시 부르는 것이 이 화면의 규칙이다).
   */
  function choose(next: ExportFormat): void {
    if (next === format) return
    void load(next)
  }

  return (
    <div className="wb-shell-export" ref={rootRef}>
      <button
        type="button"
        className="wb-shell-export-toggle"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close()
            return
          }
          setOpen(true)
          // **열 때마다 다시 본다.** 그 사이 페이지를 고쳤을 수 있고, 이 화면이 말하는 것은
          // 전부 *"지금 내보내면 무엇이 나오는가"*다 — 낡은 답을 보이면 머리말 «조용히 성공하면 안 된다»가 뒤집힌다.
          void load(DEFAULT_FORMAT)
        }}
      >
        내보내기
      </button>

      {open && (
        <div className="wb-shell-export-body" role="group" aria-label="내보내기">
          {/* **맨 위다.** 아래의 모든 문장이 이 고름에 매여 있으므로, 읽기 전에 무엇을 읽는
              중인지 알아야 한다. 눌림은 **고른 것**을 따른다 — 응답을 기다리는 동안에도
              고름은 이미 정해져 있다. */}
          <div className="wb-shell-export-formats" role="group" aria-label="내보내기 형식">
            <button
              type="button"
              className="wb-shell-export-format"
              aria-pressed={format === 'html'}
              onClick={() => choose('html')}
            >
              HTML 번들
            </button>
            <button
              type="button"
              className="wb-shell-export-format"
              aria-pressed={format === 'pptx'}
              onClick={() => choose('pptx')}
            >
              PPTX
            </button>
          </div>

          {state.status === 'loading' && <p role="status">내보낼 것을 확인하는 중…</p>}
          {/* 세션이 끊겼으면 문장이 아니라 로그인이다(`api/failure.tsx` 머리말) — 이
              화면만 다르게 굴면 사용자는 *"내보내기가 고장 났다"*로 읽는다. */}
          {state.status === 'failed' &&
            (state.failure.kind === 'signed-out' ? (
              <SignedOut />
            ) : (
              <p role="alert">{state.failure.message}</p>
            ))}
          {/* **`preview.format`으로 가른다 — 고른 형식이 아니라.** 그려지는 값과 그 값이
              나온 응답이 같은 것이어야 한다. */}
          {state.status === 'ready' &&
            (state.preview.format === 'pptx' ? (
              <PptxSummary preview={state.preview} projectId={props.projectId} />
            ) : (
              <HtmlSummary preview={state.preview} projectId={props.projectId} />
            ))}
        </div>
      )}
    </div>
  )
}

/** HTML 정적 번들(zip)이 말하는 것. */
function HtmlSummary(props: { preview: HtmlExportPreview; projectId: string }): ReactElement {
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
              붙는다 — 아직 압축을 풀지 않은 사람에게 뜻이 없다. */}
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

      <DownloadButton preview={preview} projectId={props.projectId} />
    </>
  )
}

/**
 * PPTX가 말하는 것 — **화면 이미지에 대한 셋**이다.
 *
 * **세 자리로 가른다.** 서버가 `screenless`와 `screenFailures`를 가른 근거가 그대로
 * 여기에도 선다: *"아직 아무도 안 만들었다"*와 *"만들려다 실패했다"*를 한 자리에 접으면
 * 화면이 거짓을 말한다(`services/export-pptx.ts`의 «`screenless`와 실패를 가른다»). 셋째 `fontWarning`은 **기계의
 * 성질**이라 페이지 목록이 아니라 문장 하나다.
 *
 * **`fontWarning`이 맨 위인 것은 그것이 나머지의 이유이기 때문이다.** 한글 글꼴이 없으면
 * 아무것도 안 그리므로 `screenless`가 **전부**가 된다 — 둘이 함께 뜰 때 이유를 먼저 읽고
 * 목록을 나중에 읽는 순서가 된다.
 */
function PptxSummary(props: { preview: PptxExportPreview; projectId: string }): ReactElement {
  const { preview } = props

  return (
    <>
      <p className="wb-shell-export-count">페이지 {preview.pages.length}장을 내보냅니다</p>

      {preview.fontWarning !== null && (
        <section className="wb-shell-export-warning" aria-label="글꼴 경고">
          <h3 className="wb-shell-export-heading">화면 이미지를 그리지 못한 이유가 있습니다</h3>
          {/* **서버가 준 문장을 그대로 쓴다** — 글자를 한 자리에만 둔다(서버의
              `NO_KOREAN_FONT`). 화면이 다시 지으면 미리보기와 파일이 다른 말을 한다. */}
          <p>{preview.fontWarning}</p>
        </section>
      )}

      {preview.screenless.length > 0 && (
        <section className="wb-shell-export-warning" aria-label="화면 이미지가 없는 페이지">
          <h3 className="wb-shell-export-heading">화면 이미지 없이 실리는 페이지가 있습니다</h3>
          <p>아래 페이지의 슬라이드에는 글자만 실립니다.</p>
          <ul className="wb-shell-export-list">
            {preview.screenless.map((title, index) => (
              <li key={`${title}-${index}`}>{title}</li>
            ))}
          </ul>
        </section>
      )}

      {preview.screenFailures.length > 0 && (
        <section className="wb-shell-export-warning" aria-label="화면 이미지를 그리다 실패한 페이지">
          <h3 className="wb-shell-export-heading">화면 이미지를 그리다 실패했습니다</h3>
          {/* **이유를 페이지마다 그대로 보인다.** 브라우저가 낸 말이거나 서버가 정한
              말이고(`services/screen-render.ts`), 화면이 그것을 뭉뚱그리면 왜 실패했는지
              아는 길이 다시 사라진다. */}
          <ul className="wb-shell-export-list">
            {preview.screenFailures.map((failure, index) => (
              <li key={`${failure.title}-${index}`}>
                {failure.title} — {failure.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* **제목만이다 — 경로가 아니다.** 슬라이드 사이에는 링크가 생기지 않으므로 그 경로가
          pptx 안에서 아무것도 가리키지 않는다(위 머리말). */}
      <section className="wb-shell-export-pages" aria-label="슬라이드에 실릴 페이지">
        <h3 className="wb-shell-export-heading">슬라이드에 실릴 페이지</h3>
        <ul className="wb-shell-export-list">
          {preview.pages.map((page) => (
            <li key={page.id}>{page.title}</li>
          ))}
        </ul>
      </section>

      <DownloadButton preview={preview} projectId={props.projectId} />
    </>
  )
}

/** 내려받기의 상태. 미리보기의 `PreviewState`와 같은 판별 유니온이다. */
type DownloadState = { status: 'idle' } | { status: 'running' } | { status: 'failed'; failure: Failure }

/**
 * 내려받기 버튼. **형식마다 다시 적지 않는다** — 받고 저장하고 실패를 말하는 규칙이 두 벌이 되면
 * 한쪽만 낡는다(`routes/export.ts`의 `sendFile`이 서버 쪽에서 같은 판단을 한다).
 *
 * **형식은 `preview.format`에서 온다 — 고른 형식이 아니다.** 그래야 위에 그려진 경고와
 * 이 버튼이 **같은 응답**에서 나온 것이 된다. 파일 이름도 서버가 준 것을 그대로
 * 쓴다 — 지어내면 두 벌이 된다.
 *
 * **상자를 닫아도 받던 것은 끝까지 받아 저장한다** — 앵커로 받을 때와 같다(누른 것은 파일이다). 닫힌 상자에는 실패를
 * 적을 자리가 없으므로 그때의 실패는 말하지 못한다.
 *
 * **받아 온 뒤 저장하는 대가**(실브라우저 — 독립 헤드리스 Chrome · 같은 기계 · Chrome 프로세스 전부의 RSS 최고 대 누르기 전 ·
 * 같은 파일을 앵커로 받은 판과 번갈아 두 번씩):
 *
 * | 파일 | 앵커 | 이 버튼 | 걸린 시간 |
 * |---|---|---|---|
 * | html zip 2.8MB | +1MB | +6MB | 같다(3.4–4.2s — 서버가 만드는 시간) |
 * | pptx 33.5MB | +0MB | +0 · +5MB | 같다(7.9–9.8s) |
 * | pptx 100.6MB | +0 · +1MB | +87 · +89MB | 같다(24–27s) |
 *
 * 저장된 파일의 엔트리(이름 · 순서 · 내용)는 서버가 낸 것과 같았다. 다시 재는 법: 같은 프로젝트를 앵커(`<a download
 * href=…/export?format=…>`)와 이 버튼으로 번갈아 받으며 `ps`로 Chrome 프로세스의 RSS 를 50ms 마다 본다.
 */
function DownloadButton(props: { preview: ExportPreview; projectId: string }): ReactElement {
  const api = useApi()
  const { preview } = props
  const [state, setState] = useState<DownloadState>({ status: 'idle' })

  async function save(): Promise<void> {
    setState({ status: 'running' })
    try {
      const blob = await api.downloadExport(props.projectId, preview.format)
      saveBlob(blob, preview.fileName)
      setState({ status: 'idle' })
    } catch (caught) {
      setState({ status: 'failed', failure: toFailure(caught, DOWNLOAD_FAILURE) })
    }
  }

  return (
    <>
      <button
        type="button"
        className="wb-shell-export-download"
        disabled={state.status === 'running'}
        onClick={() => void save()}
      >
        {preview.fileName} 내려받기
      </button>
      {state.status === 'running' && <p role="status">파일을 만드는 중…</p>}
      {/* 세션이 끊겼으면 문장이 아니라 로그인이다 — 미리보기의 실패와 같은 규칙(위 `ExportPanel`). */}
      {state.status === 'failed' &&
        (state.failure.kind === 'signed-out' ? <SignedOut /> : <p role="alert">{state.failure.message}</p>)}
    </>
  )
}

/**
 * 받아 온 바이트를 파일로 저장한다 — 임시 앵커에 blob 주소를 걸어 누른다. **주소는 곧바로 놓지 않는다** — `click()`은
 * 내려받기를 시작만 하고 돌아오므로, 그 자리에서 놓으면 브라우저가 그 주소를 읽기 전에 사라질 수 있다(놓는 때를 재지는
 * 않았다 — 늦게 놓아 잃는 것은 그 분 동안의 메모리뿐이다).
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS)
}

/** 저장에 건 blob 주소를 놓기까지(ms) — `saveBlob`. */
const BLOB_URL_LIFETIME_MS = 60_000
