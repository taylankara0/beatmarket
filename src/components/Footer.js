import Link from 'next/link';

export default function Footer() {
  const currentYear =
    new Date().getFullYear();

  const footerLinkStyle = {
    color: '#d1d5db',
    textDecoration: 'none',
    fontSize: '0.9rem',
  };

  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '28px 40px',
        background: '#111',
        color: '#fff',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: '700',
            }}
          >
            BeatMarket
          </div>

          <div
            style={{
              marginTop: '6px',
              color: '#9ca3af',
              fontSize: '0.85rem',
            }}
          >
            © {currentYear} BeatMarket.
            All rights reserved.
          </div>
        </div>

        <nav
          aria-label="Legal"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/terms"
            style={footerLinkStyle}
          >
            Terms
          </Link>

          <Link
            href="/privacy"
            style={footerLinkStyle}
          >
            Privacy
          </Link>

          <Link
            href="/refund-policy"
            style={footerLinkStyle}
          >
            Refund Policy
          </Link>

          <Link
            href="/license"
            style={footerLinkStyle}
          >
            License
          </Link>
        </nav>
      </div>
    </footer>
  );
}