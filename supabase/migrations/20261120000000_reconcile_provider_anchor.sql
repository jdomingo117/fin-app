-- sync-provider calls this with its service client and the actor resolved by withAuth.
CREATE FUNCTION public.reconcile_provider_anchor(
  p_tenant uuid, p_user uuid, p_account uuid, p_account_connection uuid, p_balance_cents integer
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  mapped_provider public.provider_kind;
  cutover date;
  external_key text := 'up-anchor:' || p_account_connection;
  ledger_cents bigint;
  offset_cents bigint;
BEGIN
  IF p_balance_cents IS NULL THEN
    RAISE EXCEPTION 'Provider balance is required' USING ERRCODE = '22004';
  END IF;

  -- Serialize replacements and verify the entire mapping under the actor's tenant.
  SELECT c.provider, c.cutover_date INTO mapped_provider, cutover
    FROM public.account_connections c
    JOIN public.accounts a ON a.id = c.account_id AND a.tenant_id = c.tenant_id
    JOIN public.provider_connections pc ON pc.id = c.connection_id AND pc.tenant_id = c.tenant_id
                                        AND pc.provider = c.provider
    JOIN public.tenant_members m ON m.tenant_id = c.tenant_id AND m.user_id = p_user
   WHERE c.id = p_account_connection AND c.tenant_id = p_tenant AND c.account_id = p_account
     AND m.role IN ('owner', 'admin', 'member')
   FOR UPDATE OF a, c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider mapping unavailable' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.transactions
   WHERE tenant_id = p_tenant AND account_id = p_account
     AND provider = mapped_provider AND external_id = external_key;

  -- The CSV opening balance (if any) is part of the account's historical ledger.
  SELECT coalesce(sum(amount), 0) INTO ledger_cents FROM public.transactions
   WHERE tenant_id = p_tenant AND account_id = p_account;
  offset_cents := p_balance_cents::bigint - ledger_cents;

  IF offset_cents <> 0 THEN
    INSERT INTO public.transactions (
      tenant_id, user_id, account_id, date, original_description, merchant,
      category, subcategory, amount, category_source, needs_review,
      provider, external_id, dedupe_hash, occurrence
    ) VALUES (
      p_tenant, p_user, p_account, cutover - 1, 'Opening Balance Offset (Reconciliation)', 'Opening Balance',
      'Transfer', 'Reconciliation', offset_cents::integer, 'seed', false,
      mapped_provider, external_key, extensions.digest('provider:' || mapped_provider::text || ':v1 ' || external_key, 'sha256'), 0
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_provider_anchor(uuid,uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_provider_anchor(uuid,uuid,uuid,uuid,integer) TO service_role;

DO $$
DECLARE
  fn regprocedure := 'public.reconcile_provider_anchor(uuid,uuid,uuid,uuid,integer)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Invalid provider reconciliation grants';
  END IF;
END;
$$;
