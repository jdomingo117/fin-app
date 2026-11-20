-- Reports sum stored signed integer cents across all selected account currencies.
-- No FX conversion. BIGINT aggregates travel as decimal strings in JSON so that
-- consumers can check the safe-integer range before converting to Number.
CREATE VIEW public.reporting_transaction_lines WITH (security_invoker = true) AS
SELECT t.tenant_id,t.id AS parent_id,a.id AS allocation_id,coalesce(a.position,-1) AS position,
       t.date,t.account_id,coalesce(nullif(t.merchant,''),t.original_description) AS merchant,
       t.merchant_key,t.original_description,t.pending,t.is_transfer,t.transfer_state,t.kind_source,
       t.needs_review,coalesce(a.amount,t.amount) AS amount,coalesce(a.kind,t.kind) AS kind,
       coalesce(a.category,t.category) AS category,
       CASE WHEN a.id IS NULL THEN t.subcategory ELSE a.subcategory END AS subcategory,
       a.note AS allocation_note
FROM public.transactions_analytic t
LEFT JOIN public.transaction_allocations a ON a.tenant_id=t.tenant_id AND a.transaction_id=t.id
WHERE public.is_tenant_member(t.tenant_id);

CREATE FUNCTION public.portfolio_summary(p_tenant uuid,p_as_of date,p_account_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  RETURN (
    WITH balances AS (
      SELECT coalesce(sum(balance),0)::text AS net_worth_cents,
        coalesce(sum(greatest(balance,0)) FILTER (WHERE type IN ('Liquid','Savings')),0)::text AS cash_asset_cents,
        coalesce(sum(greatest(balance,0)) FILTER (WHERE type='Invest'),0)::text AS investment_asset_cents
      FROM public.accounts WHERE tenant_id=p_tenant AND (p_account_ids IS NULL OR id=ANY(p_account_ids))
    ), activity AS (
      SELECT coalesce(sum(amount) FILTER (WHERE date BETWEEN p_as_of-29 AND p_as_of AND NOT pending AND NOT is_transfer),0)::text AS net_movement_30d_cents,
        count(*) FILTER (WHERE needs_review OR category='Uncategorized') AS attention_count,
        count(*) FILTER (WHERE transfer_state IN ('suggested','unmatched')) AS transfer_leg_count
      FROM public.transactions_analytic WHERE tenant_id=p_tenant AND (p_account_ids IS NULL OR account_id=ANY(p_account_ids))
    ) SELECT to_jsonb(balances)||to_jsonb(activity) FROM balances,activity
  );
END $$;

-- p_from/to define the chart. Focus applies to current/prior comparison only.
-- Full category facets support part-to-whole charts even with a selection.
CREATE FUNCTION public.cash_flow_report(p_tenant uuid,p_from date,p_to date,p_account_ids uuid[] DEFAULT NULL,
  p_grain text DEFAULT 'reporting',p_bucket text DEFAULT 'day',p_categories text[] DEFAULT NULL,
  p_subcategories text[] DEFAULT NULL,p_focus_from date DEFAULT NULL,p_focus_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE lo date:=coalesce(p_focus_from,p_from); hi date:=coalesce(p_focus_to,p_to); prior_start date:=lo-(hi-lo+1);
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_from IS NULL OR p_to IS NULL OR lo>hi OR lo<p_from OR hi>p_to OR
     p_grain NOT IN ('reporting','parent') OR p_bucket NOT IN ('day','week','month') THEN RAISE invalid_parameter_value; END IF;
  RETURN (
    WITH input AS (
      SELECT date,amount,kind,kind_source,transfer_state,category,subcategory,merchant,needs_review
      FROM public.reporting_transaction_lines WHERE p_grain='reporting' AND tenant_id=p_tenant
        AND date BETWEEN least(prior_start,p_from) AND p_to AND NOT pending AND NOT is_transfer
        AND (p_account_ids IS NULL OR account_id=ANY(p_account_ids))
      UNION ALL
      SELECT date,amount,kind,kind_source,transfer_state,category,subcategory,coalesce(nullif(merchant,''),original_description),needs_review
      FROM public.transactions_analytic WHERE p_grain='parent' AND tenant_id=p_tenant
        AND date BETWEEN least(prior_start,p_from) AND p_to AND NOT pending AND NOT is_transfer
        AND (p_account_ids IS NULL OR account_id=ANY(p_account_ids))
    ), classified AS (
      SELECT *,CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected'
               THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END AS effective_kind
      FROM input
    ), facts AS (
      SELECT *,CASE WHEN effective_kind='income' THEN greatest(amount,0) ELSE 0 END AS earned,
        CASE WHEN effective_kind='expense' THEN greatest(-amount::bigint,0) ELSE 0 END AS gross,
        CASE WHEN effective_kind IN ('refund','reimbursement') THEN greatest(amount,0) ELSE 0 END AS contra,
        (coalesce(cardinality(p_categories),0)=0 OR category=ANY(p_categories)) AND
        (coalesce(cardinality(p_subcategories),0)=0 OR subcategory=ANY(p_subcategories)) AS selected,
        CASE WHEN date BETWEEN lo AND hi THEN 'current' WHEN date BETWEEN prior_start AND lo-1 THEN 'prior' END AS period
      FROM classified
    ), periods AS (
      SELECT label,coalesce(sum(earned),0)::text AS earned_cents,coalesce(sum(gross),0)::bigint::text AS gross_cents,
        coalesce(sum(gross-contra),0)::bigint::text AS expense_cents,
        count(*) FILTER (WHERE gross>0 AND (needs_review OR category='Uncategorized')) AS expense_attention_count
      FROM (VALUES ('current'),('prior')) w(label) LEFT JOIN facts ON period=label AND selected GROUP BY label
    ), chart AS (
      SELECT CASE p_bucket WHEN 'week' THEN p_from+((date-p_from)/7)*7 WHEN 'month' THEN date_trunc('month',date)::date ELSE date END AS bucket,
        sum(earned) AS earned,sum(gross) AS gross,sum(gross-contra) AS expense
      FROM facts WHERE date BETWEEN p_from AND p_to AND selected GROUP BY 1
    ), buckets AS (
      SELECT d::date AS bucket,coalesce(c.earned,0)::text AS earned_cents,coalesce(c.gross,0)::bigint::text AS gross_cents,
        coalesce(c.expense,0)::bigint::text AS expense_cents
      FROM generate_series((CASE WHEN p_bucket='month' THEN date_trunc('month',p_from)::date ELSE p_from END)::timestamp,
        p_to::timestamp,CASE p_bucket WHEN 'week' THEN interval '7 days' WHEN 'month' THEN interval '1 month' ELSE interval '1 day' END) d
      LEFT JOIN chart c ON c.bucket=d::date
    ), facets AS (
      SELECT period,category,subcategory,sum(earned)::text AS earned_cents,sum(gross)::bigint::text AS gross_cents,
        count(*) FILTER (WHERE gross>0) AS expense_count,count(*) FILTER (WHERE earned>0) AS deposit_count,
        max(earned)::text AS largest_deposit_cents,max(date) FILTER (WHERE earned>0) AS latest_deposit
      FROM facts WHERE period IS NOT NULL GROUP BY period,category,subcategory
    ), top_merchant AS (
      SELECT merchant,sum(gross)::bigint AS total FROM facts WHERE selected AND period='current' AND gross>0
      GROUP BY merchant ORDER BY total DESC,merchant LIMIT 1
    )
    SELECT jsonb_build_object('periods',(SELECT jsonb_object_agg(label,to_jsonb(periods)-'label') FROM periods),
      'buckets',(SELECT jsonb_agg(to_jsonb(buckets) ORDER BY bucket) FROM buckets),
      'categories',coalesce((SELECT jsonb_agg(to_jsonb(facets) ORDER BY period,category,subcategory) FROM facets),'[]'),
      'top_merchant',(SELECT jsonb_build_object('merchant',merchant,'gross_cents',total::text) FROM top_merchant))
  );
END $$;

-- Parent-grain, twelve calendar points. Run twice with the appropriate active
-- charge IDs when the saved baseline and selected scenario differ.
CREATE FUNCTION public.movement_history(p_tenant uuid,p_as_of date,p_account_ids uuid[] DEFAULT NULL,
  p_metric text DEFAULT 'cash',p_exclude_charge_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_month date:=date_trunc('month',p_as_of)::date;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_as_of IS NULL OR p_metric NOT IN ('cash','netWorth') THEN RAISE invalid_parameter_value; END IF;
  RETURN (
    WITH accounts_in_scope AS (
      SELECT id,type,balance FROM public.accounts WHERE tenant_id=p_tenant AND (p_account_ids IS NULL OR id=ANY(p_account_ids))
    ), facts AS (
      SELECT t.date,t.amount,t.pending,t.category,t.kind,t.is_transfer,a.type,
        NOT(t.id=ANY(coalesce(p_exclude_charge_ids,'{}'))) AS in_baseline,
        CASE WHEN p_metric='cash' THEN a.type IN ('Liquid','Savings') ELSE NOT t.is_transfer END AS eligible
      FROM public.transactions_analytic t JOIN accounts_in_scope a ON a.id=t.account_id WHERE t.tenant_id=p_tenant
    ), totals AS (
      SELECT date_trunc('month',date)::date AS month,sum(amount) AS all_cents,
        sum(amount) FILTER (WHERE NOT pending AND type IN ('Liquid','Savings')) AS cash_cents,
        sum(amount) FILTER (WHERE eligible AND NOT pending AND in_baseline AND (p_metric='cash' OR kind<>'investment')) AS baseline,
        sum(-amount::bigint) FILTER (WHERE p_metric='netWorth' AND eligible AND NOT pending AND in_baseline AND kind='investment' AND amount<0) AS contributions,
        sum(amount) FILTER (WHERE eligible AND NOT pending AND amount>0) AS observed_in,
        sum(amount) FILTER (WHERE eligible AND NOT pending AND amount<0 AND (p_metric='cash' OR kind<>'investment')) AS observed_out,
        sum(amount) FILTER (WHERE eligible AND NOT pending AND category='Uncategorized' AND (p_metric='cash' OR kind<>'investment' OR amount>=0)) AS residual
      FROM facts WHERE date>=current_month-interval '11 months' GROUP BY 1
    ), monthly AS (
      SELECT d::date AS month,coalesce(t.baseline,0)::text AS run_rate_movement_cents,
        coalesce(t.contributions,0)::bigint::text AS investment_contribution_cents,
        coalesce(t.observed_in,0)::text AS observed_in_cents,coalesce(t.observed_out,0)::text AS observed_out_cents,
        coalesce(t.residual,0)::text AS residual_cents,
        ((SELECT coalesce(sum(balance),0) FROM accounts_in_scope)-
         coalesce(sum(t.all_cents) OVER (ORDER BY d ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING),0))::bigint::text AS account_balance_cents,
        ((SELECT coalesce(sum(balance),0) FROM accounts_in_scope WHERE type IN ('Liquid','Savings'))-
          CASE WHEN d=current_month THEN 0 ELSE
          coalesce(sum(t.cash_cents) OVER (ORDER BY d ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING),0)
          +coalesce((SELECT sum(cash_cents) FROM totals WHERE month>current_month),0) END)::bigint::text AS cash_balance_cents
      FROM generate_series(current_month-interval '11 months',current_month::timestamp,interval '1 month') d
      LEFT JOIN totals t ON t.month=d::date
    )
    SELECT jsonb_build_object('baseline_from',(SELECT CASE WHEN min(date) IS NOT NULL THEN
      greatest(date_trunc('month',min(date))::date,(current_month-interval '6 months')::date) END
      FROM facts WHERE date<current_month AND in_baseline),
      'baseline_until',current_month,'months',jsonb_agg(to_jsonb(monthly) ORDER BY month)) FROM monthly
  );
END $$;

CREATE FUNCTION public.ledger_page(p_tenant uuid,p_account_ids uuid[] DEFAULT NULL,p_before_date date DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50,p_from date DEFAULT NULL,p_to date DEFAULT NULL,
  p_category text DEFAULT NULL,p_kind text DEFAULT NULL,p_query text DEFAULT NULL,p_review text DEFAULT 'all',
  p_income_source text DEFAULT NULL,p_ids uuid[] DEFAULT NULL,p_reverse boolean DEFAULT false,
  p_account_flow text DEFAULT NULL,p_account_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE insufficient_privilege; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR (p_before_date IS NULL)<>(p_before_id IS NULL)
     THEN RAISE invalid_parameter_value; END IF;
  RETURN (
    WITH matched AS NOT MATERIALIZED (
      SELECT t.*,a.name AS account_name FROM public.transactions_analytic t
      JOIN public.accounts a ON a.tenant_id=p_tenant AND a.id=t.account_id
      WHERE t.tenant_id=p_tenant AND (p_account_ids IS NULL OR t.account_id=ANY(p_account_ids))
        AND (p_ids IS NULL OR t.id=ANY(p_ids)) AND (p_from IS NULL OR t.date>=p_from) AND (p_to IS NULL OR t.date<=p_to)
        AND (p_category IS NULL OR t.category=p_category) AND (p_kind IS NULL OR t.kind=p_kind)
        AND (p_account_flow IS NULL OR (NOT t.pending AND NOT t.is_transfer AND
          CASE p_account_flow
            WHEN 'income' THEN t.amount>0 AND (t.kind='income' OR (t.kind='transfer' AND t.kind_source='derived' AND t.transfer_state='rejected'))
            WHEN 'expense' THEN t.amount<0 AND (t.kind='expense' OR (t.kind='transfer' AND t.kind_source='derived' AND t.transfer_state='rejected'))
            ELSE false END))
        AND (p_account_search IS NULL OR strpos(lower(coalesce(nullif(t.merchant,''),t.original_description)),lower(trim(p_account_search)))>0
          OR strpos(lower(t.category),lower(trim(p_account_search)))>0)
        AND (p_query IS NULL OR strpos(lower(concat_ws(' ',coalesce(nullif(t.merchant,''),t.original_description),t.original_description,
          a.name,t.category,t.subcategory,t.kind,t.spending_nature)),lower(trim(p_query)))>0)
        AND CASE p_review WHEN 'all' THEN true WHEN 'needs-attention' THEN t.needs_review OR t.category='Uncategorized'
          WHEN 'needs-review' THEN t.needs_review WHEN 'uncategorized' THEN t.category='Uncategorized'
          WHEN 'unresolved' THEN t.category='Uncategorized' AND t.category_source IS NULL
          WHEN 'eligible' THEN t.category_source IS DISTINCT FROM 'user' AND t.category_source IS DISTINCT FROM 'bank' AND NOT(t.kind='adjustment' AND t.kind_source='system')
          WHEN 'missing-subcategory' THEN t.subcategory IS NULL AND EXISTS (SELECT 1 FROM public.taxonomy_subcategories s WHERE s.category_id=t.category_id)
          WHEN 'recurring' THEN t.is_recurring WHEN 'subscription' THEN t.is_subscription WHEN 'reimbursable' THEN t.is_reimbursable
          WHEN 'tax-related' THEN t.is_tax_related ELSE t.category_source=p_review END
        AND (p_income_source IS NULL OR EXISTS (SELECT 1 FROM public.reporting_transaction_lines r
          WHERE r.tenant_id=p_tenant AND r.parent_id=t.id AND r.category=p_income_source AND NOT r.pending AND NOT r.is_transfer
            AND r.amount>0 AND (r.kind='income' OR (r.kind='transfer' AND r.kind_source='derived' AND r.transfer_state='rejected'))))
    ), candidates AS (
      SELECT * FROM matched WHERE p_before_date IS NULL OR CASE WHEN p_reverse THEN (date,id)>(p_before_date,p_before_id)
        ELSE (date,id)<(p_before_date,p_before_id) END
      ORDER BY CASE WHEN p_reverse THEN date END ASC,CASE WHEN p_reverse THEN id END ASC,date DESC,id DESC LIMIT p_limit+1
    ), page AS (
      SELECT * FROM candidates ORDER BY CASE WHEN p_reverse THEN date END ASC,CASE WHEN p_reverse THEN id END ASC,date DESC,id DESC LIMIT p_limit
    )
    SELECT jsonb_build_object('matching_count',(SELECT count(*) FROM matched),
      'attention_count',(SELECT count(*) FROM matched WHERE needs_review OR category='Uncategorized'),
      'has_more',(SELECT count(*)>p_limit FROM candidates),
      'before',(SELECT jsonb_build_object('date',date,'id',id) FROM page ORDER BY date,id LIMIT 1),
      'after',(SELECT jsonb_build_object('date',date,'id',id) FROM page ORDER BY date DESC,id DESC LIMIT 1),
      'rows',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('allocations',coalesce(children.items,'[]')) ORDER BY p.date DESC,p.id DESC)
        FROM page p LEFT JOIN LATERAL (
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a.position,a.id) AS items FROM public.transaction_allocations a
          WHERE a.tenant_id=p_tenant AND a.transaction_id=p.id
        ) children ON true),'[]'))
  );
