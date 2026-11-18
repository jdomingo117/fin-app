-- Budget table (stage 4): a read-only month-by-month view for Look back.
-- For the selected period and up to 11 before it, return each saved line's
-- planned, used, remaining and reserve figures. It reuses the existing per-period
-- details read with the same history checkpoints the workspace uses, so every figure
-- is one the app already shows for that period. No table, command or persisted state.
CREATE FUNCTION public.budget_months(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE role_name text;until_on date;per record;d jsonb;out jsonb:='[]'::jsonb;old_mode text:=coalesce(current_setting('halcyon.history_cache',true),'off');BEGIN
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 SELECT start_date INTO until_on FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND id=p_period;
 IF until_on IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 PERFORM set_config('halcyon.history_cache','on',true);
 FOR per IN SELECT id,start_date,end_date FROM (
   SELECT id,start_date,end_date FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND start_date<=until_on
   ORDER BY start_date DESC LIMIT 12) recent ORDER BY start_date LOOP
  d:=public.budget_details_m4(p_tenant,p_actor,p_plan,per.id,p_source,p_version);
  out:=out||jsonb_build_array(jsonb_build_object('period_id',per.id,'start_date',per.start_date,'end_date',per.end_date,
   'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('line_id',it->>'line_id','name',it->>'name','kind',it->>'kind',
      'goal',coalesce(it->'config'->>'type','')='goal','archived',coalesce((it->>'archived')::boolean,false),
      'planned_cents',it->'planned_cents','used_cents',it->'used_cents','remaining_cents',it->'remaining_cents',
      'reserve_cents',it->'reserve_cents','target_cents',it->'config'->'target_cents') ORDER BY it->>'line_id')
     FROM jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) it
     WHERE coalesce((it->'config'->>'voided')::boolean,false) IS NOT TRUE),'[]'::jsonb)));
 END LOOP;
 PERFORM set_config('halcyon.history_cache',old_mode,true);
 RETURN jsonb_build_object('plan_id',p_plan,'period_id',p_period,'source_revision',p_source::text,'plan_version',p_version::text,'periods',out);
 EXCEPTION WHEN OTHERS THEN PERFORM set_config('halcyon.history_cache',old_mode,true);RAISE;
END $$;

REVOKE ALL ON FUNCTION public.budget_months(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_months(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.budget_months(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE')
  OR has_function_privilege('authenticated','public.budget_months(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.budget_months(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'budget_months_privilege_assertion';END IF;
END $$;
