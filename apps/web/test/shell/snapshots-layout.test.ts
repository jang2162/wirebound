/**
 * **스냅샷 목록 줄이 520px 팝오버 안에서 접히는가.**
 *
 * # 무엇이 무너지나
 *
 * 줄 하나에 칸이 여섯(태그·만든 사람·시각·크기·버튼·설명)이다. 전체 폭이면 `display: flex`에
 * 줄바꿈이 없어도 되지만, **520px 팝오버 안에서는 무너진다.** 실브라우저에서 잰 값(창 1512,
 * 안전망 스냅샷이 든 목록):
 *
 * | 무엇 | 아래 선언 다섯이 없을 때 | 있을 때 |
 * |---|---|---|
 * | `.wb-shell-snapshots-desc` 폭 · 높이 | **11.3px · 1194px**(한 글자씩 세로로 흐른다) | **520px · 17~32px** |
 * | 본문 `scrollWidth / clientWidth` | 586 / 552 — 가로 **34px 넘침** | 552 / 552 — **0** |
 * | 본문 `scrollHeight` | 6296 | 748 |
 * | `이 상태로 되돌리기` 버튼 | 팝오버 밖으로 15~33px(글자가 잘린다) | 전부 안쪽 |
 *
 * **안전망 스냅샷의 설명은 서버가 복원마다 자동으로 만드는 긴 문자열이라**
 * (`"…"(으)로 복원하기 직전 상태 — 스냅샷 <uuid>`) 이 모양은 예외가 아니라 보통이다.
 * 그리고 잘리는 것이 **되돌릴 수 없는 조작의 입구**다.
 *
 * # 이 파일이 재지 못하는 것 — 먼저 읽어라
 *
 * **jsdom에는 레이아웃이 없다.** 위 표의 어떤 수도 여기서는 나오지 않는다 —
 * `getBoundingClientRect()`가 전부 0이고 `getComputedStyle`은 `shell.css`를 읽지도 않는다
 * (그 파일은 `main.tsx`가 import 한다). 즉 **"설명 칸이 11.3px이 된다"를 케이스로 잡는 길이
 * 이 저장소에 없다.**
 *
 * 그래서 **대신 재는 것은 그 폭을 만드는 CSS 계약이다.** 무너진 판과 선 판을 가르는
 * 선언 다섯을 값으로 못박는다 — 하나라도 빠지면 위 표의 왼쪽 칸으로 돌아간다.
 *
 * | 선언 | 없으면 |
 * |---|---|
 * | 줄의 `flex-wrap: wrap` | 칸 여섯이 한 줄에 눌린다 |
 * | 설명의 `flex-basis: 100%` | 설명이 남는 폭을 나눠 갖는다(그 남는 폭이 11.3px이다) |
 * | 설명의 `min-width: 0` | flex 항목의 기본 하한(`auto`)이 서서 줄이 가로로 넘친다 |
 * | 확인 단계의 `flex-basis: 100%` | 문장 + 버튼 둘이 메타 칸들과 한 줄을 다툰다 |
 * | 저장 폼의 `flex-wrap: wrap` | 입력 둘과 버튼이 한 줄로 눌린다(`태그` 입력과 `설명` 라벨이 붙는다) |
 *
 * **마크업 쪽 짝은 `snapshots-panel.test.tsx`가 잡는다** — 설명이 줄의 **마지막** 칸이라는
 * 것. `flex-basis: 100%`는 그 칸이 맨 뒤에 있어야 "자기 줄"이 되고, 앞으로 옮기면 태그
 * 혼자 첫 줄에 남는다. 둘이 함께 있어야 이 레이아웃이 선다.
 *
 * **여기서 재지 않는 것 하나 더:** 값이 *충분한지*는 못 본다. 예를 들어 팝오버를 200px로
 * 좁히면 이 다섯이 다 있어도 버튼이 넘친다. 그것은 브라우저에서 재는 수밖에 없고,
 * 지금 값(520px)에서 잰 것이 위 표의 오른쪽 칸이다.
 */
import { describe, expect, it } from 'vitest'
import shellCss from '../../src/shell.css?raw'
import { classDeclarations } from '../shell-css-guard'

/**
 * 규칙 하나의 선언들 — `shell-css-guard.ts`의 `classDeclarations`(주석을 걷고 `.x` 하나뿐인 선택자만 담는다 · 같은 클래스에
 * 규칙이 둘이면 뒤의 것 — 캐스케이드와 같다). 없는 클래스는 빈 객체다 — 아래 카나리아가 그 모양에 기댄다.
 */
function declarations(css: string, className: string): Record<string, string> {
  return Object.fromEntries(classDeclarations(css).get(className) ?? [])
}

/**
 * 이 항목이 **자기 줄을 통째로 쓰는가**. `flex: <grow> <shrink> 100%` 한 줄로 적든
 * `flex-basis: 100%`로 나눠 적든 같은 뜻이므로 둘 다 본다.
 */
function takesWholeLine(decl: Record<string, string>): boolean {
  if (decl['flex-basis'] === '100%') return true
  return (decl['flex'] ?? '').split(/\s+/).includes('100%')
}

