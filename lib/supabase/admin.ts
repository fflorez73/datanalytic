import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con service_role — bypassa RLS y expone supabase.auth.admin.*.
 * SOLO importar desde Server Actions / código server-side. Nunca desde
 * un componente 'use client' ni exponer SUPABASE_SERVICE_ROLE_KEY con
 * prefijo NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.'
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    db: { schema: 'analytics' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
