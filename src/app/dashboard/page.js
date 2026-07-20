import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { activateProducerProfile } from './actions';

export default async function DashboardPage({ searchParams }) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const resolvedSearchParams = await searchParams;

  const successMessage =
    typeof resolvedSearchParams?.success === 'string'
      ? resolvedSearchParams.success
      : '';

  const errorMessage =
    typeof resolvedSearchParams?.error === 'string'
      ? resolvedSearchParams.error
      : '';

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('is_producer')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('Profile loading error:', profileError);

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
      <div
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
            borderBottom: '1px solid #eee',
            paddingBottom: '20px',
          }}
        >
          <h1 style={{ margin: '0 0 5px 0' }}>Your Dashboard</h1>

          <p style={{ margin: 0, color: '#666' }}>
            Manage your account and marketplace activity.
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
          <h2 style={{ margin: '0 0 10px 0' }}>
            Start Selling Beats
          </h2>

          <p
            style={{
              margin: '0 0 24px 0',
              color: '#666',
              lineHeight: 1.6,
            }}
          >
            Activate producer features to upload beats, create licenses,
            and publish your music in the marketplace. Your account will
            still retain all buyer and download features.
          </p>

          <form action={activateProducerProfile}>
            <button
              type="submit"
              style={{
                border: 'none',
                borderRadius: '6px',
                padding: '11px 20px',
                background: '#0070f3',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Activate Producer Profile
            </button>
          </form>
        </section>
      </div>
    );
  }

  const {
    data: myBeatsData,
    error: beatsError,
  } = await supabase
    .from('beats')
    .select(`
      id,
      title,
      bpm,
      created_at,
      licenses (
        name,
        price
      )
    `)
    .eq('producer_id', user.id)
    .order('created_at', { ascending: false });

  if (beatsError) {
    console.error('Dashboard beats loading error:', beatsError);

    return (
      <div
        style={{
          padding: '40px',
          color: '#b42318',
          textAlign: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        Error loading dashboard data.
      </div>
    );
  }

  const myBeats = myBeatsData ?? [];

  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '30px',
          borderBottom: '1px solid #eee',
          paddingBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 5px 0' }}>
            Producer Dashboard
          </h1>

          <p style={{ margin: 0, color: '#666' }}>
            Manage your catalog and track marketplace listings.
          </p>
        </div>

        <Link
          href="/upload-beat"
          style={{
            flexShrink: 0,
            background: '#0070f3',
            color: '#fff',
            textDecoration: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontWeight: 'bold',
          }}
        >
          + Upload New Beat
        </Link>
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

      <h2
        style={{
          fontSize: '1.5rem',
          marginBottom: '20px',
        }}
      >
        Your Published Beats ({myBeats.length})
      </h2>

      {myBeats.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: '1px dashed #ccc',
            borderRadius: '8px',
            padding: '40px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              color: '#666',
              margin: '0 0 20px 0',
            }}
          >
            You haven&apos;t uploaded any beats yet.
          </p>

          <Link
            href="/upload-beat"
            style={{
              color: '#0070f3',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            Get started →
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: '8px',
            overflowX: 'auto',
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
                  background: '#f5f5f7',
                  borderBottom: '1px solid #eee',
                }}
              >
                <th style={{ padding: '15px' }}>Title</th>
                <th style={{ padding: '15px' }}>BPM</th>
                <th style={{ padding: '15px' }}>Basic Price</th>
                <th style={{ padding: '15px' }}>Exclusive Price</th>
              </tr>
            </thead>

            <tbody>
              {myBeats.map((beat) => {
                const licenses = Array.isArray(beat.licenses)
                  ? beat.licenses
                  : [];

                const basicPrice = Number(
                  licenses.find(
                    (license) => license.name === 'Basic'
                  )?.price ?? 0
                );

                const exclusivePrice = Number(
                  licenses.find(
                    (license) => license.name === 'Exclusive'
                  )?.price ?? 0
                );

                return (
                  <tr
                    key={beat.id}
                    style={{
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <td
                      style={{
                        padding: '15px',
                        fontWeight: 'bold',
                      }}
                    >
                      {beat.title}
                    </td>

                    <td style={{ padding: '15px' }}>
                      {beat.bpm || 'N/A'}
                    </td>

                    <td style={{ padding: '15px' }}>
                      ${basicPrice.toFixed(2)}
                    </td>

                    <td style={{ padding: '15px' }}>
                      ${exclusivePrice.toFixed(2)}
                    </td>
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