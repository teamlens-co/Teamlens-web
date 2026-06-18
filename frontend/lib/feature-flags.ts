import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

export function useFeatureFlag(flagKey: string): boolean {
  const posthog = usePostHog()

  useEffect(() => {
    if (!posthog) return
    posthog.onFeatureFlags(() => {
      // Forces re-render when flags load
    })
  }, [posthog])

  return posthog?.isFeatureEnabled(flagKey) ?? false
}
