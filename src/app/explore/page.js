'use client';

import Link from 'next/link';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  FREE_BEAT_LICENSE_NAME,
  FREE_BEAT_LICENSE_SUMMARY,
  FREE_BEAT_LICENSE_VERSION,
} from '@/lib/freeBeatLicense';

import {
  createClient,
} from '@/lib/supabase-client';

function resolveProfile(profile) {
  if (Array.isArray(profile)) {
    return profile[0] || null;
  }

  return profile || null;
}

function getProducerIdentity(profile) {
  const resolvedProfile =
    resolveProfile(profile);

  const displayName =
    String(
      resolvedProfile?.display_name || ''
    ).trim();

  const username =
    String(
      resolvedProfile?.username || ''
    ).trim();

  let displayLabel =
    'BeatMarket Producer';

  if (displayName) {
    displayLabel = displayName;
  } else if (username) {
    displayLabel = `@${username}`;
  }

  return {
    displayLabel,

    username,

    profileHref:
      username
        ? `/profile/${encodeURIComponent(
            username
          )}`
        : null,
  };
}

export default function ExplorePage() {
  const [beats, setBeats] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    loadingError,
    setLoadingError,
  ] = useState('');

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    authReady,
    setAuthReady,
  ] = useState(false);

  const [
    playingBeatId,
    setPlayingBeatId,
  ] = useState(null);

  const [
    previewErrorBeatId,
    setPreviewErrorBeatId,
  ] = useState(null);

  const [
    selectedDownloadBeat,
    setSelectedDownloadBeat,
  ] = useState(null);

  const [
    licenseAccepted,
    setLicenseAccepted,
  ] = useState(false);

  const [
    downloadError,
    setDownloadError,
  ] = useState('');

  const [
    downloadingBeatId,
    setDownloadingBeatId,
  ] = useState(null);

  const audioRef =
    useRef(null);

  const currentBeatIdRef =
    useRef(null);

  useEffect(() => {
    let isMounted = true;

    const supabase =
      createClient();

    async function fetchPageData() {
      const [
        beatsResult,
        userResult,
      ] = await Promise.all([
        supabase
          .from('beats')
          .select(`
            id,
            title,
            bpm,
            is_sold_exclusive,
            is_free_download_enabled,
            profiles (
              username,
              display_name
            )
          `)
          .order(
            'created_at',
            {
              ascending: false,
            }
          ),

        supabase.auth.getUser(),
      ]);

      if (!isMounted) {
        return;
      }

      if (beatsResult.error) {
        console.error(
          'Error fetching beats:',
          beatsResult.error
        );

        setLoadingError(
          'The beats could not be loaded.'
        );

        setBeats([]);
      } else {
        /*
          Beats previously sold through an
          Exclusive license must not be
          redistributed through the free-sharing
          experience.
        */
        const availableBeats =
          (
            beatsResult.data || []
          ).filter(
            (beat) =>
              beat.is_sold_exclusive !==
              true
          );

        setBeats(
          availableBeats
        );

        setLoadingError('');
      }

      if (userResult.error) {
        console.error(
          'Explore authentication lookup error:',
          userResult.error
        );

        setCurrentUser(null);
      } else {
        setCurrentUser(
          userResult.data?.user ||
          null
        );
      }

      setAuthReady(true);
      setLoading(false);
    }

    void fetchPageData();

    const {
      data: authStateListener,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session
        ) => {
          if (!isMounted) {
            return;
          }

          setCurrentUser(
            session?.user ||
            null
          );

          setAuthReady(true);
        }
      );

    return () => {
      isMounted = false;

      authStateListener
        .subscription
        .unsubscribe();
    };
  }, []);

  useEffect(() => {
    const audio =
      new Audio();

    audio.preload = 'none';

    function handleEnded() {
      currentBeatIdRef.current =
        null;

      setPlayingBeatId(null);
    }

    function handleError() {
      const failedBeatId =
        currentBeatIdRef.current;

      console.error(
        'Beat preview playback failed.'
      );

      setPlayingBeatId(null);

      setPreviewErrorBeatId(
        failedBeatId
      );
    }

    audio.addEventListener(
      'ended',
      handleEnded
    );

    audio.addEventListener(
      'error',
      handleError
    );

    audioRef.current =
      audio;

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

      audioRef.current =
        null;

      currentBeatIdRef.current =
        null;
    };
  }, []);

  async function handlePreview(
    beatId
  ) {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    setPreviewErrorBeatId(
      null
    );

    if (
      playingBeatId === beatId &&
      !audio.paused
    ) {
      audio.pause();

      currentBeatIdRef.current =
        null;

      setPlayingBeatId(null);

      return;
    }

    try {
      audio.pause();
      audio.currentTime = 0;

      currentBeatIdRef.current =
        beatId;

      audio.src =
        `/api/stream?beatId=${encodeURIComponent(
          beatId
        )}`;

      audio.load();

      await audio.play();

      setPlayingBeatId(
        beatId
      );
    } catch (error) {
      console.error(
        'Beat preview playback error:',
        error
      );

      currentBeatIdRef.current =
        null;

      setPlayingBeatId(null);

      setPreviewErrorBeatId(
        beatId
      );
    }
  }

  function openDownloadLicense(
    beat
  ) {
    if (!authReady) {
      return;
    }

    if (!currentUser) {
      window.location.assign(
        '/login'
      );

      return;
    }

    if (
      beat.is_free_download_enabled !==
      true
    ) {
      return;
    }

    setSelectedDownloadBeat(
      beat
    );

    setLicenseAccepted(false);
    setDownloadError('');
  }

  function closeDownloadLicense() {
    if (downloadingBeatId) {
      return;
    }

    setSelectedDownloadBeat(
      null
    );

    setLicenseAccepted(false);
    setDownloadError('');
  }

  async function handleFreeDownload() {
    if (
      !selectedDownloadBeat
    ) {
      return;
    }

    if (!licenseAccepted) {
      setDownloadError(
        'You must accept the free-beat license before downloading.'
      );

      return;
    }

    try {
      setDownloadingBeatId(
        selectedDownloadBeat.id
      );

      setDownloadError('');

      const response =
        await fetch(
          `/api/beats/${encodeURIComponent(
            selectedDownloadBeat.id
          )}/free-download`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              accepted: true,

              licenseVersion:
                FREE_BEAT_LICENSE_VERSION,
            }),
          }
        );

      const responseBody =
        await response
          .json()
          .catch(() => null);

      if (
        response.status === 401
      ) {
        window.location.assign(
          '/login'
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          responseBody?.error ||
            'The free-download link could not be generated.'
        );
      }

      if (
        !responseBody?.success ||
        !responseBody?.downloadUrl
      ) {
        throw new Error(
          'The download server returned an invalid response.'
        );
      }

      const downloadLink =
        document.createElement(
          'a'
        );

      downloadLink.href =
        responseBody.downloadUrl;

      downloadLink.rel =
        'noopener noreferrer';

      downloadLink.style.display =
        'none';

      document.body.appendChild(
        downloadLink
      );

      downloadLink.click();
      downloadLink.remove();

      setSelectedDownloadBeat(
        null
      );

      setLicenseAccepted(false);
      setDownloadError('');
    } catch (error) {
      console.error(
        'Free beat download error:',
        error
      );

      setDownloadError(
        error instanceof Error
          ? error.message
          : 'The free beat could not be downloaded.'
      );
    } finally {
      setDownloadingBeatId(
        null
      );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-10 text-center text-white">
        Loading beats...
      </div>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-gray-900 px-6 py-10 text-white sm:px-8">
        <section className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h1 className="text-4xl font-bold">
              Discover Beats
            </h1>

            <p className="mx-auto mt-3 max-w-2xl text-gray-400">
              Listen to free beats, discover
              new producers, and visit their
              profiles to connect.
            </p>
          </div>

          {loadingError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-center text-red-200"
            >
              {loadingError}
            </div>
          ) : beats.length === 0 ? (
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center">
              <h2 className="text-xl font-semibold">
                No beats available yet
              </h2>

              <p className="mt-2 text-gray-400">
                Be the first producer to
                upload and share a beat.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {beats.map((beat) => {
                const producerIdentity =
                  getProducerIdentity(
                    beat.profiles
                  );

                const isPlaying =
                  playingBeatId ===
                  beat.id;

                const previewFailed =
                  previewErrorBeatId ===
                  beat.id;

                const freeDownloadEnabled =
                  beat
                    .is_free_download_enabled ===
                  true;

                const downloadButtonText =
                  !authReady
                    ? 'Checking Account...'
                    : !currentUser
                      ? 'Sign In to Download'
                      : 'Free Download';

                return (
                  <article
                    key={beat.id}
                    className="flex min-h-72 flex-col rounded-xl border border-gray-700 bg-gray-800 p-5 shadow-lg transition-colors hover:border-indigo-500"
                  >
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-bold">
                          {beat.title}
                        </h2>

                        <div className="mt-1 text-sm text-gray-400">
                          <span>
                            by{' '}
                          </span>

                          {producerIdentity.profileHref ? (
                            <Link
                              href={
                                producerIdentity
                                  .profileHref
                              }
                              className="font-medium text-indigo-300 transition hover:text-indigo-200 hover:underline"
                            >
                              {
                                producerIdentity
                                  .displayLabel
                              }
                            </Link>
                          ) : (
                            <span>
                              {
                                producerIdentity
                                  .displayLabel
                              }
                            </span>
                          )}
                        </div>
                      </div>

                      {beat.bpm && (
                        <span className="shrink-0 rounded-full bg-gray-700 px-2 py-1 text-xs">
                          {beat.bpm} BPM
                        </span>
                      )}
                    </div>

                    <div className="mb-5 rounded-lg border border-gray-700 bg-gray-900/60 p-4">
                      <p className="text-sm font-medium text-gray-200">
                        {freeDownloadEnabled
                          ? 'Free non-commercial beat'
                          : 'Beat preview'}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-gray-400">
                        {freeDownloadEnabled
                          ? 'Listen to the preview, then sign in and accept the free non-commercial license to download the master.'
                          : 'Listen to the beat and visit the producer’s profile. Free downloads are currently disabled.'}
                      </p>
                    </div>

                    <div className="mt-auto space-y-3">
                      <button
                        type="button"
                        onClick={() =>
                          handlePreview(
                            beat.id
                          )
                        }
                        aria-pressed={
                          isPlaying
                        }
                        className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700"
                      >
                        {isPlaying
                          ? 'Pause Preview'
                          : 'Play Preview'}
                      </button>

                      {freeDownloadEnabled ? (
                        <button
                          type="button"
                          onClick={() =>
                            openDownloadLicense(
                              beat
                            )
                          }
                          disabled={
                            !authReady
                          }
                          className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-600"
                        >
                          {
                            downloadButtonText
                          }
                        </button>
                      ) : (
                        <div className="w-full rounded-lg border border-gray-600 py-2.5 text-center text-sm font-medium text-gray-400">
                          Preview Only
                        </div>
                      )}

                      {producerIdentity.profileHref && (
                        <Link
                          href={
                            producerIdentity
                              .profileHref
                          }
                          className="block w-full rounded-lg border border-gray-600 py-2.5 text-center font-medium text-gray-200 transition hover:border-gray-500 hover:bg-gray-700"
                        >
                          View Producer Profile
                        </Link>
                      )}

                      {previewFailed && (
                        <p className="text-center text-xs text-red-300">
                          The preview could not
                          be played.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {selectedDownloadBeat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDownloadLicense();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="free-license-title"
            className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 text-white shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-400">
                  Free beat download
                </p>

                <h2
                  id="free-license-title"
                  className="mt-1 text-2xl font-bold"
                >
                  {
                    selectedDownloadBeat.title
                  }
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeDownloadLicense
                }
                disabled={
                  downloadingBeatId ===
                  selectedDownloadBeat.id
                }
                aria-label="Close license"
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-indigo-800 bg-indigo-950/40 p-5">
              <h3 className="font-semibold text-indigo-200">
                {
                  FREE_BEAT_LICENSE_NAME
                }
              </h3>

              <p className="mt-2 text-sm leading-6 text-indigo-100/80">
                {
                  FREE_BEAT_LICENSE_SUMMARY
                }
              </p>
            </div>

            <ul className="mt-5 space-y-3 text-sm text-gray-200">
              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-emerald-400"
                >
                  ✓
                </span>

                <span>
                  Non-commercial use only
                </span>
              </li>

              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-emerald-400"
                >
                  ✓
                </span>

                <span>
                  Producer credit is required
                </span>
              </li>

              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-emerald-400"
                >
                  ✓
                </span>

                <span>
                  No resale, redistribution,
                  Content ID registration, or
                  ownership claims
                </span>
              </li>
            </ul>

            <Link
              href="/license"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-lg border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-950 hover:text-indigo-200"
            >
              Read the Full License Terms
            </Link>

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-700 bg-gray-800 p-4">
              <input
                type="checkbox"
                checked={
                  licenseAccepted
                }
                onChange={(event) => {
                  setLicenseAccepted(
                    event.target.checked
                  );

                  setDownloadError('');
                }}
                disabled={
                  downloadingBeatId ===
                  selectedDownloadBeat.id
                }
                className="mt-1 h-4 w-4 shrink-0"
              />

              <span className="text-sm leading-6 text-gray-200">
                I have read and accept the
                BeatMarket Free Beat License.
              </span>
            </label>

            {downloadError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
              >
                {downloadError}
              </p>
            )}

            <button
              type="button"
              onClick={
                handleFreeDownload
              }
              disabled={
                !licenseAccepted ||
                downloadingBeatId ===
                  selectedDownloadBeat.id
              }
              className="mt-6 w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            >
              {downloadingBeatId ===
              selectedDownloadBeat.id
                ? 'Preparing Secure Download...'
                : 'Accept and Download'}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-gray-500">
              Your acceptance and license
              version will be recorded for this
              download.
            </p>
          </section>
        </div>
      )}
    </>
  );
}