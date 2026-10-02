-- Run against TESTING only. Every fixture/counter mutation is rolled back.
begin;
do $$
declare first_name text; second_name text; exhausted boolean:=false;
begin
 first_name:=private.next_play_together_voice_channel_name('league_of_legends','aram_standard','sg2');
 second_name:=private.next_play_together_voice_channel_name('league_of_legends','aram_standard','sg2');
 if first_name<>'lol-aram-sg-0001' or second_name<>'lol-aram-sg-0002' then raise exception 'Unexpected sequential names: %, %',first_name,second_name; end if;
 if private.next_play_together_voice_channel_name('League of Legends!','Custom / Queue','ME1')<>'league-of-legends-custom-queue-me1-0001' then raise exception 'Normalization failed'; end if;
 if private.next_play_together_voice_channel_name('league_of_legends','aram_standard','me1')<>'lol-aram-me1-0001' then raise exception 'Actual region lost'; end if;
 update private.play_together_voice_name_counters set last_value=9999 where prefix='lol-aram-sg';
 begin
  perform private.next_play_together_voice_channel_name('league_of_legends','aram_standard','sg2');
 exception when sqlstate '22003' then exhausted:=true;
 end;
 if not exhausted then raise exception 'Counter wrapped or exceeded 4 digits'; end if;
 if has_function_privilege('authenticated','private.next_play_together_voice_channel_name(text,text,text)','EXECUTE') or has_table_privilege('authenticated','private.play_together_voice_name_counters','UPDATE') then raise exception 'Client can allocate names'; end if;
 if position('private.next_play_together_voice_channel_name(s.game_key,s.queue_key,s.region_key)' in pg_get_functiondef('private.ensure_play_together_voice_session_impl(uuid,text)'::regprocedure))=0 then raise exception 'Allocator not wired to real session fields'; end if;
end $$;
select 'voice naming assertions passed; all changes rolled back' as result;
rollback;
