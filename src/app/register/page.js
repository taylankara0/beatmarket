import Link from 'next/link';

import { signup } from '../auth/actions';

export default async function RegisterPage({
  searchParams,
}) {
  const params = await searchParams;

  const error =
    typeof params?.error === 'string'
      ? params.error
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
          maxWidth: '420px',
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
            margin: '0 0 10px',
            textAlign: 'center',
            fontSize: '28px',
          }}
        >
          Create Your Account
        </h1>

        <p
          style={{
            margin: '0 0 22px',
            textAlign: 'center',
            color: '#555',
            lineHeight: 1.5,
          }}
        >
          Buy beats, manage your purchases, and activate producer
          features whenever you are ready to start selling.
        </p>

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

        <form
          action={signup}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
          }}
        >
          <label>
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

          <label>
            <strong>Password</strong>

            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
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

          <label>
            <strong>Confirm Password</strong>

            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
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
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
            }}
          >
            Create Account
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
            Already have an account?
          </p>

          <Link
            href="/login"
            style={{
              color: '#0070f3',
              fontWeight: 'bold',
            }}
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}