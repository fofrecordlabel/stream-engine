import { useEffect } from 'react'
import { env } from '../lib/env.js'
import { injectGlobalJsonLd } from '../lib/seoJsonLd.js'

/**
 * Injects sitewide JSON-LD once (Organization, WebSite, Service, breadcrumbs, etc.).
 */
export default function GlobalSeo() {
  useEffect(() => {
    const origin =
      (typeof window !== 'undefined' && window.location?.origin) ||
      (env.appUrl ? env.appUrl.replace(/\/$/, '') : '') ||
      'https://streamengineinc.com'
    return injectGlobalJsonLd(origin)
  }, [])
  return null
}
