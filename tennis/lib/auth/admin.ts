// lib/auth/admin.ts
import { createClient } from '@/lib/supabase/server';

/**
 * Get the authenticated user from the session
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Check if the user is an admin
 *
 * TODO: Implement proper RBAC with user_profiles table
 * For now, we'll use a simple environment variable check
 * In production, you should:
 * 1. Create a user_profiles table with role column
 * 2. Check user.id against that table
 * 3. Use proper role-based permissions
 */
export async function isAdmin(userId: string): Promise<boolean> {
  // TEMPORARY: Check against environment variable list of admin user IDs
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(',') || [];

  if (adminUserIds.includes(userId)) {
    return true;
  }

  // TODO: Implement proper database check
  // const supabase = await createClient();
  // const { data } = await supabase
  //   .from('user_profiles')
  //   .select('role')
  //   .eq('user_id', userId)
  //   .single();
  //
  // return data?.role === 'admin';

  return false;
}

/**
 * Require admin authentication for an API route
 * Returns the user if authenticated and admin, throws error otherwise
 */
export async function requireAdmin() {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  const userIsAdmin = await isAdmin(user.id);

  if (!userIsAdmin) {
    throw new Error('Admin access required');
  }

  return user;
}

/**
 * Create a standardized unauthorized response
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return Response.json(
    { success: false, error: message },
    { status: 401 }
  );
}

/**
 * Create a standardized forbidden response
 */
export function forbiddenResponse(message = 'Forbidden') {
  return Response.json(
    { success: false, error: message },
    { status: 403 }
  );
}
