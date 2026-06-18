'use client'

import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
    if ('captureException' in posthog && typeof posthog.captureException === 'function') {
      posthog.captureException(error, { source: 'global-error-boundary' })
    }
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={500} title={error.message} />
      </body>
    </html>
  )
}
