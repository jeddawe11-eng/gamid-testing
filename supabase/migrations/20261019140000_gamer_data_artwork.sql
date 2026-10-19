-- My Gamer Data: Favorite Games Display Style (Mazen's task 2026-10-19) - GamID TESTING only. PROPOSED: not applied until Mazen authorizes it. Additive.
--
-- The section catalog says which Classic sections hold games with Classic artwork, so the Wall editor offers Display Style (Names Only / Game Covers) from
-- catalog metadata instead of naming a section: wall_artwork = 'game' (the items are catalog game keys; their covers come from GamID's existing
-- game-artwork function, unchanged). Favorite Games is the first such section. The projection gains one field, 'artwork'; nothing else changes: same items,
-- same privacy, same grants. The Wall binding's optional "display" key is the separate migration 20261019140100_wall_gamer_data_display.sql.

alter table public.public_section_catalog add column wall_artwork text check (wall_artwork in ('game'));
update public.public_section_catalog set wall_artwork = 'game' where section_key = 'favorite_games';

-- copied from 20261019120000_gamer_data_sections.sql; changed: the section's 'artwork' (catalog wall_artwork) is listed with it
create or replace function private.gamer_data_projection(candidate_handle text, candidate_owner boolean)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', c.section_key, 'label', c.label, 'icon', c.wall_icon, 'presentation', c.wall_presentation, 'single', c.wall_single,
      'all', c.wall_all, 'order', c.sort_order, 'item_label', c.wall_item_label, 'artwork', c.wall_artwork, 'items', x.items) order by c.sort_order, c.section_key), '[]'::jsonb)
  from public.public_section_catalog c
  cross join lateral (select private.gamer_data_items(c.section_key, candidate_handle, candidate_owner) as items) x
  where c.active and c.wall_importable and x.items is not null and (candidate_owner or jsonb_array_length(x.items) > 0);
$$;
