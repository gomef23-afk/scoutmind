-- 029 — Ownership multiplier, SHADOW ONLY; picks visible from the deadline
-- (17 Nov 2026)
--
-- Re-runnable: every object is created with IF NOT EXISTS / OR REPLACE, or
-- dropped first. Run it whole in the SQL editor.
--
-- 1. The ownership ladder (plan A, decisions of 17 Nov): a pick's multiplier
--    from the share of the round's entries that picked the player, the fewer
--    the higher, capped at x1.4. The bands reuse the five tier words, so the
--    chip "Underrated x1.20" reads the same in both modes:
--      >= 30%  -> tier 5 Star        x1.00
--      15-30%  -> tier 4 Proven      x1.05
--      7.5-15% -> tier 3 Steady      x1.10
--      3-7.5%  -> tier 2 Underrated  x1.20
--      < 3%    -> tier 1 Hidden gem  x1.40
--    Below 20 entries in a round the performance tiers apply, as today.
--    The numbers live in api/_lib/scout-game.js; the stats job writes them to
--    game_config and hands them to lock_due_rounds(), like the tier ladder.
--
-- 2. ownership_live is FALSE. Live scoring does not change: every round still
--    locks in 'tier' mode. At each lock the ownership band of every pick is
--    recorded in game_shadow_picks, and the stats job scores it beside the
--    real score (shadow_total). Nobody but the SQL editor reads that table.
--
-- 3. The contrarian +0.5 is retired: lock_due_rounds() no longer sets
--    locked_contrarian (always false from now on). The column stays for the
--    rounds already locked.
--
-- 4. game_ownership_bands(round): the live band of each picked player in an
--    open round, for the pick screen once ownership goes live. Bands only,
--    never a percentage or a count; nothing at all while ownership_live is
--    false or the round has fewer than the minimum entries.
--
-- 5. Someone else's entry, picks and scores become readable at the deadline
--    itself, not when the stats job locks the round (up to 15 minutes later).
--    Picks are frozen at the deadline already (submit_picks and 017's
--    restrictive policies), so nothing can change once they are visible.
--
-- Verification query at the end of the file.

-- ---------------------------------------------------------------------------
-- 1. COLUMNS
-- ---------------------------------------------------------------------------
alter table public.game_rounds
  add column if not exists multiplier_mode text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_rounds_multiplier_mode_check') then
    alter table public.game_rounds
      add constraint game_rounds_multiplier_mode_check check (multiplier_mode in ('tier', 'ownership'));
  end if;
end $$;

-- Every round locked before 029 was scored on the performance tiers.
update public.game_rounds set multiplier_mode = 'tier'
 where status <> 'open' and multiplier_mode is null;

alter table public.game_config
  add column if not exists ownership_ladder jsonb not null default
    '[{"min_pct":30,"tier":5,"multiplier":1},{"min_pct":15,"tier":4,"multiplier":1.05},{"min_pct":7.5,"tier":3,"multiplier":1.1},{"min_pct":3,"tier":2,"multiplier":1.2},{"min_pct":0,"tier":1,"multiplier":1.4}]'::jsonb,
  add column if not exists ownership_min_participants integer not null default 20,
  add column if not exists ownership_live boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. THE SHADOW TABLE
-- ---------------------------------------------------------------------------
-- One row per pick of every round locked from now on: what the ownership
-- ladder would have paid. Written by lock_due_rounds() (band) and the stats
-- job (shadow_base / shadow_total, recomputed with each scoring pass).
create table if not exists public.game_shadow_picks (
  entry_id       bigint       not null,
  slot           smallint     not null,
  round_id       bigint       not null references public.game_rounds(id),
  player_id      bigint       not null,
  ownership_pct  numeric(6,2) not null,
  band           smallint     not null,
  multiplier     numeric      not null,
  participants   integer      not null,
  would_apply    boolean      not null,   -- participants >= the minimum at lock
  live_mode      text         not null,   -- the mode the round was really scored in
  shadow_base    numeric,                 -- null until the pick has a scored fixture
  shadow_total   numeric,
  scored_at      timestamptz,
  created_at     timestamptz  not null default now(),
  primary key (entry_id, slot),
  foreign key (entry_id, slot) references public.game_picks(entry_id, slot) on delete cascade
);
create index if not exists game_shadow_picks_round_idx on public.game_shadow_picks (round_id);

-- RLS on, no policy: the browser reads and writes nothing here. The stats job
-- (service_role) and the SQL editor do.
alter table public.game_shadow_picks enable row level security;
revoke all on public.game_shadow_picks from public, anon, authenticated;
grant select, insert, update on public.game_shadow_picks to service_role;

