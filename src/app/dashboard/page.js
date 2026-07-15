import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // UPDATED: Joined query to fetch licenses associated with each beat
  const { data: myBeats, error: dbError } = await supabase
    .from('beats')
    .select(`
      id, 
      title, 
      bpm, 
      created_at,
      licenses (name, price)
    `)
    .eq('producer_id', user.id)
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('Database Error:', dbError);
    return <div style={{ padding: '40px', color: 'red', textAlign: 'center' }}>Error loading dashboard data.</div>;
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0' }}>Producer Dashboard</h1>
          <p style={{ margin: 0, color: '#666' }}>Manage your catalog and track marketplace listings.</p>
        </div>
        <Link href="/upload-beat" style={{ background: '#0070f3', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold' }}>
          + Upload New Beat
        </Link>
      </header>

      <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Your Published Beats ({myBeats.length})</h2>

      {myBeats.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #ccc', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#666', margin: '0 0 20px 0' }}>You haven't uploaded any beats yet.</p>
          <Link href="/upload-beat" style={{ color: '#0070f3', fontWeight: 'bold', textDecoration: 'none' }}>
            Get started →
          </Link>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f5f5f7', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '15px' }}>Title</th>
                <th style={{ padding: '15px' }}>BPM</th>
                <th style={{ padding: '15px' }}>Basic Price</th>
                <th style={{ padding: '15px' }}>Exclusive Price</th>
              </tr>
            </thead>
            <tbody>
              {myBeats.map((beat) => {
                const basic = beat.licenses.find(l => l.name === 'Basic')?.price || 0;
                const exclusive = beat.licenses.find(l => l.name === 'Exclusive')?.price || 0;
                return (
                  <tr key={beat.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px', fontWeight: 'bold' }}>{beat.title}</td>
                    <td style={{ padding: '15px' }}>{beat.bpm || 'N/A'}</td>
                    <td style={{ padding: '15px' }}>${basic.toFixed(2)}</td>
                    <td style={{ padding: '15px' }}>${exclusive.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}