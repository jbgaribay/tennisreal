// app/admin/page.tsx - SECURED VERSION
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminPanel from './admin-panel';

export default async function AdminPage() {
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/auth/login?redirect=/admin');
  }

  // Optional: Add role-based access control
  // For now, any authenticated user can access admin panel
  // You can add more sophisticated role checks here:
  // const { data: profile } = await supabase
  //   .from('user_profiles')
  //   .select('role')
  //   .eq('user_id', user.id)
  //   .single();
  //
  // if (profile?.role !== 'admin') {
  //   redirect('/');
  // }

  return <AdminPanel />;
}