-- ---------------------------------------------------------------------------
-- 3. THE BAND FOR AN OWNERSHIP PERCENTAGE
-- ---------------------------------------------------------------------------
-- The highest band whose min_pct the percentage reaches; null pct = nobody
-- picked him = 0%. Mirrors ownershipBand() in api/_lib/scout-game.js.
create or replace function public.ownership_band(p_pct numeric, p_ladder jsonb)
returns table (tier smallint, multiplier numeric)
language sql
immutable
set search_path = ''
as $$
  select (b ->> 'tier')::smallint, (b ->> 'multiplier')::numeric
    from jsonb_array_elements(p_ladder) b
   where coalesce(p_pct, 0) >= (b ->> 'min_pct')::numeric
   order by (b ->> 'min_pct')::numeric desc
   limit 1
$$;
revoke all on function public.ownership_band(numeric, jsonb) from public, anon, authenticated;
grant execute on function public.ownership_band(numeric, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. LOCK: tier or ownership mode, the shadow rows, no contrarian
-- ---------------------------------------------------------------------------
-- The 017 signature goes; the stats job calls the new one and falls back to
-- the old one only while this migration has not run (rule 21).
drop function if exists public.lock_due_rounds(jsonb, numeric, numeric, integer);

create or replace function public.lock_due_rounds(
  p_ladder jsonb, p_unranked numeric, p_own_ladder jsonb, p_own_min integer, p_own_live boolean)
returns setof bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r      record;
  v_n    integer;
  v_mode text;
  v_min  integer := coalesce(p_own_min, 20);
begin
  for r in
    select * from public.game_rounds
     where status = 'open' and deadline_utc <= now()
     order by deadline_utc
  loop
    select count(*) into v_n from public.game_entries e where e.round_id = r.id;
    v_mode := case when coalesce(p_own_live, false) and v_n >= v_min then 'ownership' else 'tier' end;

    -- Nobody played: nothing to snapshot.
    if v_n = 0 then
      update public.game_rounds
         set status = 'locked', locked_at = now(), participants = 0, multiplier_mode = v_mode, updated_at = now()
       where id = r.id;
      return next r.id;
      continue;
    end if;

    with t as (
      select * from public.player_tiers_at(r.league_id, r.season, r.deadline_utc)
    ),
    own as (
      select gp.player_id, 100.0 * count(distinct gp.entry_id) / v_n as pct
        from public.game_picks gp where gp.round_id = r.id
       group by gp.player_id
    ),
    b as (
      select own.player_id, ob.tier, ob.multiplier
        from own cross join lateral public.ownership_band(own.pct, p_own_ladder) ob
    )
    update public.game_picks gp
       set locked_tier          = case when v_mode = 'ownership'
                                    then (select b.tier from b where b.player_id = gp.player_id)
                                    else (select t.tier from t where t.player_id = gp.player_id) end,
           locked_multiplier    = case when v_mode = 'ownership'
                                    then coalesce((select b.multiplier from b where b.player_id = gp.player_id), p_unranked)
                                    else coalesce(
                                      (p_ladder ->> ((select t.tier from t where t.player_id = gp.player_id))::text)::numeric,
                                      p_unranked) end,
           locked_ownership_pct = (select round(own.pct, 2) from own where own.player_id = gp.player_id),
           locked_contrarian    = false,   -- retired 17 Nov 2026 (029)
           locked_at            = now()
     where gp.round_id = r.id;

    -- The shadow: what the ownership ladder pays, whatever the mode.
    insert into public.game_shadow_picks as s
           (entry_id, slot, round_id, player_id, ownership_pct, band, multiplier,
            participants, would_apply, live_mode, created_at)
    select gp.entry_id, gp.slot, r.id, gp.player_id, round(o.pct, 2), ob.tier, ob.multiplier,
           v_n, v_n >= v_min, v_mode, now()
      from public.game_picks gp
      join (select g2.player_id, 100.0 * count(distinct g2.entry_id) / v_n as pct
              from public.game_picks g2 where g2.round_id = r.id
             group by g2.player_id) o on o.player_id = gp.player_id
      cross join lateral public.ownership_band(o.pct, p_own_ladder) ob
     where gp.round_id = r.id
    on conflict (entry_id, slot) do update
       set round_id = excluded.round_id, player_id = excluded.player_id,
           ownership_pct = excluded.ownership_pct, band = excluded.band,
           multiplier = excluded.multiplier, participants = excluded.participants,
           would_apply = excluded.would_apply, live_mode = excluded.live_mode;

    update public.game_rounds
       set status = 'locked', locked_at = now(), participants = v_n, multiplier_mode = v_mode, updated_at = now()
     where id = r.id;

    return next r.id;
  end loop;
end;
$$;
revoke all on function public.lock_due_rounds(jsonb, numeric, jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.lock_due_rounds(jsonb, numeric, jsonb, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 5. THE LIVE BAND WHILE PICKING (used once ownership goes live)
-- ---------------------------------------------------------------------------
-- {active, reason, bands:[{player_id, tier, multiplier}], unpicked:{tier,multiplier}}
-- Bands only: no percentage, no count, no names. Inactive (empty) while
-- ownership_live is false, when the round is not open or past its deadline,
-- and below the minimum entries.
create or replace function public.game_ownership_bands(p_round_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r   public.game_rounds%rowtype;
  c   public.game_config%rowtype;
  v_n integer;
begin
  select * into c from public.game_config limit 1;
  if not found or not coalesce(c.ownership_live, false) then
    return jsonb_build_object('active', false, 'reason', 'off', 'bands', '[]'::jsonb);
  end if;
  select * into r from public.game_rounds where id = p_round_id;
  if not found or r.status <> 'open' or r.deadline_utc <= now() then
    return jsonb_build_object('active', false, 'reason', 'closed', 'bands', '[]'::jsonb);
  end if;
  select count(*) into v_n from public.game_entries e where e.round_id = p_round_id;
  if v_n < c.ownership_min_participants then
    return jsonb_build_object('active', false, 'reason', 'few', 'min', c.ownership_min_participants, 'bands', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'active', true,
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object('player_id', o.player_id, 'tier', ob.tier, 'multiplier', ob.multiplier)
                       order by o.player_id)
        from (select gp.player_id, 100.0 * count(distinct gp.entry_id) / v_n as pct
                from public.game_picks gp where gp.round_id = p_round_id
               group by gp.player_id) o
        cross join lateral public.ownership_band(o.pct, c.ownership_ladder) ob), '[]'::jsonb),
    'unpicked', (select jsonb_build_object('tier', ob.tier, 'multiplier', ob.multiplier)
                   from public.ownership_band(0, c.ownership_ladder) ob));
end;
$$;
revoke all on function public.game_ownership_bands(bigint) from public;
grant execute on function public.game_ownership_bands(bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. OTHER PEOPLE'S PICKS FROM THE DEADLINE
-- ---------------------------------------------------------------------------
drop policy if exists "game_entries: own, or after lock" on public.game_entries;
drop policy if exists "game_entries: own, or after the deadline" on public.game_entries;
create policy "game_entries: own, or after the deadline" on public.game_entries
  for select to anon, authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.game_rounds g
                     where g.id = round_id and (g.status <> 'open' or g.deadline_utc <= now())));

