'use client';
import { createClient } from '@/lib/supabase-client';

import { useState } from 'react';

export default function UploadBeatPage() {
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [priceBasic, setPriceBasic] = useState('29.99');
  const [priceExclusive, setPriceExclusive] = useState('199.99');
  const [bpm, setBpm] = useState('');
  
  // Track file selection states
  const [previewFile, setPreviewFile] = useState(null);
  const [untaggedFile, setUntaggedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Reusable utility to upload a file directly to Cloudflare R2 via presigned URLs
  async function uploadToR2(file) {
    if (!file) return null;

    // 1. Get a secure temporary upload token from our Next.js backend API endpoint
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
      }),
    });

    if (!response.ok) throw new Error(`Failed to secure upload signature for ${file.name}`);
    
    const { uploadUrl, fileKey } = await response.json();

    // 2. Upload the raw binary stream directly to Cloudflare R2
    const uploadResult = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadResult.ok) throw new Error(`Direct upload failed for ${file.name}`);

    return fileKey; // Returns the unique path key to store in Supabase later
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!previewFile || !untaggedFile) {
      setStatusMessage('❌ Please select both a preview track and an untagged master track.');
      return;
    }

    try {
      setUploading(true);
      setStatusMessage('📤 Uploading tracks directly to Cloudflare R2 securely...');

      // Clean up filenames by replacing spaces, brackets, and parentheses with underscores
      const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9.]/g, '_');

      const cleanPreviewFile = new File([previewFile], sanitizeFilename(previewFile.name), { type: previewFile.type });
      const cleanUntaggedFile = new File([untaggedFile], sanitizeFilename(untaggedFile.name), { type: untaggedFile.type });

      const [previewKey, untaggedKey] = await Promise.all([
        uploadToR2(cleanPreviewFile),
        uploadToR2(cleanUntaggedFile),
      ]);

      setStatusMessage('💾 Files uploaded successfully! Ready to link keys to your database.');
      console.log('R2 Asset Storage Keys:', { previewKey, untaggedKey });

      // 3. Connect metadata keys to your Supabase PostgreSQL table
      // 2. Fetch the logged-in user's session natively from Supabase Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('You must be signed in to publish beats to the marketplace.');
      }

      const { data, error } = await supabase
        .from('beats')
        .insert([
          {
            title: title,
            bpm: bpm ? parseInt(bpm, 10) : null,
            price_basic: parseFloat(priceBasic),
            price_exclusive: parseFloat(priceExclusive),
            preview_url: previewKey,   // Unique identifier pointing to Cloudflare R2
            untagged_file_key: untaggedKey, // Unique identifier pointing to Cloudflare R2
            producer_id: user.id,
          }
        ])
        .select();

      if (error) throw error;

      setStatusMessage('🎉 Success! Beat uploaded and published to the marketplace!');
      
      // Reset form controls
      setTitle('');
      setBpm('');

    } catch (error) {
      console.error(error);
      setStatusMessage(`❌ Error processing upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ maxWidth: '500px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Upload Your New Beat</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        <label>
          <strong>Beat Title *</strong>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
        </label>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ flex: 1 }}>
            <strong>BPM</strong>
            <input type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ flex: 1 }}>
            <strong>Basic License Price ($) *</strong>
            <input type="number" step="0.01" value={priceBasic} onChange={(e) => setPriceBasic(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
          </label>
          <label style={{ flex: 1 }}>
            <strong>Exclusive License Price ($) *</strong>
            <input type="number" step="0.01" value={priceExclusive} onChange={(e) => setPriceExclusive(e.target.value)} required style={{ width: '100%', padding: '8px', marginTop: '4px' }} />
          </label>
        </div>

        <label>
          <strong>Streaming Preview Track (Tagged MP3) *</strong>
          <input type="file" accept="audio/mp3,audio/mpeg" onChange={(e) => setPreviewFile(e.target.files[0])} required style={{ display: 'block', marginTop: '6px' }} />
        </label>

        <label>
          <strong>Master Audio Track (Untagged WAV/MP3) *</strong>
          <input type="file" accept="audio/*" onChange={(e) => setUntaggedFile(e.target.files[0])} required style={{ display: 'block', marginTop: '6px' }} />
        </label>

        <button type="submit" disabled={uploading} style={{ padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
          {uploading ? 'Processing Storage Pipelines...' : 'Publish Beat to Marketplace'}
        </button>
      </form>

      {statusMessage && <p style={{ marginTop: '20px', fontWeight: 'bold', textAlign: 'center' }}>{statusMessage}</p>}
    </div>
  );
}