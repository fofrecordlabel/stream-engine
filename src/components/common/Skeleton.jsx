import { T } from '../../tokens.js'

export function SkeletonBlock({ w = '100%', h = 12, r = 10, style = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: 'rgba(255,255,255,.06)',
        border: `1px solid ${T.b0}`,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.07) 50%, rgba(255,255,255,0) 100%)',
          transform: 'translateX(-60%)',
          animation: 'seShimmer 1.2s ease-in-out infinite',
        }}
      />
    </div>
  )
}

export function SkeletonCuratorCard() {
  return (
    <div style={{ background: `linear-gradient(145deg,${T.card},#0d0d10)`, border: `1px solid ${T.b0}`, borderRadius: 14, padding: '16px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
        <SkeletonBlock w={40} h={40} r={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <SkeletonBlock w="70%" h={12} r={8} style={{ marginBottom: 7 }} />
          <SkeletonBlock w={64} h={16} r={999} />
        </div>
      </div>
      <SkeletonBlock w="55%" h={11} r={8} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SkeletonBlock w={88} h={11} r={8} />
        <SkeletonBlock w={44} h={22} r={999} />
      </div>
    </div>
  )
}

