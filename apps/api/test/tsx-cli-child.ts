/**
 * `shutdown.test.ts`의 «깔린 tsx»가 자식 프로세스로 띄운다(케이스 파일 아님). 이 node 가 스스로를 tsx CLI 가 띄운 것으로 보는지
 * 찍는다.
 */
import { launchedByTsxCli } from '../src/shutdown'

process.stdout.write(JSON.stringify(launchedByTsxCli(process.execArgv)))
