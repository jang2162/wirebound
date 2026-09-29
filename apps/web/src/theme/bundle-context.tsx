/**
 * 번들 로더를 트리에 건넨다. **세우는 자리는 `main.tsx` 하나다**(스크립트 로더 — 세션에 하나). 화면 테스트는 jsdom 이 `<script src>` 를
 * 실행하지 않으므로 시험용 로더를 끼운다(`test/theme-loader.ts` 의 `staticBundleLoader`).
 *
 * 공급자가 없으면 `useThemeBundleLoader` 가 던진다 — 조용히 스크립트 로더로 떨어지면 jsdom 에서는 한도(10초)까지 «여는 중» 으로 멈춰
 * 무엇이 빠졌는지 안 보인다.
 */
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'
import { createScriptBundleLoader, type ThemeBundleLoader } from './bundle-loader'

const BundleLoaderContext = createContext<ThemeBundleLoader | null>(null)

export function ThemeBundleProvider(props: { loader?: ThemeBundleLoader; children: ReactNode }): ReactElement {
  // 로더는 캐시를 쥐므로 공급자가 사는 동안 하나다 — 렌더마다 새로 지으면 번들을 다시 싣는다.
  const [fallback] = useState(() => (props.loader === undefined ? createScriptBundleLoader() : null))
  return <BundleLoaderContext.Provider value={props.loader ?? fallback}>{props.children}</BundleLoaderContext.Provider>
}

export function useThemeBundleLoader(): ThemeBundleLoader {
  const loader = useContext(BundleLoaderContext)
  if (loader === null) throw new Error('ThemeBundleProvider 가 없습니다 — 번들 로더를 세우는 자리는 main.tsx 다')
  return loader
}