END $$;

REVOKE ALL ON public.reporting_transaction_lines FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.reporting_transaction_lines TO authenticated;
DO $$
DECLARE fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.portfolio_summary(uuid,date,uuid[])'::regprocedure,
    'public.cash_flow_report(uuid,date,date,uuid[],text,text,text[],text[],date,date)'::regprocedure,
    'public.movement_history(uuid,date,uuid[],text,uuid[])'::regprocedure,
    'public.ledger_page(uuid,uuid[],date,uuid,integer,date,date,text,text,text,text,text,uuid[],boolean,text,text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn);
    IF has_function_privilege('service_role',fn,'EXECUTE') OR has_function_privilege('anon',fn,'EXECUTE') OR NOT has_function_privilege('authenticated',fn,'EXECUTE')
       OR (SELECT prosecdef OR provolatile<>'s' OR NOT coalesce(proconfig@>ARRAY['search_path=public, pg_temp'],false) FROM pg_proc WHERE oid=fn)
       THEN RAISE EXCEPTION 'Unsafe report RPC %',fn; END IF;
  END LOOP;
  IF NOT (SELECT coalesce(reloptions@>ARRAY['security_invoker=true'],false) FROM pg_class WHERE oid='public.reporting_transaction_lines'::regclass)
     OR has_table_privilege('service_role','public.reporting_transaction_lines','SELECT')
     OR has_table_privilege('anon','public.reporting_transaction_lines','SELECT')
     OR NOT has_table_privilege('authenticated','public.reporting_transaction_lines','SELECT') THEN RAISE EXCEPTION 'Unsafe reporting view'; END IF;
END $$;
