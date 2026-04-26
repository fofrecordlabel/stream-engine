import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function ToolCard({ icon, title, desc, cta, onClick, badge }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: `linear-gradient(145deg,${T.card},#0d0d10)`,
        border: `1px solid ${T.b0}`,
        borderRadius: 18,
        padding: '18px 18px',
        cursor: 'pointer',
        transition: 'transform .15s, border-color .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.b1; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.b0; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(127,255,0,.08)', border: `1px solid ${T.gnB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
        {badge ? (
          <div style={{ fontSize: 10.5, fontWeight: 900, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: `1px solid ${T.b0}`, color: T.g200, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {badge}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 6, letterSpacing: '-.02em' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: T.g300, lineHeight: 1.65, marginBottom: 14 }}>{desc}</div>
      <button className="bp" style={{ padding: '10px 14px', fontSize: 13, borderRadius: 12 }}>
        {cta} <span className="arr">→</span>
      </button>
    </div>
  )
}

export default function ToolsPage({ setPage }) {
  const { isLoggedIn } = useAuth()

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <NavBar setPage={setPage} scrolled />
      <div className="se-shell" style={{ padding: '92px 16px 70px', maxWidth: 980 }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Tools
          </div>
          <h1 style={{ fontSize: 'clamp(24px,4.2vw,40px)', fontWeight: 950, letterSpacing: '-.03em', marginBottom: 10 }}>
            Power tools for campaigns
          </h1>
          <p style={{ fontSize: 14.5, color: T.g200, lineHeight: 1.7, maxWidth: 720 }}>
            Utilities that make submissions faster and outcomes cleaner. Playlist Trader is a credits-only MVP: escrow holds credits until delivery is confirmed.
          </p>
          {!isLoggedIn && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, border: `1px solid ${T.b0}`, background: 'rgba(255,255,255,.02)', fontSize: 13, color: T.g300 }}>
              Log in to create listings or fund offers. You can browse listings without an account.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <ToolCard
            icon="🔁"
            badge="MVP"
            title="Playlist Trader"
            desc="Make offers to curators, hold credits in escrow, deliver proof, and release payment on completion."
            cta="Open Playlist Trader"
            onClick={() => setPage('playlist-trader')}
          />
          <ToolCard
            icon="✍️"
            badge="Next"
            title="Pitch Builder"
            desc="Generate a tight pitch template and rewrite your copy for a specific playlist vibe."
            cta="Coming soon"
            onClick={() => setPage('artist')}
          />
          <ToolCard
            icon="🧠"
            badge="Next"
            title="Campaign Planner"
            desc="Suggest a curator mix, budgets, and a timeline for a release window."
            cta="Coming soon"
            onClick={() => setPage('artist')}
          />
        </div>
      </div>
    </div>
  )
}

