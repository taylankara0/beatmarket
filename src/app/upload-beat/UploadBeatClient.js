'use client';

import { useState } from 'react';

const MEGABYTE = 1024 * 1024;
const PREVIEW_MAX_BYTES =
  25 * MEGABYTE;
const MASTER_MAX_BYTES =
  250 * MEGABYTE;

export default function UploadBeatClient() {
  const [title, setTitle] =
    useState('');

  const [bpm, setBpm] =
    useState('');

  const [
    previewFile,
    setPreviewFile,
  ] = useState(null);

  const [
    masterFile,
    setMasterFile,
  ] = useState(null);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    statusMessage,
    setStatusMessage,
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
      !Number.isSafeInteger(
        file.size
      ) ||
      file.size <= 0
    ) {
      throw new Error(
        `${file.name} is empty or has an invalid size.`
      );
    }

    if (
      file.size >
      maximumBytes
    ) {
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
        'audio/x-flac',
      ];

      const allowedExtensions = [
        'mp3',
        'wav',
        'flac',
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
          'The download master must be an MP3, WAV, or FLAC file.'
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
      sanitizeFilename(
        file.name
      ),
      {
        type:
          contentType,

        lastModified:
          file.lastModified,
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

    const authorizationResponse =
      await fetch('/api/upload', {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          filename:
            file.name,

          contentType,

          uploadType,

          fileSize:
            file.size,
        }),
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

    if (
      !uploadUrl ||
      !fileKey
    ) {
      throw new Error(
        `The upload URL or storage key is missing for ${file.name}.`
      );
    }

    if (
      !uploadHeaders ||
      typeof uploadHeaders !==
        'object' ||
      Array.isArray(
        uploadHeaders
      )
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
      'x-amz-meta-expectedbytes',
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
      uploadHeaders[
        'Content-Type'
      ] !== contentType
    ) {
      throw new Error(
        `The signed Content-Type does not match ${file.name}.`
      );
    }

    const uploadResult =
      await fetch(
        uploadUrl,
        {
          method: 'PUT',

          headers:
            uploadHeaders,

          body:
            file,
        }
      );

    if (!uploadResult.ok) {
      throw new Error(
        `Direct R2 upload failed for ${file.name}.`
      );
    }

    return fileKey;
  }

  async function publishFreeBeat({
    title: beatTitle,
    bpm: beatBpm,
    previewKey,
    masterKey,
  }) {
    const response =
      await fetch(
        '/api/beats/publish-free',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            title:
              beatTitle,

            bpm:
              beatBpm,

            previewKey,

            masterKey,
          }),
        }
      );

    const responseBody =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      throw new Error(
        responseBody?.error ||
          'The free beat could not be published.'
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
      setMasterFile(null);
      return;
    }

    try {
      validateAudioFile(
        selectedFile,
        'master'
      );

      setMasterFile(
        selectedFile
      );

      setStatusMessage('');
    } catch (error) {
      event.target.value = '';

      setMasterFile(null);

      setStatusMessage(
        `❌ ${
          error instanceof Error
            ? error.message
            : 'Invalid master file.'
        }`
      );
    }
  }

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    const form =
      event.currentTarget;

    if (
      !previewFile ||
      !masterFile
    ) {
      setStatusMessage(
        '❌ Please select both a streaming preview and a download master.'
      );

      return;
    }

    const trimmedTitle =
      title.trim();

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
      trimmedTitle.length >
      120
    ) {
      setStatusMessage(
        '❌ The beat title cannot exceed 120 characters.'
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
          masterFile,
          'master'
        );

      setStatusMessage(
        '📤 Uploading tracks securely to private storage...'
      );

      const [
        previewKey,
        masterKey,
      ] = await Promise.all([
        uploadToR2(
          cleanPreviewFile,
          'preview'
        ),

        uploadToR2(
          cleanMasterFile,
          'master'
        ),
      ]);

      setStatusMessage(
        '💾 Publishing your free beat securely...'
      );

      await publishFreeBeat({
        title:
          trimmedTitle,

        bpm:
          parsedBpm,

        previewKey,

        masterKey,
      });

      setStatusMessage(
        '🎉 Success! Your free beat was published securely.'
      );

      setTitle('');
      setBpm('');
      setPreviewFile(null);
      setMasterFile(null);

      form.reset();
    } catch (error) {
      console.error(
        'Free beat upload error:',
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

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    marginTop: '6px',
    padding: '11px 12px',
    border:
      '1px solid #d0d5dd',
    borderRadius: '8px',
    fontSize: '15px',
  };

  const labelStyle = {
    display: 'block',
    color: '#344054',
    fontSize: '14px',
    fontWeight: 'bold',
  };

  return (
    <main
      style={{
        maxWidth: '620px',
        margin: '40px auto',
        padding: '0 20px 50px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          marginBottom: '24px',
        }}
      >
        <h1
          style={{
            margin: '0 0 10px 0',
          }}
        >
          Upload Beat
        </h1>

        <p
          style={{
            margin: 0,
            color: '#667085',
            lineHeight: 1.6,
          }}
        >
          Publish your beat for artists and
          other creators to discover. New
          uploads are marked for free download
          automatically.
        </p>
      </header>

      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          border:
            '1px solid #b2ddff',
          borderRadius: '10px',
          background: '#eff8ff',
          color: '#175cd3',
          fontSize: '14px',
          lineHeight: 1.6,
        }}
      >
        The preview is used for listening on
        BeatMarket. The master file remains in
        private storage and is used for the
        secure free-download flow. You can
        disable free downloads later from your
        Creator Dashboard.
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '24px',
          border:
            '1px solid #e5e7eb',
          borderRadius: '12px',
          background: '#fff',
        }}
      >
        <label
          style={labelStyle}
        >
          Beat Title *

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
            placeholder="Enter the beat title"
            style={fieldStyle}
          />
        </label>

        <label
          style={labelStyle}
        >
          BPM

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
            placeholder="Optional"
            style={fieldStyle}
          />
        </label>

        <label
          style={labelStyle}
        >
          Streaming Preview *

          <span
            style={{
              display: 'block',
              marginTop: '5px',
              color: '#667085',
              fontSize: '13px',
              fontWeight: 'normal',
              lineHeight: 1.5,
            }}
          >
            MP3 only, maximum 25 MB.
          </span>

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
              width: '100%',
              marginTop: '10px',
              color: '#344054',
            }}
          />

          {previewFile && (
            <span
              style={{
                display: 'block',
                marginTop: '8px',
                color: '#067647',
                fontSize: '13px',
                fontWeight: 'normal',
                wordBreak: 'break-word',
              }}
            >
              Selected: {previewFile.name}
            </span>
          )}
        </label>

        <label
          style={labelStyle}
        >
          Free Download Master *

          <span
            style={{
              display: 'block',
              marginTop: '5px',
              color: '#667085',
              fontSize: '13px',
              fontWeight: 'normal',
              lineHeight: 1.5,
            }}
          >
            MP3, WAV, or FLAC, maximum 250 MB.
          </span>

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
              width: '100%',
              marginTop: '10px',
              color: '#344054',
            }}
          />

          {masterFile && (
            <span
              style={{
                display: 'block',
                marginTop: '8px',
                color: '#067647',
                fontSize: '13px',
                fontWeight: 'normal',
                wordBreak: 'break-word',
              }}
            >
              Selected: {masterFile.name}
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={uploading}
          style={{
            marginTop: '4px',
            padding: '13px 18px',
            border: 'none',
            borderRadius: '8px',
            background:
              uploading
                ? '#98a2b3'
                : '#0070f3',
            color: '#fff',
            cursor:
              uploading
                ? 'not-allowed'
                : 'pointer',
            fontSize: '15px',
            fontWeight: 'bold',
            opacity:
              uploading
                ? 0.8
                : 1,
          }}
        >
          {uploading
            ? 'Publishing Beat...'
            : 'Publish Beat'}
        </button>
      </form>

      {statusMessage && (
        <div
          aria-live="polite"
          style={{
            marginTop: '20px',
            padding: '14px 16px',
            border:
              statusMessage.startsWith(
                '❌'
              )
                ? '1px solid #fecdca'
                : statusMessage.startsWith(
                      '🎉'
                    )
                  ? '1px solid #a6f4c5'
                  : '1px solid #b2ddff',
            borderRadius: '8px',
            background:
              statusMessage.startsWith(
                '❌'
              )
                ? '#fef3f2'
                : statusMessage.startsWith(
                      '🎉'
                    )
                  ? '#ecfdf3'
                  : '#eff8ff',
            color:
              statusMessage.startsWith(
                '❌'
              )
                ? '#b42318'
                : statusMessage.startsWith(
                      '🎉'
                    )
                  ? '#067647'
                  : '#175cd3',
            fontWeight: 'bold',
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          {statusMessage}
        </div>
      )}
    </main>
  );
}