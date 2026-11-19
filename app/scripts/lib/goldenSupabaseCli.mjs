export function goldenSupabaseCli(args, override = process.env.SUPABASE_CLI) {
  return override ? [override, args] : ['npx', ['supabase@2', ...args]]
}
