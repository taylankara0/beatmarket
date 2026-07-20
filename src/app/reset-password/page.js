import { updatePassword } from './actions';

export default async function ResetPasswordPage({
  searchParams,
}) {
  const params = await searchParams;

  const error = params?.error;

  return (
    <div
      style={{
        maxWidth: '400px',
        margin: '60px auto',
        padding: '25px',
        fontFamily: 'sans-serif',
        border: '1px solid #ddd',
        borderRadius: '8px',
      }}
    >
      <h1
        style={{
          marginBottom: '10px',
          textAlign: 'center',
        }}
      >
        Reset Password
      </h1>

      <p
        style={{
          marginBottom: '20px',
          textAlign: 'center',
          color: '#555',
        }}
      >
        Enter a new password for your account.
      </p>

      {error && (
        <p
          style={{
            color: 'red',
            textAlign: 'center',
            fontWeight: 'bold',
          }}
        >
          ❌ {error}
        </p>
      )}

      <form
        action={updatePassword}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
        }}
      >
        <label>
          <strong>New Password</strong>

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
              boxSizing: 'border-box',
            }}
          />
        </label>

        <label>
          <strong>Confirm New Password</strong>

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
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Update Password
        </button>
      </form>
    </div>
  );
}