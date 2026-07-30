import Link from 'next/link';

export default function LegalPage({
  title,
  lastUpdated,
  children,
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '56px 24px 80px',
        color: '#171717',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      <Link
        href="/explore"
        style={{
          display: 'inline-block',
          marginBottom: '28px',
          color: '#374151',
          textDecoration: 'none',
          fontSize: '0.95rem',
          fontWeight: '600',
        }}
      >
        ← Back to BeatMarket
      </Link>

      <header
        style={{
          paddingBottom: '28px',
          borderBottom:
            '1px solid #e5e7eb',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize:
              'clamp(2rem, 5vw, 3rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </h1>

        {lastUpdated && (
          <p
            style={{
              margin: '14px 0 0',
              color: '#6b7280',
              fontSize: '0.9rem',
            }}
          >
            Last updated: {lastUpdated}
          </p>
        )}
      </header>

      <article
        style={{
          paddingTop: '32px',
          fontSize: '1rem',
          lineHeight: 1.75,
        }}
      >
        {children}
      </article>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}) {
  return (
    <section
      style={{
        marginTop: '36px',
      }}
    >
      <h2
        style={{
          margin: '0 0 14px',
          fontSize: '1.35rem',
          lineHeight: 1.35,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color: '#374151',
        }}
      >
        {children}
      </div>
    </section>
  );
}