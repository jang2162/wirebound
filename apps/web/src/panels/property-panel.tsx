/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성한다**
 * (설계 §5.1·§9) — 컴포넌트마다 패널을 따로 만들지 않는다는 뜻이고, 그래서 카탈로그에
 * 컴포넌트가 늘어도 이 파일은 그대로다.
 *
 * **이 단계는 읽기 전용이다.** 입력 컨트롤(`EditorField.control`)을 실제 위젯으로 바꾸는
 * 것은 P2b-2다. `test/panels/property-panel.test.tsx`의 `이 단계에서는 입력이 없다` 케이스가
 * 그 경계를 지키고 있어, 그 케이스가 죽는 날이 곧 편집이 생긴 날이다.
 *
 * 설계 §9의 우측 패널은 탭 셋(속성·코멘트·상호작용)이지만 이 단계에는 속성뿐이라 탭을
 * 두지 않는다. 뷰 모드의 "페이지 설명" 탭도 마찬가지로 이후 단계다.
 */
import type { ReactElement } from 'react'
import {
  defaultStructure,
  findNode,
  getComponent,
  type ComponentDef,
  type EditorField,
  type WbNode,
} from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
// 카탈로그가 없으면 모든 노드가 "알 수 없는 타입"이 된다. 설치는 import만으로 끝난다.
import '../catalog-setup'

/** 고를 노드가 아직 없을 때. 페이지를 열지 않았을 때와 고르지 않았을 때가 같은 문장이다. */
const NO_SELECTION = '노드를 고르면 속성이 보입니다'

export function PropertyPanel(): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  const doc = useEditorStore(store, (s) => s.document)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  // 선택은 id 하나이고 노드는 문서에서 찾는다. 노드 객체를 스토어에 두면 P2b-2의 낙관적
  // 패치가 문서를 갈아 끼울 때 패널만 옛 노드를 들고 있게 된다.
  const node =
    doc !== null && selectedNodeId !== null ? findNode(doc.root, selectedNodeId) : undefined

  if (node === undefined) {
    return <p className="wb-shell-panel-notice">{NO_SELECTION}</p>
  }

  const def = getComponent(node.type)

  if (def === undefined) {
    return (
      <>
        <h2 className="wb-shell-panel-title">{node.type}</h2>
        {/* 캔버스는 이 노드를 폴백으로 그리고 배너로 알린다. 패널이 잠자코 비어 있으면
            사용자는 "왜 속성이 안 나오지"를 묻게 된다. */}
        <p className="wb-shell-panel-notice">카탈로그에 없는 컴포넌트입니다: {node.type}</p>
      </>
    )
  }

  const fields = visibleFields(def)

  return (
    <>
      <h2 className="wb-shell-panel-title">{node.type}</h2>
      {fields.length === 0 ? (
        // `Page`·`Slot`처럼 `editor`가 빈 컴포넌트가 있다. 아무것도 그리지 않으면
        // "아직 고르지 않았다"와 구분되지 않는다.
        <p className="wb-shell-panel-notice">이 컴포넌트에는 편집할 속성이 없습니다</p>
      ) : (
        <dl className="wb-shell-props">
          {fields.map((field) => (
            // `<dl>` 안의 `<div>`는 표준이 허용하는 묶음이다. 라벨과 값을 한 줄로 묶어야
            // 스타일과 테스트가 "줄"을 다룰 수 있다.
            <div className="wb-shell-prop" key={field.prop}>
              <dt className="wb-shell-prop-label">{field.label}</dt>
              <dd className="wb-shell-prop-value">{formatValue(readProp(node, field.prop))}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/**
 * 지금 구조에서 보이는 필드만 남긴다(설계 §5.1의 `visibleWhen`). 컬럼처럼 특정 구조에서만
 * 뜻이 있는 속성이 다른 구조에서 편집 가능한 것처럼 보이면 안 된다.
 */
function visibleFields(def: ComponentDef): EditorField[] {
  const structure = currentStructure(def)
  return def.editor.filter(
    (field) => field.visibleWhen === undefined || field.visibleWhen.structure === structure,
  )
}

/**
 * 이 노드가 **지금 그려지고 있는 구조**.
 *
 * 테마가 없는 이 단계에서는 카탈로그의 첫 구조가 곧 지금 구조다 — 렌더러도 구조 표를
 * 받지 못하면 같은 값을 고른다(`packages/renderer/src/render.tsx`의 `resolveStructureOf`).
 *
 * **P4a가 이것을 테마의 구조 선택으로 바꿔야 한다.** 테마가 실리면 캔버스가
 * `renderDocument(doc, { structures })`로 넘기는 그 표가 진실이 되고, 여기도 같은 표를
 * 봐야 한다. 둘이 갈라지면 패널이 감춘 속성이 화면에는 그려지는(또는 그 반대) 어긋남이
 * 생기는데, 그것은 사용자에게 "없는 속성"으로 보인다.
 */
function currentStructure(def: ComponentDef): string {
  return defaultStructure(def)
}

/** 노드의 props에서 값 하나. 없으면 `undefined`다 — 기본값을 대신 채우지 않는다(아래). */
function readProp(node: WbNode, prop: string): unknown {
  return node.props?.[prop]
}

/**
 * 값을 사람이 읽는 한 줄로 만든다.
 *
 * **없는 값은 빈 문자열이다.** 카탈로그의 기본값을 대신 채우지 않는 것은 의도다 — 문서에
 * 실제로 있는 값과 스키마의 기본값은 다른 것이고, P2b-2가 편집을 얹으면 "비어 있음"과
 * "기본값과 같은 값을 넣어 둠"이 서로 다른 편집 결과가 된다.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  // 사용자가 읽을 문장이어야 한다. `true`를 그대로 찍으면 화면에 코드가 보인다.
  if (typeof value === 'boolean') return value ? '켜짐' : '꺼짐'
  if (Array.isArray(value)) return value.map(formatItem).join(', ')
  // 여기 오는 값은 카탈로그의 어느 control에도 해당하지 않는 것이다. 지금 카탈로그에는
  // 그런 prop이 없지만(문자열·수·불리언·문자열 배열·키-값 배열이 전부다), 검증을 통과하지
  // 못한 문서가 스토어에 실리는 P2b-2에서는 들어올 수 있다. 마지막 수단으로 원문을 보인다.
  return JSON.stringify(value) ?? ''
}

/** 배열 원소 하나. `pairList`의 키-값 쌍만 따로 다룬다. */
function formatItem(item: unknown): string {
  if (isPair(item)) return `${item.key}: ${item.value}`
  return formatValue(item)
}

function isPair(value: unknown): value is { key: string; value: string } {
  if (typeof value !== 'object' || value === null) return false
  const pair = value as { key?: unknown; value?: unknown }
  return typeof pair.key === 'string' && typeof pair.value === 'string'
}
