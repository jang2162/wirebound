/**
 * 초안을 해석해 **갤러리가 쓸 CSS와 이슈**를 낸다. 그리고 그 CSS를 `document.head`에
 * **갤러리 전용 시트**로 싣는다.
 *
 * ---
 *
 * # 재라 #2의 답 — **셋째 시트다.** 후보 셋을 밟아서 골랐다
 *
 * `use-theme-css.ts`가 고정 id의 `<style>` 둘(`structure`·`theme`)을 `document.head`에 넣고
 * **cleanup에서 지우지 않는다**(그쪽 주석이 근거를 적어 두었다 — 전역 공유 자원인데 훅은
 * 인스턴스마다 돌기 때문이다). **갤러리가 같은 방식으로 초안 CSS를 넣으면 그 둘을 덮어쓴다.**
 *
 * **밟아서 잰 것**(내가 쟀다. 전부 jsdom, `render`/`unmount`로):
 *
 * | # | 심은 것 | 관측 |
 * |---|---|---|
 * | 1 | 캔버스가 떠 있는 채로 갤러리가 같은 id로 붙는다 | 공유 `theme` 시트가 **초안 CSS로 덮인다** |
 * | 2 | 그 뒤 캔버스만 다시 그린다 | **안 고쳐진다** — `css` 의존이 안 바뀌어 레이아웃 이펙트가 다시 안 돈다 |
 * | 3 | 그 뒤 갤러리를 언마운트한다 | **안 고쳐진다** — 그쪽도 정리에서 아무것도 안 한다 |
 * | 4 | 갤러리 → 언마운트 → 캔버스 마운트(뒤로 가기) | **고쳐진다** — 새 마운트의 이펙트가 자기 CSS를 쓴다 |
 * | 5 | 갤러리 → 언마운트 → 캔버스가 **안 그려지는** 셸(페이지 미선택) | **초안 CSS가 남는다** |
 *
 * **1~3이 이 부류의 진짜 손해다:** 덮인 뒤 **아무도 고치지 않는다.** 두 훅이 같은 태그를
 * 공유하는데 둘 다 *"내 값이 안 바뀌었으면 안 쓴다"*이므로, 한 번 어긋나면 그 화면이
 * 살아 있는 동안 계속 어긋나 있다.
 *
 * > **계획서 D5의 *"뒤로 가면 캔버스가 초안 CSS로 그려진다"*는 오늘 거짓이다**(관측 4).
 * > 뒤로 가는 경로에서는 캔버스가 새로 마운트되어 스스로 고친다. **남는 것은 관측 5** —
 * > 캔버스가 그려지지 않는 상태(페이지 미선택·조회 중·조회 실패)에서는 고칠 주체가 없다.
 * > 오늘 그것이 눈에 안 띄는 이유는 셸이 읽는 커스텀 프로퍼티가 전부 `--wb-shell-*`이고
 * > 테마가 싣는 것과 **교집합이 비어 있기** 때문이다(`use-theme-css.ts`가 쟀다).
 *
 * **후보 셋의 판정:**
 *
 * | 후보 | 판정 |
 * |---|---|
 * | **㉠ 갤러리 전용 id의 셋째 시트** | **이것이다.** 공유 시트 둘을 **아예 안 건드린다**(관측 1~3이 통째로 사라진다). 그리고 **소유자가 하나뿐이라 정리에서 비울 수 있다** — 공유 시트를 못 비우게 한 참조 계수 문제가 여기서는 성립하지 않는다. 관측 5도 함께 닫힌다 |
 * | ㉡ `<iframe>` 격리 | **유일하게 진짜 격리다.** 그러나 렌더러가 다른 `document`에 그려야 하고(포털) 이 훅이 대상 `document`를 인자로 받아야 하며, **jsdom에서 `var()`가 안 풀려**(재서 확인했다 — `getComputedStyle`이 `var(--x)`를 글자 그대로 낸다) 격리 자체를 그 환경에서 잴 수 없다. D1이 캔버스를 테마 라우트 밖에 두는 한 값이 비용을 넘지 않는다 |
 * | ㉢ 들어갈 때 갈아 끼우고 나갈 때 되돌리기 | **관측 1~3을 못 닫는다.** 둘이 동시에 떠 있는 창에서는 "되돌릴 값"이 무엇인지 정할 주체가 없다. 그리고 되돌릴 값을 갤러리가 들면 캔버스의 상태를 갤러리가 아는 셈이 된다 |
 *
 * **㉠이 격리는 아니다 — 그 한계를 적어 둔다.** CSS는 삽입 위치로 범위를 갖지 않으므로
 * (P4a-2가 쟀다), 갤러리와 캔버스가 **한 트리에 함께 뜨면** 이 시트가 캔버스의 노드에도
 * 걸린다(재서 확인했다: 둘을 함께 마운트하면 공유 `theme` 시트는 멀쩡한데 `:root`의 계산값이
 * 초안의 것이 된다). **다만 손해의 모양이 다르다** — 덮어쓰기는 *"고칠 주체가 없다"*이고
 * 이쪽은 *"갤러리가 언마운트되면 정리에서 비워져 저절로 돌아온다"*이다(재서 확인했다).
 *
 * > **㉡로 갈아탈 방아쇠:** 갤러리(또는 그 축소판 미리보기)가 **캔버스와 같은 트리**에
 * > 살게 되는 날. 그날 셋째 시트는 부족하고, 선택자를 상자 아래로 좁히려면 `compileTheme`에
 * > 방출 옵션을 더해야 하므로(§6.11의 계약을 건드린다) `<iframe>`이 더 싸질 수 있다.
 *
 * ---
 *
 * # jsdom이 캐스케이드를 보는 방식 — **DOM 순서가 아니라 쓴 순서다**
 *
 * **교정해서 쟀다**(내가 쟀다). 이 사실이 없으면 아래 `structure` 갱신의 가드가 왜 하중인지
 * 설명되지 않는다.
 *
 * | # | 심은 것 | 관측 |
 * |---|---|---|
 * | 1 | 시트 `a`·`b`를 만들고 `b`를 나중에 채운다 | `b`가 이긴다 (DOM 순서와 같다) |
 * | 2 | 같은 배치에서 **`a`를 나중에** 채운다 | **`a`가 이긴다** — DOM 순서는 그대로인데 결과가 뒤집힌다 |
 * | 3 | `structure`·`draft`·`theme` 셋을 만들고 `theme` → `draft` 순으로 채운다 | **`draft`가 이긴다** (DOM에서는 `theme`이 뒤인데도) |
 *
 * **즉 jsdom에서는 `textContent`를 나중에 쓴 시트가 이긴다.** 실제 브라우저는 DOM 순서로
 * 가르므로 **이 환경에서는 순서 계약을 잴 수 없다** — 잴 수 있는 것은 태그의 DOM 순서까지이고
 * (`test/theme/use-theme-css.test.tsx`가 그것을 본다), 캐스케이드는 Chromium이 유일한 수단이다.
 *
 * **아래 `structure` 갱신에 등호 가드를 두는 이유가 이것이다.** 구조 기본 CSS는 상수라
 * 캔버스가 이미 넣어 둔 것과 글자까지 같은데, 가드 없이 다시 쓰면 **jsdom에서만** 그 시트가
 * 맨 뒤로 가 테마 CSS를 이긴다 — 브라우저에는 없는 거짓 관측이 회귀에 섞인다.
 * (`use-theme-css.ts`의 같은 자리에도 같은 가드가 있는데 그쪽 주석은 재파싱 비용만 말한다.)
 */
