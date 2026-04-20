import { createClient } from '@supabase/supabase-js'
import { env, isProd } from './env.js'

/** Production Supabase project (public URL). Override with VITE_SUPABASE_URL. */
export const STREAMENGINE_SUPABASE_URL = 'https://rltejlyhvhlivskbezkx.supabase.co'

const url = env.supabaseUrl || STREAMENGINE_SUPABASE_URL
const key = env.supabaseAnonKey || ''

/* Anon key is required for real auth/data; URL alone enables a consistent project target in builds. */
export const isDemo = !key

/** User-facing message when DB/auth is unavailable (local vs production). */
export function supabaseConfigErrorMessage() {
  return isProd
    ? 'Cloud database is not configured. Set VITE_SUPABASE_ANON_KEY (and VITE_SUPABASE_URL) in Netlify → Environment variables, then redeploy.'
    : 'Add VITE_SUPABASE_ANON_KEY to your project root .env and restart the dev server.'
}

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

if (isDemo && !isProd) {
  console.info('[StreamEngine] No VITE_SUPABASE_ANON_KEY — auth and cloud data are disabled until .env is configured.')
}

/* ── generic helpers ─────────────────────────────────────── */

/** Fetch all rows matching a filter, with RLS applied. */
export async function dbSelect(table, query = {}) {
  if (isDemo) return { data: [], error: { message: supabaseConfigErrorMessage() } }
  let q = supabase.from(table).select(query.select || '*')
  if (query.eq)      Object.entries(query.eq).forEach(([k, v]) => (q = q.eq(k, v)))
  if (query.order)   q = q.order(query.order.col, { ascending: query.order.asc ?? true })
  if (query.limit)   q = q.limit(query.limit)
  return q
}

export async function dbInsert(table, row) {
  if (isDemo) return { data: null, error: { message: supabaseConfigErrorMessage() } }
  return supabase.from(table).insert(row).select().single()
}

export async function dbUpdate(table, id, patch) {
  if (isDemo) return { data: null, error: { message: supabaseConfigErrorMessage() } }
  return supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
}

export async function dbDelete(table, id) {
  if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
  return supabase.from(table).delete().eq('id', id)
}
