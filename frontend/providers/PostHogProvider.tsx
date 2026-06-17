'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com'

    if (!apiKey || typeof window === 'undefined') return

    posthog.init(apiKey, {
      api_host: apiHost,
      person_profiles: 'identified_only',
      capture_pageview: false, // We capture manually in PostHogPageView
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug(false)
      },
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  )
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      const query = searchParams?.toString()
      if (query) url = url + '?' + query

      posthog.capture('$pageview', { $current_url: url })
    }
  }, [pathname, searchParams, posthog])

  return null
}

function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  )
}
