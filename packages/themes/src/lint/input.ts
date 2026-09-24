/**
 * 테마 규칙이 받는 **값**. `schema`의 `LintProject`와 같은 태도다 — DB도 파일도 모른다.
 *
 * ## `resolveTheme`과 같은 계약을 쓴다
 *
 * `base`를 호출자가 준다. 그것이 이미 그 함수의 계약이고(`resolveTheme(document, base)`),
 * *"상속 대상이 코드에 없다"*를 판정하는 자리는 `apps/api`의 `resolveThemeBase`인데
 * **lint는 그것 없이도 잰다** — 파생 문서를 `base` 없이 해석하면 `resolveTheme`이 스스로
 * `bad-extends`를 낸다. 그래서 여기서 시스템 테마를 찾아 붙이는 코드를
 * 새로 짜지 않는다.
 *
 * ## `document`가 `unknown`인 것도 `resolveTheme`을 따른 것이다
 *
 * 그 함수가 **경계**라 규격 밖 입력(`null`·`42`·배열)을 이슈로 만든다. lint가 앞에서 `Theme`
 * 으로 좁히면 그 이슈가 나올 자리가 사라진다 — 규격을 어긴 테마를 *"검사 대상이 아니다"*로
 * 조용히 넘기게 된다.
 */
import type { PageDocument } from '@wirebound/schema'
import type { Theme } from '../spec/theme'

/** 그 테마로 그려지는 페이지 하나. `theme-node-variant`가 이것을 본다. */
export interface LintThemePage {
  id: string
  document: PageDocument
}

export interface LintThemeEntry {
  id: string
  /** 테마 문서. 규격을 지키는지는 `resolveTheme`이 본다. */
  document: unknown
  /** 파생이면 상속 대상 전문. 없으면 파생 문서가 `bad-extends`로 걸린다(`theme-extends`). */
  base?: Theme
  /**
   * 이 테마가 입는 페이지들. **비면 `theme-node-variant`가 돌지 않는다** — 페이지를 모르면 *"노드가 쓰는
   * variant"*라는 물음 자체가 성립하지 않는다. 없는 것을 0건으로 위장하지 않는다.
   */
  pages?: readonly LintThemePage[]
}

/** 테마 규칙이 보는 프로젝트 하나. */
export interface ThemeLintInput {
  themes: readonly LintThemeEntry[]
}
