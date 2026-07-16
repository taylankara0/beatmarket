'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-client';

export default function UploadBeatPage() {
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [priceBasic, setPriceBasic] = useState('29.99');
  const [priceExclusive, setPriceExclusive] = useState('199.99');
  const [bpm, setBpm] = useState('');

  const [previewFile, setPreviewFile] = useState(null);
  const [untaggedFile, setUntaggedFile] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  async function uploadToR2(file) {
    if (!file) {
      return null;
    }

    const contentType =
      file.type || 'application/octet-stream';

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: file.name,
        contentType
      })
    });

    if (!response.ok) {
      const responseBody = await response
        .json()
        .catch(() => null);

      throw new Error(
        responseBody?.error ||
          `Failed to create an upload URL for ${file.name}.`
      );
    }

    const { uploadUrl, fileKey } =
      await response.json();

    if (!uploadUrl || !fileKey) {
      throw new Error(
        `The upload URL or storage key is missing for ${file.name}.`
      );
    }

    const uploadResult = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: file
    });

    if (!uploadResult.ok) {
      throw new Error(
        `Direct R2 upload failed for ${file.name}.`
      );
    }

    return fileKey;
  }

  function sanitizeFilename(name) {
    return name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
  }

  function getFileFormat(file) {
    const filename = file?.name || '';
    const extension = filename
      .split('.')
      .pop()
      ?.trim()
      .toUpperCase();

    if (
      extension &&
      extension !== filename.toUpperCase()
    ) {
      return extension;
    }

    const contentType =
      file?.type?.toLowerCase() || '';

    if (
      contentType === 'audio/wav' ||
      contentType === 'audio/x-wav' ||
      contentType === 'audio/wave'
    ) {
      return 'WAV';
    }

    if (
      contentType === 'audio/mpeg' ||
      contentType === 'audio/mp3'
    ) {
      return 'MP3';
    }

    return 'AUDIO';
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!previewFile || !untaggedFile) {
      setStatusMessage(
        '❌ Please select both a preview track and an untagged master track.'
      );

      return;
    }

    const trimmedTitle = title.trim();
    const basicPrice = Number(priceBasic);
    const exclusivePrice = Number(priceExclusive);

    const parsedBpm = bpm
      ? Number.parseInt(bpm, 10)
      : null;

    if (!trimmedTitle) {
      setStatusMessage(
        '❌ Please enter a beat title.'
      );

      return;
    }

    if (
      !Number.isFinite(basicPrice) ||
      basicPrice <= 0
    ) {
      setStatusMessage(
        '❌ Please enter a valid Basic license price.'
      );

      return;
    }

    if (
      !Number.isFinite(exclusivePrice) ||
      exclusivePrice <= 0
    ) {
      setStatusMessage(
        '❌ Please enter a valid Exclusive license price.'
      );

      return;
    }

    if (
      parsedBpm !== null &&
      (!Number.isInteger(parsedBpm) ||
        parsedBpm <= 0)
    ) {
      setStatusMessage(
        '❌ Please enter a valid BPM value.'
      );

      return;
    }

    let createdBeatId = null;

    try {
      setUploading(true);

      setStatusMessage(
        '🔐 Checking your account...'
      );

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          'You must be signed in to publish beats.'
        );
      }

      const cleanPreviewFile = new File(
        [previewFile],
        sanitizeFilename(previewFile.name),
        {
          type:
            previewFile.type ||
            'audio/mpeg'
        }
      );

      const cleanUntaggedFile = new File(
        [untaggedFile],
        sanitizeFilename(untaggedFile.name),
        {
          type:
            untaggedFile.type ||
            'application/octet-stream'
        }
      );

      const previewFormat =
        getFileFormat(cleanPreviewFile);

      const masterFormat =
        getFileFormat(cleanUntaggedFile);

      setStatusMessage(
        '📤 Uploading tracks securely to Cloudflare R2...'
      );

      const [previewKey, untaggedKey] =
        await Promise.all([
          uploadToR2(cleanPreviewFile),
          uploadToR2(cleanUntaggedFile)
        ]);

      setStatusMessage(
        '💾 Saving the beat to the marketplace...'
      );

      const {
        data: createdBeat,
        error: beatInsertError
      } = await supabase
        .from('beats')
        .insert({
          title: trimmedTitle,
          bpm: parsedBpm,
          preview_url: previewKey,
          untagged_file_key: untaggedKey,
          producer_id: user.id
        })
        .select('id')
        .single();

      if (beatInsertError || !createdBeat) {
        throw new Error(
          beatInsertError?.message ||
            'The beat could not be saved.'
        );
      }

      createdBeatId = createdBeat.id;

      const { error: licensesInsertError } =
        await supabase
          .from('licenses')
          .insert([
            {
              beat_id: createdBeat.id,
              name: 'Basic',
              price: basicPrice.toFixed(2),
              file_format:
                previewFormat === 'AUDIO'
                  ? 'MP3'
                  : previewFormat,
              is_exclusive: false
            },
            {
              beat_id: createdBeat.id,
              name: 'Exclusive',
              price:
                exclusivePrice.toFixed(2),
              file_format: masterFormat,
              is_exclusive: true
            }
          ]);

      if (licensesInsertError) {
        const { error: beatDeleteError } =
          await supabase
            .from('beats')
            .delete()
            .eq('id', createdBeat.id);

        if (beatDeleteError) {
          console.error(
            'Incomplete beat cleanup failed:',
            beatDeleteError
          );
        }

        createdBeatId = null;

        throw new Error(
          licensesInsertError.message ||
            'The beat licenses could not be saved.'
        );
      }

      setStatusMessage(
        '🎉 Success! The beat and its licenses were published.'
      );

      setTitle('');
      setBpm('');
      setPriceBasic('29.99');
      setPriceExclusive('199.99');
      setPreviewFile(null);
      setUntaggedFile(null);
    } catch (error) {
      console.error(
        'Beat upload error:',
        error
      );

      if (createdBeatId) {
        const { error: cleanupError } =
          await supabase
            .from('beats')
            .delete()
            .eq('id', createdBeatId);

        if (cleanupError) {
          console.error(
            'Beat cleanup failed:',
            cleanupError
          );
        }
      }

      setStatusMessage(
        `❌ Error processing upload: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: '500px',
        margin: '40px auto',
        padding: '20px',
        fontFamily: 'sans-serif'
      }}
    >
      <h1>Upload Your New Beat</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}
      >
        <label>
          <strong>Beat Title *</strong>

          <input
            type="text"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            required
            disabled={uploading}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px'
            }}
          />
        </label>

        <label>
          <strong>BPM</strong>

          <input
            type="number"
            min="1"
            value={bpm}
            onChange={(event) =>
              setBpm(event.target.value)
            }
            disabled={uploading}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px'
            }}
          />
        </label>

        <div
          style={{
            display: 'flex',
            gap: '10px'
          }}
        >
          <label style={{ flex: 1 }}>
            <strong>
              Basic License Price ($) *
            </strong>

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={priceBasic}
              onChange={(event) =>
                setPriceBasic(
                  event.target.value
                )
              }
              required
              disabled={uploading}
              style={{
                width: '100%',
                padding: '8px',
                marginTop: '4px'
              }}
            />
          </label>

          <label style={{ flex: 1 }}>
            <strong>
              Exclusive License Price ($) *
            </strong>

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={priceExclusive}
              onChange={(event) =>
                setPriceExclusive(
                  event.target.value
                )
              }
              required
              disabled={uploading}
              style={{
                width: '100%',
                padding: '8px',
                marginTop: '4px'
              }}
            />
          </label>
        </div>

        <label>
          <strong>
            Streaming Preview Track (Tagged MP3) *
          </strong>

          <input
            type="file"
            accept="audio/mp3,audio/mpeg"
            onChange={(event) =>
              setPreviewFile(
                event.target.files?.[0] ||
                  null
              )
            }
            required
            disabled={uploading}
            style={{
              display: 'block',
              marginTop: '6px'
            }}
          />
        </label>

        <label>
          <strong>
            Master Audio Track (Untagged WAV/MP3) *
          </strong>

          <input
            type="file"
            accept="audio/*"
            onChange={(event) =>
              setUntaggedFile(
                event.target.files?.[0] ||
                  null
              )
            }
            required
            disabled={uploading}
            style={{
              display: 'block',
              marginTop: '6px'
            }}
          />
        </label>

        <button
          type="submit"
          disabled={uploading}
          style={{
            padding: '12px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: uploading
              ? 'not-allowed'
              : 'pointer',
            fontWeight: 'bold',
            opacity: uploading ? 0.7 : 1
          }}
        >
          {uploading
            ? 'Processing Storage Pipelines...'
            : 'Publish Beat to Marketplace'}
        </button>
      </form>

      {statusMessage && (
        <p
          style={{
            marginTop: '20px',
            fontWeight: 'bold',
            textAlign: 'center'
          }}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}