-- Owner decision 2026-10-01: login MFA + twenty-minute inactivity logout.
-- Remove elapsed-MFA checks only; identity, factor binding, idle expiry,
-- receipts, revisions, idempotency and audit remain authoritative.
do $$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_count integer := 0;
begin
  for v_function in select p.oid, p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'admin_preview_content_publication','admin_preview_content_archive',
      'admin_list_content_history','admin_publish_content_draft',
      'admin_archive_content','admin_rollback_content',
      'admin_delete_content_draft','admin_begin_content_media_upload',
      'admin_claim_content_media_upload',
      'admin_begin_content_import_upload','admin_claim_content_import_upload',
      'admin_preview_content_import_v2','admin_commit_content_import_v2'
    ) loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := regexp_replace(v_definition,
      E'  if \\(v_auth ->> ''mfa_age_seconds''\\)::integer > (300|600) then\\n[^;]+;\\n  end if;\\n',
      '', 'gs');
    if v_updated = v_definition then
      raise exception 'ADMIN_MFA_POLICY_DEFINITION_DRIFT: %',v_function.proname;
    end if;
    execute v_updated;
    v_count := v_count + 1;
  end loop;
  if v_count <> 13 then raise exception 'ADMIN_MFA_POLICY_FUNCTION_COUNT: %',v_count; end if;
  for v_function in select p.oid, p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'admin_internal_execute_command','svc_admin_issue_command_receipt'
    ) loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := regexp_replace(v_definition,
      E'  if p_requires_fresh_totp\\n[^;]+interval ''10 minutes'' then\\n[^;]+;\\n  end if;\\n',
      '', 'gs');
    if v_updated = v_definition then
      raise exception 'ADMIN_COMMAND_MFA_POLICY_DEFINITION_DRIFT: %',v_function.proname;
    end if;
    execute v_updated;
  end loop;
end;
$$;

-- Safe queue projection: titles and hierarchy identity, never answer keys or
-- complete payloads. All draft types are discoverable across chapter filters.
create or replace function public.admin_list_content_catalog()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_courses jsonb;
  v_chapters jsonb;
  v_hierarchy jsonb;
  v_drafts jsonb;
begin
  perform set_config('statement_timeout','5000',true);
  if not coalesce((v_auth->>'ok')::boolean,false) then
    return public.admin_internal_deny('content/catalog',v_auth->>'code',
      'admin_list_content_catalog','content_catalog','unknown',null,null,
      (v_auth->>'auth_session_id')::uuid,null,null,null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'stable_code',stable_code,
    'title',title,'status',status,'sort_order',sort_order)
    order by sort_order,stable_code),'[]'::jsonb) into v_courses from public.courses;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'course_id',course_id,
    'stable_code',stable_code,'title',title,'status',status,'sort_order',sort_order)
    order by sort_order,stable_code),'[]'::jsonb) into v_chapters from public.chapters;
  select coalesce(jsonb_agg(jsonb_build_object('draft_id',id,'entity_type',entity_type,
    'stable_code',stable_code,'revision',revision,'payload',payload,'updated_at',updated_at)
    order by updated_at desc),'[]'::jsonb) into v_hierarchy from public.content_drafts
    where entity_id is null and entity_type in ('course','chapter');
  with draft_parents as (
    select d.*, coalesce(nullif(d.payload->>'bank_id','')::uuid,
      nullif(d.payload->>'subtopic_id','')::uuid,nullif(d.payload->>'section_id','')::uuid,
      nullif(d.payload->>'chapter_id','')::uuid,nullif(d.payload->>'course_id','')::uuid) as parent_id,
      case d.entity_type when 'chapter' then 'course' when 'section' then 'chapter'
        when 'subtopic' then 'section' when 'review_card' then 'subtopic'
        when 'question' then 'assessment_bank' when 'assessment_bank' then
          case when d.payload->>'kind'='CR' then 'chapter' else 'section' end
        else null end as parent_type
    from public.content_drafts d
    where (content_private.current_entity(d.entity_type,d.entity_id)->>'status')
      is distinct from 'archived'
      and (d.entity_id is null or (d.payload is distinct from
        (content_private.current_entity(d.entity_type,d.entity_id)->'payload')
        and not exists (select 1 from public.content_versions version
          where version.content_type=d.entity_type and version.content_id=d.entity_id
            and version.version=(content_private.current_entity(d.entity_type,d.entity_id)->>'version')::integer
            and version.frozen_payload=d.payload)))
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'draft_id',d.id,'entity_id',d.entity_id,'entity_type',d.entity_type,
    'stable_code',d.stable_code,'revision',d.revision,'updated_at',d.updated_at,
    'title',coalesce(nullif(d.payload->>'title',''),nullif(d.payload->>'prompt',''),d.stable_code),
    'parent_id',d.parent_id,'parent_type',d.parent_type,
    'bank_kind',coalesce(d.payload->>'kind',bank.kind::text),
    'chapter_id',coalesce(nullif(d.payload->>'chapter_id','')::uuid,bank.chapter_id,section.chapter_id),
    'section_id',section.id,'subtopic_id',subtopic.id)
    order by case d.entity_type when 'course' then 1 when 'chapter' then 2
      when 'section' then 3 when 'subtopic' then 4 when 'assessment_bank' then 5 else 6 end,
      d.updated_at desc),'[]'::jsonb) into v_drafts
    from draft_parents d
    left join public.assessment_banks bank on d.entity_type='question' and bank.id=d.parent_id
    left join public.subtopics subtopic on d.entity_type='review_card' and subtopic.id=d.parent_id
    left join public.sections section on section.id=coalesce(
      nullif(d.payload->>'section_id','')::uuid,bank.section_id,subtopic.section_id);
  return jsonb_build_object('outcome','ok','request_id',gen_random_uuid(),
    'courses',v_courses,'chapters',v_chapters,'hierarchy_drafts',v_hierarchy,'drafts',v_drafts);
end;
$$;
revoke execute on function public.admin_list_content_catalog() from public,anon;
grant execute on function public.admin_list_content_catalog() to authenticated;

-- Historical teaching content is readable only through the same Admin gate.
-- Student/teacher APIs still never expose question answer keys.
create or replace function public.admin_list_content_history(p_entity_id uuid,p_entity_type text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, content_private, extensions, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_entries jsonb;
begin
  perform set_config('statement_timeout','5000',true);
  if not coalesce((v_auth->>'ok')::boolean,false) then
    return content_private.publication_denial(v_auth,v_auth->>'code','admin_list_content_history');
  end if;
  if content_private.current_entity(p_entity_type,p_entity_id) is null then
    return content_private.publication_denial(v_auth,'CONTENT_SCOPE_INVALID','admin_list_content_history');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',event.id,'event_type',event.event_type,'version_id',event.version_id,
    'version',event.version,'impact',event.impact,'reason',event.reason,
    'changed_fields',event.changed_fields,'actor_id',event.actor_id,'created_at',event.created_at,
    'payload',version.frozen_payload
  ) order by event.created_at desc,event.id desc),'[]'::jsonb) into v_entries
  from public.content_publication_events event
  left join public.content_versions version on version.id=event.version_id
    and version.content_type=p_entity_type and version.content_id=p_entity_id
  where event.content_type=p_entity_type and event.content_id=p_entity_id;
  return jsonb_build_object('outcome','ok','request_id',gen_random_uuid(),
    'entity_type',p_entity_type,'entity_id',p_entity_id,'entries',v_entries);
end;
$$;
revoke execute on function public.admin_list_content_history(uuid,text) from public,anon;
grant execute on function public.admin_list_content_history(uuid,text) to authenticated;