drop policy if exists "game_picks: own, or after lock" on public.game_picks;
drop policy if exists "game_picks: own, or after the deadline" on public.game_picks;
create policy "game_picks: own, or after the deadline" on public.game_picks
  for select to anon, authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.game_rounds g
                     where g.id = round_id and (g.status <> 'open' or g.deadline_utc <= now())));

drop policy if exists "game_pick_scores: after lock" on public.game_pick_scores;
drop policy if exists "game_pick_scores: after the deadline" on public.game_pick_scores;
create policy "game_pick_scores: after the deadline" on public.game_pick_scores
  for select to anon, authenticated
  using (exists (select 1 from public.game_rounds g
                  where g.id = round_id and (g.status <> 'open' or g.deadline_utc <= now())));

-- ---------------------------------------------------------------------------
-- VERIFICATION (run after the file; each line should say true)
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) = 1 from information_schema.columns
--     where table_name = 'game_rounds' and column_name = 'multiplier_mode')               as rounds_have_mode,
--   (select ownership_live = false and ownership_min_participants = 20
--      and jsonb_array_length(ownership_ladder) = 5 from public.game_config)               as config_shadow_off,
--   (select relrowsecurity from pg_class where oid = 'public.game_shadow_picks'::regclass) as shadow_rls_on,
--   not has_table_privilege('anon', 'public.game_shadow_picks', 'select')
--     and not has_table_privilege('authenticated', 'public.game_shadow_picks', 'select')  as shadow_closed_to_browser,
--   (select array_agg(tier || ':' || multiplier order by p)
--      = array['1:1.4','2:1.2','3:1.1','4:1.05','5:1']
--      from (select p, (public.ownership_band(p, c.ownership_ladder)).*
--              from unnest(array[0, 3, 7.5, 15, 30]::numeric[]) p, public.game_config c) x)  as ladder_edges,
--   to_regprocedure('public.lock_due_rounds(jsonb,numeric,numeric,integer)') is null
--     and to_regprocedure('public.lock_due_rounds(jsonb,numeric,jsonb,integer,boolean)') is not null as lock_replaced,
--   (public.game_ownership_bands(0) ->> 'reason') = 'off'                                  as bands_off_while_shadow,
--   (select count(*) = 3 from pg_policy
--     where polrelid in ('public.game_entries'::regclass, 'public.game_picks'::regclass, 'public.game_pick_scores'::regclass)
--       and polcmd = 'r' and pg_get_expr(polqual, polrelid) like '%deadline_utc <= now()%') as picks_open_at_deadline,
--   (select count(*) = 0 from public.game_rounds where status <> 'open' and multiplier_mode is null) as old_rounds_tier;
