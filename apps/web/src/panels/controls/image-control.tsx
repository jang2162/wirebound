/**
 * `image` control의 위젯 — 자리표시자의 그림(설계 spec `2026-10-24-compose-input-design.md` «그림 칸»). 값은 그림 id(그 바이트의 sha256)다.
 *
 * | 입구 | 무엇 |
 * |---|---|
 * | «그림 고르기…» | 숨은 파일 고르개(`accept` 다섯 꼴) |
 * | 끌어 놓기 | 이 칸이 OS 파일 놓기를 받는다. 패널의 나머지에 놓인 파일은 브라우저가 열지 않게 막는다(`usePanelFileGuard`) |
 * | 붙여넣기 | 이 칸 안에 포커스가 있을 때의 `paste` 에서 `clipboardData.files` 의 그림 — 칸에 `data-wb-own-shortcuts` 를 달아 셸의 노드 붙이기가 안 선다 |
 * | «올린 그림에서» | 그 프로젝트의 그림 목록에서 고른다(같은 그림을 다시 올리지 않게) |
 * | «지우기» | prop 을 지운다 |
 *
 * **올리기와 편집은 따로다** — 올리는 동안 «올리는 중 …%» 와 «취소», 끝나면 `place` 가 그 순간의 판을 다시 보고 `image` 하나를 바꾸는 편집을 낸다
 * (되돌리기 한 번). 편집 자리는 **누른 때의 노드**다 — 그 사이 다른 노드를 골라 이 위젯이 내려가도 처음 노드에 낸다(`place` 는 패널이 쥔다). 그
 * 노드를 남이 잠갔거나 지웠으면 편집을 안 내고 말한다. 올린 그림은 프로젝트에 남는다 — 다시 고르면 같은 id 다.
 *
 * **잠금** — `disabled` 면 고르기 · 놓기 · 붙여넣기 · 목록 · 지우기가 다 꺼진다(`./list-control.tsx` 의 «칸뿐 아니라 버튼도 함께 꺼진다»).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { EditorField } from '@wirebound/schema'
import { ApiError } from '../../api/client'
import { projectAssetUrl } from '../../api/asset-url'
import type { AssetInfo, AssetList } from '../../api/types'
import { useApi } from '../../api/context'

/** 받는 꼴 — 서버가 바이트로 다시 가른다(`apps/api/src/services/asset-format.ts`). */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

/** 올린 뒤 편집을 냈는가 — 패널이 그 순간의 판으로 가른다(`../property-panel.tsx` 의 `placeImage`). */
export type PlaceOutcome = 'ok' | 'locked' | 'gone' | 'left'

export const IMAGE_MESSAGES = {
  forbidden: '이 프로젝트에 그림을 올릴 권한이 없습니다',
  unreachable: '올리지 못했습니다 — 연결을 확인하세요',
  locked: '그림은 올렸지만 이 칸이 잠겨 넣지 못했습니다 — "올린 그림에서" 고를 수 있습니다',
  gone: '그림은 올렸지만 이 칸이 지워져 넣지 못했습니다 — "올린 그림에서" 고를 수 있습니다',
  notImage: 'PNG · JPEG · WebP · GIF · SVG 만 올릴 수 있습니다',
  listFailed: '올린 그림 목록을 읽지 못했습니다',
  noAssets: '이 프로젝트에 올린 그림이 없습니다',
} as const

export interface ImageControlProps {
  field: EditorField
  value: unknown
  id: string
  projectId: string
  disabled: boolean
  /** 곧바로 바꾸는 것(목록에서 고르기 · 지우기 — `''` 는 지우기). */
  onCommit: (value: string) => void
  /** 올리기가 끝난 뒤 — 그 순간의 판으로 편집을 낸다. 위젯이 내려간 뒤에도 불린다(누른 때의 노드). */
  place: (assetId: string) => PlaceOutcome
}

