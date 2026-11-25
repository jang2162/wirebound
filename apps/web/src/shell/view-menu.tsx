/**
 * **머리의 «보기»** — 열린 페이지의 레이아웃에서 지금 테마가 선언한 끌 수 있는 영역(GNB · LNB …)을 켜고 끄는 메뉴(설계
 * `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「에디터의 입구 — 머리의 «보기»」). 값은 사람의 화면 설정이라 문서가 아니다 — 켬 · 끔은
 * `store/use-view-prefs.ts` 가 든다(곧바로 캔버스에 서고 PUT 을 보낸다 · 연달아 바꾼 것은 마지막 값 하나로 · 실패면 되돌리고 하단 바에 한 줄).
 *
 * | 판 | 단추 |
 * |---|---|
 * | 편집 모드 · 끌 영역이 있다 | 켠다 — 항목마다 `menuitemcheckbox`(켠 영역이 참). 골라도 닫히지 않는다 |
 * | 지금 테마의 manifest 가 끌 영역을 하나도 선언하지 않았다(앞 판 테마 · 테마 없음) | 꺼지고 «이 테마는 끌 영역을 선언하지 않았습니다» |
 * | 선언은 있는데 이 페이지의 레이아웃에는 없다(빈 · 팝업) | 꺼지고 «이 레이아웃에는 끌 영역이 없습니다» |
 * | 뷰 모드 | 서지 않는다 — 뷰 모드는 늘 다 켠다(설계 «정해진 것» 3) |
 *
 * 항목 이름은 manifest 의 `label`(테마를 지은 사람의 글)이라 `isolateBidi` 로 방향을 격리한다 — 접힌 머리에서는 `…` 의 항목 «보기 · <이름>» 으로
 * 이어 붙는다(`shell/head-fold.ts` 의 `folded`). 모든 역할에 선다 — 읽기 도구다(viewer 도 저장한다).
 */
import { isolateBidi, type PageLayout } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { documentLayout } from '../edit/page-kind-ops'
import { useOpenDocument } from '../store/use-editor-store'
import { useViewPrefs } from '../store/use-view-prefs'
import { useProjectTheme } from '../theme/project-theme'
import { ActionMenu, type ActionMenuItem } from './action-menu'
import { ICONS } from './icons'

/** 단추의 접근 이름 · `title`. */
export const VIEW_MENU_LABEL = '보기'
/** 지금 테마가 끌 영역을 선언하지 않았다. */
export const VIEW_MENU_NO_THEME = '이 테마는 끌 영역을 선언하지 않았습니다'
/** 테마는 선언했지만 이 레이아웃에는 끌 영역이 없다. */
export const VIEW_MENU_NO_REGIONS = '이 레이아웃에는 끌 영역이 없습니다'

export interface ViewMenuModel {
  /** 영역 항목 — 끌 영역이 없으면 비었다. */
  items: readonly ActionMenuItem[]
  /** 꺼진 까닭 — 켤 수 있으면 `undefined`. */
  reason: string | undefined
}

/** 열린 페이지의 «보기» 항목과 꺼진 까닭(머리말의 표). `prefix` 를 주면 항목 이름 앞에 붙인다(접힌 머리의 `…` — «보기 · »). */
export function useViewMenu(pageId: string | undefined, prefix = ''): ViewMenuModel {
  const document = useOpenDocument(pageId)
  const layouts = useProjectTheme().manifest?.layouts
  const prefs = useViewPrefs()
  const toggleable = (layout: PageLayout) => (layouts?.[layout]?.regions ?? []).filter((region) => region.toggle !== false)
  const declared = layouts !== undefined && (Object.keys(layouts) as PageLayout[]).some((layout) => toggleable(layout).length > 0)
  if (!declared) return { items: [], reason: VIEW_MENU_NO_THEME }
  const layout = document === null ? 'blank' : documentLayout(document)
  const regions = toggleable(layout)
  if (regions.length === 0) return { items: [], reason: VIEW_MENU_NO_REGIONS }
  const items = regions.map((region): ActionMenuItem => {
    const key = `${layout}.${region.id}`
    const shown = !prefs.hidden.includes(key)
    return {
      key: `view-${key}`,
      label: `${prefix}${isolateBidi(region.label)}`,
      toggled: shown,
      // 모르는 열쇠(다른 테마 · 다른 레이아웃의 것)는 그대로 둔다 — 설계 「표시 옵션 저장」 «모르는 열쇠는 그대로 둔다».
      onSelect: () => prefs.set(shown ? [...prefs.hidden, key] : prefs.hidden.filter((hidden) => hidden !== key)),
    }
  })
  return { items, reason: undefined }
}

/** 머리 도구 줄의 «보기» 단추 — «배치 선» 곁(`routes/editor.tsx`). */
export function ViewMenu(props: { pageId: string | undefined }): ReactElement {
  const { items, reason } = useViewMenu(props.pageId)
  return <ActionMenu label={VIEW_MENU_LABEL} icon={ICONS.viewRegions} items={items} reason={reason} />
}
