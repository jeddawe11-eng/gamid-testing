-- Run after 20260922230000 on TESTING. Read-only catalog/security assertions plus transaction-rolled-back owner flow.
begin;
do $$
begin
  if (select count(*) from public.play_together_languages where is_active) <> 10 then raise exception 'expected 10 active languages'; end if;
  if not exists(select 1 from public.play_together_languages where language_key='en' and sort_order=10) then raise exception 'English default catalog row missing'; end if;
  if exists(select 1 from public.play_together_queues where enabled_for_creation and max_premade_party_size is null) then raise exception 'creatable queue without capacity'; end if;
  if exists(select 1 from public.play_together_sessions where admission_policy <> 'HOST_APPROVAL') then raise exception 'non-host admission policy'; end if;
  if has_table_privilege('authenticated','public.play_together_sessions','INSERT') or has_table_privilege('authenticated','public.play_together_sessions','UPDATE') or has_table_privilege('authenticated','public.play_together_sessions','DELETE') then raise exception 'direct session mutation exposed'; end if;
  if has_table_privilege('anon','public.play_together_sessions','SELECT') then raise exception 'anonymous session read exposed'; end if;
  if not has_function_privilege('authenticated','public.create_play_together_session(text,text,integer,text[],text)','EXECUTE') then raise exception 'create RPC missing'; end if;
  if has_function_privilege('anon','public.create_play_together_session(text,text,integer,text[],text)','EXECUTE') then raise exception 'anonymous create exposed'; end if;
end $$;
rollback;