/** 바이트를 사람이 읽는 크기로. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`
}

/** 실패를 칸 밑 한 줄로. 끊은 올리기(«취소»)는 부르는 쪽이 거른다 — 말하지 않는다. */
function failureLine(error: unknown): { text: string; retry: boolean } {
  if (error instanceof ApiError) {
    if (
      error.code === 'too-large' ||
      error.code === 'unsupported-media' ||
      error.code === 'asset-quota' ||
      error.code === 'validation-failed'
    ) {
      return { text: error.issues?.[0]?.message ?? error.message, retry: false }
    }
    if (error.status === 403) return { text: IMAGE_MESSAGES.forbidden, retry: false }
    if (error.status === 0) return { text: IMAGE_MESSAGES.unreachable, retry: true }
    return { text: error.message, retry: true }
  }
  return { text: IMAGE_MESSAGES.unreachable, retry: true }
}

/** 칸 밖(패널의 나머지)에 놓인 파일을 브라우저가 열지 않게 — 그 파일을 버린다. 칸 안의 놓기는 칸이 받는다. */
function usePanelFileGuard(host: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = host.current
    const panel = element?.closest('aside') ?? null
    if (element === null || element === undefined || panel === null) return
    const guard = (event: DragEvent) => {
      if (!(event.dataTransfer?.types ?? []).includes('Files')) return
      if (event.target instanceof Node && element.contains(event.target)) return
      event.preventDefault()
      if (event.type === 'dragover' && event.dataTransfer !== null) event.dataTransfer.dropEffect = 'none'
    }
    panel.addEventListener('dragover', guard)
    panel.addEventListener('drop', guard)
    return () => {
      panel.removeEventListener('dragover', guard)
      panel.removeEventListener('drop', guard)
    }
  }, [host])
}

