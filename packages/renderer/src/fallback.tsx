import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * 스타일을 인라인으로 두는 이유: 이 요소는 테마의 어휘 밖이다. 테마가 스타일할 수
 * 있는 것은 카탈로그가 선언한 parts뿐이고(설계서 「컴포넌트 정의 구조」), 폴백은 그 목록에 없다. 테마가
 * 무엇이든 이 자리표시는 같은 모습으로 보여야 한다.
 */
const containerStyle: CSSProperties = {
  border: '1px dashed #d24545',
  borderRadius: 4,
  padding: '8px',
  background: '#fff5f5',
  color: '#a11',
  font: '12px/1.5 system-ui, sans-serif',
}

const messageStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  whiteSpace: 'pre-wrap',
}

/**
 * 렌더할 수 없는 노드 자리에 그리는 눈에 보이는 자리표시.
 *
 * 던지지 않는 이유(설계서 「정방향 흐름」): 에디터는 서버 검증 **전에** 낙관적 패치를
 * 적용하므로 일시적으로 유효하지 않은 문서가 정상 상태다. 한 노드가 던지면 React가
 * 그 서브트리를 통째로 버려 편집 중 화면이 사라진다.
 *
 * `data-wb-id`를 그대로 다는 이유: 캔버스의 선택 로직이 id로 노드를 찾는다. 폴백이
 * id를 잃으면 깨진 노드는 클릭해서 고칠 수 없는 노드가 된다.
 *
 * 자식을 안에 품는 이유: 부모를 못 그리는 것과 자식을 못 그리는 것은 별개다.
 */
export function FallbackNode(props: {
  nodeId: string
  /** 한국어 메시지. 사용자에게 그대로 보여도 된다. */
  message: string
  children?: ReactNode
}): ReactElement {
  return (
    <div data-wb-id={props.nodeId} data-wb-error={props.message} style={containerStyle}>
      <span style={messageStyle}>{props.message}</span>
      {props.children}
    </div>
  )
}
