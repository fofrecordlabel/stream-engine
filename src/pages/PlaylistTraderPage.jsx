import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import Modal from '../components/common/Modal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase, isDemo, supabaseConfigErrorMessage } from '../lib/supabase.js'

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid rgba(255,255,255,.12)`,
  borderRadius: 12,
  padding: '11px 13px',
  color: '#fff',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'inherit',
}

function Pill({ text, color = T.g300, bg = 'rgba(255,255,255,.04)', border = `1px solid ${T.b0}` }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 9px', borderRadius: 999, background: bg, border, color, letterSpacing: '.06em', textTransform: 'uppercase' }}>
      {text}
    </span>
  )
}

function Card({ children }) {
  return (
    <div style={{ background: `linear-gradient(145deg,${T.card},#0d0d10)`, border: `1px solid ${T.b0}`, borderRadius: 18, padding: '16px 16px' }}>
      {children}
    </div>
  )
}

function statusColor(status) {
  if (status === 'sent') return T.g300
  if (status === 'accepted') return '#38bdf8'
  if (status === 'funded') return T.gold
  if (status === 'delivered') return '#a78bfa'
  if (status === 'completed') return T.gn
  if (status === 'rejected' || status === 'cancelled') return T.red
  if (status === 'disputed') return '#fb923c'
  if (status === 'refunded') return '#94a3b8'
  return T.g300
}

function fundedTimeoutEligible(fundedAt) {
  if (!fundedAt) return false
  const t = new Date(fundedAt).getTime() + 14 * 24 * 60 * 60 * 1000
  return Date.now() > t
}

