-- Wall background controls: Flip horizontal / Flip vertical - GamID TESTING only.
--
-- An image or video background may carry two more OPTIONAL booleans, mirroring dist/wall-kit/background.js exactly (the shared corpus keeps them identical):
--   flipX, flipY   true / false (a JSON null = not set). Anything else: BACKGROUND:INVALID_FLIP:<scope>.
-- They only change how the background is drawn (a CSS mirror of the media); the uploaded file is never re-encoded or copied. Backgrounds saved before this
-- have neither key and stay valid. Only this function is replaced (create or replace, same signature); every other line is copied unchanged from
-- 20260929100000_wall_split_video_background.sql. No table, bucket, grant, RLS or data change.

create or replace function private.wall_background_errors(bg jsonb, scope text)
returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
  errs text[] := array[]::text[];
  kind text;
  code text;
  codes text[] := array[]::text[];
begin
  if bg is null or jsonb_typeof(bg) <> 'object' or jsonb_typeof(bg -> 'kind') is distinct from 'string' or (bg ->> 'kind') = '' then return array['INVALID_BACKGROUND:' || scope]; end if;
  kind := bg ->> 'kind';
  if kind = 'color' then
    if not private.wall_is_hex(bg -> 'color') then codes := array_append(codes, 'INVALID_COLOR'); end if;
  elsif kind = 'gradient' then
    if not private.wall_is_gradient(bg) then codes := array_append(codes, 'INVALID_GRADIENT'); end if;
  elsif kind in ('image', 'video') then
    if jsonb_typeof(bg -> 'assetId') is distinct from 'string' or (bg ->> 'assetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then codes := array_append(codes, 'INVALID_ASSET'); end if;
    if jsonb_typeof(bg -> 'fit') is distinct from 'string' or (bg ->> 'fit') not in ('cover', 'contain') then codes := array_append(codes, 'INVALID_FIT'); end if;
    if not (private.wall_in_range(bg -> 'posX', 0, 100) and private.wall_in_range(bg -> 'posY', 0, 100)) then codes := array_append(codes, 'INVALID_POSITION'); end if;
    if not private.wall_in_range(bg -> 'opacity', 0, 1) then codes := array_append(codes, 'INVALID_OPACITY'); end if;
    if private.wall_is_set(bg -> 'overlay') and not (jsonb_typeof(bg -> 'overlay') = 'object' and private.wall_is_hex(bg -> 'overlay' -> 'color') and private.wall_in_range(bg -> 'overlay' -> 'opacity', 0, 1)) then
      codes := array_append(codes, 'INVALID_OVERLAY');
    end if;
    if (private.wall_is_set(bg -> 'flipX') and jsonb_typeof(bg -> 'flipX') <> 'boolean') or (private.wall_is_set(bg -> 'flipY') and jsonb_typeof(bg -> 'flipY') <> 'boolean') then
      codes := array_append(codes, 'INVALID_FLIP');
    end if;
  else
    return array['UNKNOWN_BACKGROUND_KIND:' || scope];
  end if;
  foreach code in array codes loop errs := array_append(errs, 'BACKGROUND:' || code || ':' || scope); end loop;
  return errs || private.wall_scan_unsafe(bg, scope || '.background');
end;
$$;
