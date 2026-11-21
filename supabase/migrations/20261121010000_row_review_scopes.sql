-- Scalar arrays are returned as one value, independent of PostgREST max_rows.
CREATE FUNCTION public.ledger_review_ids(p_tenant uuid, p_scope text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('eligible','unresolved') THEN RAISE invalid_parameter_value; END IF;
  RETURN (SELECT coalesce(jsonb_agg(t.id ORDER BY t.date DESC,t.id DESC),'[]')
    FROM public.transactions t WHERE t.tenant_id=p_tenant AND CASE p_scope
      WHEN 'unresolved' THEN t.category='Uncategorized' AND t.category_source IS NULL
      ELSE t.category_source IS DISTINCT FROM 'user' AND t.category_source IS DISTINCT FROM 'bank'
        AND NOT (t.kind='adjustment' AND t.kind_source='system') END);
END $$;

CREATE FUNCTION public.account_activity_categories(p_tenant uuid,p_account uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  RETURN (SELECT coalesce(jsonb_agg(DISTINCT category ORDER BY category),'[]')
    FROM public.transactions WHERE tenant_id=p_tenant AND account_id=p_account);
END $$;

-- Use the canonical parent filter and order, returning only selection IDs.
CREATE FUNCTION public.ledger_selection_ids(p_tenant uuid,p_accounts uuid[],p_from date,p_to date,
  p_category text,p_kind text,p_query text,p_review text,p_income_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  RETURN (SELECT coalesce(jsonb_agg(item->'id' ORDER BY position),'[]')
    FROM jsonb_array_elements(public.ledger_page(p_tenant,p_account_ids=>p_accounts,p_limit=>500,
      p_from=>p_from,p_to=>p_to,p_category=>p_category,p_kind=>p_kind,p_query=>p_query,
      p_review=>p_review,p_income_source=>p_income_source)->'rows') WITH ORDINALITY AS rows(item,position));
END $$;

-- Group membership is evaluated before exclusions and batching. Suggested
-- account pairs are unordered. The unmatched window is queue-wide.
CREATE FUNCTION public.transfer_group_batch(p_tenant uuid,p_queue text,p_group text,p_deselected uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  leg record;
  normalized text;
  original text;
  prior text;
  segments text[];
  group_ids uuid[] := '{}';
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_queue IS NULL OR p_queue NOT IN ('suggested','unmatched') THEN RAISE invalid_parameter_value; END IF;
  -- Older imports can have a stored merchant_key different from the normalized
  -- original description. Match the review panel's normalizeMerchant key.
  IF p_queue='unmatched' THEN
    FOR leg IN SELECT t.id,t.original_description FROM public.transactions_analytic t
      WHERE t.tenant_id=p_tenant AND t.transfer_state='unmatched' ORDER BY t.date DESC,t.id DESC LIMIT 500
    LOOP
      original := btrim(regexp_replace(coalesce(leg.original_description,''),'^\s+|\s+$','','g'));
      normalized := regexp_replace(original,
        '\m(receipt\s+number:|frgn\s+amt:|foreign\s+amount:|value\s+date:|card\s+(ending|no\.?|number)\s*[:#]?\s*[x*0-9]+|ref(erence)?\s*[:#]\s*\S+|effective\s+date).*',' ','i');
      segments := regexp_split_to_array(btrim(normalized),'\s{2,}');
      IF cardinality(segments)>1 THEN
        normalized := CASE WHEN length(segments[1])>=4 THEN segments[1] ELSE segments[1]||' '||segments[2] END;
      END IF;
      normalized := btrim(regexp_replace(normalized,'\s+',' ','g'));
      normalized := regexp_replace(normalized,'\s+(x{1,2}|\*{2,})[0-9]{3,}(?=\s|$)','','gi');
      LOOP
        prior := normalized;
        normalized := btrim(regexp_replace(normalized,
          '^(sq\s*\*\s*|sp\s+|paypal\s*\*\s*|(visa|eftpos|mastercard)\s+(purchase|debit|payment)\s+|(direct\s+)?debit\s+|pos\s+(purchase\s+)?|(to|from)\s+)','','i'));
        EXIT WHEN normalized=prior;
      END LOOP;
      LOOP
        prior := normalized;
        normalized := btrim(regexp_replace(normalized,
          '(\s*-\s*[0-9]{4,}|\s+[0-9]{6,}|\s*,?\s*thank\s+you\.?|\s+(au|aus|usa|us|nz|gb|uk)|[\s,.-]+)$','','i'));
        normalized := btrim(regexp_replace(normalized,'\s+[A-Z]{2}\s+[0-9]{5}$',''));
        EXIT WHEN normalized=prior;
      END LOOP;
      normalized := lower(btrim(regexp_replace(coalesce(nullif(normalized,''),nullif(original,''),'unknown'),'\s+',' ','g')));
      IF normalized=p_group THEN group_ids := array_append(group_ids,leg.id); END IF;
    END LOOP;
  END IF;
  RETURN (
    WITH recent AS (
      SELECT t.id,t.date,t.amount FROM public.transactions_analytic t
      WHERE p_queue='unmatched' AND t.tenant_id=p_tenant AND t.transfer_state='unmatched'
      ORDER BY t.date DESC,t.id DESC LIMIT 500
    ), members AS (
      SELECT id,date,NULL::numeric AS score,false AS ambiguous,amount FROM recent WHERE id=ANY(group_ids)
      UNION ALL
      SELECT l.id,NULL::date,l.score,l.ambiguous,a.amount FROM public.transfer_links l
      JOIN public.transactions a ON a.tenant_id=p_tenant AND a.id=l.from_txn_id
      JOIN public.transactions b ON b.tenant_id=p_tenant AND b.id=l.to_txn_id
      WHERE p_queue='suggested' AND l.tenant_id=p_tenant AND l.state='suggested'
        AND least(a.account_id,b.account_id)::text||':'||greatest(a.account_id,b.account_id)::text=p_group
    ), eligible AS (
      SELECT * FROM members WHERE NOT ambiguous AND NOT (id=ANY(coalesce(p_deselected,'{}')))
    ), batch AS (
      SELECT * FROM eligible ORDER BY score DESC,date DESC,id DESC LIMIT 200
    )
    SELECT jsonb_build_object(
      'selectedIds',(SELECT coalesce(jsonb_agg(id ORDER BY score DESC,date DESC,id DESC),'[]') FROM batch),
      'deferredCount',greatest(0,(SELECT count(*) FROM eligible)-200),
      'ambiguousCount',count(*) FILTER (WHERE ambiguous),'total',count(*),
      'amount',coalesce(sum(abs(amount::bigint)),0)) FROM members
  );
END $$;

CREATE FUNCTION public.transfer_overflow_summary(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  RETURN (SELECT jsonb_build_object('bucketCount',count(*),'legCount',coalesce(sum(leg_count),0),
    'suggestedPairCount',(SELECT count(DISTINCT (least(from_account_id,to_account_id),greatest(from_account_id,to_account_id)))
      FROM public.transfer_links WHERE tenant_id=p_tenant AND state='suggested' AND to_account_id IS NOT NULL))
    FROM public.transfer_match_overflow WHERE tenant_id=p_tenant);
END $$;

DO $$
DECLARE fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.ledger_selection_ids(uuid,uuid[],date,date,text,text,text,text,text)'::regprocedure,
    'public.ledger_review_ids(uuid,text)'::regprocedure,
    'public.account_activity_categories(uuid,uuid)'::regprocedure,
    'public.transfer_group_batch(uuid,text,text,uuid[])'::regprocedure,
    'public.transfer_overflow_summary(uuid)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn);
    IF has_function_privilege('service_role',fn,'EXECUTE') OR has_function_privilege('anon',fn,'EXECUTE')
      OR NOT has_function_privilege('authenticated',fn,'EXECUTE')
      OR (SELECT prosecdef OR provolatile<>'s' OR NOT coalesce(proconfig@>ARRAY['search_path=public, pg_temp'],false) FROM pg_proc WHERE oid=fn)
    THEN RAISE EXCEPTION 'Unsafe row review RPC %',fn; END IF;
  END LOOP;
END $$;
