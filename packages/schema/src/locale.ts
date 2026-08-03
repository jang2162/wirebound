import z from 'zod'
// @ts-expect-error zod/v4/locales/ko is not in zod's exports type definitions
import ko from 'zod/v4/locales/ko'

/**
 * Configure zod with Korean error messages.
 * This module has a side effect: it globally configures zod's error messages to Korean.
 * It's kept in a separate module so this global configuration happens in one place
 * and is easy to identify.
 */
z.config({ localeError: ko().localeError })
