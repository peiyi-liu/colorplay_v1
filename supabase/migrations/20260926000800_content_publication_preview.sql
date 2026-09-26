-- Read-only publication impact preview. The browser never classifies impact;
-- this function applies the same trusted helpers and validation used by the
-- mutation immediately before an Admin confirms publication.
create function public.admin_preview_content_publication(
  p_draft_id uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, extensions, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_draft public.content_drafts;
  v_current jsonb;
  v_before jsonb;
  v_fields text[];
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(
      v_auth, v_auth ->> 'code', 'admin_preview_content_publication');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_preview_content_publication');
  end if;

  select draft.* into v_draft
  from public.content_drafts draft
  where draft.id = p_draft_id;
  if v_draft.id is null or v_draft.revision is distinct from p_expected_revision then
    return content_private.publication_denial(
      v_auth, 'CONTENT_DRAFT_CONFLICT', 'admin_preview_content_publication');
  end if;
  if jsonb_array_length(content_private.validate_draft(v_draft)) > 0 then
    return content_private.publication_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED', 'admin_preview_content_publication');
  end if;

  v_current := case when v_draft.entity_id is null then null
    else content_private.current_entity(v_draft.entity_type, v_draft.entity_id)
  end;
  if v_current is not null
     and (v_current ->> 'version')::integer is distinct from v_draft.base_version then
    return content_private.publication_denial(
      v_auth, 'CONTENT_PUBLICATION_CONFLICT', 'admin_preview_content_publication');
  end if;
  if v_current is not null and not content_private.scope_matches(
      v_draft.entity_type, v_current, v_draft.payload) then
    return content_private.publication_denial(
      v_auth, 'CONTENT_SCOPE_INVALID', 'admin_preview_content_publication');
  end if;

  v_before := v_current -> 'payload';
  v_fields := content_private.changed_fields(v_before, v_draft.payload);
  if v_current is not null and cardinality(v_fields) = 0 then
    return content_private.publication_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED', 'admin_preview_content_publication');
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'request_id', v_request_id,
    'draft_id', v_draft.id,
    'stable_code', v_draft.stable_code,
    'entity_type', v_draft.entity_type,
    'current_version', (v_current ->> 'version')::integer,
    'next_version', coalesce((v_current ->> 'version')::integer, 0) + 1,
    'changed_fields', v_fields,
    'impact', content_private.publication_impact(
      v_draft.entity_type, v_before, v_draft.payload)
  );
end;
$$;

revoke all on function public.admin_preview_content_publication(uuid, integer)
from public, anon;
grant execute on function public.admin_preview_content_publication(uuid, integer)
to authenticated;

-- Archive uses the same server-owned progress classification as the mutation.
-- The exact entity and optimistic version are echoed so the UI cannot reuse a
-- preview after selection or version state changes.
create function public.admin_preview_content_archive(
  p_entity_id uuid,
  p_entity_type text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, extensions, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_current jsonb;
  v_impact text;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(
      v_auth, v_auth ->> 'code', 'admin_preview_content_archive');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_preview_content_archive');
  end if;
  if p_entity_type not in (
      'course','chapter','section','subtopic','review_card','assessment_bank','question'
    ) then
    return content_private.publication_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED', 'admin_preview_content_archive');
  end if;

  v_current := content_private.current_entity(p_entity_type, p_entity_id);
  if v_current is null
     or (v_current ->> 'version')::integer is distinct from p_expected_version
     or v_current ->> 'status' <> 'published' then
    return content_private.publication_denial(
      v_auth, 'CONTENT_PUBLICATION_CONFLICT', 'admin_preview_content_archive');
  end if;
  v_impact := case
    when p_entity_type = 'review_card' then 'requires_recompletion'
    when p_entity_type in ('question','assessment_bank')
      then 'requires_requalification'
    else 'compatible'
  end;
  return jsonb_build_object(
    'outcome', 'ok',
    'request_id', v_request_id,
    'entity_id', p_entity_id,
    'stable_code', v_current ->> 'stable_code',
    'entity_type', p_entity_type,
    'current_version', p_expected_version,
    'next_version', p_expected_version + 1,
    'changed_fields', jsonb_build_array('status'),
    'impact', v_impact
  );
end;
$$;

revoke all on function public.admin_preview_content_archive(uuid, text, integer)
from public, anon;
grant execute on function public.admin_preview_content_archive(uuid, text, integer)
to authenticated;

-- The operator history includes the accountable actor without exposing any
-- profile/contact data. The underlying immutable event remains authoritative.
create or replace function public.admin_list_content_history(
  p_entity_id uuid,
  p_entity_type text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, extensions, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_request_id uuid := gen_random_uuid();
  v_entries jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(v_auth, v_auth ->> 'code',
      'admin_list_content_history');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_list_content_history');
  end if;
  if content_private.current_entity(p_entity_type, p_entity_id) is null then
    return content_private.publication_denial(v_auth, 'CONTENT_SCOPE_INVALID',
      'admin_list_content_history');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', event.id, 'event_type', event.event_type,
    'version_id', event.version_id, 'version', event.version,
    'impact', event.impact, 'reason', event.reason,
    'changed_fields', event.changed_fields, 'actor_id', event.actor_id,
    'created_at', event.created_at
  ) order by event.created_at desc, event.id desc), '[]'::jsonb)
  into v_entries
  from public.content_publication_events event
  where event.content_type = p_entity_type and event.content_id = p_entity_id;
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id,
    'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'entries', v_entries);
end;
$$;
