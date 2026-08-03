import z from 'zod'

/**
 * Get Korean error map for use in schema validation.
 * zod 4.4.3 provides z.locales.ko as a locale function that returns { localeError: $ZodErrorMap }.
 * Use this in ParseContext when calling safeParse to get Korean error messages.
 */
export function getKoreanErrorMap() {
  return z.locales.ko().localeError
}
