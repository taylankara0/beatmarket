'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { useCart } from '@/context/CartContext';

export default function ProfileBeatGrid({
  beats,
  producerName,
}) {
  const [
    playingBeatId,
    setPlayingBeatId,
  ] = useState(null);

  const [
    previewErrorBeatId,
    setPreviewErrorBeatId,
  ] = useState(null);

  const audioRef = useRef(null);
  const currentBeatIdRef = useRef(null);

  const { addToCart } = useCart();

  useEffect(() => {
    const audio = new Audio();

    audio.preload = 'none';

    function handleEnded() {
      currentBeatIdRef.current = null;
      setPlayingBeatId(null);
    }

    function handleError() {
      const failedBeatId =
        currentBeatIdRef.current;

      console.error(
        'Profile beat preview playback failed.'
      );

      currentBeatIdRef.current = null;
      setPlayingBeatId(null);
      setPreviewErrorBeatId(failedBeatId);
    }

    audio.addEventListener(
      'ended',
      handleEnded
    );

    audio.addEventListener(
      'error',
      handleError
    );

    audioRef.current = audio;

    return () => {
      audio.removeEventListener(
        'ended',
        handleEnded
      );

      audio.removeEventListener(
        'error',
        handleError
      );

      audio.pause();
      audio.removeAttribute('src');
      audio.load();

      audioRef.current = null;
      currentBeatIdRef.current = null;
    };
  }, []);

  async function handlePreview(beatId) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setPreviewErrorBeatId(null);

    if (
      playingBeatId === beatId &&
      !audio.paused
    ) {
      audio.pause();

      currentBeatIdRef.current = null;
      setPlayingBeatId(null);

      return;
    }

    try {
      audio.pause();
      audio.currentTime = 0;

      currentBeatIdRef.current = beatId;

      audio.src =
        `/api/stream?beatId=${encodeURIComponent(
          beatId
        )}`;

      audio.load();

      await audio.play();

      setPlayingBeatId(beatId);
    } catch (error) {
      console.error(
        'Profile beat preview playback error:',
        error
      );

      currentBeatIdRef.current = null;
      setPlayingBeatId(null);
      setPreviewErrorBeatId(beatId);
    }
  }

  function handleAddLicenseToCart(
    beat,
    license
  ) {
    if (beat.is_sold_exclusive) {
      return;
    }

    addToCart({
      id: `${beat.id}-${license.id}`,
      beatId: beat.id,
      licenseId: license.id,
      title: beat.title,
      price: license.price,
      licenseName: license.name,
      licenseType: license.name,
      producer: producerName,
    });
  }

  if (!Array.isArray(beats) || beats.length === 0) {
    return (
      <div
        style={{
          padding: '36px',
          border: '1px dashed #d0d5dd',
          borderRadius: '12px',
          background: '#fff',
          color: '#667085',
          textAlign: 'center',
        }}
      >
        No published beats are available yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
      }}
    >
      {beats.map((beat) => {
        const licenses = Array.isArray(
          beat.licenses
        )
          ? beat.licenses
          : [];

        const basicLicense = licenses.find(
          (license) =>
            license.name === 'Basic'
        );

        const exclusiveLicense =
          licenses.find(
            (license) =>
              license.name === 'Exclusive'
          );

        const isSoldExclusive = Boolean(
          beat.is_sold_exclusive
        );

        const isPlaying =
          playingBeatId === beat.id;

        const previewFailed =
          previewErrorBeatId === beat.id;

        return (
          <article
            key={beat.id}
            style={{
              padding: '20px',
              border: isSoldExclusive
                ? '1px solid #fecdca'
                : '1px solid #e5e7eb',
              borderRadius: '12px',
              background: '#fff',
              opacity: isSoldExclusive
                ? 0.78
                : 1,
              boxShadow:
                '0 4px 14px rgba(16, 24, 40, 0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  minWidth: 0,
                }}
              >
                <h3
                  style={{
                    margin: '0 0 6px 0',
                    color: '#101828',
                    fontSize: '1.15rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {beat.title}
                </h3>

                <p
                  style={{
                    margin: 0,
                    color: '#667085',
                    fontSize: '13px',
                  }}
                >
                  by {producerName}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                {beat.bpm && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '999px',
                      background: '#f2f4f7',
                      color: '#475467',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {beat.bpm} BPM
                  </span>
                )}

                {isSoldExclusive && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '999px',
                      background: '#fef3f2',
                      color: '#b42318',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    Sold Exclusive
                  </span>
                )}
              </div>
            </div>

            {isSoldExclusive ? (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '14px',
                  border: '1px solid #fecdca',
                  borderRadius: '8px',
                  background: '#fef3f2',
                  color: '#b42318',
                  textAlign: 'center',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                This beat is no longer available
                for licensing.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: '10px',
                  marginBottom: '14px',
                }}
              >
                {basicLicense && (
                  <button
                    type="button"
                    onClick={() =>
                      handleAddLicenseToCart(
                        beat,
                        basicLicense
                      )
                    }
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '11px 12px',
                      border: '1px solid #d0d5dd',
                      borderRadius: '8px',
                      background: '#fff',
                      color: '#344054',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    <span>Add Basic to Cart</span>

                    <span>
                      ${basicLicense.price}
                    </span>
                  </button>
                )}

                {exclusiveLicense && (
                  <button
                    type="button"
                    onClick={() =>
                      handleAddLicenseToCart(
                        beat,
                        exclusiveLicense
                      )
                    }
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '11px 12px',
                      border: 'none',
                      borderRadius: '8px',
                      background: '#111827',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    <span>
                      Add Exclusive to Cart
                    </span>

                    <span>
                      ${exclusiveLicense.price}
                    </span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                handlePreview(beat.id)
              }
              aria-pressed={isPlaying}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                borderRadius: '8px',
                background: isPlaying
                  ? '#475467'
                  : '#4f46e5',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              {isPlaying
                ? 'Pause Preview'
                : 'Play Preview'}
            </button>

            {previewFailed && (
              <p
                style={{
                  margin: '10px 0 0 0',
                  color: '#b42318',
                  fontSize: '12px',
                  textAlign: 'center',
                }}
              >
                The preview could not be played.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}