import { useLayoutEffect, useMemo } from 'react'
import { structureBaseCss } from '@wirebound/renderer'
import {
  compileTheme,
  resolveTheme,
  type ResolvedTheme,
  type Theme,
  type ThemeIssue,
} from '@wirebound/themes'
/**
 * **테마 해석이 카탈로그를 읽는다** — `use-theme-css.ts`가 같은 import를 두고 그 근거를
 * 적어 두었다. 설치 전에 `resolveTheme`을 부르면 모든 컴포넌트가 `unknown-component`가 되어
 * 테마가 통째로 이슈가 된다. **재서 확인했다:** 카탈로그 없는 파일에서 `resolveTheme(admin)`을
 * 부르니 `theme`이 `null`이었다.
 *
 * > **이 줄은 오늘 아무 케이스도 지키지 않는다 — 재서 적는다(0 사망).** 바로 아래 줄이
 * > `./use-theme-css`를 import하고 **그쪽이 카탈로그를 끌어오기 때문**이다. 그래도 두는 것은
 * > 이 파일의 `resolveDraft`가 그 훅과 무관한 순수 함수여서, 아래 import가 사라지는 날
 * > (예: `STRUCTURE_STYLE_ID`를 상수 파일로 옮기면) **이 줄만이 남는 방벽**이기 때문이다.
 * > **"지켜지고 있다"고 적지 않는 것이 요점이다** — 그 형태의 문장이 이 저장소에서 반복해 낡았다.
 */