describe('스냅샷 목록이 좁은 팝오버에서 접힌다', () => {
  it('검사가 진짜 shell.css를 읽는다', () => {
    // 어느 하나가 비면 아래 단언이 통째로 헛돈다(다른 CSS 검사들의 카나리아와 같은 자리다).
    expect(shellCss).toContain('.wb-shell-snapshots-row')
    expect(declarations(shellCss, 'wb-shell-snapshots-row')['display']).toBe('flex')
    expect(declarations(shellCss, 'wb-shell-snapshots-없는것')).toEqual({})
  })

  it('줄이 접힌다 — `flex-wrap: wrap`', () => {
    expect(declarations(shellCss, 'wb-shell-snapshots-row')['flex-wrap']).toBe('wrap')
  })

  it('설명이 자기 줄을 통째로 쓴다', () => {
    const desc = declarations(shellCss, 'wb-shell-snapshots-desc')
    expect([takesWholeLine(desc), desc['flex'] ?? desc['flex-basis']]).toEqual([true, expect.anything()])
  })

  /**
   * flex 항목의 기본 `min-width`는 `auto`이고, 그것은 **내용의 최소 폭**이다. 설명에 안 주면
   * 긴 uuid 한 토막이 줄의 하한이 되어 줄 전체가 가로로 넘친다 — 머리말 표의 `scrollWidth`
   * 34px 넘침이 그 모양이다.
   */
  it('설명이 줄어들 수 있다 — `min-width: 0`', () => {
    expect(declarations(shellCss, 'wb-shell-snapshots-desc')['min-width']).toBe('0')
  })

  /**
   * **`word-break: break-word`로는 부족하다.** 안전망 스냅샷의 설명 끝에 붙는 uuid는 공백이
   * 없는 토막이라, 끊을 자리를 아무 데서나 찾게 해야 한다.
   */
  it('설명이 아무 데서나 끊긴다 — `overflow-wrap: anywhere`', () => {
    expect(declarations(shellCss, 'wb-shell-snapshots-desc')['overflow-wrap']).toBe('anywhere')
  })

  it('설명은 한 줄로 붙들지 않는다 — 음성 대조', () => {
    // `nowrap`이 붙으면 위 셋이 다 있어도 설명이 한 줄로 뻗어 줄이 가로로 넘친다.
    expect(declarations(shellCss, 'wb-shell-snapshots-desc')['white-space']).toBeUndefined()
  })

  it('확인 단계도 자기 줄을 쓴다 — 문장에 태그가 들어가고 버튼이 둘이다', () => {
    expect(takesWholeLine(declarations(shellCss, 'wb-shell-snapshots-confirm'))).toBe(true)
  })

  it('저장 폼이 접힌다 — 입력 둘과 버튼이 한 줄로 눌리지 않는다', () => {
    const fields = declarations(shellCss, 'wb-shell-snapshots-fields')
    expect([fields['display'], fields['flex-wrap']]).toEqual(['flex', 'wrap'])
  })

  it('입력이 줄어들 수 있다 — `<input>`의 UA 기본 폭이 하한이 되지 않는다', () => {
    expect(declarations(shellCss, 'wb-shell-snapshots-input')['min-width']).toBe('0')
    expect(declarations(shellCss, 'wb-shell-snapshots-field')['min-width']).toBe('0')
  })

  /**
   * **버튼은 줄어들지 않는다.** 줄이 접히는 것과 버튼이 눌리는 것은 다른 일이다 —
   * 눌리면 `이 상태로 되돌리▮니다`처럼 글자가 잘려 무엇을 누르는지 못 읽는다.
   */
  it('복원 버튼과 저장 버튼은 글자가 잘리지 않는다 — `white-space: nowrap`', () => {
    expect(declarations(shellCss, 'wb-shell-snapshots-restore')['white-space']).toBe('nowrap')
    expect(declarations(shellCss, 'wb-shell-snapshots-save')['white-space']).toBe('nowrap')
  })

  /**
   * **구분력 — 선언을 지우면 잡는다.** "지금 트리가 통과한다"는 검사가 일한다는 증거가
   * 아니므로, 무너진 판을 메모리에서 만들어 위 단언들이 실제로 갈리는지 함께 잰다.
   * (원본 파일은 건드리지 않는다 — 실패했을 때 작업 트리를 오염시킨 채 끝나지 않게.)
   */
  describe('구분력 — 무너진 판을 만들면 갈린다', () => {
    it('줄에서 `flex-wrap`을 지우면 갈린다', () => {
      const broken = shellCss.replace(
        /(\.wb-shell-snapshots-row \{[^}]*?)\n  flex-wrap: wrap;/,
        '$1',
      )
      expect(broken, '심을 자리가 사라졌다').not.toBe(shellCss)
      expect(declarations(broken, 'wb-shell-snapshots-row')['flex-wrap']).toBeUndefined()
    })

    it('설명을 `flex: 1`로 두면 갈린다 — 그것이 11.3px을 만드는 값이다', () => {
      const broken = shellCss.replace(
        /(\.wb-shell-snapshots-desc \{)\n  flex: 1 0 100%;\n  min-width: 0;/,
        '$1\n  flex: 1;',
      )
      expect(broken, '심을 자리가 사라졌다').not.toBe(shellCss)
      const desc = declarations(broken, 'wb-shell-snapshots-desc')
      expect(takesWholeLine(desc)).toBe(false)
      expect(desc['min-width']).toBeUndefined()
    })
  })
})
