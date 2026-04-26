-- Playlist Trader MVP (credits-only)
-- Listings by curators, offers by artists, escrow held in credits, delivery proofs.

-- ── Tables ───────────────────────────────────────────────────

create table if not exists playlist_trader_listings (
  id uuid default gen_random_uuid() primary key,
  curator_id uuid references profiles(id) on delete cascade not null,
  playlist_id uuid references curator_playlists(id) on delete set null,
  title text not null,
  description text,
  genre text,
  platform text default 'Spotify',
  follower_count int,
  turnaround text default '48h',
  price_credits int not null check (price_credits > 0),
  active bool default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ptl_curator_idx on playlist_trader_listings(curator_id);
create index if not exists ptl_active_idx on playlist_trader_listings(active);

create table if not exists playlist_trader_offers (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references playlist_trader_listings(id) on delete cascade not null,
  artist_id uuid references profiles(id) on delete cascade not null,
  song_id uuid references songs(id) on delete set null,
  message text,
  status text not null check (status in ('sent','accepted','rejected','funded','delivered','completed','disputed','cancelled')) default 'sent',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint pto_one_open_offer_per_listing_artist unique (listing_id, artist_id)
);

create index if not exists pto_listing_idx on playlist_trader_offers(listing_id);
create index if not exists pto_artist_idx on playlist_trader_offers(artist_id);
create index if not exists pto_status_idx on playlist_trader_offers(status);

create table if not exists playlist_trader_escrows (
  id uuid default gen_random_uuid() primary key,
  offer_id uuid references playlist_trader_offers(id) on delete cascade not null,
  artist_id uuid references profiles(id) on delete cascade not null,
  curator_id uuid references profiles(id) on delete cascade not null,
  amount_credits int not null check (amount_credits > 0),
  status text not null check (status in ('held','released','refunded')) default 'held',
  stripe_payment_id text, -- optional, for future mixed-mode; unused in credits MVP
  created_at timestamptz default now(),
  released_at timestamptz,
  refunded_at timestamptz,
  constraint pte_one_per_offer unique (offer_id)
);

create index if not exists pte_artist_idx on playlist_trader_escrows(artist_id);
create index if not exists pte_curator_idx on playlist_trader_escrows(curator_id);
create index if not exists pte_status_idx on playlist_trader_escrows(status);

create table if not exists playlist_trader_delivery_proofs (
  id uuid default gen_random_uuid() primary key,
  offer_id uuid references playlist_trader_offers(id) on delete cascade not null,
  curator_id uuid references profiles(id) on delete cascade not null,
  proof_type text not null check (proof_type in ('spotify_link','note','screenshot_url')),
  payload text not null,
  created_at timestamptz default now()
);

create index if not exists ptdp_offer_idx on playlist_trader_delivery_proofs(offer_id);

-- ── RLS ──────────────────────────────────────────────────────

alter table playlist_trader_listings enable row level security;
alter table playlist_trader_offers enable row level security;
alter table playlist_trader_escrows enable row level security;
alter table playlist_trader_delivery_proofs enable row level security;

-- Listings: public read; curator owns writes; admin all.
drop policy if exists "ptl_public_read" on playlist_trader_listings;
drop policy if exists "ptl_curator_write" on playlist_trader_listings;
drop policy if exists "ptl_admin_all" on playlist_trader_listings;

create policy "ptl_public_read" on playlist_trader_listings for select using (true);
create policy "ptl_curator_write" on playlist_trader_listings
  for all
  using (curator_id = auth.uid())
  with check (curator_id = auth.uid());
create policy "ptl_admin_all" on playlist_trader_listings for all using (current_user_role() = 'admin');

-- Offers: artist can create/read own; curator can read offers on their listings + update status; admin all.
drop policy if exists "pto_artist_own" on playlist_trader_offers;
drop policy if exists "pto_curator_listing" on playlist_trader_offers;
drop policy if exists "pto_admin_all" on playlist_trader_offers;

create policy "pto_artist_own" on playlist_trader_offers
  for all
  using (artist_id = auth.uid())
  with check (artist_id = auth.uid());

create policy "pto_curator_listing" on playlist_trader_offers
  for select
  using (
    exists (
      select 1
      from playlist_trader_listings l
      where l.id = listing_id and l.curator_id = auth.uid()
    )
  );

create policy "pto_curator_listing_update" on playlist_trader_offers
  for update
  using (
    exists (
      select 1
      from playlist_trader_listings l
      where l.id = listing_id and l.curator_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from playlist_trader_listings l
      where l.id = listing_id and l.curator_id = auth.uid()
    )
  );

create policy "pto_admin_all" on playlist_trader_offers for all using (current_user_role() = 'admin');

-- Escrows: artist+curator can read if party; writes only via security definer RPC.
drop policy if exists "pte_party_read" on playlist_trader_escrows;
drop policy if exists "pte_admin_all" on playlist_trader_escrows;

create policy "pte_party_read" on playlist_trader_escrows
  for select
  using (artist_id = auth.uid() or curator_id = auth.uid());

create policy "pte_admin_all" on playlist_trader_escrows for all using (current_user_role() = 'admin');

-- Delivery proofs: artist+curator can read if party; curator can insert for own offers.
drop policy if exists "ptdp_party_read" on playlist_trader_delivery_proofs;
drop policy if exists "ptdp_curator_insert" on playlist_trader_delivery_proofs;
drop policy if exists "ptdp_admin_all" on playlist_trader_delivery_proofs;

create policy "ptdp_party_read" on playlist_trader_delivery_proofs
  for select
  using (
    curator_id = auth.uid()
    or exists (select 1 from playlist_trader_offers o where o.id = offer_id and o.artist_id = auth.uid())
  );

create policy "ptdp_curator_insert" on playlist_trader_delivery_proofs
  for insert
  with check (
    curator_id = auth.uid()
    and exists (
      select 1
      from playlist_trader_offers o
      join playlist_trader_listings l on l.id = o.listing_id
      where o.id = offer_id and l.curator_id = auth.uid()
    )
  );

create policy "ptdp_admin_all" on playlist_trader_delivery_proofs for all using (current_user_role() = 'admin');

-- ── Credits escrow RPC (atomic) ───────────────────────────────

-- Returns current credits balance for a user (RLS-safe via security definer).
create or replace function credits_balance_for_user(uid uuid)
returns int
language sql
security definer
stable
as $$
  select coalesce(sum(amount), 0)::int from credits_ledger where user_id = uid
$$;

-- Fund escrow: debits artist credits and creates escrow row (idempotent by offer_id uniqueness).
create or replace function playlist_trader_fund_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_artist uuid;
  v_listing uuid;
  v_curator uuid;
  v_price int;
  v_status text;
  v_bal int;
  v_escrow_id uuid;
begin
  select o.artist_id, o.listing_id, o.status
    into v_artist, v_listing, v_status
  from playlist_trader_offers o
  where o.id = p_offer_id;

  if v_artist is null then
    return jsonb_build_object('ok', false, 'error', 'Offer not found');
  end if;

  if v_artist <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;

  select l.curator_id, l.price_credits into v_curator, v_price
  from playlist_trader_listings l
  where l.id = v_listing;

  if v_curator is null then
    return jsonb_build_object('ok', false, 'error', 'Listing not found');
  end if;

  if v_status not in ('accepted','sent') then
    return jsonb_build_object('ok', false, 'error', 'Offer not eligible to fund');
  end if;

  v_bal := credits_balance_for_user(v_artist);
  if v_bal < v_price then
    return jsonb_build_object('ok', false, 'error', 'Insufficient credits');
  end if;

  -- Create escrow row (unique per offer) and debit artist
  insert into playlist_trader_escrows (offer_id, artist_id, curator_id, amount_credits, status)
  values (p_offer_id, v_artist, v_curator, v_price, 'held')
  on conflict (offer_id) do update set offer_id = excluded.offer_id
  returning id into v_escrow_id;

  -- Debit credits ledger idempotently using escrow id as stripe_payment_id-like token
  insert into credits_ledger (user_id, amount, reason, stripe_payment_id)
  values (v_artist, -v_price, 'trader_escrow_hold', 'pte_' || v_escrow_id::text)
  on conflict do nothing;

  update playlist_trader_offers set status = 'funded', updated_at = now()
  where id = p_offer_id;

  return jsonb_build_object('ok', true, 'escrow_id', v_escrow_id, 'amount_credits', v_price);
end;
$$;

-- Release escrow to curator: credits curator, marks escrow released, marks offer completed.
create or replace function playlist_trader_release_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_curator uuid;
  v_artist uuid;
  v_amount int;
  v_status text;
  v_eid uuid;
begin
  select e.id, e.curator_id, e.artist_id, e.amount_credits, e.status
    into v_eid, v_curator, v_artist, v_amount, v_status
  from playlist_trader_escrows e
  where e.offer_id = p_offer_id;

  if v_eid is null then
    return jsonb_build_object('ok', false, 'error', 'Escrow not found');
  end if;

  -- Only the artist (release) or admin for now.
  if auth.uid() <> v_artist and current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;

  if v_status <> 'held' then
    return jsonb_build_object('ok', false, 'error', 'Escrow is not held');
  end if;

  update playlist_trader_escrows
    set status = 'released', released_at = now()
  where id = v_eid;

  insert into credits_ledger (user_id, amount, reason, stripe_payment_id)
  values (v_curator, v_amount, 'trader_escrow_release', 'pte_release_' || v_eid::text)
  on conflict do nothing;

  update playlist_trader_offers set status = 'completed', updated_at = now()
  where id = p_offer_id;

  return jsonb_build_object('ok', true, 'released', true, 'amount_credits', v_amount);
end;
$$;

-- Refund escrow back to artist (admin only in MVP).
create or replace function playlist_trader_refund_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_curator uuid;
  v_artist uuid;
  v_amount int;
  v_status text;
  v_eid uuid;
begin
  if current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Admin only');
  end if;

  select e.id, e.curator_id, e.artist_id, e.amount_credits, e.status
    into v_eid, v_curator, v_artist, v_amount, v_status
  from playlist_trader_escrows e
  where e.offer_id = p_offer_id;

  if v_eid is null then
    return jsonb_build_object('ok', false, 'error', 'Escrow not found');
  end if;

  if v_status <> 'held' then
    return jsonb_build_object('ok', false, 'error', 'Escrow is not held');
  end if;

  update playlist_trader_escrows
    set status = 'refunded', refunded_at = now()
  where id = v_eid;

  insert into credits_ledger (user_id, amount, reason, stripe_payment_id)
  values (v_artist, v_amount, 'trader_escrow_refund', 'pte_refund_' || v_eid::text)
  on conflict do nothing;

  update playlist_trader_offers set status = 'refunded', updated_at = now()
  where id = p_offer_id;

  return jsonb_build_object('ok', true, 'refunded', true, 'amount_credits', v_amount);
end;
$$;

