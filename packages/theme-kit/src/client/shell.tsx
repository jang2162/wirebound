import type { ExamplePageId } from '@wirebound/theme-gallery'
import type { TokenDecl } from '@wirebound/theme-sdk'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  EVENTS_PATH,
  PROJECT_PATH,
  type FramePage,
  type FrameReady,
  type FrameState,
  type PreviewView,
  type ProjectState,
} from './protocol'

/** 뷰포트 프리셋(px). 프레임 iframe 의 폭이 되어 테마의 `@media` · `vw` 가 그 폭으로 판정된다(spec 「캔버스 iframe」과 같은 까닭). */
const VIEWPORT_PRESETS = [1920, 1440, 1280, 1024, 768, 375] as const

type Values = Record<string, string | number>

/** 보기 전환 — 웹의 테마 미리보기와 같은 말. */
const VIEWS: readonly { id: PreviewView; label: string }[] = [
  { id: 'components', label: '컴포넌트' },
  { id: 'examples', label: '예제 페이지' },
]

function TokenField(props: {
  name: string
  decl: TokenDecl
  value: string | number | undefined
  onChange: (v: string | number | undefined) => void
}): ReactElement {
  const { name, decl } = props
  const shown = props.value ?? decl.default
  const common = { 'data-wb-token-input': name, 'aria-label': decl.label }
  let control: ReactElement
  if (decl.type === 'select') {
    control = (
      <select {...common} value={String(shown)} onChange={(e) => props.onChange(e.target.value)}>
        {(decl.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  } else if (decl.type === 'number') {
    control = (
      <input
        {...common}
        type="number"
        value={String(shown)}
        onChange={(e) => props.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  } else {
    control = <input {...common} type="text" value={String(shown)} onChange={(e) => props.onChange(e.target.value)} />
  }
  const hex = typeof shown === 'string' && /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#000000'
  return (
    <label className="token">
      <span className="token-label">
        {decl.label} <code>{name}</code>
      </span>
      <span className="token-controls">
        {decl.type === 'color' && (
          <input type="color" value={hex} aria-label={`${decl.label} 고르기`} onChange={(e) => props.onChange(e.target.value)} />
        )}
        {control}
        <button type="button" disabled={props.value === undefined} onClick={() => props.onChange(undefined)}>
          기본값
        </button>
      </span>
    </label>
  )
}

function Shell(): ReactElement {
  const [project, setProject] = useState<ProjectState>({ manifest: null, issues: [] })
  const [width, setWidth] = useState<number>(1280)
  const [overlay, setOverlay] = useState(false)
  const [values, setValues] = useState<Values>({})
  const [view, setView] = useState<PreviewView>('components')
  /** 예제의 장 목록 — 프레임이 준비 신호에 싣는다(`FrameReady` 머리말). 첫 장이 처음 장이다. */
  const [pages, setPages] = useState<FrameReady['pages']>([])
  const [page, setPage] = useState<ExamplePageId>('dashboard')
  /** 예제 틀에서 끈 영역 — 작성자가 «보기» 메뉴로 끈 판을 본다(에디터 편집 모드와 같은 켬/끔). */
  const [hiddenRegions, setHiddenRegions] = useState<string[]>([])
  const frame = useRef<HTMLIFrameElement>(null)
  const latest = useRef<Omit<FrameState, 'type'>>({ tokens: values, overlay, view, page, hiddenRegions })
  latest.current = { tokens: values, overlay, view, page, hiddenRegions }

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'wb-state', ...latest.current } satisfies FrameState, '*')
  }, [])

  useEffect(() => {
    void fetch(PROJECT_PATH)
      .then((r) => r.json() as Promise<ProjectState>)
      .then(setProject)
    const events = new EventSource(EVENTS_PATH)
    events.onmessage = (event) => setProject(JSON.parse(event.data as string) as ProjectState)
    return () => events.close()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data as FrameReady | FramePage | null
      if (data?.type === 'wb-frame-ready') {
        setPages(data.pages)
        // 첫 장이 처음 장 — 목록에 없는 장이면(갤러리가 장을 바꿈) 첫 장으로.
        setPage((prev) => (data.pages.some((one) => one.id === prev) ? prev : (data.pages[0]?.id ?? prev)))
        send()
      }
      // 예제 안의 이동 — 장 이름 줄이 따라간다. 프레임은 이미 그 장을 그렸다.
      if (data?.type === 'wb-page') setPage(data.page)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [send])

  useEffect(send, [values, overlay, view, page, hiddenRegions, send])

  const manifest = project.manifest
  // 예제 장은 서브페이지다 — 그 레이아웃의 끌 수 있는 영역만 체크로 선다.
  const toggles = (manifest?.layouts?.subpage?.regions ?? []).filter((region) => region.toggle !== false)
  const items = Object.entries(manifest?.tokens.items ?? {})
  const groups = [...(manifest?.tokens.groups ?? []), { id: '', label: '기타' }]
  const setValue = (name: string, value: string | number | undefined) =>
    setValues((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[name]
      else next[name] = value
      return next
    })

  return (
    <div className="shell">
      <header>
        <strong data-wb-theme-title="">{manifest ? `${manifest.name} · ${manifest.version}` : '(manifest 를 읽지 못했습니다)'}</strong>
        <label>
          뷰포트{' '}
          <select data-wb-viewport="" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
            {VIEWPORT_PRESETS.map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </label>
        <label>
          <input data-wb-overlay="" type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> 겹쳐 보기(포커스 ·
          마커)
        </label>
        <button type="button" disabled={Object.keys(values).length === 0} onClick={() => setValues({})}>
          전체 기본값
        </button>
        <span role="radiogroup" aria-label="미리보기 보기" className="views">
          {VIEWS.map((one) => (
            <label key={one.id}>
              <input data-wb-view={one.id} type="radio" name="wb-view" checked={view === one.id} onChange={() => setView(one.id)} />{' '}
              {one.label}
            </label>
          ))}
        </span>
        {view === 'examples' && (
          <nav aria-label="예제 페이지" className="pages">
            {pages.map((one) => (
              <button key={one.id} type="button" aria-current={one.id === page ? 'page' : undefined} onClick={() => setPage(one.id)}>
                {one.title}
              </button>
            ))}
          </nav>
        )}
        {view === 'examples' && toggles.length > 0 && (
          <span role="group" aria-label="틀 영역" className="regions">
            {toggles.map((region) => (
              <label key={region.id}>
                <input
                  data-wb-region-toggle={region.id}
                  type="checkbox"
                  checked={!hiddenRegions.includes(region.id)}
                  onChange={(e) =>
                    setHiddenRegions((prev) => (e.target.checked ? prev.filter((id) => id !== region.id) : [...prev, region.id]))
                  }
                />{' '}
                {region.label}
              </label>
            ))}
          </span>
        )}
      </header>
      <aside>
        {project.issues.length > 0 && (
          <ul data-wb-issues="" className="issues">
            {project.issues.map((i, n) => (
              <li key={n} data-wb-issue-code={i.code}>
                ✗ {i.code} <code>{i.path}</code> — {i.message}
              </li>
            ))}
          </ul>
        )}
        {groups.map((group) => {
          const inGroup = items.filter(([, decl]) => {
            const known = manifest?.tokens.groups?.some((g) => g.id === decl.group) ?? false
            return group.id === '' ? !known : decl.group === group.id
          })
          if (inGroup.length === 0) return null
          return (
            <fieldset key={group.id}>
              <legend>{group.label}</legend>
              {inGroup.map(([name, decl]) => (
                <TokenField key={name} name={name} decl={decl} value={values[name]} onChange={(v) => setValue(name, v)} />
              ))}
            </fieldset>
          )
        })}
      </aside>
      <main>
        <iframe ref={frame} title="미리보기" src="/frame.html" style={{ width: `${width}px` }} />
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Shell />)
