import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'

export function useAnalytics() {
  const posthog = usePostHog()

  const capture = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      if (posthog) {
        posthog.capture(eventName, properties)
      }
    },
    [posthog]
  )

  const identify = useCallback(
    (userId: string, traits?: Record<string, unknown>) => {
      if (posthog) {
        posthog.identify(userId, traits)
      }
    },
    [posthog]
  )

  const reset = useCallback(() => {
    if (posthog) {
      posthog.reset()
    }
  }, [posthog])

  return { capture, identify, reset }
}
