/**
 * Rich JSON-LD for StreamEngine (Organization, WebSite, Service, ItemList, BreadcrumbList).
 * Uses the live origin so canonical URLs match production or preview hosts.
 */

function stripSlash(s) {
  return String(s || '').replace(/\/$/, '')
}

export function buildStreamEngineSchemas(origin) {
  const o = stripSlash(origin || 'https://streamengineinc.com')
  const desc =
    'StreamEngine connects independent artists with verified Spotify playlist curators. Submit tracks for Playlist Push campaigns, buy credits, and grow streams with transparent curator workflows.'

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${o}/#organization`,
    name: 'StreamEngine',
    url: o,
    logo: `${o}/stream-engine-logo.png`,
    description: desc,
    foundingDate: '2024',
    slogan: 'Get your music onto Spotify playlists.',
    knowsAbout: [
      'Spotify playlist promotion',
      'Independent music marketing',
      'Playlist curator submissions',
      'Music streaming growth',
    ],
    areaServed: { '@type': 'Place', name: 'Worldwide' },
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${o}/#website`,
    name: 'StreamEngine',
    url: o,
    description: desc,
    publisher: { '@id': `${o}/#organization` },
    inLanguage: 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${o}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  const service = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${o}/#service`,
    name: 'StreamEngine Playlist Push',
    image: `${o}/stream-engine-logo.png`,
    description: desc,
    url: o,
    provider: { '@id': `${o}/#organization` },
    serviceType: 'Music promotion and playlist curator marketplace',
    audience: {
      '@type': 'Audience',
      audienceType: 'Independent artists, labels, and managers seeking Spotify playlist placements.',
    },
    areaServed: 'Worldwide',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      description: 'Credit packs and optional Pro subscription for higher weekly submission caps.',
    },
  }

  const siteMapList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${o}/#sitemap-list`,
    name: 'StreamEngine key pages',
    numberOfItems: 12,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${o}/` },
      { '@type': 'ListItem', position: 2, name: 'Get started', item: `${o}/` },
      { '@type': 'ListItem', position: 3, name: 'Pricing & plans', item: `${o}/pricing` },
      { '@type': 'ListItem', position: 4, name: 'How it works', item: `${o}/how-it-works` },
      { '@type': 'ListItem', position: 5, name: 'FAQ', item: `${o}/faq` },
      { '@type': 'ListItem', position: 6, name: 'Blog', item: `${o}/blog` },
      { '@type': 'ListItem', position: 7, name: 'Submit song', item: `${o}/submit-song` },
      { '@type': 'ListItem', position: 8, name: 'Submit playlist', item: `${o}/submit-playlist` },
      { '@type': 'ListItem', position: 9, name: 'Terms of service', item: `${o}/terms` },
      { '@type': 'ListItem', position: 10, name: 'Privacy policy', item: `${o}/privacy` },
      { '@type': 'ListItem', position: 11, name: 'Contact', item: `${o}/contact` },
      { '@type': 'ListItem', position: 12, name: 'Sign in', item: `${o}/signup` },
    ],
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${o}/#breadcrumbs`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${o}/` },
      { '@type': 'ListItem', position: 2, name: 'Music promotion', item: `${o}/how-it-works` },
      { '@type': 'ListItem', position: 3, name: 'Spotify playlists', item: `${o}/` },
      { '@type': 'ListItem', position: 4, name: 'Playlist Push', item: `${o}/how-it-works` },
      { '@type': 'ListItem', position: 5, name: 'Curator network', item: `${o}/` },
      { '@type': 'ListItem', position: 6, name: 'Verified curators', item: `${o}/how-it-works` },
      { '@type': 'ListItem', position: 7, name: 'Artist submissions', item: `${o}/submit-song` },
      { '@type': 'ListItem', position: 8, name: 'Credits & billing', item: `${o}/pricing` },
      { '@type': 'ListItem', position: 9, name: 'Pro subscription', item: `${o}/pricing` },
      { '@type': 'ListItem', position: 10, name: 'Get more streams', item: `${o}/` },
      { '@type': 'ListItem', position: 11, name: 'Resources', item: `${o}/blog` },
      { '@type': 'ListItem', position: 12, name: 'StreamEngine', item: `${o}/` },
    ],
  }

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${o}/#app`,
    name: 'StreamEngine',
    applicationCategory: 'MusicApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free tier with weekly Playlist Push cap' },
    description: desc,
    url: o,
    publisher: { '@id': `${o}/#organization` },
  }

  return [organization, website, service, siteMapList, breadcrumbs, software]
}

export function injectGlobalJsonLd(origin) {
  if (typeof document === 'undefined') return () => {}
  document.querySelectorAll('script[data-se-jsonld]').forEach((el) => el.remove())
  const schemas = buildStreamEngineSchemas(origin)
  const nodes = []
  schemas.forEach((schema, i) => {
    const s = document.createElement('script')
    s.type = 'application/ld+json'
    s.dataset.seJsonld = String(i)
    s.textContent = JSON.stringify(schema)
    document.head.appendChild(s)
    nodes.push(s)
  })
  return () => {
    nodes.forEach((n) => n.parentNode?.removeChild(n))
  }
}
