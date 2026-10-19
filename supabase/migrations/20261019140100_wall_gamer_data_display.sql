-- My Gamer Data: Favorite Games Display Style (Mazen's task 2026-10-19) - GamID TESTING only. PROPOSED: not applied until Mazen authorizes it. Additive.
--
-- A Classic section binding (gamidData field "section", both forms) may carry an optional "display": "names" (the default - the text design, also when the
-- key is absent, so every saved Wall stays exactly as it is) or "covers" (Game Covers). Anything else is INVALID_DATA_DISPLAY. Same rules as
-- dist/wall-kit/gamid-data.js; the shared corpus checks both.

-- copied from 20261019120100_wall_gamer_data_binding.sql; changed: the optional "display" key and its INVALID_DATA_DISPLAY check
create or replace function private.wall_gamid_data_errors(payload jsonb)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  f text;
  allowed text[];
  look jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then return array['PAYLOAD_NOT_OBJECT']; end if;
  if jsonb_typeof(payload -> 'field') is distinct from 'string'
     or (payload ->> 'field') not in ('avatar', 'displayName', 'handle', 'bio', 'role', 'roles', 'game', 'games', 'connection', 'connections', 'section') then
    return array['INVALID_DATA_FIELD'];
  end if;
  f := payload ->> 'field';
  allowed := case f
    when 'avatar' then array['look']
    when 'role' then array['ref', 'text'] when 'game' then array['ref', 'text'] when 'connection' then array['ref', 'text', 'withLabel']
    when 'roles' then array['style', 'layout'] when 'connections' then array['style', 'layout'] when 'games' then array['style', 'layout', 'initial', 'showPlaytime']
    when 'section' then case when private.wall_is_set(payload -> 'item') then array['section', 'item', 'text', 'display'] else array['section', 'style', 'layout', 'display'] end
    else array['text'] end;
  if not private.wall_keys_within(payload, array['field'] || allowed) then errs := array_append(errs, 'INVALID_DATA_KEY'); end if;
  if f in ('role', 'game', 'connection') then
    if not coalesce(case f
        when 'role' then jsonb_typeof(payload -> 'ref') = 'string' and (payload ->> 'ref') ~ '^(@primary|[a-z0-9_]{1,40})$'
        when 'connection' then jsonb_typeof(payload -> 'ref') = 'string' and (payload ->> 'ref') ~ '^[a-z][a-z0-9_]{1,30}$'
        else private.wall_game_ref_ok(payload -> 'ref') end, false) then
      errs := array_append(errs, 'INVALID_DATA_REF');
    end if;
  end if;
  if f = 'section' then
    if not coalesce(jsonb_typeof(payload -> 'section') = 'string' and (payload ->> 'section') ~ '^[a-z][a-z0-9_]{1,31}$', false) then errs := array_append(errs, 'INVALID_DATA_SECTION'); end if;
    if private.wall_is_set(payload -> 'item') and not coalesce(jsonb_typeof(payload -> 'item') = 'string' and (payload ->> 'item') ~ '^[a-z0-9][a-z0-9_]{0,63}$', false) then
      errs := array_append(errs, 'INVALID_DATA_ITEM');
    end if;
    if private.wall_is_set(payload -> 'display') and not coalesce(jsonb_typeof(payload -> 'display') = 'string' and (payload ->> 'display') in ('names', 'covers'), false) then
      errs := array_append(errs, 'INVALID_DATA_DISPLAY');
    end if;
  end if;
  if 'text' = any (allowed) and private.wall_is_set(payload -> 'text') and not (jsonb_typeof(payload -> 'text') = 'object' and not (payload -> 'text') ? 'text' and not (payload -> 'text') ? 'link'
      and cardinality(private.wall_text_payload_errors((payload -> 'text') || '{"text": ""}'::jsonb)) = 0) then
    errs := array_append(errs, 'INVALID_DATA_TEXT');
  end if;
  if 'look' = any (allowed) and private.wall_is_set(payload -> 'look') then
    look := payload -> 'look';
    if not (private.wall_keys_within(look, array['backdrop', 'mask', 'effects', 'blend', 'radius', 'opacity'])
        and (not private.wall_is_set(look -> 'opacity') or private.wall_in_range(look -> 'opacity', 0, 1))
        and cardinality(private.wall_artwork_look_errors(look)) = 0) then
      errs := array_append(errs, 'INVALID_DATA_LOOK');
    end if;
  end if;
  if 'withLabel' = any (allowed) and private.wall_is_set(payload -> 'withLabel') and jsonb_typeof(payload -> 'withLabel') <> 'boolean' then errs := array_append(errs, 'INVALID_DATA_WITH_LABEL'); end if;
  if 'layout' = any (allowed) and private.wall_is_set(payload -> 'layout') and (jsonb_typeof(payload -> 'layout') is distinct from 'string' or (payload ->> 'layout') not in ('card', 'compact')) then errs := array_append(errs, 'INVALID_LAYOUT'); end if;
  if 'showPlaytime' = any (allowed) and private.wall_is_set(payload -> 'showPlaytime') and jsonb_typeof(payload -> 'showPlaytime') is distinct from 'boolean' then errs := array_append(errs, 'INVALID_SHOW_PLAYTIME'); end if;
  if 'initial' = any (allowed) and private.wall_is_set(payload -> 'initial') and not (private.wall_is_pixels(payload -> 'initial') and (payload ->> 'initial')::float8 between 3 and 24) then errs := array_append(errs, 'INVALID_INITIAL'); end if;
  if 'style' = any (allowed) and private.wall_is_set(payload -> 'style') then errs := errs || private.wall_gamid_style_errors(payload -> 'style'); end if;
  return errs;
end;
$$;
