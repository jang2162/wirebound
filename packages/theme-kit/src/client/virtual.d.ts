/** dev 서버가 작성자의 진입으로 잇는 이름(`dev.ts` 의 `resolve.alias`). 클라이언트 빌드는 이것을 밖에 둔다. */
declare module 'virtual:wb-theme-entry' {
  import type { ThemeDefinition } from '@wirebound/theme-sdk'
  const theme: ThemeDefinition
  export default theme
}
