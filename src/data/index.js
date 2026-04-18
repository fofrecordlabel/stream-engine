/**
 * IMPORTANT:
 * This file contains UI-only constants and **no seeded business records**.
 * Do not add fake songs, users, campaigns, curators, inbox items, payouts, disputes, or metrics here.
 */

export const GENRES = ["All","Hip-Hop","R&B","Electronic","Indie","Lo-Fi","Pop"]
export const ALL_TAGS = ["Fast Response","High Approval","Trending"]

// UI-only packs (used to render purchase options). Real orders come from Supabase + Stripe.
export const CREDIT_PACKS = [
  { id:"p10", credits:10, price:9.99,  label:"Starter", perCredit:.99 },
  { id:"p25", credits:25, price:19.99, label:"Pro",     perCredit:.80, popular:true },
  { id:"p60", credits:60, price:39.99, label:"Scale",   perCredit:.67, bestValue:true },
]

// Homepage FAQ copy — keep generic and avoid hard operational promises.
export const FAQS_DATA = [
  { q:"What are credits?", a:"Credits are used to submit your track to curators inside StreamEngine." },
  { q:"Do credits expire?", a:"Credits stay in your account until you use them." },
  { q:"Is placement guaranteed?", a:"No. Curators decide what to accept based on fit and playlist rules." },
  { q:"Where do I manage billing?", a:"Go to your dashboard → Billing to view purchases and buy more credits." },
]
