-- Budget table (stage 1): per-group totals for the read-only My plan table.
-- Read-only and additive. It sums facts already present in the selected
-- period's details payload, so it can't disagree with the rows it totals. An
-- unknown member makes that group field unknown; it is never summed as zero.
-- No table, command, persisted state or Edge Function change.
CREATE FUNCTION public.budget_sheet_facts(p_tenant uuid,p_plan uuid,p_period uuid,d jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH rows AS (
  SELECT CASE WHEN it->'config'->>'type'='goal' THEN 'goal' ELSE it->>'kind' END grp,
   (it->>'planned_cents')::numeric planned,(it->>'used_cents')::numeric used,(it->>'remaining_cents')::numeric remaining,
   (it->>'reserve_cents')::numeric reserve,(it->>'net_purchases_cents')::numeric purchases,(it->>'bank_confirmed_cents')::numeric confirmed
  FROM jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) it
  WHERE coalesce((it->'config'->>'voided')::boolean,false) IS NOT TRUE
 ), groups AS (
  SELECT grp,count(*) n,
   CASE WHEN bool_or(planned IS NULL) THEN NULL ELSE sum(planned) END planned_cents,
   CASE WHEN bool_or(used IS NULL) THEN NULL ELSE sum(used) END used_cents,
   CASE WHEN bool_or(remaining IS NULL) THEN NULL ELSE sum(remaining) END remaining_cents,
   CASE WHEN bool_or(reserve IS NULL) THEN NULL ELSE sum(reserve) END reserve_cents,
   CASE WHEN bool_or(purchases IS NULL) THEN NULL ELSE sum(purchases) END purchases_cents,
   CASE WHEN bool_or(confirmed IS NULL) THEN NULL ELSE sum(confirmed) END bank_confirmed_cents
  FROM rows GROUP BY grp
 )
 SELECT jsonb_build_object(
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('key',grp,'count',n,'planned_cents',planned_cents,'used_cents',used_cents,
    'remaining_cents',remaining_cents,'reserve_cents',reserve_cents,'purchases_cents',purchases_cents,'bank_confirmed_cents',bank_confirmed_cents)
    ORDER BY array_position(ARRAY['fixed','everyday','reserve','goal','contribution'],grp)) FROM groups),'[]'::jsonb),
  'allocated_cents',(SELECT coalesce(sum(a.amount_cents),0) FROM public.budget_periods p
    JOIN public.budget_allocations a ON a.revision_id=p.current_revision_id AND a.tenant_id=p.tenant_id
    WHERE p.tenant_id=p_tenant AND p.plan_id=p_plan AND p.id=p_period))
$$;

-- Compose after the existing details, forecast and attention facts. The workspace
-- composer resolves the uncached function by name, so it picks this one up unchanged.
ALTER FUNCTION public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_workspace_details_uncached_before_sheet;
CREATE FUNCTION public.budget_workspace_details_uncached(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE d jsonb;BEGIN
 d:=public.budget_workspace_details_uncached_before_sheet(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 RETURN d||jsonb_build_object('sheet',public.budget_sheet_facts(p_tenant,p_plan,p_period,d));
END $$;

REVOKE ALL ON FUNCTION public.budget_sheet_facts(uuid,uuid,uuid,jsonb),public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint),
 public.budget_workspace_details_uncached_before_sheet(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_sheet_facts(uuid,uuid,uuid,jsonb),public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint),
 public.budget_workspace_details_uncached_before_sheet(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ DECLARE signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.budget_sheet_facts(uuid,uuid,uuid,jsonb)','public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint)',
  'public.budget_workspace_details_uncached_before_sheet(uuid,uuid,uuid,uuid,bigint,bigint)','public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'budget_sheet_privilege_assertion';END IF;
 END LOOP;
END $$;
