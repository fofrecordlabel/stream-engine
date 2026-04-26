-- Interactive onboarding (coach persistence), Playlist Trader escrow fixes,
-- disputes, artist 14-day timeout refund, in-app notifications + offer lifecycle triggers.

-- ── Profiles: coach persistence ──────────────────────────────
alter table profiles add column if not exists onboarding_step int default 0;
alter table profiles add column if not exists onboarding_version int default 1;
alter table profiles add column if not exists onboarding_coach_dismissed_at timestamptz;

update profiles set onboarding_step = 0 where onboarding_step is null;
update profiles set onboarding_version = 1 where onboarding_version is null;

-- ── Offers: funded / dispute / refunded status ────────────────
alter table playlist_trader_offers add column if not exists funded_at timestamptz;
alter table playlist_trader_offers add column if not exists dispute_reason text;
alter table playlist_trader_offers add column if not exists dispute_opened_at timestamptz;

alter table playlist_trader_offers drop constraint if exists playlist_trader_offers_status_check;
alter table playlist_trader_offers add constraint playlist_trader_offers_status_check
  check (status in ('sent','accepted','rejected','funded','delivered','completed','disputed','cancelled','refunded'));

-- ── Notifications ─────────────────────────────────────────────
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  meta jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_user_created_idx on notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications(user_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists "notifications_own_select" on notifications;
drop policy if exists "notifications_own_update" on notifications;
drop policy if exists "notifications_admin_all" on notifications;

create policy "notifications_own_select" on notifications for select using (user_id = auth.uid());
create policy "notifications_own_update" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_admin_all" on notifications for all using (current_user_role() = 'admin');

create or replace function internal_insert_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_meta jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into notifications (user_id, kind, title, body, meta)
  values (p_user_id, p_kind, p_title, coalesce(p_body, ''), coalesce(p_meta, '{}'::jsonb));
end;
$$;

create or replace function tr_playlist_trader_offer_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cur uuid;
begin
  if tg_op = 'INSERT' then
    select l.curator_id into cur from playlist_trader_listings l where l.id = new.listing_id;
    perform internal_insert_notification(
      cur,
      'trader_offer_new',
      'New Playlist Trader offer',
      left(coalesce(new.message, ''), 500),
      jsonb_build_object('offer_id', new.id, 'listing_id', new.listing_id)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'accepted' and coalesce(old.status, '') <> 'accepted' then
      perform internal_insert_notification(
        new.artist_id,
        'trader_offer_accepted',
        'Offer accepted',
        'Fund escrow to start the deal.',
        jsonb_build_object('offer_id', new.id, 'listing_id', new.listing_id)
      );
    end if;

    if new.status = 'funded' and coalesce(old.status, '') <> 'funded' then
      select l.curator_id into cur from playlist_trader_listings l where l.id = new.listing_id;
      perform internal_insert_notification(
        cur,
        'trader_escrow_funded',
        'Escrow funded',
        'Deliver proof to complete the trade.',
        jsonb_build_object('offer_id', new.id, 'listing_id', new.listing_id)
      );
    end if;

    if new.status = 'delivered' and coalesce(old.status, '') <> 'delivered' then
      perform internal_insert_notification(
        new.artist_id,
        'trader_delivery_posted',
        'Delivery posted',
        'Review proof and release escrow when satisfied.',
        jsonb_build_object('offer_id', new.id, 'listing_id', new.listing_id)
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_playlist_trader_offer_notify_ins on playlist_trader_offers;
create trigger tr_playlist_trader_offer_notify_ins
  after insert on playlist_trader_offers
  for each row execute function tr_playlist_trader_offer_notify();

drop trigger if exists tr_playlist_trader_offer_notify_upd on playlist_trader_offers;
create trigger tr_playlist_trader_offer_notify_upd
  after update on playlist_trader_offers
  for each row execute function tr_playlist_trader_offer_notify();

-- ── Escrow RPCs (replace) ────────────────────────────────────

create or replace function playlist_trader_fund_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  if v_status is distinct from 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'Offer must be accepted before funding');
  end if;

  select l.curator_id, l.price_credits into v_curator, v_price
  from playlist_trader_listings l
  where l.id = v_listing;

  if v_curator is null then
    return jsonb_build_object('ok', false, 'error', 'Listing not found');
  end if;

  v_bal := credits_balance_for_user(v_artist);
  if v_bal < v_price then
    return jsonb_build_object('ok', false, 'error', 'Insufficient credits');
  end if;

  insert into playlist_trader_escrows (offer_id, artist_id, curator_id, amount_credits, status)
  values (p_offer_id, v_artist, v_curator, v_price, 'held')
  on conflict (offer_id) do update set offer_id = excluded.offer_id
  returning id into v_escrow_id;

  insert into credits_ledger (user_id, amount, reason, stripe_payment_id)
  values (v_artist, -v_price, 'trader_escrow_hold', 'pte_' || v_escrow_id::text)
  on conflict do nothing;

  update playlist_trader_offers
  set status = 'funded', funded_at = coalesce(funded_at, now()), updated_at = now()
  where id = p_offer_id;

  return jsonb_build_object('ok', true, 'escrow_id', v_escrow_id, 'amount_credits', v_price);
end;
$$;

create or replace function playlist_trader_release_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curator uuid;
  v_artist uuid;
  v_amount int;
  v_escrow_status text;
  v_offer_status text;
  v_eid uuid;
begin
  select e.id, e.curator_id, e.artist_id, e.amount_credits, e.status, o.status
    into v_eid, v_curator, v_artist, v_amount, v_escrow_status, v_offer_status
  from playlist_trader_escrows e
  join playlist_trader_offers o on o.id = e.offer_id
  where e.offer_id = p_offer_id;

  if v_eid is null then
    return jsonb_build_object('ok', false, 'error', 'Escrow not found');
  end if;

  if auth.uid() <> v_artist and current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;

  if v_offer_status = 'disputed' and current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Disputed trades require admin resolution');
  end if;

  if v_offer_status is distinct from 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'Delivery required before release');
  end if;

  if v_escrow_status is distinct from 'held' then
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

create or replace function playlist_trader_refund_escrow(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid;
  v_amount int;
  v_escrow_status text;
  v_offer_status text;
  v_funded_at timestamptz;
  v_eid uuid;
  v_allowed boolean := false;
begin
  select e.id, e.artist_id, e.amount_credits, e.status, o.status, o.funded_at
    into v_eid, v_artist, v_amount, v_escrow_status, v_offer_status, v_funded_at
  from playlist_trader_escrows e
  join playlist_trader_offers o on o.id = e.offer_id
  where e.offer_id = p_offer_id;

  if v_eid is null then
    return jsonb_build_object('ok', false, 'error', 'Escrow not found');
  end if;

  if v_escrow_status is distinct from 'held' then
    return jsonb_build_object('ok', false, 'error', 'Escrow is not held');
  end if;

  if v_offer_status = 'disputed' and current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Disputed trades require admin refund');
  end if;

  if current_user_role() = 'admin' then
    v_allowed := true;
  elsif auth.uid() = v_artist
    and v_offer_status = 'funded'
    and v_funded_at is not null
    and v_funded_at < (now() - interval '14 days') then
    v_allowed := true;
  end if;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'Refund not allowed (admin only, or 14-day timeout as artist on funded offers)');
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

create or replace function playlist_trader_open_dispute(p_offer_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist uuid;
  v_curator uuid;
  v_escrow_status text;
  v_offer_status text;
begin
  select o.artist_id, l.curator_id, e.status, o.status
    into v_artist, v_curator, v_escrow_status, v_offer_status
  from playlist_trader_offers o
  join playlist_trader_listings l on l.id = o.listing_id
  left join playlist_trader_escrows e on e.offer_id = o.id
  where o.id = p_offer_id;

  if v_artist is null then
    return jsonb_build_object('ok', false, 'error', 'Offer not found');
  end if;

  if auth.uid() not in (v_artist, v_curator) and current_user_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;

  if v_escrow_status is distinct from 'held' then
    return jsonb_build_object('ok', false, 'error', 'Disputes only apply while escrow is held');
  end if;

  if v_offer_status not in ('funded','delivered') then
    return jsonb_build_object('ok', false, 'error', 'Offer not eligible for dispute');
  end if;

  update playlist_trader_offers
  set status = 'disputed',
      dispute_reason = left(coalesce(p_reason, ''), 2000),
      dispute_opened_at = now(),
      updated_at = now()
  where id = p_offer_id;

  if auth.uid() = v_artist then
    perform internal_insert_notification(v_curator, 'trader_dispute', 'Trade disputed', left(coalesce(p_reason,''), 500), jsonb_build_object('offer_id', p_offer_id));
  elsif auth.uid() = v_curator then
    perform internal_insert_notification(v_artist, 'trader_dispute', 'Trade disputed', left(coalesce(p_reason,''), 500), jsonb_build_object('offer_id', p_offer_id));
  else
    perform internal_insert_notification(v_artist, 'trader_dispute', 'Trade disputed (admin)', left(coalesce(p_reason,''), 500), jsonb_build_object('offer_id', p_offer_id));
    perform internal_insert_notification(v_curator, 'trader_dispute', 'Trade disputed (admin)', left(coalesce(p_reason,''), 500), jsonb_build_object('offer_id', p_offer_id));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function playlist_trader_open_dispute(uuid, text) to authenticated;
grant execute on function playlist_trader_open_dispute(uuid, text) to service_role;
