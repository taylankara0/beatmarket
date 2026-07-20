'use client';

import { useState } from 'react';

const MEGABYTE = 1024 * 1024;
const PREVIEW_MAX_BYTES = 25 * MEGABYTE;
const MASTER_MAX_BYTES = 250 * MEGABYTE;

export default function UploadBeatPage() {
  const [title, setTitle] = useState('');

  const [priceBasic, setPriceBasic] =
    useState('29.99');

  const [
    priceExclusive,
    setPriceExclusive
  ] = useState('199.99');

  const [bpm, setBpm] = useState('');

  const [previewFile, setPreviewFile] =
    useState(null);

  const [
    untaggedFile,
    setUntaggedFile
  ] = useState(null);

  const [uploading, setUploading] =
    useState(false);

  const [
    statusMessage,
    setStatusMessage
  ] = useState('');

  function sanitizeFilename(name) {
    return name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
  }

  function getContentType(file) {
    if (file?.type) {
      return file.type
        .toLowerCase()
        .split(';')[0]
        .trim();
    }

    const extension =
      file?.name
        ?.split('.')
        .pop()
        ?.toLowerCase() || '';

    if (extension === 'mp3') {
      return 'audio/mpeg';
    }

    if (extension === 'wav') {
      return 'audio/wav';
    }

    if (extension === 'flac') {
      return 'audio/flac';
    }

    return '';
  }

  function formatMegabytes(bytes) {
    return Math.round(
      bytes / MEGABYTE
    );
  }

  function getMaximumFileSize(
    uploadType
  ) {
    if (uploadType === 'preview') {
      return PREVIEW_MAX_BYTES;
    }

    if (uploadType === 'master') {
      return MASTER_MAX_BYTES;
    }

    return 0;
  }

  function validateFileSize(
    file,
    uploadType
  ) {
    const maximumBytes =
      getMaximumFileSize(
        uploadType
      );

    if (!maximumBytes) {
      throw new Error(
        'The upload type is invalid.'
      );
    }

    if (
      !Number.isSafeInteger(file.size) ||
      file.size <= 0
    ) {
      throw new Error(
        `${file.name} is empty or has an invalid size.`
      );
    }

    if (file.size > maximumBytes) {
      throw new Error(
        `The ${uploadType} file cannot exceed ${formatMegabytes(
          maximumBytes
        )} MB.`
      );
    }
  }

  function validateFileType(
    file,
    uploadType
  ) {
    const contentType =
      getContentType(file);

    const extension =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase() || '';

    if (uploadType === 'preview') {
      const isMp3 =
        (
          contentType ===
            'audio/mpeg' ||
          contentType ===
            'audio/mp3'
        ) &&
        extension === 'mp3';

      if (!isMp3) {
        throw new Error(
          'The streaming preview must be an MP3 file.'
        );
      }

      return;
    }

    if (uploadType === 'master') {
      const allowedMasterTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/vnd.wave',
        'audio/flac',
        'audio/x-flac'
      ];

      const allowedExtensions = [
        'mp3',
        'wav',
        'flac'
      ];

      if (
        !allowedMasterTypes.includes(
          contentType
        ) ||
        !allowedExtensions.includes(
          extension
        )
      ) {
        throw new Error(
          'The master track must be an MP3, WAV, or FLAC file.'
        );
      }

      return;
    }

    throw new Error(
      'The upload type is invalid.'
    );
  }

  function validateAudioFile(
    file,
    uploadType
  ) {
    if (!file) {
      throw new Error(
        'An audio file is missing.'
      );
    }

    validateFileSize(
      file,
      uploadType
    );

    validateFileType(
      file,
      uploadType
    );
  }

  function createCleanFile(
    file,
    uploadType
  ) {
    validateAudioFile(
      file,
      uploadType
    );

    const contentType =
      getContentType(file);

    if (!contentType) {
      throw new Error(
        `${file.name} does not have a supported audio format.`
      );
    }

    return new File(
      [file],
      sanitizeFilename(file.name),
      {
        type: contentType,
        lastModified:
          file.lastModified
      }
    );
  }

  async function uploadToR2(
    file,
    uploadType
  ) {
    validateAudioFile(
      file,
      uploadType
    );

    const contentType =
      getContentType(file);

    if (!contentType) {
      throw new Error(
        `The file type could not be determined for ${file.name}.`
      );
    }

    /*
      Request a short-lived upload URL from the secured
      server endpoint.

      The server receives the intended file role and
      exact browser-reported file size.
    */
    const authorizationResponse =
      await fetch('/api/upload', {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          filename:
            file.name,

          contentType,

          uploadType,

          fileSize:
            file.size
        })
      });

    const authorizationBody =
      await authorizationResponse
        .json()
        .catch(() => null);

    if (
      !authorizationResponse.ok
    ) {
      throw new Error(
        authorizationBody?.error ||
          `Failed to authorize the upload for ${file.name}.`
      );
    }

    const uploadUrl =
      authorizationBody?.uploadUrl;

    const fileKey =
      authorizationBody?.fileKey;

    const uploadHeaders =
      authorizationBody?.uploadHeaders;

    if (!uploadUrl || !fileKey) {
      throw new Error(
        `The upload URL or storage key is missing for ${file.name}.`
      );
    }

    if (
      !uploadHeaders ||
      typeof uploadHeaders !== 'object' ||
      Array.isArray(uploadHeaders)
    ) {
      throw new Error(
        `The required signed upload headers are missing for ${file.name}.`
      );
    }

    const requiredHeaderNames = [
      'Content-Type',
      'x-amz-meta-owner',
      'x-amz-meta-originalfilename',
      'x-amz-meta-uploadtype',
      'x-amz-meta-expectedbytes'
    ];

    const hasAllRequiredHeaders =
      requiredHeaderNames.every(
        (headerName) =>
          typeof uploadHeaders[
            headerName
          ] === 'string' &&
          uploadHeaders[
            headerName
          ].length > 0
      );

    if (!hasAllRequiredHeaders) {
      throw new Error(
        `One or more signed upload headers are invalid for ${file.name}.`
      );
    }

    if (
      uploadHeaders['Content-Type'] !==
      contentType
    ) {
      throw new Error(
        `The signed Content-Type does not match ${file.name}.`
      );
    }

    /*
      Upload the actual file directly to private R2 storage.

      Every signed metadata header returned by /api/upload
      must be included exactly as received. The browser sets
      Content-Length automatically from the File body.
    */
    const uploadResult =
      await fetch(uploadUrl, {
        method: 'PUT',

        headers:
          uploadHeaders,

        body:
          file
      });

    if (!uploadResult.ok) {
      throw new Error(
        `Direct R2 upload failed for ${file.name}.`
      );
    }

    return fileKey;
  }

  async function publishBeat({
    title,
    bpm,
    basicPrice,
    exclusivePrice,
    previewKey,
    masterKey
  }) {
    /*
      The authenticated server route creates the beat and
      licenses. The browser never supplies a producer ID
      or writes directly to Supabase.
    */
    const response =
      await fetch(
        '/api/beats/publish',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            title,
            bpm,
            basicPrice,
            exclusivePrice,
            previewKey,
            masterKey
          })
        }
      );

    const responseBody =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      throw new Error(
        responseBody?.error ||
          'The beat could not be published.'
      );
    }

    if (
      !responseBody?.success ||
      !responseBody?.beatId
    ) {
      throw new Error(
        'The publishing server returned an invalid response.'
      );
    }

    return responseBody;
  }

  function handlePreviewSelection(
    event
  ) {
    const selectedFile =
      event.target.files?.[0] ||
      null;

    if (!selectedFile) {
      setPreviewFile(null);
      return;
    }

    try {
      validateAudioFile(
        selectedFile,
        'preview'
      );

      setPreviewFile(
        selectedFile
      );

      setStatusMessage('');
    } catch (error) {
      event.target.value = '';
      setPreviewFile(null);

      setStatusMessage(
        `❌ ${
          error instanceof Error
            ? error.message
            : 'Invalid preview file.'
        }`
      );
    }
  }

  function handleMasterSelection(
    event
  ) {
    const selectedFile =
      event.target.files?.[0] ||
      null;

    if (!selectedFile) {
      setUntaggedFile(null);
      return;
    }

    try {
      validateAudioFile(
        selectedFile,
        'master'
      );

      setUntaggedFile(
        selectedFile
      );

      setStatusMessage('');
    } catch (error) {
      event.target.value = '';
      setUntaggedFile(null);

      setStatusMessage(
        `❌ ${
          error instanceof Error
            ? error.message
            : 'Invalid master file.'
        }`
      );
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form =
      event.currentTarget;

    if (
      !previewFile ||
      !untaggedFile
    ) {
      setStatusMessage(
        '❌ Please select both a preview track and an untagged master track.'
      );

      return;
    }

    const trimmedTitle =
      title.trim();

    const basicPrice =
      Number(priceBasic);

    const exclusivePrice =
      Number(priceExclusive);

    const parsedBpm =
      bpm.trim() === ''
        ? null
        : Number(bpm);

    if (!trimmedTitle) {
      setStatusMessage(
        '❌ Please enter a beat title.'
      );

      return;
    }

    if (
      trimmedTitle.length > 120
    ) {
      setStatusMessage(
        '❌ The beat title cannot exceed 120 characters.'
      );

      return;
    }

    if (
      !Number.isFinite(
        basicPrice
      ) ||
      basicPrice <= 0
    ) {
      setStatusMessage(
        '❌ Please enter a valid Basic license price.'
      );

      return;
    }

    if (
      !Number.isFinite(
        exclusivePrice
      ) ||
      exclusivePrice <= 0
    ) {
      setStatusMessage(
        '❌ Please enter a valid Exclusive license price.'
      );

      return;
    }

    if (
      exclusivePrice <=
      basicPrice
    ) {
      setStatusMessage(
        '❌ The Exclusive license price must be greater than the Basic license price.'
      );

      return;
    }

    if (
      parsedBpm !== null &&
      (
        !Number.isInteger(
          parsedBpm
        ) ||
        parsedBpm < 1 ||
        parsedBpm > 400
      )
    ) {
      setStatusMessage(
        '❌ BPM must be a whole number between 1 and 400.'
      );

      return;
    }

    try {
      setUploading(true);

      setStatusMessage(
        '🔐 Validating the selected audio files...'
      );

      const cleanPreviewFile =
        createCleanFile(
          previewFile,
          'preview'
        );

      const cleanMasterFile =
        createCleanFile(
          untaggedFile,
          'master'
        );

      setStatusMessage(
        '📤 Uploading tracks securely to Cloudflare R2...'
      );

      const [
        previewKey,
        masterKey
      ] = await Promise.all([
        uploadToR2(
          cleanPreviewFile,
          'preview'
        ),

        uploadToR2(
          cleanMasterFile,
          'master'
        )
      ]);

      setStatusMessage(
        '💾 Publishing the beat through the secured server...'
      );

      await publishBeat({
        title:
          trimmedTitle,

        bpm:
          parsedBpm,

        basicPrice:
          basicPrice.toFixed(2),

        exclusivePrice:
          exclusivePrice.toFixed(2),

        previewKey,

        masterKey
      });

      setStatusMessage(
        '🎉 Success! The beat and its licenses were published securely.'
      );

      setTitle('');
      setBpm('');
      setPriceBasic('29.99');
      setPriceExclusive('199.99');
      setPreviewFile(null);
      setUntaggedFile(null);

      form.reset();
    } catch (error) {
      console.error(
        'Beat upload error:',
        error
      );

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
      <h1>
        Upload Your New Beat
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}
      >
        <label>
          <strong>
            Beat Title *
          </strong>

          <input
            type="text"
            value={title}
            maxLength={120}
            onChange={(event) =>
              setTitle(
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

        <label>
          <strong>
            BPM
          </strong>

          <input
            type="number"
            min="1"
            max="400"
            step="1"
            value={bpm}
            onChange={(event) =>
              setBpm(
                event.target.value
              )
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
          <label
            style={{
              flex: 1
            }}
          >
            <strong>
              Basic License Price ($) *
            </strong>

            <input
              type="number"
              min="0.01"
              max="1000000"
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

          <label
            style={{
              flex: 1
            }}
          >
            <strong>
              Exclusive License Price ($) *
            </strong>

            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              value={
                priceExclusive
              }
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
            Streaming Preview Track
            (Tagged MP3, maximum 25 MB) *
          </strong>

          <input
            type="file"
            accept=".mp3,audio/mp3,audio/mpeg"
            onChange={
              handlePreviewSelection
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
            Master Audio Track
            (Untagged MP3/WAV/FLAC,
            maximum 250 MB) *
          </strong>

          <input
            type="file"
            accept=".mp3,.wav,.flac,audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/flac,audio/x-flac"
            onChange={
              handleMasterSelection
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

            cursor:
              uploading
                ? 'not-allowed'
                : 'pointer',

            fontWeight: 'bold',

            opacity:
              uploading
                ? 0.7
                : 1
          }}
        >
          {uploading
            ? 'Processing Secure Upload...'
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