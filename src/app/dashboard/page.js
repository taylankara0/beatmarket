import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

import {
  activateProducerProfile,
  saveProducerDisplayName,
  setBeatFreeDownloadAvailability,
} from './actions';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(date);
}

function getDownloadStatus(beat) {
  if (beat.is_sold_exclusive === true) {
    return {
      label: 'Unavailable',
      description:
        'Previously sold through an Exclusive license.',
      background: '#fef3f2',
      color: '#b42318',
    };
  }

  if (beat.is_free_download_enabled === true) {
    return {
      label: 'Enabled',
      description:
        'Visitors will be able to download this beat after the free-download flow is completed.',
      background: '#ecfdf3',
      color: '#067647',
    };
  }

  return {
    label: 'Disabled',
    description:
      'Visitors can listen to the preview, but the master file is not downloadable.',
    background: '#f2f4f7',
    color: '#475467',
  };
}

export default async function DashboardPage({
  searchParams,
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const resolvedSearchParams =
    await searchParams;

  const successMessage =
    typeof resolvedSearchParams?.success ===
    'string'
      ? resolvedSearchParams.success
      : '';

  const errorMessage =
    typeof resolvedSearchParams?.error ===
    'string'
      ? resolvedSearchParams.error
      : '';

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(`
      is_producer,
      display_name,
      username
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile
  ) {
    console.error(
      'Dashboard profile loading error:',
      profileError
    );

    return (
      <div
        style={{
          padding: '40px',
          color: '#b42318',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        Error loading your account profile.
      </div>
    );
  }

  if (!profile.is_producer) {
    return (
      <main
        style={{
          maxWidth: '800px',
          margin: '40px auto',
          padding: '0 20px',
          fontFamily: 'sans-serif',
        }}
      >
        <header
          style={{
            marginBottom: '30px',
            paddingBottom: '20px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <h1
            style={{
              margin: '0 0 8px 0',
            }}
          >
            Creator Dashboard
          </h1>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.6,
            }}
          >
            Share your free beats, build your
            producer profile, and connect with
            artists and other creators.
          </p>
        </header>

        {successMessage && (
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #a6f4c5',
              borderRadius: '8px',
              background: '#ecfdf3',
              color: '#067647',
            }}
          >
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
            }}
          >
            {errorMessage}
          </div>
        )}

        <section
          style={{
            padding: '32px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px 0',
            }}
          >
            Become a Beat Creator
          </h2>

          <p
            style={{
              margin: '0 0 24px 0',
              color: '#667085',
              lineHeight: 1.6,
            }}
          >
            Activate creator features to upload
            beats, manage free downloads, and
            publish your music on your public
            profile.
          </p>

          <form action={activateProducerProfile}>
            <button
              type="submit"
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '11px 20px',
                background: '#0070f3',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Activate Creator Profile
            </button>
          </form>
        </section>
      </main>
    );
  }

  const {
    data: beatsData,
    error: beatsError,
  } = await supabase
    .from('beats')
    .select(`
      id,
      title,
      bpm,
      created_at,
      is_sold_exclusive,
      is_free_download_enabled
    `)
    .eq('producer_id', user.id)
    .order('created_at', {
      ascending: false,
    });

  if (beatsError) {
    console.error(
      'Creator dashboard beats loading error:',
      beatsError
    );

    return (
      <div
        style={{
          padding: '40px',
          color: '#b42318',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        Error loading your creator dashboard.
      </div>
    );
  }

  const beats = beatsData ?? [];

  const freeDownloadEnabledCount =
    beats.filter(
      (beat) =>
        beat.is_free_download_enabled === true &&
        beat.is_sold_exclusive !== true
    ).length;

  const unavailableBeatCount =
    beats.filter(
      (beat) =>
        beat.is_sold_exclusive === true
    ).length;

  return (
    <main
      style={{
        maxWidth: '1050px',
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 8px 0',
            }}
          >
            Creator Dashboard
          </h1>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Manage your beats, free-download
            availability, and public creator
            profile.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <Link
            href="/profile"
            style={{
              padding: '10px 18px',
              border: '1px solid #d0d5dd',
              borderRadius: '8px',
              background: '#fff',
              color: '#344054',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Manage Profile
          </Link>

          <Link
            href="/upload-beat"
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#0070f3',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            + Upload New Beat
          </Link>
        </div>
      </header>

      {successMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border: '1px solid #a6f4c5',
            borderRadius: '8px',
            background: '#ecfdf3',
            color: '#067647',
          }}
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border: '1px solid #fecdca',
            borderRadius: '8px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          {errorMessage}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            padding: '22px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin: '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Published Beats
          </p>

          <p
            style={{
              margin: 0,
              color: '#111827',
              fontSize: '28px',
              fontWeight: 'bold',
            }}
          >
            {beats.length}
          </p>
        </div>

        <div
          style={{
            padding: '22px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin: '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Free Downloads Enabled
          </p>

          <p
            style={{
              margin: 0,
              color: '#067647',
              fontSize: '28px',
              fontWeight: 'bold',
            }}
          >
            {freeDownloadEnabledCount}
          </p>
        </div>

        <div
          style={{
            padding: '22px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <p
            style={{
              margin: '0 0 8px 0',
              color: '#667085',
              fontSize: '14px',
            }}
          >
            Download Unavailable
          </p>

          <p
            style={{
              margin: 0,
              color:
                unavailableBeatCount > 0
                  ? '#b42318'
                  : '#111827',
              fontSize: '28px',
              fontWeight: 'bold',
            }}
          >
            {unavailableBeatCount}
          </p>
        </div>
      </section>

      <section
        style={{
          marginBottom: '32px',
          padding: '24px',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          background: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '20px',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.4rem',
              }}
            >
              Creator Profile
            </h2>

            <p
              style={{
                margin: 0,
                color: '#667085',
                lineHeight: 1.5,
              }}
            >
              Choose the public name displayed
              beside your beats.
            </p>
          </div>

          {profile.username && (
            <Link
              href={`/profile/${profile.username}`}
              style={{
                color: '#0070f3',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              View Public Profile →
            </Link>
          )}
        </div>

        <form
          action={saveProducerDisplayName}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '12px',
          }}
        >
          <div
            style={{
              flex: '1 1 280px',
            }}
          >
            <label
              htmlFor="display_name"
              style={{
                display: 'block',
                marginBottom: '6px',
                color: '#344054',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Public Display Name
            </label>

            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              defaultValue={
                profile.display_name ?? ''
              }
              placeholder="Enter your producer name"
              autoComplete="nickname"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 12px',
                border: '1px solid #d0d5dd',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '11px 18px',
              background: '#111827',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Save Display Name
          </button>
        </form>
      </section>

      <section>
        <div
          style={{
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: '1.5rem',
            }}
          >
            Your Published Beats ({beats.length})
          </h2>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Free downloads remain disabled until
            you explicitly enable them for each
            beat.
          </p>
        </div>

        {beats.length === 0 ? (
          <div
            style={{
              padding: '40px',
              border: '1px dashed #d0d5dd',
              borderRadius: '12px',
              background: '#fff',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: '0 0 20px 0',
                color: '#667085',
              }}
            >
              You haven&apos;t uploaded any beats
              yet.
            </p>

            <Link
              href="/upload-beat"
              style={{
                color: '#0070f3',
                fontWeight: 'bold',
                textDecoration: 'none',
              }}
            >
              Upload your first beat →
            </Link>
          </div>
        ) : (
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              background: '#fff',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f9fafb',
                    borderBottom:
                      '1px solid #e5e7eb',
                  }}
                >
                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Beat
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    BPM
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Published
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Free Download
                  </th>

                  <th
                    style={{
                      padding: '15px',
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {beats.map((beat) => {
                  const status =
                    getDownloadStatus(beat);

                  const isUnavailable =
                    beat.is_sold_exclusive ===
                    true;

                  const isEnabled =
                    beat.is_free_download_enabled ===
                    true;

                  return (
                    <tr
                      key={beat.id}
                      style={{
                        borderBottom:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        style={{
                          padding: '15px',
                          minWidth: '200px',
                        }}
                      >
                        <div
                          style={{
                            marginBottom: '4px',
                            color: '#111827',
                            fontWeight: 'bold',
                          }}
                        >
                          {beat.title}
                        </div>

                        <div
                          style={{
                            maxWidth: '320px',
                            color: '#667085',
                            fontSize: '12px',
                            lineHeight: 1.4,
                          }}
                        >
                          {status.description}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '15px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {beat.bpm || '-'}
                      </td>

                      <td
                        style={{
                          padding: '15px',
                          whiteSpace: 'nowrap',
                          color: '#667085',
                        }}
                      >
                        {formatDate(
                          beat.created_at
                        )}
                      </td>

                      <td
                        style={{
                          padding: '15px',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '5px 10px',
                            borderRadius: '999px',
                            background:
                              status.background,
                            color: status.color,
                            fontSize: '12px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '15px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isUnavailable ? (
                          <span
                            style={{
                              color: '#98a2b3',
                              fontSize: '13px',
                            }}
                          >
                            Locked
                          </span>
                        ) : (
                          <form
                            action={
                              setBeatFreeDownloadAvailability
                            }
                          >
                            <input
                              type="hidden"
                              name="beat_id"
                              value={beat.id}
                            />

                            <input
                              type="hidden"
                              name="free_download_action"
                              value={
                                isEnabled
                                  ? 'disable'
                                  : 'enable'
                              }
                            />

                            <button
                              type="submit"
                              style={{
                                border: isEnabled
                                  ? '1px solid #f04438'
                                  : 'none',
                                borderRadius: '8px',
                                padding: '9px 14px',
                                background: isEnabled
                                  ? '#fff'
                                  : '#0070f3',
                                color: isEnabled
                                  ? '#b42318'
                                  : '#fff',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                              }}
                            >
                              {isEnabled
                                ? 'Disable'
                                : 'Enable'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}