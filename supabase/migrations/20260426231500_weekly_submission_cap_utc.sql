-- Enforce weekly Playlist Push cap on the server with a single global reset:
-- Monday 00:00 UTC for everyone.

create or replace function weekly_cap_for_artist(p_artist_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select
    case lower(coalesce((select subscription_tier from profiles where id = p_artist_id), 'free'))
      when 'premium' then 40
      when 'pro' then 20
      else 10
    end;
$$;

create or replace function utc_week_start()
returns timestamptz
language sql
stable
as $$
  -- Postgres date_trunc('week', ...) starts on Monday.
  select (date_trunc('week', now() at time zone 'utc') at time zone 'utc');
$$;

create or replace function trg_enforce_weekly_campaign_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int;
  v_used int;
  v_t0 timestamptz;
begin
  -- Admin bypass.
  if current_user_role() = 'admin' then
    return new;
  end if;

  -- Only enforce for playlist campaigns that count toward the cap.
  if coalesce(new.campaign_type, 'playlist') <> 'playlist' then
    return new;
  end if;

  if coalesce(new.status, 'pending') = 'draft' then
    return new;
  end if;

  v_t0 := utc_week_start();
  v_cap := weekly_cap_for_artist(new.artist_id);

  select count(*)::int into v_used
  from campaigns c
  where c.artist_id = new.artist_id
    and coalesce(c.campaign_type, 'playlist') = 'playlist'
    and coalesce(c.status, 'pending') <> 'draft'
    and c.created_at >= v_t0;

  if v_used >= v_cap then
    raise exception 'WEEKLY_CAP_REACHED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_enforce_weekly_campaign_cap on campaigns;
create trigger tr_enforce_weekly_campaign_cap
  before insert on campaigns
  for each row execute function trg_enforce_weekly_campaign_cap();

grant execute on function weekly_cap_for_artist(uuid) to authenticated;
grant execute on function utc_week_start() to authenticated;