export default function PlaylistTraderPage({ setPage }) {
  const { user, role, credits, refreshProfile, isLoggedIn } = useAuth()
  const [tab, setTab] = useState('browse') // browse | my-offers | my-listings
  const [listings, setListings] = useState([])
  const [offers, setOffers] = useState([])
  const [adminOfferView, setAdminOfferView] = useState('artist') // artist | curator
  const [proofModal, setProofModal] = useState(null) // offer id
  const [proofText, setProofText] = useState('')
  const [disputeModal, setDisputeModal] = useState(null)
  const [disputeText, setDisputeText] = useState('')
  const [myPlaylists, setMyPlaylists] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const [listingForm, setListingForm] = useState({
    playlist_id: '',
    title: '',
    description: '',
    genre: 'Hip-Hop',
    platform: 'Spotify',
    follower_count: '',
    turnaround: '48h',
    price_credits: 3,
    active: true,
  })

  const [offerDraft, setOfferDraft] = useState(null) // listing
  const [offerMessage, setOfferMessage] = useState('')
  const [mySongs, setMySongs] = useState([])
  const [songId, setSongId] = useState('')

  const canCreateListings = role === 'curator' || role === 'admin'
  const canCreateOffers = role === 'artist' || role === 'admin'

  const loadListings = async () => {
    if (isDemo) { setListings([]); return }
    if (!supabase) return
    setLoading(true); setErr('')
    try {
      const { data, error } = await supabase
        .from('playlist_trader_listings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) { setErr(error.message || 'Failed to load listings'); return }
      setListings(data || [])
    } finally {
      setLoading(false)
    }
  }

  const loadMyOffers = async () => {
    if (isDemo) { setOffers([]); return }
    if (!supabase || !user?.id) return
    setLoading(true); setErr('')
    try {
      const { data, error } = await supabase
        .from('playlist_trader_offers')
        .select('*, playlist_trader_listings(*), playlist_trader_delivery_proofs(id, proof_type, payload, created_at)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) { setErr(error.message || 'Failed to load offers'); return }
      // RLS ensures artist sees own; curator sees offers via listing select policy.
      setOffers(data || [])
    } finally {
      setLoading(false)
    }
  }

  const loadMySongs = async () => {
    if (isDemo) { setMySongs([]); return }
    if (!supabase || !user?.id) return
    const { data } = await supabase.from('songs').select('id,title,artist_name').eq('artist_id', user.id).order('created_at', { ascending: false }).limit(100)
    setMySongs(data || [])
    if (!songId && data?.[0]?.id) setSongId(data[0].id)
  }

  useEffect(() => {
    void loadListings()
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    if (tab === 'my-offers') void loadMyOffers()
    if (tab === 'my-listings') {
      void loadListings()
      if (canCreateListings) void loadMyPlaylists()
    }
  }, [tab, isLoggedIn, canCreateListings])

  useEffect(() => {
    if (!isLoggedIn) return
    if (canCreateOffers) void loadMySongs()
  }, [isLoggedIn]) // eslint-disable-line

  const myListings = useMemo(() => {
    if (!user?.id) return []
    return listings.filter((l) => String(l.curator_id) === String(user.id))
  }, [listings, user?.id])

  const artistOffers = useMemo(
    () => (offers || []).filter((o) => String(o.artist_id) === String(user?.id)),
    [offers, user?.id],
  )
  const curatorOffers = useMemo(
    () => (offers || []).filter((o) => String(o.playlist_trader_listings?.curator_id) === String(user?.id)),
    [offers, user?.id],
  )
  const displayOffers = useMemo(() => {
    if (role === 'admin') return adminOfferView === 'curator' ? curatorOffers : artistOffers
    if (role === 'curator') return curatorOffers
    return artistOffers
  }, [role, adminOfferView, artistOffers, curatorOffers])

  const loadMyPlaylists = async () => {
    if (isDemo || !supabase || !user?.id) return
    const { data } = await supabase
      .from('curator_playlists')
      .select('id, name, genre')
      .eq('curator_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(100)
    setMyPlaylists(data || [])
  }

  const createListing = async () => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase || !user?.id) return
    const title = String(listingForm.title || '').trim()
    if (!title) { setErr('Title is required'); return }
    const price = parseInt(String(listingForm.price_credits || '0'), 10)
    if (!Number.isFinite(price) || price <= 0) { setErr('Price must be > 0 credits'); return }
    setLoading(true)
    try {
      const row = {
        curator_id: user.id,
        playlist_id: listingForm.playlist_id || null,
        title,
        description: String(listingForm.description || '').trim() || null,
        genre: listingForm.genre || null,
        platform: listingForm.platform || 'Spotify',
        follower_count: listingForm.follower_count ? parseInt(String(listingForm.follower_count), 10) : null,
        turnaround: listingForm.turnaround || '48h',
        price_credits: price,
        active: !!listingForm.active,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('playlist_trader_listings').insert(row)
      if (error) { setErr(error.message || 'Could not create listing'); return }
      setListingForm((p) => ({ ...p, title: '', description: '' }))
      await loadListings()
      setTab('my-listings')
    } finally {
      setLoading(false)
    }
  }

  const sendOffer = async () => {
    setErr('')
    if (!offerDraft?.id) return
    if (!isLoggedIn) { setPage('auth'); return }
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase || !user?.id) return
    if (!songId) { setErr('Pick a song first'); return }
    setLoading(true)
    try {
      const { error } = await supabase.from('playlist_trader_offers').insert({
        listing_id: offerDraft.id,
        artist_id: user.id,
        song_id: songId,
        message: String(offerMessage || '').trim() || null,
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      if (error) { setErr(error.message || 'Could not send offer'); return }
      setOfferDraft(null)
      setOfferMessage('')
      await loadMyOffers()
      setTab('my-offers')
    } finally {
      setLoading(false)
    }
  }

  const updateOfferStatus = async (offerId, status) => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('playlist_trader_offers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', offerId)
      if (error) { setErr(error.message || 'Could not update offer'); return }
      await loadMyOffers()
    } finally {
      setLoading(false)
    }
  }

  const fundEscrow = async (offerId) => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('playlist_trader_fund_escrow', { p_offer_id: offerId })
      if (error) { setErr(error.message || 'Could not fund escrow'); return }
      if (data && data.ok === false) { setErr(data.error || 'Could not fund escrow'); return }
      await refreshProfile()
      await loadMyOffers()
    } finally {
      setLoading(false)
    }
  }

  const refundEscrow = async (offerId) => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('playlist_trader_refund_escrow', { p_offer_id: offerId })
      if (error) { setErr(error.message || 'Could not refund escrow'); return }
      if (data && data.ok === false) { setErr(data.error || 'Could not refund escrow'); return }
      await refreshProfile()
      await loadMyOffers()
    } finally {
      setLoading(false)
    }
  }

  const submitDisputeRpc = async (offerId) => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('playlist_trader_open_dispute', {
        p_offer_id: offerId,
        p_reason: String(disputeText || '').trim() || null,
      })
      if (error) { setErr(error.message || 'Could not open dispute'); return }
      if (data && data.ok === false) { setErr(data.error || 'Could not open dispute'); return }
      setDisputeModal(null)
      setDisputeText('')
      await loadMyOffers()
    } finally {
      setLoading(false)
    }
  }

  const releaseEscrow = async (offerId) => {
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('playlist_trader_release_escrow', { p_offer_id: offerId })
      if (error) { setErr(error.message || 'Could not release escrow'); return }
      if (data && data.ok === false) { setErr(data.error || 'Could not release escrow'); return }
      await refreshProfile()
      await loadMyOffers()
    } finally {
      setLoading(false)
    }
  }

  const submitProof = async (offerId, payloadRaw) => {
    const payload = String(payloadRaw || '').trim()
    if (!payload) return
    setErr('')
    if (isDemo) { setErr(supabaseConfigErrorMessage()); return }
    if (!supabase || !user?.id) return
    setLoading(true)
    try {
      const { error } = await supabase.from('playlist_trader_delivery_proofs').insert({
        offer_id: offerId,
        curator_id: user.id,
        proof_type: payload.startsWith('http') ? 'spotify_link' : 'note',
        payload,
      })
      if (error) { setErr(error.message || 'Could not add proof'); return }
      await updateOfferStatus(offerId, 'delivered')
      setProofModal(null)
      setProofText('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <NavBar setPage={setPage} scrolled />
      <div className="se-shell" style={{ padding: '92px 16px 70px', maxWidth: 1080 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Tools / Playlist Trader
            </div>
            <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 950, letterSpacing: '-.03em', marginBottom: 8 }}>
              Credits-only escrow for playlist deals
            </h1>
            <p style={{ fontSize: 14, color: T.g200, lineHeight: 1.65, maxWidth: 760 }}>
              Artists make offers to curator listings. When accepted, you fund escrow in credits. Curator delivers proof. Artist releases escrow to complete.
            </p>
          </div>
          {role === 'artist' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(127,255,0,.06)', border: '1px solid rgba(127,255,0,.18)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.gn, boxShadow: `0 0 10px ${T.gn}` }} />
              <div style={{ fontSize: 12.5, color: T.g300 }}>Balance</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 900, color: T.gn }}>{credits ?? 0}cr</div>
            </div>
          )}
        </div>

        <div className="scroll-x" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[
            { k: 'browse', l: 'Browse listings' },
            { k: 'my-offers', l: 'Offers' },
            { k: 'my-listings', l: 'Listings' },
          ].map((t2) => (
            <button
              key={t2.k}
              type="button"
              className={`chip ${tab === t2.k ? 'csel' : 'cb'}`}
              onClick={() => setTab(t2.k)}
              style={{ flexShrink: 0 }}
            >
              {t2.l}
            </button>
          ))}
        </div>

        {err && (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.22)', color: T.red, fontSize: 13 }}>
            {err}
          </div>
        )}

        {tab === 'browse' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {listings.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🔁</div>
                  <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>No listings yet</div>
                  <div style={{ fontSize: 13, color: T.g300, lineHeight: 1.6 }}>
                    Curators can create listings in the Listings tab.
                  </div>
                </div>
              </Card>
            ) : (
              listings.map((l) => (
                <Card key={l.id}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 950 }}>{l.title}</div>
                        <Pill text={`${l.price_credits}cr`} color={T.gn} bg="rgba(127,255,0,.08)" border="1px solid rgba(127,255,0,.22)" />
                        {l.genre ? <Pill text={l.genre} /> : null}
                        {l.turnaround ? <Pill text={l.turnaround} /> : null}
                        {!l.active ? <Pill text="inactive" color={T.red} bg="rgba(255,64,96,.08)" border="1px solid rgba(255,64,96,.22)" /> : null}
                      </div>
                      {l.description ? (
                        <div style={{ fontSize: 13.5, color: T.g200, lineHeight: 1.65, marginBottom: 10 }}>
                          {l.description}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 12.5, color: T.g300, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Platform: <strong style={{ color: T.w }}>{l.platform || 'Spotify'}</strong></span>
                        {l.follower_count ? <span>Followers: <strong style={{ color: T.w }}>{l.follower_count}</strong></span> : null}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {canCreateOffers ? (
                        <button className="bp" disabled={!l.active} onClick={() => setOfferDraft(l)} style={{ padding: '10px 14px', fontSize: 13, opacity: l.active ? 1 : 0.6 }}>
                          Make offer <span className="arr">→</span>
                        </button>
                      ) : (
                        <button className="bp" onClick={() => setPage(isLoggedIn ? 'artist' : 'auth')} style={{ padding: '10px 14px', fontSize: 13 }}>
                          Sign in to offer <span className="arr">→</span>
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'my-offers' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {!isLoggedIn ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
                  <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>Sign in required</div>
                  <div style={{ fontSize: 13, color: T.g300, lineHeight: 1.6, marginBottom: 12 }}>Offers are tied to your account.</div>
                  <button className="bp" onClick={() => setPage('auth')} style={{ padding: '10px 14px', fontSize: 13 }}>Sign in →</button>
                </div>
              </Card>
            ) : (
              <>
                {role === 'admin' && (artistOffers.length > 0 || curatorOffers.length > 0) && (
                  <div className="scroll-x" style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                    <button type="button" className={`chip ${adminOfferView === 'artist' ? 'csel' : 'cb'}`} onClick={() => setAdminOfferView('artist')} style={{ flexShrink: 0 }}>
                      As artist ({artistOffers.length})
                    </button>
                    <button type="button" className={`chip ${adminOfferView === 'curator' ? 'csel' : 'cb'}`} onClick={() => setAdminOfferView('curator')} style={{ flexShrink: 0 }}>
                      On my listings ({curatorOffers.length})
                    </button>
                  </div>
                )}
                {displayOffers.length === 0 ? (
                  <Card>
                    <div style={{ textAlign: 'center', padding: '28px 0' }}>
                      <div style={{ fontSize: 34, marginBottom: 10 }}>📨</div>
                      <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>No offers in this view</div>
                      <div style={{ fontSize: 13, color: T.g300, lineHeight: 1.6 }}>Browse listings to send offers, or accept incoming offers on your listings.</div>
                    </div>
                  </Card>
                ) : (
                  displayOffers.map((o) => {
                    const listing = o.playlist_trader_listings || null
                    const isArtistParty = String(o.artist_id) === String(user?.id)
                    const isListingCurator = String(listing?.curator_id) === String(user?.id)
                    const showCuratorActions = (role === 'curator' && isListingCurator) || (role === 'admin' && adminOfferView === 'curator')
                    const showArtistActions = (role === 'artist' && isArtistParty) || (role === 'admin' && adminOfferView === 'artist')
                    const proofs = o.playlist_trader_delivery_proofs || []
                    const canDispute = (isArtistParty || isListingCurator || role === 'admin') && ['funded', 'delivered'].includes(o.status)
                    const canTimeoutRefund = (isArtistParty || (role === 'admin' && adminOfferView === 'artist')) && o.status === 'funded' && fundedTimeoutEligible(o.funded_at)

                    return (
                      <Card key={o.id}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                              <div style={{ fontSize: 15, fontWeight: 950 }}>{listing?.title || 'Listing'}</div>
                              <Pill text={o.status} color={statusColor(o.status)} />
                              {listing?.price_credits ? <Pill text={`${listing.price_credits}cr`} color={T.gn} bg="rgba(127,255,0,.08)" border="1px solid rgba(127,255,0,.22)" /> : null}
                            </div>
                            {o.message ? <div style={{ fontSize: 13.5, color: T.g200, lineHeight: 1.65, marginBottom: 10 }}>{o.message}</div> : null}
                            <div style={{ fontSize: 12.5, color: T.g300, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              <span>Created: <span className="mono" style={{ color: T.g200 }}>{String(o.created_at || '').slice(0, 10)}</span></span>
                              {o.funded_at ? <span>Funded: <span className="mono" style={{ color: T.g200 }}>{String(o.funded_at).slice(0, 10)}</span></span> : null}
                            </div>
                            {proofs.length > 0 ? (
                              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.03)', border: `1px solid ${T.b0}` }}>
                                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Delivery proof</div>
                                {proofs.map((p) => (
                                  <div key={p.id} style={{ fontSize: 12.5, color: T.g200, marginBottom: 6, wordBreak: 'break-word' }}>
                                    <span style={{ color: T.g300 }}>{p.proof_type} · </span>
                                    {p.payload}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {o.status === 'disputed' && o.dispute_reason ? (
                              <div style={{ marginTop: 10, fontSize: 12.5, color: '#fb923c' }}>Dispute: {o.dispute_reason}</div>
                            ) : null}
                          </div>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {showCuratorActions && (
                              <>
                                {o.status === 'sent' && (
                                  <>
                                    <button type="button" className="bp" disabled={loading} onClick={() => updateOfferStatus(o.id, 'accepted')} style={{ padding: '10px 12px', fontSize: 13 }}>Accept →</button>
                                    <button type="button" className="bt" disabled={loading} onClick={() => updateOfferStatus(o.id, 'rejected')} style={{ padding: '10px 12px', fontSize: 13, color: T.red }}>Reject</button>
                                  </>
                                )}
                                {o.status === 'funded' && (
                                  <button type="button" className="bp" disabled={loading} onClick={() => { setProofText(''); setProofModal(o.id) }} style={{ padding: '10px 12px', fontSize: 13 }}>
                                    Post delivery →
                                  </button>
                                )}
                              </>
                            )}

                            {showArtistActions && (
                              <>
                                {o.status === 'accepted' && (
                                  <button type="button" className="bp" disabled={loading} onClick={() => fundEscrow(o.id)} style={{ padding: '10px 12px', fontSize: 13 }}>
                                    Fund escrow →
                                  </button>
                                )}
                                {o.status === 'delivered' && (
                                  <button type="button" className="bp" disabled={loading} onClick={() => releaseEscrow(o.id)} style={{ padding: '10px 12px', fontSize: 13 }}>
                                    Release escrow →
                                  </button>
                                )}
                                {canTimeoutRefund && (
                                  <button type="button" className="bt" disabled={loading} onClick={() => refundEscrow(o.id)} style={{ padding: '10px 12px', fontSize: 13, color: T.red }}>
                                    Refund (14d+)
                                  </button>
                                )}
                              </>
                            )}

                            {canDispute && (
                              <button type="button" className="bt" disabled={loading} onClick={() => { setDisputeText(''); setDisputeModal(o.id) }} style={{ padding: '10px 12px', fontSize: 13, color: '#fb923c' }}>
                                Dispute
                              </button>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })
                )}
              </>
            )}
          </div>
        )}

        {tab === 'my-listings' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {!isLoggedIn ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
                  <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>Sign in required</div>
                  <div style={{ fontSize: 13, color: T.g300, lineHeight: 1.6, marginBottom: 12 }}>Listings are tied to curator accounts.</div>
                  <button className="bp" onClick={() => setPage('auth')} style={{ padding: '10px 14px', fontSize: 13 }}>Sign in →</button>
                </div>
              </Card>
            ) : !canCreateListings ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🎵</div>
                  <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>Curators only</div>
                  <div style={{ fontSize: 13, color: T.g300, lineHeight: 1.6 }}>Switch to a curator account to create listings.</div>
                </div>
              </Card>
            ) : (
              <>
                <Card>
                  <div style={{ fontSize: 12, fontWeight: 950, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                    Create listing
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Curator playlist (optional)</div>
                      <select
                        style={{ ...inputStyle, cursor: 'pointer' }}
                        value={listingForm.playlist_id}
                        onChange={(e) => setListingForm((p) => ({ ...p, playlist_id: e.target.value }))}
                      >
                        <option value="" style={{ background: T.bg }}>— Not linked —</option>
                        {myPlaylists.map((pl) => (
                          <option key={pl.id} value={pl.id} style={{ background: T.bg }}>
                            {pl.name}{pl.genre ? ` · ${pl.genre}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Title</div>
                      <input style={inputStyle} value={listingForm.title} onChange={(e) => setListingForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Pop playlist slot (weekly)" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
                      <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', lineHeight: 1.6 }} value={listingForm.description} onChange={(e) => setListingForm((p) => ({ ...p, description: e.target.value }))} placeholder="What you accept, what you don’t, how delivery works…" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Genre</div>
                      <input style={inputStyle} value={listingForm.genre} onChange={(e) => setListingForm((p) => ({ ...p, genre: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Turnaround</div>
                      <input style={inputStyle} value={listingForm.turnaround} onChange={(e) => setListingForm((p) => ({ ...p, turnaround: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Followers (optional)</div>
                      <input style={inputStyle} value={listingForm.follower_count} onChange={(e) => setListingForm((p) => ({ ...p, follower_count: e.target.value }))} placeholder="e.g. 8200" />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Price (credits)</div>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={String(listingForm.price_credits)} onChange={(e) => setListingForm((p) => ({ ...p, price_credits: parseInt(e.target.value, 10) }))}>
                        {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={String(n)} style={{ background: T.bg }}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="bp" disabled={loading} onClick={createListing} style={{ padding: '10px 14px', fontSize: 13 }}>
                      Create listing <span className="arr">→</span>
                    </button>
                    <button className="bt" disabled={loading} onClick={loadListings} style={{ padding: '10px 12px', fontSize: 13 }}>
                      Refresh
                    </button>
                  </div>
                </Card>

                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 950 }}>Your listings</div>
                    <div style={{ fontSize: 12.5, color: T.g300 }}>{myListings.length} total</div>
                  </div>
                  {myListings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: T.g300 }}>
                      No listings yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {myListings.map((l) => (
                        <div key={l.id} style={{ padding: '12px 12px', borderRadius: 14, border: `1px solid ${T.b0}`, background: 'rgba(255,255,255,.02)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 900 }}>{l.title}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <Pill text={`${l.price_credits}cr`} color={T.gn} bg="rgba(127,255,0,.08)" border="1px solid rgba(127,255,0,.22)" />
                              {l.active ? <Pill text="active" color={T.gn} bg="rgba(127,255,0,.06)" border="1px solid rgba(127,255,0,.18)" /> : <Pill text="inactive" color={T.red} bg="rgba(255,64,96,.08)" border="1px solid rgba(255,64,96,.22)" />}
                            </div>
                          </div>
                          {l.description ? <div style={{ marginTop: 6, fontSize: 13, color: T.g300, lineHeight: 1.6 }}>{l.description}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* Offer modal */}
      <Modal
        open={!!proofModal}
        title="Post delivery proof"
        description="Paste a Spotify playlist/track link or a short note. This is shown to the artist."
        onClose={() => (loading ? null : setProofModal(null))}
        width={520}
      >
        <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', lineHeight: 1.6, marginBottom: 14 }} value={proofText} onChange={(e) => setProofText(e.target.value)} placeholder="https://open.spotify.com/..." />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="bt" disabled={loading} onClick={() => setProofModal(null)} style={{ padding: '10px 14px', fontSize: 13 }}>Cancel</button>
          <button type="button" className="bp" disabled={loading || !proofText.trim()} onClick={() => void submitProof(proofModal, proofText)} style={{ padding: '10px 14px', fontSize: 13 }}>
            Submit & mark delivered <span className="arr">→</span>
          </button>
        </div>
      </Modal>

      <Modal
        open={!!disputeModal}
        title="Open dispute"
        description="Escrow stays held until an admin resolves the case. Summarize what went wrong."
        onClose={() => (loading ? null : setDisputeModal(null))}
        width={520}
      >
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.6, marginBottom: 14 }} value={disputeText} onChange={(e) => setDisputeText(e.target.value)} placeholder="Reason…" />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="bt" disabled={loading} onClick={() => setDisputeModal(null)} style={{ padding: '10px 14px', fontSize: 13 }}>Cancel</button>
          <button type="button" className="bp" disabled={loading} onClick={() => void submitDisputeRpc(disputeModal)} style={{ padding: '10px 14px', fontSize: 13 }}>
            Submit dispute <span className="arr">→</span>
          </button>
        </div>
      </Modal>

      {offerDraft && (
        <Modal
          open={!!offerDraft}
          title="Make an offer"
          description={`${offerDraft?.title || 'Listing'} · ${offerDraft?.price_credits || ''} credits`}
          onClose={() => (loading ? null : setOfferDraft(null))}
          width={560}
        >

            {canCreateOffers ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Song</div>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={songId} onChange={(e) => setSongId(e.target.value)}>
                    {mySongs.length === 0 ? <option value="" style={{ background: T.bg }}>No songs yet — add one first</option> : null}
                    {mySongs.map((s) => (
                      <option key={s.id} value={s.id} style={{ background: T.bg }}>
                        {s.title} — {s.artist_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Message</div>
                  <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} placeholder="Short pitch + what you’re looking for. Keep it specific." />
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12.5, color: T.g300 }}>
                    Escrow is funded *after* the curator accepts.
                  </div>
                  <button className="bp" disabled={loading || !songId} onClick={sendOffer} style={{ padding: '10px 14px', fontSize: 13, opacity: (!songId || loading) ? 0.7 : 1 }}>
                    Send offer <span className="arr">→</span>
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${T.b0}`, background: 'rgba(255,255,255,.02)', color: T.g300, fontSize: 13 }}>
                Artist accounts can send offers. Switch roles or sign in.
              </div>
            )}
        </Modal>
      )}
    </div>
  )
}

