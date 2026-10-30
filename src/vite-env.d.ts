/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Supabase project URL, e.g. https://abcd.supabase.co. Public. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase's publishable key. Public by design; access is controlled by the database's rules. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