import '../catalog-setup'
import { STRUCTURE_STYLE_ID } from './use-theme-css'

/**
 * 갤러리 전용 시트의 이름. **공유 시트 둘과 겹치면 안 된다** — 겹치는 순간 위 표의 관측 1이
 * 되살아난다.
 */
export const DRAFT_STYLE_ID = 'theme-draft'

/** 초안을 해석한 결과. 갤러리와 이슈 패널이 **같은 한 번의 해석**을 나눠 쓴다. */
export interface ResolvedDraft {
  /** `error`가 있으면 `null`이다(`resolveTheme`의 계약). 갤러리가 구조 선택에 쓴다. */
  resolved: ResolvedTheme | null
  /** **`error`와 `warning`이 섞여 있다.** 가르는 것은 `partitionIssues` 하나다(D4). */
  issues: ThemeIssue[]
  /** 해석이 실패했으면 빈 문자열이다. */
  css: string
}

const NOTHING: ResolvedDraft = { resolved: null, issues: [], css: '' }

/**
 * 초안 하나를 해석해 CSS와 이슈를 함께 낸다. **순수 함수다** — React를 모른다.
 *
 * **한 번만 해석하는 것이 요점이다.** 갤러리는 CSS와 `ResolvedTheme`(구조 선택)을 둘 다
 * 필요로 하고 이슈 패널은 이슈를 필요로 하는데, 각자 부르면 **세 결과가 갈릴 수 있는 자리**가
 * 생긴다 — `use-theme-css.ts`의 `CompiledCss.resolved`가 같은 이유로 셋을 함께 낸다.
 *
 * **던지지 않는다.** 해석이 실패해도 이슈를 실어 돌려준다 — 저작 UI에서 그것을 **보여 주는
 * 것이 자기 일**이기 때문이다(D4). 콘솔에 남기지도 않는다: 화면에 나오는 것을 콘솔에 또
 * 남기면 같은 사실을 두 번 말하게 된다(`use-theme-css.ts`의 `console.error`는 **보여 줄
 * 화면이 없는** 캔버스의 이야기다).
 *
 * @param base 파생이면 상속 대상 전문. **`null`이면 파생 문서의 해석이 `bad-extends`로
 *   거부된다** — 그것을 여기서 막지 않는 것은 그 상태(상속 대상이 사라진 파생)를 사용자가
 *   봐야 하기 때문이다.
 */
export function resolveDraft(draft: Theme | null, base: Theme | null): ResolvedDraft {
  if (draft === null) return NOTHING

  const { theme, issues } = resolveTheme(draft, base ?? undefined)
  if (theme === null) return { resolved: null, issues, css: '' }

  const resolved = theme as ResolvedTheme
  return { resolved, issues, css: compileTheme(resolved) }
}

/**
 * 초안 CSS를 `document.head`의 **갤러리 전용 시트**에 싣는다.
 *
 * **`useLayoutEffect`인 이유는 `useThemeCss`와 같다** — `useEffect`로 넣으면 한 프레임이
 * CSS 없이 그려진다.
 *
 * **정리에서 시트를 비운다 — 태그는 남긴다.** 태그를 지우지 않는 것은 `use-theme-css.ts`의
 * 판단 그대로(순서가 계약이고, 지웠다 새로 만들면 자리가 뒤집힌다)이고, **내용을 비우는 것은
 * 그쪽과 갈리는 자리**다: 이 시트는 **소유자가 하나**라 비워도 남의 스타일이 사라지지 않는다.
 * 공유 시트를 못 비우게 한 것은 훅 하나가 언마운트될 때 살아남은 훅의 스타일까지 사라진다는
 * 관측이었는데(그쪽이 쟀다), 여기에는 살아남을 다른 훅이 없다.
 *
 * > **갤러리를 한 화면에 둘 이상 띄우면 그 전제가 깨진다.** 그때는 이 자리도 참조 계수가
 * > 필요해진다 — 오늘 부르는 자리가 하나라는 것이 전제이고, 그 사실은 주석이 아니라
 * > `test/api-consumers.test.ts`와 같은 형식의 검사로 세는 편이 낫다(안 만들었다).
 */
