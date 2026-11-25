import { LayoutLink, LayoutRegion, type LayoutNavItem, type LayoutView } from '@wirebound/theme-sdk'
import type { ReactElement } from 'react'

/**
 * **서브페이지 틀** — 관리자 셸(GNB · LNB · 브레드크럼브 · 페이지 제목). 모양과 치수는 lms-skala 관리자 셸(`_header.scss` · `_lnb.scss` ·
 * `_content.scss`)에서 왔다 — 치수 · 색은 `theme.css` 의 `[data-wb-layout="subpage"]` 규칙이 갖고, 이 뷰는 조각(`data-wb-part`)만 세운다.
 *
 * 영역 넷은 manifest `layouts.subpage.regions` 의 id 그대로 `LayoutRegion` 으로 감싼다 — 끈 영역은 SDK 가 감싸는 요소째 안 그린다. 그래서 «LNB 를
 * 끄면 본문이 왼쪽으로 붙는다» 는 형제 셀렉터 없이 선다(몸통이 flex 다 — `theme.css` 의 «틀은 형제 구조로 안 가른다»).
 *
 * LNB 의 «메뉴 / 즐겨찾기» 탭 · 사용자 칸은 그림이다(누를 것이 없다 — 설계 「정한 것 — 레이아웃 갈래」 5). 그래서 단추가 아니라 글로 둔다 — 캔버스는
 * 포커스 받는 요소를 입력 표면으로 본다(템플릿 SKILL.md «포커스 받는 요소는 …»). LNB 는 깊이를 자르지 않고 다 펼친다 — 접힘은 상태라 화면 설계서가
 * 보이려는 메뉴 구성을 가린다.
 */
export const SubpageLayout: LayoutView = (props) => (
  <div data-wb-part="frame">
    <LayoutRegion id="gnb" as="header" data-wb-part="gnb">
      <span data-wb-part="logo" aria-hidden="true">
        LOGO
      </span>
      <nav data-wb-part="gnbNav" aria-label="GNB">
        <ul data-wb-part="gnbList">
          {props.gnb.map((item) => (
            <li key={item.id} data-wb-part="gnbItem">
              <LayoutLink item={item} data-wb-part="gnbLink" data-wb-current={item.current ? 'true' : 'false'} />
            </li>
          ))}
        </ul>
      </nav>
      <span data-wb-part="user">
        <span data-wb-part="avatar" aria-hidden="true" />
        <b data-wb-part="userName">관리자</b>
      </span>
    </LayoutRegion>
    <div data-wb-part="body">
      <LayoutRegion id="lnb" as="aside" data-wb-part="lnb">
        <div data-wb-part="lnbTabs" aria-hidden="true">
          <span data-wb-part="lnbTab" data-wb-current="true">
            메뉴
          </span>
          <span data-wb-part="lnbTab" data-wb-current="false">
            즐겨찾기
          </span>
        </div>
        {props.lnb !== null && (
          <nav aria-label="LNB">
            <div data-wb-part="lnbSection">{props.lnb.title}</div>
            <LnbList items={props.lnb.children} depth={2} />
          </nav>
        )}
      </LayoutRegion>
      <main data-wb-part="content">
        <LayoutRegion id="breadcrumb" as="nav" aria-label="브레드크럼브" data-wb-part="breadcrumb">
          <span data-wb-part="crumb">홈</span>
          {props.trail.map((item, at) => (
            <Crumb key={item.id} item={item} last={at === props.trail.length - 1} />
          ))}
        </LayoutRegion>
        <LayoutRegion id="title" as="h1" data-wb-part="title">
          {props.title}
        </LayoutRegion>
        {props.children}
      </main>
    </div>
  </div>
)

/** 브레드크럼브 한 칸 — 구분 글자 `>` 뒤에 이름. 마지막(지금 페이지)은 굵게 — 조각 이름으로 가른다(`:last-child` 는 형제 구조다). */
function Crumb(props: { item: LayoutNavItem; last: boolean }): ReactElement {
  return (
    <>
      <span data-wb-part="crumbSep" aria-hidden="true">
        &gt;
      </span>
      <span data-wb-part={props.last ? 'crumbCurrent' : 'crumb'}>{props.item.title}</span>
    </>
  )
}

/**
 * LNB 목록 한 단. 깊이는 `data-wb-depth` 로 단다(2 · 3 · 4 — 4 아래도 4) — 들여쓰기 · 글 크기가 깊이마다 다르고, 셋째 단부터 옅은 바탕이다
 * (lms-skala `.adm-lnb__node--d3` · `--d4`).
 */
function LnbList(props: { items: readonly LayoutNavItem[]; depth: number }): ReactElement {
  const depth = Math.min(props.depth, 4)
  return (
    <ul data-wb-part={props.depth === 2 ? 'lnbTree' : 'lnbChildren'}>
      {props.items.map((item) => (
        <li key={item.id} data-wb-part="lnbNode" data-wb-depth={depth}>
          <LayoutLink item={item} data-wb-part="lnbLink" />
          {item.children.length > 0 && <LnbList items={item.children} depth={props.depth + 1} />}
        </li>
      ))}
    </ul>
  )
}
