-- Run with psql -X -v ON_ERROR_STOP=1 in an empty, identity-verified disposable
-- Supabase database. Its runner sets halcyon.test_project after checking Docker's
-- project label, published ports, and volume. All fixtures roll back together.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  tenant uuid;
  other_tenant uuid;
  account uuid := gen_random_uuid();
  other_account uuid := gen_random_uuid();
  connection uuid := gen_random_uuid();
  mapping uuid := gen_random_uuid();
  anchor_key text := 'up-anchor:' || mapping;
  before_row jsonb;
  after_row jsonb;
  csv_row jsonb;
  count_rows integer;
  actual integer;
  total bigint;
  previous_count integer := 0;
  n integer;
  expected_sum integer;
BEGIN
  IF coalesce(current_setting('halcyon.test_project', true), '') !~ '^halcyon-anchor-[a-z0-9]+$'
     OR current_database() <> 'postgres' OR EXISTS (SELECT FROM auth.users)
     OR EXISTS (SELECT FROM public.tenants) OR EXISTS (SELECT FROM public.accounts)
     OR EXISTS (SELECT FROM public.transactions) THEN
    RAISE EXCEPTION 'Requires verified empty isolated anchor test project';
  END IF;

  INSERT INTO auth.users(id,email) VALUES (actor, actor || '@example.invalid'), (outsider, outsider || '@example.invalid');
  SELECT tenant_id INTO STRICT tenant FROM public.tenant_members WHERE user_id = actor;
  SELECT tenant_id INTO STRICT other_tenant FROM public.tenant_members WHERE user_id = outsider;
  INSERT INTO public.accounts(id,user_id,tenant_id,name,type) VALUES
    (account,actor,tenant,'Anchor test','Liquid'), (other_account,outsider,other_tenant,'Isolation test','Liquid');
  INSERT INTO public.provider_connections(id,user_id,tenant_id,provider) VALUES (connection,actor,tenant,'up');
  INSERT INTO public.account_connections(id,connection_id,tenant_id,account_id,provider,provider_account_id,cutover_date)
    VALUES (mapping,connection,tenant,account,'up','fixture','2024-03-01');

  SET LOCAL ROLE service_role;
  FOREACH n IN ARRAY ARRAY[999,1000,1001] LOOP
    INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,category,amount)
      SELECT actor,tenant,account,'2024-03-01','Boundary','Fixture','Uncategorized',
             CASE WHEN i % 2 = 0 THEN 5 ELSE -3 END FROM generate_series(previous_count + 1,n) i;
    previous_count := n;
    expected_sum := (n/2)*2 - (n%2)*3;
    PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,500);
    SELECT count(*),sum(amount) INTO count_rows,total FROM public.transactions WHERE account_id=account;
    SELECT amount INTO STRICT actual FROM public.transactions WHERE account_id=account AND external_id=anchor_key
      AND provider='up' AND occurrence=0 AND date='2024-02-29' AND category_source='seed' AND NOT needs_review
      AND original_description='Opening Balance Offset (Reconciliation)' AND merchant='Opening Balance'
      AND category='Transfer' AND subcategory='Reconciliation'
      AND dedupe_hash=extensions.digest('provider:up:v1 ' || anchor_key,'sha256');
    ASSERT count_rows=n+1 AND total=500 AND actual=500-expected_sum;
    RAISE NOTICE 'rows %, ordinary cents %, anchor %, ledger %', n,total-actual,actual,total;
  END LOOP;

  PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,1200);
  PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,1200);
  SELECT count(*),max(amount) INTO count_rows,actual FROM public.transactions WHERE account_id=account AND external_id=anchor_key;
  ASSERT count_rows=1 AND actual=203;
  RAISE NOTICE 'replacement and retry: anchors %, cents %',count_rows,actual;
  SELECT to_jsonb(t) INTO STRICT before_row FROM public.transactions t WHERE account_id=account AND external_id=anchor_key;

  BEGIN
    PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,-2147483648);
    RAISE EXCEPTION 'Expected integer-cent overflow';
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE NOTICE 'replacement failed with %', SQLSTATE;
  END;
  SELECT to_jsonb(t) INTO STRICT after_row FROM public.transactions t WHERE account_id=account AND external_id=anchor_key;
  ASSERT before_row=after_row;
  RAISE NOTICE 'rollback same complete row %, cents %', before_row=after_row,after_row->>'amount';

  BEGIN
    PERFORM public.reconcile_provider_anchor(tenant,outsider,account,mapping,500);
    RAISE EXCEPTION 'Accepted actor outside tenant';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'foreign actor %',SQLSTATE;
  END;
  BEGIN
    PERFORM public.reconcile_provider_anchor(other_tenant,outsider,other_account,mapping,500);
    RAISE EXCEPTION 'Accepted mapping outside tenant';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'foreign mapping %',SQLSTATE;
  END;
  BEGIN
    PERFORM public.reconcile_provider_anchor(tenant,actor,other_account,mapping,500);
    RAISE EXCEPTION 'Accepted mismatched account';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'foreign account %',SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO count_rows FROM public.transactions WHERE account_id=account AND external_id=anchor_key;
  ASSERT count_rows=0;
  RAISE NOTICE 'other tenant visible anchors %',count_rows;
  BEGIN
    PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,500);
    RAISE EXCEPTION 'Browser executed RPC';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'authenticated execute %',SQLSTATE;
  END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  SELECT to_jsonb(t) INTO STRICT after_row FROM public.transactions t WHERE account_id=account AND external_id=anchor_key;
  ASSERT before_row=after_row;

  PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,997);
  SELECT count(*),sum(amount) INTO count_rows,total FROM public.transactions WHERE account_id=account;
  ASSERT count_rows=1001 AND total=997;
  RAISE NOTICE 'zero offset: surviving rows %, cents %',count_rows,total;

  INSERT INTO public.transactions AS t(user_id,tenant_id,account_id,date,original_description,merchant,
    category,subcategory,category_source,needs_review,amount)
    VALUES(actor,tenant,account,'2024-02-01','Opening Balance Offset (Reconciliation)','Opening Balance',
      'Transfer','Reconciliation','seed',false,200) RETURNING to_jsonb(t) INTO csv_row;
  PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,1300);
  SELECT amount INTO STRICT actual FROM public.transactions WHERE account_id=account AND external_id=anchor_key;
  ASSERT actual=103;
  PERFORM public.reconcile_provider_anchor(tenant,actor,account,mapping,1197);
  SELECT to_jsonb(t) INTO STRICT after_row FROM public.transactions t WHERE id=(csv_row->>'id')::uuid;
  SELECT count(*) FILTER (WHERE external_id=anchor_key),sum(amount) INTO count_rows,total
    FROM public.transactions WHERE account_id=account;
  ASSERT after_row=csv_row AND count_rows=0 AND total=1197;
  RAISE NOTICE 'CSV same complete row %, cents %, provider anchors %, ledger %',after_row=csv_row,after_row->>'amount',count_rows,total;
END;
$$;
ROLLBACK;