export function ImageControl(props: ImageControlProps): ReactElement {
  const api = useApi()
  const { field, id, projectId, disabled } = props
  const value = typeof props.value === 'string' ? props.value : ''
  const host = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<{ percent: number; abort: AbortController } | null>(null)
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null)
  const [lastFile, setLastFile] = useState<File | null>(null)
  const [list, setList] = useState<AssetList | null | 'failed'>(null)
  const [browsing, setBrowsing] = useState(false)
  const [info, setInfo] = useState<AssetInfo | null>(null)
  usePanelFileGuard(host)

  // 지금 그림의 이름 · 크기 — 그림이 있을 때만 목록을 읽는다(없으면 요청이 없다).
  useEffect(() => {
    if (value === '') {
      setInfo(null)
      return
    }
    let live = true
    api.listAssets(projectId).then(
      (got) => live && setInfo(got.assets.find((asset) => asset.id === value) ?? null),
      () => live && setInfo(null),
    )
    return () => {
      live = false
    }
  }, [api, projectId, value])

  function upload(file: File): void {
    if (disabled || uploading !== null) return
    setFailure(null)
    setLastFile(file)
    if (file.type !== '' && !IMAGE_ACCEPT.split(',').includes(file.type)) {
      setFailure({ text: IMAGE_MESSAGES.notImage, retry: false })
      return
    }
    const abort = new AbortController()
    setUploading({ percent: 0, abort })
    api
      .uploadAsset(projectId, file, file.name, {
        signal: abort.signal,
        onProgress: (loaded, total) => setUploading({ percent: total > 0 ? Math.floor((loaded / total) * 100) : 0, abort }),
      })
      .then(
        (asset) => {
          setUploading(null)
          setList(null)
          const outcome = props.place(asset.id)
          if (outcome === 'locked') setFailure({ text: IMAGE_MESSAGES.locked, retry: false })
          else if (outcome === 'gone') setFailure({ text: IMAGE_MESSAGES.gone, retry: false })
          else setInfo(asset)
        },
        (error: unknown) => {
          setUploading(null)
          if (!abort.signal.aborted) setFailure(failureLine(error))
        },
      )
  }

  function firstImage(files: FileList | null | undefined): File | null {
    return [...(files ?? [])].find((file) => file.type === '' || file.type.startsWith('image/')) ?? null
  }

  function browse(): void {
    if (browsing) {
      setBrowsing(false)
      return
    }
    setBrowsing(true)
    setList(null)
    api.listAssets(projectId).then(setList, () => setList('failed'))
  }

  const src = value === '' ? null : projectAssetUrl(projectId, value)
  return (
    <div
      ref={host}
      className="wb-shell-image"
      role="group"
      aria-labelledby={`${id}-label`}
      id={id}
      data-wb-own-shortcuts=""
      data-wb-image-dropzone=""
      aria-disabled={disabled ? true : undefined}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        if (disabled) return
        const file = firstImage(event.dataTransfer.files)
        if (file !== null) upload(file)
      }}
      onPaste={(event) => {
        const file = firstImage(event.clipboardData.files)
        if (file === null) return
        event.preventDefault()
        if (!disabled) upload(file)
      }}
    >
      <div className="wb-shell-image-current">
        {src === null ? (
          <span className="wb-shell-image-empty">그림 없음</span>
        ) : (
          <img className="wb-shell-image-thumb" src={src} alt={info?.name ?? '고른 그림'} />
        )}
        {info !== null && (
          <span className="wb-shell-image-info">
            {info.name} · {info.width}×{info.height} · {sizeLabel(info.size)}
          </span>
        )}
      </div>
      <div className="wb-shell-image-actions">
        <button
          type="button"
          className="wb-shell-image-button"
          disabled={disabled || uploading !== null}
          onClick={() => picker.current?.click()}
        >
          그림 고르기…
        </button>
        <button type="button" className="wb-shell-image-button" disabled={disabled} aria-expanded={browsing} onClick={browse}>
          올린 그림에서
        </button>
        <button type="button" className="wb-shell-image-button" disabled={disabled || value === ''} onClick={() => props.onCommit('')}>
          지우기
        </button>
        <input
          ref={picker}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          aria-label={`${field.label} 파일`}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) upload(file)
          }}
        />
      </div>
      <p className="wb-shell-image-hint">{disabled ? '이 칸은 지금 고칠 수 없습니다' : '여기에 파일을 끌어 놓거나 붙여 넣으세요'}</p>
      {uploading !== null && (
        <p className="wb-shell-image-progress" role="status">
          올리는 중 {uploading.percent}%
          <button type="button" className="wb-shell-image-button" onClick={() => uploading.abort.abort()}>
            취소
          </button>
        </p>
      )}
      {failure !== null && (
        <p className="wb-shell-prop-why" role="alert">
          {failure.text}
          {failure.retry && lastFile !== null && (
            <button type="button" className="wb-shell-image-button" disabled={disabled} onClick={() => upload(lastFile)}>
              다시 시도
            </button>
          )}
        </p>
      )}
      {browsing && (
        <div className="wb-shell-image-browser" role="listbox" aria-label="올린 그림">
          {list === null ? (
            <p className="wb-shell-image-hint">읽는 중…</p>
          ) : list === 'failed' ? (
            <p className="wb-shell-prop-why">{IMAGE_MESSAGES.listFailed}</p>
          ) : list.assets.length === 0 ? (
            <p className="wb-shell-image-hint">{IMAGE_MESSAGES.noAssets}</p>
          ) : (
            list.assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                role="option"
                aria-selected={asset.id === value}
                className="wb-shell-image-option"
                title={`${asset.name} · ${asset.width}×${asset.height} · ${sizeLabel(asset.size)}`}
                disabled={disabled}
                onClick={() => {
                  setBrowsing(false)
                  if (asset.id !== value) props.onCommit(asset.id)
                }}
              >
                <img className="wb-shell-image-option-thumb" src={projectAssetUrl(projectId, asset.id)} alt={asset.name} />
              </button>
            ))
          )}
          {list !== null && list !== 'failed' && (
            <p className="wb-shell-image-hint">
              그림 공간 {sizeLabel(list.usedBytes)} / {sizeLabel(list.limitBytes)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
