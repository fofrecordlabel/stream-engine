-- ============================================================
-- StreamEngine Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── profiles ────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid references auth.users on delete cascade primary key,
  role          text not null check (role in ('artist','curator','admin')) default 'artist',
  display_name  text,
  avatar_url    text,
  stripe_customer_id text,
  subscription_tier text default 'free',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'artist'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── songs ────────────────────────────────────────────────────
create table if not exists songs (
  id            uuid default gen_random_uuid() primary key,
  artist_id     uuid references profiles(id) on delete cascade not null,
  title         text not null,
  artist_name   text not null,
  genre         text default 'Hip-Hop',
  spotify_url   text,
  spotify_id    text,
  artwork_url   text,
  bg            text default '#050506',
  ac            text default '#7fff00',
  bpm           int,
  submissions   int default 0,
  created_at    timestamptz default now()
);

-- Duplicate protection (per-artist, per-Spotify track)
create unique index if not exists songs_artist_spotify_unique
  on songs(artist_id, spotify_id)
  where spotify_id is not null;

create unique index if not exists songs_artist_spotify_url_unique
  on songs(artist_id, spotify_url)
  where spotify_url is not null;

-- ── curator_profiles ─────────────────────────────────────────
create table if not exists curator_profiles (
  id                  uuid references profiles(id) on delete cascade primary key,
  display_name        text,
  bio                 text,
  genres              text[] default '{}',
  platforms           text[] default '{Spotify}',
  turnaround          text default '48h',
  price_credits       int default 2,
  open_for_submissions bool default true,
  verified            bool default false,
  follower_count      int default 0,
  approval_count      int default 0,
  response_rate       int default 85,
  rules               text,
  instagram_url       text,
  twitter_url         text,
  spotify_profile_url text,
  artwork             text default '🎵',
  color               text default '#7fff00',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── curator_playlists ────────────────────────────────────────
create table if not exists curator_playlists (
  id             uuid default gen_random_uuid() primary key,
  curator_id     uuid references curator_profiles(id) on delete cascade not null,
  name           text not null,
  spotify_url    text,
  genre          text,
  platform       text default 'Spotify',
  follower_count text,
  turnaround     text default '48h',
  credits        int default 2,
  rules          text,
  active         bool default true,
  created_at     timestamptz default now()
);

-- ── campaigns ────────────────────────────────────────────────
create table if not exists campaigns (
  id                        uuid default gen_random_uuid() primary key,
  artist_id                 uuid references profiles(id) on delete cascade not null,
  song_id                   uuid references songs(id) on delete set null,
  campaign_type             text check (campaign_type in ('playlist','tiktok','influencer')) default 'playlist',
  status                    text check (status in ('pending','approved','in_progress','completed','rejected')) default 'pending',
  total_credits             int default 0,
  amount_paid               numeric(10,2) default 0,
  platform_fee              numeric(10,2) default 0,
  curator_earnings          numeric(10,2) default 0,
  admin_note                text,
  assigned_curator_id       uuid references curator_profiles(id),
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- ── submissions ───────────────────────────────────────────────
create table if not exists submissions (
  id                uuid default gen_random_uuid() primary key,
  campaign_id       uuid references campaigns(id) on delete cascade not null,
  curator_id        uuid references curator_profiles(id) not null,
  playlist_id       uuid references curator_playlists(id),
  status            text check (status in ('new','pending','accepted','declined','completed')) default 'new',
  credits           int not null,
  payout            numeric(10,2),
  due_date          date,
  notes             text,
  playlist_assigned text,
  curator_note      text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ── credits_ledger ────────────────────────────────────────────
create table if not exists credits_ledger (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade not null,
  amount        int not null,        -- positive = credit, negative = debit
  reason        text,                -- 'purchase', 'campaign_spend', 'refund'
  campaign_id   uuid references campaigns(id),
  stripe_payment_id text,
  created_at    timestamptz default now()
);

-- Idempotency for Stripe credit grants
create unique index if not exists credits_ledger_stripe_payment_unique
  on credits_ledger(stripe_payment_id)
  where stripe_payment_id is not null;

-- ── discount_codes ────────────────────────────────────────────
-- NOTE: For V1, `amount` is interpreted as:
-- - type='percent' => percent integer (e.g. 20 means 20% off)
-- - type='fixed'   => cents integer (e.g. 500 means $5.00 off)
create table if not exists discount_codes (
  id              uuid default gen_random_uuid() primary key,
  code            text not null,
  type            text not null check (type in ('percent','fixed')),
  amount          int  not null check (amount > 0),
  active          bool default true,
  currency        text default 'usd',
  expires_at      timestamptz,
  usage_limit     int,
  usage_count     int default 0,
  min_amount_cents int,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint discount_codes_code_unique unique (code)
);

-- ── playlist_push_orders ──────────────────────────────────────
-- Stripe checkout → order record; amounts are stored as cents integers.
create table if not exists playlist_push_orders (
  id                      uuid default gen_random_uuid() primary key,
  user_id                 uuid references profiles(id) on delete cascade not null,
  song_id                 uuid references songs(id) on delete set null,
  pack_id                 text,
  credits_purchased        int default 0,
  stripe_session_id       text not null,
  stripe_payment_intent_id text,
  amount_subtotal         int,
  amount_discount         int default 0,
  amount_total            int,
  currency                text default 'usd',
  status                  text check (status in ('created','paid','failed','expired','refunded')) default 'created',
  discount_code           text,
  invite_code             text,
  referral_code           text,
  source                  text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  constraint ppo_session_unique unique (stripe_session_id)
);

-- ── order_discounts ───────────────────────────────────────────
create table if not exists order_discounts (
  id               uuid default gen_random_uuid() primary key,
  order_id         uuid references playlist_push_orders(id) on delete cascade not null,
  discount_code_id uuid references discount_codes(id) on delete set null,
  amount_applied   int default 0,
  created_at       timestamptz default now()
);

-- ── referrals (optional) ──────────────────────────────────────
create table if not exists referrals (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references profiles(id) on delete cascade not null,
  ref_code   text,
  source     text,
  created_at timestamptz default now()
);

-- Computed credits balance (use as view for convenience)
create or replace view credits_balance as
  select user_id, coalesce(sum(amount), 0)::int as balance
  from credits_ledger
  group by user_id;

-- ── payouts ───────────────────────────────────────────────────
create table if not exists payouts (
  id                 uuid default gen_random_uuid() primary key,
  curator_id         uuid references curator_profiles(id) on delete cascade not null,
  submission_id      uuid references submissions(id),
  amount             numeric(10,2) not null,
  status             text check (status in ('pending','released','failed')) default 'pending',
  stripe_transfer_id text,
  notes              text,
  created_at         timestamptz default now(),
  released_at        timestamptz
);

-- ── disputes ──────────────────────────────────────────────────
create table if not exists disputes (
  id           uuid default gen_random_uuid() primary key,
  campaign_id  uuid references campaigns(id),
  artist_id    uuid references profiles(id) not null,
  issue_summary text,
  user_message  text not null,
  admin_response text,
  internal_note  text,
  -- Thread is an append-only array of { at, by, kind, message }
  thread       jsonb default '[]'::jsonb,
  status       text check (status in ('open','handled','resolved')) default 'open',
  created_at   timestamptz default now(),
  handled_at   timestamptz,
  resolved_at  timestamptz
);

-- ── homepage_content ──────────────────────────────────────────
create table if not exists homepage_content (
  id             int primary key default 1,
  hero_headline  text default 'Get Your Music On Every Playlist That Matters',
  hero_subline   text default 'Submit once. Reach thousands of curators. Start for free.',
  hero_cta       text default 'Start Your Campaign',
  stats_streams  text default '40M+',
  stats_curators text default '1,200+',
  stats_artists  text default '18K+',
  stats_rating   text default '4.9',
  updated_at     timestamptz default now()
);
insert into homepage_content (id) values (1) on conflict do nothing;

-- ── pricing_settings ─────────────────────────────────────────
create table if not exists pricing_settings (
  id                int primary key default 1,
  platform_fee_pct  numeric(4,2) default 20.00,
  credit_to_usd     numeric(6,4) default 0.80,
  starter_credits   int default 10,
  starter_price     numeric(8,2) default 9.99,
  pro_credits       int default 25,
  pro_price         numeric(8,2) default 19.99,
  scale_credits     int default 60,
  scale_price       numeric(8,2) default 39.99,
  updated_at        timestamptz default now()
);
insert into pricing_settings (id) values (1) on conflict do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles           enable row level security;
alter table songs              enable row level security;
alter table curator_profiles   enable row level security;
alter table curator_playlists  enable row level security;
alter table campaigns          enable row level security;
alter table submissions        enable row level security;
alter table credits_ledger     enable row level security;
alter table discount_codes     enable row level security;
alter table playlist_push_orders enable row level security;
alter table order_discounts    enable row level security;
alter table referrals          enable row level security;
alter table payouts            enable row level security;
alter table disputes           enable row level security;
alter table homepage_content   enable row level security;
alter table pricing_settings   enable row level security;

-- Helper: get current user role
create or replace function current_user_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- profiles: read own, admin reads all
drop policy if exists "profiles_own"   on profiles;
drop policy if exists "profiles_admin" on profiles;
create policy "profiles_read_own"   on profiles for select using (id = auth.uid());
create policy "profiles_update_own" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_all"  on profiles for all using (current_user_role() = 'admin');

-- songs: artist owns, all can read (marketplace)
create policy "songs_owner"       on songs for all    using (artist_id = auth.uid());
create policy "songs_public_read" on songs for select using (true);

-- curator_profiles: curator owns, all can read
create policy "curator_own"       on curator_profiles for all    using (id = auth.uid());
create policy "curator_pub_read"  on curator_profiles for select using (true);
create policy "curator_admin"     on curator_profiles for all    using (current_user_role() = 'admin');

-- curator_playlists: curator owns, all can read
create policy "cpl_own"           on curator_playlists for all    using (curator_id = auth.uid());
create policy "cpl_pub_read"      on curator_playlists for select using (true);

-- campaigns: artist owns, admin sees all
create policy "camp_owner"        on campaigns for all    using (artist_id = auth.uid());
create policy "camp_admin"        on campaigns for all    using (current_user_role() = 'admin');
create policy "camp_curator_read" on campaigns for select using (
  exists (select 1 from submissions s where s.campaign_id = id and s.curator_id = auth.uid())
);

-- submissions: curator sees own, artist sees via campaign, admin all
create policy "sub_curator"       on submissions for all    using (curator_id = auth.uid());
create policy "sub_admin"         on submissions for all    using (current_user_role() = 'admin');
create policy "sub_artist_read"   on submissions for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and c.artist_id = auth.uid())
);

-- credits: own only
create policy "credits_own"       on credits_ledger for all using (user_id = auth.uid());
create policy "credits_admin"     on credits_ledger for all using (current_user_role() = 'admin');

-- payouts: curator sees own, admin all
create policy "payout_curator"    on payouts for select using (curator_id = auth.uid());
create policy "payout_admin"      on payouts for all    using (current_user_role() = 'admin');

-- disputes: artist owns, admin all
create policy "dispute_owner"     on disputes for all    using (artist_id = auth.uid());
create policy "dispute_admin"     on disputes for all    using (current_user_role() = 'admin');

-- homepage + pricing: public read, admin write
create policy "cms_public_read"   on homepage_content  for select using (true);
create policy "cms_admin_write"   on homepage_content  for all    using (current_user_role() = 'admin');
create policy "price_public_read" on pricing_settings  for select using (true);
create policy "price_admin_write" on pricing_settings  for all    using (current_user_role() = 'admin');

-- discount_codes: admin only (server uses service role key; RLS here prevents client reads)
create policy "discount_admin_all" on discount_codes for all using (current_user_role() = 'admin');

-- playlist_push_orders: user owns, admin all
create policy "ppo_owner_all" on playlist_push_orders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ppo_admin_all" on playlist_push_orders for all using (current_user_role() = 'admin');

-- order_discounts: owner read via order, admin all
create policy "od_owner_read" on order_discounts for select using (
  exists (select 1 from playlist_push_orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "od_admin_all" on order_discounts for all using (current_user_role() = 'admin');

-- referrals: user owns, admin all
create policy "ref_owner_all" on referrals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ref_admin_all" on referrals for all using (current_user_role() = 'admin');

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists songs_artist_idx       on songs(artist_id);
create index if not exists songs_spotify_id_idx   on songs(spotify_id);
create index if not exists campaigns_artist_idx   on campaigns(artist_id);
create index if not exists campaigns_status_idx   on campaigns(status);
create index if not exists submissions_curator_idx on submissions(curator_id);
create index if not exists submissions_campaign_idx on submissions(campaign_id);
create index if not exists credits_user_idx        on credits_ledger(user_id);
create index if not exists ppo_user_idx           on playlist_push_orders(user_id);
create index if not exists ppo_status_idx         on playlist_push_orders(status);
create index if not exists discount_code_active_idx on discount_codes(active);
create index if not exists order_discounts_order_idx on order_discounts(order_id);
create index if not exists referrals_user_idx     on referrals(user_id);
create index if not exists payouts_curator_idx     on payouts(curator_id);

-- ── track_submissions ─────────────────────────────────────────
-- Simplified submission record created when artist submits via SubmitPage.
-- Distinct from the campaigns + submissions join — this is the artist-facing entry point.
create table if not exists track_submissions (
  id             uuid default gen_random_uuid() primary key,
  artist_id      uuid references profiles(id) on delete set null,
  song_id        uuid references songs(id) on delete set null,
  song_title     text not null,
  artist_name    text not null,
  spotify_url    text,
  artwork_url    text,
  genre          text,
  curator_ids    jsonb default '[]',   -- array of curator IDs/names from mock or real
  curator_names  text[],
  total_credits  int default 0,
  status         text check (status in ('pending','in_review','accepted','declined')) default 'pending',
  notes          text,
  created_at     timestamptz default now()
);

alter table track_submissions enable row level security;
create policy "ts_own"   on track_submissions for all    using (artist_id = auth.uid());
create policy "ts_admin" on track_submissions for all    using (current_user_role() = 'admin');
create index if not exists ts_artist_idx on track_submissions(artist_id);

-- ── playlist_submissions ──────────────────────────────────────
-- Curator submits their playlist to be listed on StreamEngine.
create table if not exists playlist_submissions (
  id             uuid default gen_random_uuid() primary key,
  curator_id     uuid references profiles(id) on delete set null,
  name           text not null,
  spotify_url    text,
  genre          text,
  description    text,
  submission_type text check (submission_type in ('Free','Paid','Invite Only')) default 'Free',
  status         text check (status in ('pending','approved','rejected')) default 'pending',
  admin_note     text,
  created_at     timestamptz default now()
);

alter table playlist_submissions enable row level security;
create policy "ps_own"   on playlist_submissions for all    using (curator_id = auth.uid());
create policy "ps_admin" on playlist_submissions for all    using (current_user_role() = 'admin');
create index if not exists ps_curator_idx on playlist_submissions(curator_id);

-- ── newsletter_signups ────────────────────────────────────────
create table if not exists newsletter_signups (
  id         uuid default gen_random_uuid() primary key,
  email      text not null unique,
  source     text default 'homepage',
  created_at timestamptz default now()
);

alter table newsletter_signups enable row level security;
-- Anyone can insert; only admin can read
create policy "nl_insert" on newsletter_signups for insert with check (true);
create policy "nl_admin"  on newsletter_signups for select using (current_user_role() = 'admin');

-- ── contact_inquiries ─────────────────────────────────────────
create table if not exists contact_inquiries (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  email      text not null,
  subject    text,
  message    text not null,
  status     text check (status in ('open','replied','closed')) default 'open',
  created_at timestamptz default now()
);

alter table contact_inquiries enable row level security;
create policy "ci_insert" on contact_inquiries for insert with check (true);
create policy "ci_admin"  on contact_inquiries for all    using (current_user_role() = 'admin');
