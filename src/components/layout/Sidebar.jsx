import { T } from '../../tokens.js'
import { BrandMark } from '../common/Logo.jsx'
import { CreditPill } from '../common/Atoms.jsx'

export function MobileDrawer({ items, section, setSection, wallet, onClose, label = "Artist" }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div style={{ padding:"18px 18px 14px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <BrandMark onClick={onClose} size={26} />
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:7, background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)", color:T.g200, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>×</button>
        </div>
        <div style={{ padding:"12px 12px" }}>
          <div style={{ background:T.gnGl, border:`1px solid ${T.gnB}`, borderRadius:11, padding:"13px 15px", marginBottom:14 }}>
            <div style={{ fontSize:9.5, fontWeight:800, color:"rgba(127,255,0,.6)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>Wallet</div>
            <CreditPill n={wallet} large />
          </div>
          <div style={{ fontSize:9.5, fontWeight:800, color:T.g400, letterSpacing:".1em", textTransform:"uppercase", padding:"8px 8px 4px" }}>{label}</div>
          {items.map(it => (
            <button key={it.id} type="button" data-coach={it.coach || undefined} className={`sni ${section === it.id ? "act" : ""}`} onClick={() => { setSection(it.id); onClose(); }}>
              <span style={{ fontSize:14 }}>{it.icon}</span>{it.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function DesktopSide({ items, section, setSection, wallet, label = "Artist", onBuyCredits }) {
  return (
    <aside style={{ width:210, borderRight:"1px solid rgba(255,255,255,.05)", flexShrink:0, display:"flex", flexDirection:"column", background:`linear-gradient(180deg,${T.bg1},${T.bg})`, overflow:"auto" }}>
      <nav style={{ padding:"12px 10px", flex:1 }}>
        <div style={{ fontSize:9.5, fontWeight:800, color:T.g400, letterSpacing:".1em", textTransform:"uppercase", padding:"8px 8px 4px" }}>{label}</div>
        {items.map(it => (
          <button key={it.id} type="button" data-coach={it.coach || undefined} className={`sni ${section === it.id ? "act" : ""}`} onClick={() => setSection(it.id)}>
            <span style={{ fontSize:13 }}>{it.icon}</span>{it.label}
          </button>
        ))}
      </nav>
      <div style={{ padding:12, borderTop:"1px solid rgba(255,255,255,.05)" }}>
        <div style={{ background:T.gnGl, border:`1px solid ${T.gnB}`, borderRadius:12, padding:"13px 14px" }}>
          <div style={{ fontSize:9.5, fontWeight:800, color:"rgba(127,255,0,.55)", letterSpacing:".07em", textTransform:"uppercase", marginBottom:4 }}>Wallet</div>
          <div style={{ marginBottom:8 }}><CreditPill n={wallet} large /></div>
          <button type="button" className="bp" data-coach="coach-wallet-buy" onClick={onBuyCredits} style={{ width:"100%", padding:"9px 0", fontSize:12, borderRadius:8 }}>Buy Credits</button>
        </div>
      </div>
    </aside>
  );
}
