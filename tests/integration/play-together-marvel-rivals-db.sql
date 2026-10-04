-- TESTING only. Disposable fixture; always rolled back.
begin;
do $test$
declare u uuid:=gen_random_uuid(); sid uuid; cat jsonb; rejected boolean;
begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'mr-fixture@example.invalid',now());
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 perform 1 from public.create_solo_identity('zmrfixture','Marvel Fixture',date '1990-01-01','en');
 select catalog into cat from public.get_play_together_catalog();
 if not cat->'games' @> '[{"game_key":"marvel_rivals"}]'::jsonb then raise exception 'game missing'; end if;
 rejected:=false;
 begin perform 1 from public.create_play_together_session('mr_competitive','mr_singapore',1,array['en'],'PREFERRED');
 exception when sqlstate '22023' then rejected:=sqlerrm='QUEUE_NOT_AVAILABLE'; end;
 if not rejected then raise exception 'competitive accepted'; end if;
 rejected:=false;
 begin perform 1 from public.create_play_together_session('mr_quick_match','sg2',1,array['en'],'PREFERRED');
 exception when sqlstate '22023' then rejected:=sqlerrm='INVALID_REGION'; end;
 if not rejected then raise exception 'cross-game region accepted'; end if;
 rejected:=false;
 begin perform 1 from public.create_play_together_session('mr_quick_match','mr_singapore',6,array['en'],'PREFERRED');
 exception when sqlstate '22023' then rejected:=sqlerrm='INVALID_SEATS_WANTED'; end;
 if not rejected then raise exception 'over-capacity accepted'; end if;
 select session_id into sid from public.create_play_together_session('mr_quick_match','mr_singapore',5,array['en'],'PREFERRED');
 reset role;
 if not exists(select 1 from public.play_together_sessions where session_id=sid and game_key='marvel_rivals' and region_key='mr_singapore' and seats_wanted=5) then raise exception 'session wrong game'; end if;
 if (select count(*) from public.play_together_regions where game_key='marvel_rivals' and is_active)<>10 then raise exception 'server count'; end if;
 if exists(select 1 from public.play_together_regions where game_key='league_of_legends' and (riot_platform_id is null or riot_regional_route is null)) then raise exception 'League identities altered'; end if;
 if private.next_play_together_voice_channel_name('marvel_rivals','mr_quick_match','mr_singapore') !~ '^marvel-rivals-quick-match-mr-singapore-[0-9]{4}$' then raise exception 'voice naming failed'; end if;
end $test$;
select 'PASS: catalog, Quick Match creation, six-player cap, Competitive rejection, cross-game rejection, League identities, voice naming' as result;
rollback;
