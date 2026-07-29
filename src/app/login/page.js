import Link from 'next/link';

import {
  login,
  requestPasswordReset,
} from '../auth/actions';

export default async function LoginPage({
  searchParams,
}) {
  const params = await searchParams;

  const error =
    typeof params?.error === 'string'
      ? params.error
      : null;

  const message =
    typeof params?.message === 'string'
      ? params.message
      : null;

  return (
    <main
      style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '60px 20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '25px',
          fontFamily: 'sans-serif',
          border: '1px solid #ddd',
          borderRadius: '8px',
          background: '#fff',
          color: '#111',
          boxSizing: 'border-box',
        }}
      >
        <h1
          style={{
            margin: '0 0 20px',
            textAlign: 'center',
            fontSize: '28px',
          }}
        >
          Sign In to BeatMarket
        </h1>

        {error && (
          <p
            role="alert"
            style={{
              margin: '0 0 18px',
              padding: '10px',
              color: '#b91c1c',
              background: '#fee2e2',
              borderRadius: '4px',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ❌ {error}
          </p>
        )}

        {message && (
          <p
            role="status"
            style={{
              margin: '0 0 18px',
              padding: '10px',
              color: '#166534',
              background: '#dcfce7',
              borderRadius: '4px',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ℹ️ {message}
          </p>
        )}

        <form
          action={login}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
          }}
        >
          <label
            style={{
              order: 1,
            }}
          >
            <strong>Email Address</strong>

            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '5px',
                border: '1px solid #bbb',
                borderRadius: '4px',
                background: '#fff',
                color: '#111',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <label
            style={{
              order: 2,
            }}
          >
            <strong>Password</strong>

            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '5px',
                border: '1px solid #bbb',
                borderRadius: '4px',
                background: '#fff',
                color: '#111',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              order: 4,
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
            }}
          >
            Sign In
          </button>

          <button
            type="submit"
            formAction={requestPasswordReset}
            formNoValidate
            style={{
              order: 3,
              alignSelf: 'flex-end',
              padding: 0,
              border: 'none',
              background: 'none',
              color: '#0070f3',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '14px',
            }}
          >
            Forgot password?
          </button>
        </form>

        <div
          style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #ddd',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
            }}
          >
            Don&apos;t have an account?
          </p>

          <Link
            href="/register"
            style={{
              display: 'inline-block',
              width: '100%',
              padding: '12px',
              background: '#333',
              color: '#fff',
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 'bold',
              boxSizing: 'border-box',
            }}
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}