import { defineTheme, Root, view } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'

const Card = view(({ props, children }) => (
  <Root as="article" className="sample-card">
    <h3>{String(props.title ?? '')}</h3>
    <p className="sample-card-note">샘플 카드</p>
    {children}
  </Root>
))

export default defineTheme({ manifest, views: { Card } })
