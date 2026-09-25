/**
 * `screen-chromium.test.ts`의 「그리는 중에 신호를 받아도」가 자식 프로세스로 띄우는 것 — **케이스 파일이 아니다.**
 *
 * 서버처럼 신호에 처리기를 걸어 두고(닫기가 도는 그리기를 기다리는 자리 — `src/shutdown.ts`), 그리는 도중에 자기에게 그 신호를
 * 보낸 뒤 결과의 실패 수를 한 줄 JSON 으로 낸다. **브라우저가 뜬 뒤에 보낸다** — playwright 는 브라우저를 띄울 때 `exit`
 * 처리기를 거므로 그 수가 늘어나는 것을 본다. 뜨기 전에 보내면 신호 처리를 브라우저에게 맡긴 판도 안 죽는다.
 *
 * 인자: `<신호> <실행 파일 경로|->`.
 */
import { chromiumScreenRenderer } from '../src/services/screen-render-chromium'

const [signal, executablePath] = process.argv.slice(2) as [NodeJS.Signals, string]
process.on(signal, () => {})

const exitListeners = process.listenerCount('exit')
const renderer = chromiumScreenRenderer(executablePath === '-' ? {} : { executablePath })
const requests = Array.from({ length: 40 }, (_unused, index) => ({
  title: `${index}`,
  html: `<!doctype html><html lang="ko"><body><h1>페이지 ${index}</h1></body></html>`,
  // 빈 글자면 `addStyleTag`가 거절한다.
  css: 'h1 { color: black; }',
}))
const pending = renderer.render(requests)

const launched = setInterval(() => {
  if (process.listenerCount('exit') <= exitListeners) return
  clearInterval(launched)
  process.kill(process.pid, signal)
}, 1)

const batch = await pending
clearInterval(launched)
console.log(JSON.stringify({ failures: batch.results.filter((result) => !result.ok).length, total: batch.results.length }))
