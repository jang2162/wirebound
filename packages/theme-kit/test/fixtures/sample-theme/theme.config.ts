import { defineManifest } from '@wirebound/theme-sdk'

export default defineManifest({
  id: 'sample',
  name: '샘플',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: { items: { 'color.primary': { type: 'color', label: '주색', default: '#e11d48' } } },
  components: {
    Card: {
      variants: [
        { id: 'plain', label: '보통' },
        { id: 'loud', label: '큼' },
      ],
      defaultVariant: 'plain',
    },
  },
})
