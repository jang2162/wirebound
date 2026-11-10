import { z } from 'zod'
import { defineComponent } from '../define'
import { SUMMARY_TEXT_MAX, axisWord, clipped, joined, oneLine } from '../summary'

export const TextDef = defineComponent({
  type: 'Text',
  code: { kind: 'label', prop: 'content' },
  label: '텍스트',
  description: '제목·본문 같은 글. 역할이 크기를 정한다.',
  group: 'document',
  props: z.strictObject({
    content: z.string().default('텍스트'),
    role: z.enum(['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption']).default('body'),
  }),
  editor: [
    { prop: 'content', control: 'textarea', label: '내용' },
    {
      prop: 'role',
      control: 'select',
      label: '역할',
      options: ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'],
    },
  ],
  variantFrom: 'role',
  summary: (props) => clipped(props.content, SUMMARY_TEXT_MAX),
  states: [],
  zones: [],
})

export const MediaDef = defineComponent({
  type: 'Media',
  label: '미디어',
  description: '이미지·영상·차트가 들어갈 자리.',
  group: 'document',
  props: z.strictObject({
    kind: z.enum(['image', 'video', 'illustration', 'chart']).default('image'),
    caption: z.string().default(''),
    ratio: z.enum(['16/9', '4/3', '1/1', '3/4']).default('16/9'),
  }),
  editor: [
    { prop: 'kind', control: 'select', label: '종류', options: ['image', 'video', 'illustration', 'chart'] },
    { prop: 'ratio', control: 'select', label: '비율', options: ['16/9', '4/3', '1/1', '3/4'] },
    { prop: 'caption', control: 'text', label: '설명' },
  ],
  summary: (props) => joined(oneLine(props.kind), oneLine(props.caption)),
  states: [],
  zones: [],
})

export const DividerDef = defineComponent({
  type: 'Divider',
  label: '구분선',
  description: '내용을 가르는 선.',
  group: 'document',
  props: z.strictObject({
    direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  editor: [{ prop: 'direction', control: 'select', label: '방향', options: ['horizontal', 'vertical'] }],
  variantFrom: 'direction',
  summary: (props) => axisWord(props.direction),
  states: [],
  zones: [],
})

/** 자리표시자 색의 꼴 — 소문자 `#rrggbb` 하나. 에디터의 색 칸이 소문자로 바꿔 보낸다. */
export const PLACEHOLDER_COLOR = /^#[0-9a-f]{6}$/

/**
 * 그림 id 의 꼴 — 그림 바이트의 sha256 소문자 16진수 64 자(내용이 이름이다 · 정본 「그림」). api 의 그림 라우트 · 번들 수집 · 에디터가 같은 꼴을 쓴다.
 */
export const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/

/** 빈 값(`''` · 없음)은 «테마 기본» 이다. */
function placeholderColor() {
  return z.string().regex(PLACEHOLDER_COLOR, '색은 #rrggbb(소문자) 꼴입니다').or(z.literal('')).optional()
}

export const PlaceholderDef = defineComponent({
  type: 'Placeholder',
  code: { kind: 'label', prop: 'label' },
  // **`영역`이 아닌 것에 근거가 있다.** 이 컴포넌트의 `label` 기본값이 `'미정 영역'`이라
  // 이름을 `영역`으로 두면 상호작용 문장이 *"미정 영역 영역"*이 된다(`describe.ts`가 이
  // 이름을 그대로 쓴다). 짧게 «고치지» 마라.
  label: '자리 표시자',
  description: '카탈로그에 없는 요소를 손으로 그리는 자리. 색 · 글 · 그림을 정한다.',
  group: 'document',
  /**
   * **이 컴포넌트만 그리기 값을 prop 으로 든다** — 정본 「페이지 스키마 노드」 의 «노드는 스타일을 갖지 않는다» 의 예외(카탈로그 밖 요소를 그리는
   * 자리). 값의 꼴을 좁힌다: 색은 `PLACEHOLDER_COLOR` · 길이는 정수 px. 뷰가 값을 인라인 변수로 싣는데, 자유 CSS 글자를 받으면 `url(…)` 이
   * 캔버스 · 내보낸 번들에서 바깥 요청을 내고 `;` · `}` 로 꾸밈을 넘길 길이 생긴다. 값이 없으면 «테마 기본» 이다.
   */
  props: z.strictObject({
    label: z.string().default('미정 영역'),
    width: z.number().int().min(20).max(2000).optional(),
    height: z.number().int().min(20).max(2000).optional(),
    background: placeholderColor(),
    border: z.enum(['dashed', 'solid', 'none']).default('dashed'),
    borderColor: placeholderColor(),
    radius: z.number().int().min(0).max(999).optional(),
    color: placeholderColor(),
    fontSize: z.number().int().min(10).max(72).optional(),
    align: z.enum(['start', 'center', 'end']).default('center'),
    padding: z.number().int().min(0).max(200).optional(),
    // 이 프로젝트에 올린 그림의 id. 권한은 그 프로젝트의 소유 행이 가른다 — 남의 그림 id 를 적어도 읽히지 않는다(빈 그림 표지).
    image: z.string().regex(ASSET_ID_PATTERN, '그림 id 는 소문자 16진수 64 자입니다').or(z.literal('')).optional(),
    imageFit: z.enum(['cover', 'contain']).default('cover'),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'width', control: 'number', label: '너비(px)' },
    { prop: 'height', control: 'number', label: '높이(px)' },
    { prop: 'background', control: 'color', label: '바탕색' },
    { prop: 'border', control: 'select', label: '테두리', options: ['dashed', 'solid', 'none'] },
    { prop: 'borderColor', control: 'color', label: '테두리 색' },
    { prop: 'radius', control: 'number', label: '모서리(px)' },
    { prop: 'color', control: 'color', label: '글 색' },
    { prop: 'fontSize', control: 'number', label: '글 크기(px)' },
    { prop: 'align', control: 'select', label: '정렬', options: ['start', 'center', 'end'] },
    { prop: 'padding', control: 'number', label: '여백(px)' },
    { prop: 'image', control: 'image', label: '그림' },
    { prop: 'imageFit', control: 'select', label: '그림 맞춤', options: ['cover', 'contain'] },
  ],
  summary: (props) => oneLine(props.label),
  states: [],
  // 몸통 하나라 구조 트리에 구역 줄이 안 선다. 기본 내용이 없다 — 새 자리표시자는 라벨이 선 빈 칸이다.
  zones: [{ name: 'body', label: '내용' }],
})
