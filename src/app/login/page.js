import { login, signup } from '../auth/actions';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  const message = params?.message;

  return (
    <div style={{ maxWidth: '400px', margin: '60px auto', padding: '25px', fontFamily: 'sans-serif', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h1 style={{ marginBottom: '20px', textAlign: 'center' }}>Marketplace Portal</h1>
      
      {error && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>❌ {error}</p>}
      {message && <p style={{ color: 'green', textAlign: 'center', fontWeight: 'bold' }}>ℹ️ {message}</p>}

      <form style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <label>
          <strong>Email Address</strong>
          <input name="email" type="email" required style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box' }} />
        </label>
        
        <label>
          <strong>Password</strong>
          <input name="password" type="password" required style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box' }} />
        </label>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button formAction={login} style={{ flex: 1, padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Sign In
          </button>
          <button formAction={signup} style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Register As Producer
          </button>
        </div>
      </form>
    </div>
  );
}