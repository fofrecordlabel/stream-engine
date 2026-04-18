/**
 * useCampaigns — campaign CRUD with Supabase + demo fallback.
 */
import { useState, useEffect } from 'react'
import { isDemo, dbInsert, dbUpdate, supabase } from '../lib/supabase.js'
import { campaignStatusBlocksResubmit } from '../lib/dedupeRules.js'
// Intentionally no seeded campaign records, even in demo mode.
import { creditsToUsd, calcFees } from '../lib/stripe.js'

export function useCampaigns(userId, role = 'artist') {
  const [campaigns, setCampaigns] = useState([])
  const [loading,   setLoading]   = useState(!isDemo)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (isDemo || !userId) { setLoading(false); return }
    setLoading(true)
    setError('')

    let q = supabase.from('campaigns').select(`
      *,
      songs ( id, title, artist_name, genre, artwork_url, spotify_url ),
      submissions ( id, curator_id, status, credits, payout, created_at, updated_at, curator_note,
        curator_profiles ( id, display_name, verified, artwork, color )
      )
    `)

    if (role === 'artist')  q = q.eq('artist_id', userId)
    if (role === 'admin')   {} // no filter — admin sees all (RLS handles it)
    if (role === 'curator') {
      q = supabase.from('submissions').select(`
        *, campaigns ( *, songs ( * ) )
      `).eq('curator_id', userId)
    }

    q.order('created_at', { ascending: false })
     .then(({ data, error: err }) => {
       if (err) setError(err.message || 'Failed to load campaigns')
       setCampaigns(data || [])
       setLoading(false)
     })
  }, [userId, role])

  const createCampaign = async ({ songId, song, campaignType, selectedCurators, userId: uid }) => {
    const realCampaignType = campaignType?.id || 'playlist'
    const totalCredits   = selectedCurators.reduce((a, c) => a + c.credits, 0)
    const totalUsd       = creditsToUsd(totalCredits)
    const { platformFee, curatorEarnings } = calcFees(totalUsd)

    if (isDemo) {
      return { data: null, error: new Error('Campaign creation requires Supabase configuration.') }
    }

    const { data: openCampaigns, error: openErr } = await supabase
      .from('campaigns')
      .select('id,status,song_id')
      .eq('artist_id', uid)
      .eq('song_id', songId)

    if (openErr) return { data: null, error: openErr, code: 'CAMPAIGN_QUERY_FAILED' }

    const blocked = (openCampaigns || []).some((c) => campaignStatusBlocksResubmit(c.status))
    if (blocked) {
      const err = new Error('DUPLICATE_ACTIVE_CAMPAIGN')
      err.code = 'DUPLICATE_ACTIVE_CAMPAIGN'
      return { data: null, error: err, code: 'DUPLICATE_ACTIVE_CAMPAIGN' }
    }

    const row = {
      artist_id:       uid,
      song_id:         songId,
      campaign_type:   realCampaignType,
      status:          'pending',
      total_credits:   totalCredits,
      amount_paid:     totalUsd,
      platform_fee:    platformFee,
      curator_earnings:curatorEarnings,
    }
    const { data: camp, error } = await dbInsert('campaigns', row)
    if (error || !camp) {
      const msg = String(error?.message || '')
      const code = error?.code
      if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        const err = new Error('DUPLICATE_ACTIVE_CAMPAIGN')
        err.code = 'DUPLICATE_ACTIVE_CAMPAIGN'
        return { data: null, error: err, code: 'DUPLICATE_ACTIVE_CAMPAIGN' }
      }
      return { data: null, error }
    }

    // Create a submission row per curator
    const subRows = selectedCurators.map(c => ({
      campaign_id: camp.id,
      curator_id:  c.id,
      status:      'new',
      credits:     c.credits,
      payout:      creditsToUsd(c.credits) * (1 - 0.20),
      due_date:    new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
    }))
    await supabase.from('submissions').insert(subRows)

    setCampaigns(p => [camp, ...p])
    return { data: camp, error: null }
  }

  const updateCampaignStatus = async (id, status, note = null) => {
    if (isDemo) {
      setCampaigns(p => p.map(c => c.id===id ? {...c, status, ...(note?{adminNote:note}:{})} : c))
      return { error: null }
    }
    const { data, error } = await dbUpdate('campaigns', id, { status, ...(note?{admin_note:note}:{}) })
    if (!error) setCampaigns(p => p.map(c => c.id===id ? {...c,...data} : c))
    return { error }
  }

  return { campaigns, setCampaigns, loading, error, createCampaign, updateCampaignStatus }
}
