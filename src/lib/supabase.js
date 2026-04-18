import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isDemo = !url || !key

export const supabase = isDemo
  ? null
  : createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'se-supabase-auth',
      },
    })

if (isDemo) {
  console.info('[StreamEngine] Running in demo mode — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to enable backend')
}

/* ── generic helpers ─────────────────────────────────────── */

/** Fetch all rows matching a filter, with RLS applied. */
export async function dbSelect(table, query = {}) {
  if (isDemo) return { data: [], error: null }
  let q = supabase.from(table).select(query.select || '*')
  if (query.eq)      Object.entries(query.eq).forEach(([k, v]) => (q = q.eq(k, v)))
  if (query.order)   q = q.order(query.order.col, { ascending: query.order.asc ?? true })
  if (query.limit)   q = q.limit(query.limit)
  return q
}

export async function dbInsert(table, row) {
  if (isDemo) return { data: [{ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }], error: null }
  return supabase.from(table).insert(row).select().single()
}

export async function dbUpdate(table, id, patch) {
  if (isDemo) return { data: { id, ...patch }, error: null }
  return supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
}

export async function dbDelete(table, id) {
  if (isDemo) return { error: null }
  return supabase.from(table).delete().eq('id', id)
}
