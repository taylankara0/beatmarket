'use client';

import { useState } from 'react';

export default function DownloadButton({
  orderItemId
}) {
  const [downloading, setDownloading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  async function handleDownload() {
    try {
      setDownloading(true);
      setErrorMessage('');

      const response = await fetch(
        `/api/download/${encodeURIComponent(
          orderItemId
        )}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        }
      );

      const result = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !result?.success ||
        !result?.downloadUrl
      ) {
        throw new Error(
          result?.error ||
            'The download link could not be generated.'
        );
      }

      /*
        The URL is a temporary Cloudflare R2 signed URL.

        The download endpoint already verified that the
        current user owns the paid order.
      */
      window.location.assign(
        result.downloadUrl
      );
    } catch (error) {
      console.error(
        'Download button error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The download could not be started.'
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {downloading
          ? 'Preparing Download...'
          : 'Download Master Track'}
      </button>

      {errorMessage && (
        <p className="mt-3 text-sm text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}