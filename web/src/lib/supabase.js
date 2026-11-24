import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, AUTH_STORAGE_KEY } from './config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true },
})

// Accounts are usernames; Supabase wants an email, so each gets one on a domain that never receives mail.
export const emailFor = (username) => `${username.trim().toLowerCase()}@users.example.com`

export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export function explainAuthError(err) {
  const m = String(err?.message || err || '')
  if (/invalid login credentials/i.test(m)) return 'That username and password do not match.'
  if (/invite_invalid/i.test(m) || /database error saving new user/i.test(m)) return 'That invite code is not valid any more. Ask for a new one.'
  if (/username_invalid/i.test(m)) return 'Usernames are 3 to 20 letters, digits or underscores.'
  if (/already registered|already been registered/i.test(m)) return 'That username is taken.'
  if (/password/i.test(m) && /least/i.test(m)) return 'Passwords need at least 8 characters.'
  if (/fetch|network/i.test(m)) return 'Cannot reach the server. Check your connection.'
  return m || 'Something went wrong.'
}
