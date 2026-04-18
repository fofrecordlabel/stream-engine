/** User-facing copy for Supabase OAuth failures (incl. disabled providers). */
export function formatOAuthProviderError(error) {
  if (!error) return 'Sign-in could not start. Please try again.'
  const raw =
    typeof error === 'string'
      ? error
      : error.message || error.error_description || error.msg || ''
  const s = String(raw || '').trim()
  if (/unsupported provider|provider is not enabled|not enabled|provider.*disabled/i.test(s)) {
    return (
      'Google or Apple sign-in is not turned on for this Supabase project yet. ' +
      'Enable the provider under Authentication → Providers, add OAuth credentials, ' +
      'then set Site URL and Redirect URLs under URL Configuration. ' +
      'You can keep using email and password below.'
    )
  }
  if (s.length > 240) return 'Sign-in could not start. Try email and password or try again later.'
  return s || 'Sign-in could not start. Please try again.'
}
