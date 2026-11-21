-- Browser-only, uncapped monetary aggregates and proposal-specific display names.
-- Detector evidence remains stable-keyset paged in the browser; Budget's private
-- service contracts are deliberately unchanged.
CREATE FUNCTION public.recurrence_scope_summary(p_tenant uuid,p_as_of date,
  p_account_ids uuid[] DEFAULT NULL,p_grain text DEFAULT 'reporting',p_proposals jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_as_of IS NULL OR p_grain NOT IN ('parent','reporting') OR jsonb_typeof(p_proposals)<>'array'
    THEN RAISE invalid_parameter_value; END IF;
  RETURN (
    WITH facts AS (
      SELECT account_id,merchant_key,date,amount FROM public.transactions_analytic
      WHERE p_grain='parent' AND tenant_id=p_tenant AND (p_account_ids IS NULL OR account_id=ANY(p_account_ids))
        AND kind='expense' AND amount<0 AND NOT pending AND NOT is_transfer AND date BETWEEN p_as_of-364 AND p_as_of
      UNION ALL
      SELECT account_id,merchant_key,date,amount FROM public.reporting_transaction_lines
      WHERE p_grain='reporting' AND tenant_id=p_tenant AND (p_account_ids IS NULL OR account_id=ANY(p_account_ids))
        AND kind='expense' AND amount<0 AND NOT pending AND NOT is_transfer AND date BETWEEN p_as_of-364 AND p_as_of
    ), grouped AS (
      SELECT account_id,merchant_key,sum(-amount::bigint)::text AS trailing_cents,
        coalesce(sum(-amount::bigint) FILTER (WHERE date>=p_as_of-29),0)::text AS pressure_cents
      FROM facts GROUP BY account_id,merchant_key
    ), proposals AS (
      SELECT DISTINCT (p->>'account_id')::uuid AS account_id,p->>'merchant_key' AS merchant_key
      FROM jsonb_array_elements(p_proposals) p
    ), names AS (
      SELECT p.account_id,p.merchant_key,t.merchant FROM proposals p
      CROSS JOIN LATERAL (
        SELECT merchant FROM public.transactions_analytic t WHERE t.tenant_id=p_tenant
          AND t.account_id=p.account_id AND t.merchant_key=p.merchant_key ORDER BY date DESC,id DESC LIMIT 1
      ) t
    )
    SELECT jsonb_build_object('groups',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY account_id,merchant_key) FROM grouped g),'[]'),
      'total_pressure_cents',coalesce((SELECT sum(pressure_cents::bigint)::text FROM grouped),'0'),
      'names',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY account_id,merchant_key) FROM names n),'[]'))
  );
END $$;
REVOKE ALL ON FUNCTION public.recurrence_scope_summary(uuid,date,uuid[],text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recurrence_scope_summary(uuid,date,uuid[],text,jsonb) TO authenticated;
DO $$
DECLARE fn regprocedure:='public.recurrence_scope_summary(uuid,date,uuid[],text,jsonb)'::regprocedure;
BEGIN
  IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('service_role',fn,'EXECUTE')
    OR NOT has_function_privilege('authenticated',fn,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=fn AND a.grantee=0 AND a.privilege_type='EXECUTE')
    OR (SELECT prosecdef OR provolatile<>'s' OR NOT coalesce(proconfig@>ARRAY['search_path=public, pg_temp'],false) FROM pg_proc WHERE oid=fn)
    THEN RAISE EXCEPTION 'Unsafe recurrence helper %',fn; END IF;
END $$;
