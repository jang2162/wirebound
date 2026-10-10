/**
 * **사람이 읽는 출력에서 터미널을 제어하는 글자를 이스케이프로 바꾼다.** `wireb page get` · `lint` 같은 명령은 라벨 · 제목 · 설명 · 코멘트
 * 본문을 그대로 찍는데 그 글은 설계서를 고치는 누구나 넣을 수 있다 — ESC(화면 · 창 제목 제어) · C1(`U+009B` 는 CSI) · `\r`(줄 덮어쓰기) ·
 * 방향 제어(뒤따르는 글을 뒤집어 보인다)가 터미널에서 일을 한다.
 *
 * 바꾸는 것은 `\n` · `\t` 를 뺀 C0 · DEL · C1 · 줄 · 문단 구분 · 방향 제어 글자이고 `\uXXXX` 글로 쓴다. **`--json` 도 같은 입구를 지난다** —
 * `JSON.stringify` 는 C0 만 이스케이프하고 C1 · 방향 제어는 날 글자로 내는데, 그 글자가 든 자리는 JSON 문자열 안뿐이라 `\uXXXX` 로 바꿔도 읽은
 * 값이 같다. 이 거름은 **글자 출력(`Io.out` · `Io.err`)만** 지난다 — 파일에 쓰는 바이트(`Io.files.write`)는 그대로다.
 */
const TERMINAL_UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu

export function terminalSafe(text: string): string {
  return text.replace(TERMINAL_UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}
