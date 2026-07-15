'use server';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export async function signOutAction() {
  const supabase = await createClient();
  
  // Clear the session cookies on the server side
  await supabase.auth.signOut();
  
  // Redirect the user back to the login page
  redirect('/login');
}

// THIS IS THE APPENDED SECTION:
export async function deleteBeatAction(formData) {
  const beatId = formData.get('beatId');
  if (!beatId) return;

  const supabase = await createClient();

  // 1. Double check the user session for server-side security
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // 2. Delete the row where the ID matches and the producer owns it
  const { error } = await supabase
    .from('beats')
    .delete()
    .eq('id', beatId)
    .eq('producer_id', user.id);

  if (error) {
    console.error('Database deletion error:', error);
    return;
  }

  // 3. Force Next.js to purge the cached data and redraw the tables
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/dashboard');
  revalidatePath('/explore');
}