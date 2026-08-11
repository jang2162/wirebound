/**
 * 브라우저로 **파일을 내려받고 읽는** 두 함수(P4c-3 T2·T3). 테마를 모른다 — 글자와 파일만
 * 안다. `theme-io.ts`(순수)와 `theme-io-panel.tsx`(화면) 사이에 이 파일이 있는 이유는
 * **여기만 브라우저 API에 매여 있기** 때문이다.
 *
 * **새 런타임 의존을 더하지 않는다**(P4c-2에서 사용자가 정했고 P4c-3도 같다). `Blob` +
 * `URL.createObjectURL` + `<a download>` + `FileReader` — 넷 다 플랫폼의 것이다.
 *
 * ---
 *
 * # jsdom에서 이 파일을 어떻게 재는가 — **쟀고, 절반은 대역이다**
 *
 * 계획서 T2가 *"`URL.createObjectURL`이 jsdom에 없을 수 있다 — 재고 판단하라"*고 했다.
 * **쟀다**(내가 이 워크트리의 jsdom에서 쟀다):
 *
 * | # | 잰 것 | 값 |
 * |---|---|---|
 * | 1 | `typeof Blob` | `function` |
 * | 2 | `typeof URL.createObjectURL` | **`undefined`** |
 * | 3 | `typeof URL.revokeObjectURL` | **`undefined`** |
 * | 4 | `Object.getOwnPropertyNames(Blob.prototype)` | `constructor` · `slice` · `size` · `type` — **`text()`도 `arrayBuffer()`도 없다** |
 * | 5 | `typeof FileReader` | `function`이고 **Blob의 내용을 실제로 읽는다** |
 * | 6 | `typeof HTMLAnchorElement.prototype.click` | `function` |
 *
 * **판정: 내려받기의 *효과*는 못 재고 *무엇을 넘겼는지*는 잰다.** 케이스가 2·3에 대역을
 * 심고(그 사실을 케이스가 적는다) ㉠ Blob에 실린 **글자**(5로 읽는다) ㉡ 앵커의 `download`
 * 이름 ㉢ 클릭이 한 번 일어난 것 ㉣ 대역을 되돌린 것까지 잰다. **재지 못하는 것은
 * 브라우저가 실제로 파일을 저장하는지**이고, 그것은 실브라우저의 몫이다.
 *
 * > **측정 장치의 함정 하나를 실제로 밟았다 — 적어 둔다.** Blob의 글자를 읽으려고
 * > `await new Response(blob).text()`를 먼저 써 봤다. **던지지 않고 `"[object Blob]"`을
 * > 냈다**(내가 쟀다) — Node의 전역 `Response`가 jsdom의 `Blob`을 자기 것으로 못 알아보고
 * > 문자열로 바꾼 것이다. **초록인 채로 거짓을 재는 형태**라 `FileReader`로 갈아탔다.
 * > P4c-2 §3.2의 교훈(*"의심했으면 같은 장치를 다시 돌리지 말고 다른 장치로 재라"*)이
 * > 가리키는 그 자리다.
 */

/** 내보낸 파일의 MIME. 내려받기 이름이 `.json`으로 끝나는 것과 짝이다. */
const JSON_MIME = 'application/json'

/**
 * 글자 한 벌을 파일로 내려받는다.
 *
 * **`<a download>`를 만들고 눌렀다가 버린다.** 화면에 남기지 않는 것은 이 조작이
 * *"버튼을 눌렀다"*의 결과이지 화면의 일부가 아니기 때문이다 — 남기면 두 번째 내보내기에서
 * 앵커가 둘이 된다.
 *
 * **`revokeObjectURL`을 반드시 부른다.** 안 부르면 그 Blob이 문서가 사는 동안 메모리에
 * 남는다. 브라우저가 내려받기를 **동기적으로 시작하므로**(클릭 핸들러 안에서 URL을 이미
 * 읽었다) 곧바로 revoke해도 안전하다.
 */
export function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: JSON_MIME }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  // **`body`에 붙였다 뗀다.** 붙지 않은 노드의 클릭을 무시하는 브라우저가 있다.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * 고른 파일의 글자를 읽는다.
 *
 * **`FileReader`다 — `file.text()`가 아니다.** jsdom의 `Blob`에 `text()`가 없다(머리말의 4).
 * 실브라우저에는 있지만 **두 환경에서 다른 경로를 타면 회귀가 재는 것이 배포되는 것과
 * 다르다.** `FileReader`는 양쪽에 다 있다.
 *
 * **실패를 삼키지 않는다** — 못 읽은 파일과 빈 파일은 다르고, 후자는 `fromImport`가
 * *"내용이 비어 있습니다"*로 가른다.
 */
export function readTextFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다'))
    reader.readAsText(file)
  })
}
