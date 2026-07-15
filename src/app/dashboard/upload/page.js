'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';

export default function ProducerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  
  const [title, setTitle] = useState('');
  const [bpm, setBpm] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [basicPrice, setBasicPrice] = useState('29.99');
  const [premiumPrice, setPremiumPrice] = useState('49.99');
  const [exclusivePrice, setExclusivePrice] = useState('199.99');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/login');
      else setUser(user);
    }
    checkUser();
  }, [router]);

  const handleUpload = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    try {
      if (!audioFile) throw new Error('Please select an audio file.');

      // 1. Upload the MASTER file to the PRIVATE bucket
      const fileExt = audioFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`; 
      
      const { error: uploadError } = await supabase
        .storage
        .from('private-masters')
        .upload(fileName, audioFile);

      if (uploadError) throw uploadError;

      // 2. Insert the Beat record (preview_url will be updated by the watermark trigger later)
      const { data: newBeat, error: beatError } = await supabase
        .from('beats')
        .insert([{ 
            title: title, 
            bpm: parseInt(bpm) || null, 
            preview_url: 'pending', // Placeholder until watermarking completes
            producer_id: user.id,
            untagged_file_key: fileName 
        }])
        .select()
        .single();

      if (beatError) throw beatError;

      // 3. Insert the Licenses
      const { error: licenseError } = await supabase.from('licenses').insert([
        { beat_id: newBeat.id, name: 'Basic', price: parseFloat(basicPrice), file_format: 'MP3', is_exclusive: false },
        { beat_id: newBeat.id, name: 'Premium', price: parseFloat(premiumPrice), file_format: 'WAV', is_exclusive: false },
        { beat_id: newBeat.id, name: 'Exclusive', price: parseFloat(exclusivePrice), file_format: 'TRACKOUTS', is_exclusive: true }
      ]);

      if (licenseError) throw licenseError;

      setMessage({ type: 'success', text: 'Beat uploaded to secure storage! Watermarking in progress...' });
      setTitle(''); setBpm(''); setAudioFile(null);
      document.getElementById('audio-upload-input').value = '';
      
    } catch (err) {
      console.error('--- DASHBOARD FETCH ERROR START ---');
      console.error(err);
      console.error('--- DASHBOARD FETCH ERROR END ---');  
      
      setError('Error loading dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div style={{ padding: '40px', textAlign: 'center' }}>Authenticating...</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h1>Producer Dashboard</h1>
      <form onSubmit={handleUpload} style={{ background: '#fff', padding: '30px', borderRadius: '12px', border: '1px solid #eee' }}>
        <h3>1. Track Details</h3>
        <input required type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Beat Title" style={{ width: '100%', padding: '10px', marginBottom: '15px' }} />
        <input type="number" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="BPM" style={{ width: '100%', padding: '10px', marginBottom: '15px' }} />
        <input id="audio-upload-input" required type="file" accept="audio/*" onChange={e => setAudioFile(e.target.files[0])} />
        
        <h3>2. Pricing (USD)</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input required type="number" step="0.01" value={basicPrice} onChange={e => setBasicPrice(e.target.value)} placeholder="Basic" />
          <input required type="number" step="0.01" value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)} placeholder="Premium" />
          <input required type="number" step="0.01" value={exclusivePrice} onChange={e => setExclusivePrice(e.target.value)} placeholder="Exclusive" />
        </div>
        
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '20px', padding: '14px', background: '#111', color: '#fff' }}>
          {loading ? 'Processing...' : 'Publish Beat'}
        </button>
      </form>
    </div>
  );
}