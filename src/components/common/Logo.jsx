/** Primary brand lockup (SE mark + STREAM ENGINE wordmark), served from /public */
export const STREAM_ENGINE_LOGO_SRC = '/stream-engine-logo.png'

/**
 * Compact mark for tight layouts (favicon-style); uses same asset, height-driven.
 * @param {number} size — target height in px
 */
export function SELogo({ size = 36 }) {
  const h = Math.max(22, Math.round(size))
  return (
    <img
      src={STREAM_ENGINE_LOGO_SRC}
      alt=""
      width={Math.round(h * 1.15)}
      height={h}
      style={{ display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(140,255,0,.25))' }}
    />
  )
}

/**
 * Full StreamEngine logo for nav, auth headers, footers.
 * @param {number} size — approximate lockup height in px (width scales with aspect)
 */
export function BrandMark({ onClick, size = 34 }) {
  const h = Math.max(26, Math.round(size * 1.45))
  const maxW = Math.min(280, Math.round(h * 3.6))
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        padding: 0,
        flexShrink: 0,
        maxWidth: maxW,
      }}
      aria-label="StreamEngine home"
    >
      <img
        src={STREAM_ENGINE_LOGO_SRC}
        alt="StreamEngine"
        style={{
          display: 'block',
          height: h,
          width: 'auto',
          maxWidth: maxW,
          objectFit: 'contain',
          objectPosition: 'left center',
        }}
      />
    </button>
  )
}
