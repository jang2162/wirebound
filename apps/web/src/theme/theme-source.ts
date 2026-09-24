import { systemTheme, type Theme } from '@wirebound/themes'

/**
 * 지금 화면이 쓸 테마를 고른다.
 *
 * **이 파일의 기본값은 내장 테마 하나를 그대로 낸다.** 프로젝트가 고른 테마를 저장소(설계서
 * 「테이블 정의」의 `themes` 테이블)에서 읽어 오는 것은 `use-project-theme.ts`다.
 * 그 둘을 **함수 하나(`ThemeSource`)로 좁혀 두는 것**이 이 파일의 전부다 — 주입하는 쪽
 * (`use-theme-css.ts`)이 "테마가 어디서 오는가"를 모르게 한다.
 *
 * `null`을 낼 수 있다. 테마가 아직 없는 상태(조회 중·프로젝트가 테마를 고르지 않음)가
 * 정상이고, 그때 화면은 **구조 기본 CSS만으로** 그려진다 — 에디터가 그 상태에서도 쓸 만해야
 * 한다는 것이 시트를 둘(구조 기본 CSS · 테마 CSS)로 나눈 이유다.
 */
export type ThemeSource = () => Theme | null

/** 기본값. 내장 `admin` 하나다. */
export const DEFAULT_THEME_ID = 'admin'

export const defaultThemeSource: ThemeSource = () => systemTheme(DEFAULT_THEME_ID) ?? null
