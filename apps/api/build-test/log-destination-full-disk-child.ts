/**
 * `log-destination-full-disk.test.ts`가 컨테이너 안에서 띄운다(케이스 파일 아님 — 한 파일로 묶어 넣는다). 가득 찬 파일시스템 위의
 * 파일에 줄을 쓰고, 떨굼이 알려진 뒤 더 쓰고 `flushSync`로 끝낸다 — 멈추면 컨테이너 안의 `timeout`에 걸린다.
 */
import { openSync } from 'node:fs'
import { logDestination } from '../src/log-destination'

const stream = logDestination(openSync(process.argv[2]!, 'a'))
// 한 번에 넘길 만큼 — 가득 찬 파일시스템은 0 바이트는 받고 1 바이트부터 거절한다.
stream.write('첫 줄\n'.repeat(50))
stream.write('둘째 줄\n')
await new Promise((resolve) => setTimeout(resolve, 200))
stream.write('셋째 줄\n')
const started = performance.now()
stream.flushSync()
process.stdout.write(`끝까지 왔다 flushSync=${Math.round(performance.now() - started)}ms\n`)
process.exit(0)