export function useDraftCss(draft: ResolvedDraft): void {
  const structure = useMemo(() => structureBaseCss(), [])

  useLayoutEffect(() => {
    /**
     * **구조 기본 CSS는 공유 시트를 그대로 쓴다.** 값이 상수라 캔버스가 넣은 것과 글자까지
     * 같고, 갤러리 전용으로 한 벌 더 두면 같은 규칙이 두 번 실린다.
     *
     * **등호 가드가 하중이다** — 머리말의 jsdom 절 참고. 없으면 이 시트가 테마 시트보다
     * 나중에 쓰여 jsdom에서만 캐스케이드가 뒤집힌다.
     */
    const structureTag = ensureStyle(STRUCTURE_STYLE_ID)
    if (structureTag.textContent !== structure) structureTag.textContent = structure

    const draftTag = ensureStyle(DRAFT_STYLE_ID)

    /**
     * **초안 시트를 `head`의 맨 끝으로 옮긴다.** 이 한 줄이 없으면 **흔한 방문 순서에서
     * 갤러리가 초안을 못 보인다** — P4c-2 ③이 **실브라우저에서 재현했다.**
     *
     * | # | 방문 순서 | `head`의 DOM 순서 | 갤러리가 보이는 값 |
     * |---|---|---|---|
     * | 1 | 캔버스 → 테마 | `structure` · `theme` · **`theme-draft`** | 초안 ✓ |
     * | 2 | **테마 → 캔버스 → 테마** | `structure` · **`theme-draft`** · `theme` | **저장본** ✗ |
     *
     * 2번에서 입력창에는 `#FF6600`이 들어가 있는데 갤러리 버튼은 저장본 `#00A86B`로
     * 그려졌다(③이 Chromium에서 쟀다). **D5의 약속(*"고치면 오른쪽에 바로 보인다"*)이
     * 그 세션 내내 깨진다.**
     *
     * 원인 셋이 겹친다.
     *
     * 1. `useThemeCss`가 정리에서 `theme` 시트를 **안 비운다**(전역 공유 자원이라는 판단 —
     *    그쪽 머리말). 캔버스를 떠나도 그 시트는 내용을 그대로 들고 살아 있다.
     * 2. `ensureStyle`이 태그를 **이름으로** 찾으므로 DOM 위치가 **최초 생성 순서**에 고정된다.
     * 3. **실브라우저는 캐스케이드를 DOM 순서로 가른다**(③이 쟀다: DOM에서 뒤인 시트가
     *    나중에 쓴 시트를 이겼다). jsdom은 **쓴 순서**로 가르므로(①이 쟀다) **이 결함은
     *    계산된 스타일로는 회귀에 안 잡힌다** — 그래서 케이스가 **DOM 순서**를 단언한다
     *    (`test/theme/draft-css.test.tsx`).
     *
     * **`append`는 이미 붙어 있는 노드를 옮긴다** — 지웠다 새로 만드는 것이 아니므로
     * `use-theme-css.ts`가 금한 것(*"지웠다 새로 만들면 자리가 뒤집힌다"*)에 해당하지 않는다.
     * 오히려 그 파일이 말한 *"순서가 계약이다"*를 초안 시트에 대해 **실제로 지키는** 자리다:
     * 초안은 **늘 마지막**이어야 한다.
     */
    if (document.head.lastElementChild !== draftTag) document.head.append(draftTag)

    if (draftTag.textContent !== draft.css) draftTag.textContent = draft.css

    return () => {
      // **비운다.** 태그는 남긴다 — 머리말 참고.
      draftTag.textContent = ''
    }
  }, [structure, draft])
}

/**
 * 이름이 같은 태그가 있으면 그것을 쓰고, 없으면 `head` 끝에 새로 붙인다.
 *
 * **`use-theme-css.ts`의 같은 이름 함수와 내용이 같다.** 합치지 않는 것은 그쪽이 그 함수를
 * 내보내지 않고 있고, 내보내면 *"공유 시트를 만드는 수단"*이 패키지 밖으로 열리기 때문이다 —
 * 이 파일이 그것을 쓰는 유일한 정당한 이유는 **구조 기본 CSS 하나**이고 그것은 상수다.
 */
function ensureStyle(id: string): HTMLStyleElement {
  const existing = document.head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
  if (existing !== null) return existing

  const element = document.createElement('style')
  element.dataset.wbStyle = id
  document.head.append(element)
  return element
}
