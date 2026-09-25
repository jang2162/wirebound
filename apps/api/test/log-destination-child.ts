/**
 * `log-destination.test.ts`가 자식 프로세스로 띄운다(케이스 파일 아님). 쓰기가 실패하는 fd 에 줄을 쓰고 끝낸다 — 멈추면 부모의
 * 한도에 걸리고, 던지면 종료 코드가 1 이다.
 *
 * - `at-once`: 쓰자마자 `flushSync` · `process.exit` — 비동기 쓰기의 오류가 알려지기 전이다.
 * - `late`: 쓰기 오류가 알려질 만큼 기다린 뒤 더 쓰고 끝낸다.
 */
import { openSync } from 'node:fs'
import { logDestination } from '../src/log-destination'

// 읽기 전용으로 연 fd 에 쓰면 EBADF — 끊긴 터미널의 EIO 와 같은 «EAGAIN 이 아닌 쓰기 오류»다.
const stream = logDestination(openSync('/dev/null', 'r'))
stream.write('첫 줄\n')
stream.write('둘째 줄\n')
if (process.argv[2] === 'late') {
  await new Promise((resolve) => setTimeout(resolve, 200))
  stream.write('셋째 줄\n')
}
stream.flushSync()
process.stdout.write('끝까지 왔다\n')
process.exit(0)
