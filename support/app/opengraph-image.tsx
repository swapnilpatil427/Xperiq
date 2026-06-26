import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Experient Support Intelligence'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f5f7f9 0%, #eef1f3 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(42,75,217,0.12) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            right: '-80px',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(131,41,200,0.08) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Logo area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #2a4bd9, #879aff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(42,75,217,0.3)',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                background: 'rgba(242, 241, 255, 0.9)',
                borderRadius: '4px',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '32px',
                fontWeight: '800',
                color: '#2c2f31',
                letterSpacing: '-0.02em',
                lineHeight: '1',
              }}
            >
              Experient
            </span>
            <span
              style={{
                fontSize: '16px',
                color: '#595c5e',
                marginTop: '4px',
              }}
            >
              Support Intelligence
            </span>
          </div>
        </div>

        {/* Main headline */}
        <h1
          style={{
            fontSize: '72px',
            fontWeight: '800',
            color: '#2c2f31',
            letterSpacing: '-0.03em',
            lineHeight: '1.05',
            textAlign: 'center',
            margin: '0 0 24px 0',
            maxWidth: '900px',
          }}
        >
          AI-Powered Support{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #2a4bd9, #879aff)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Intelligence
          </span>
        </h1>

        <p
          style={{
            fontSize: '24px',
            color: '#595c5e',
            textAlign: 'center',
            maxWidth: '700px',
            lineHeight: '1.5',
            margin: '0 0 48px 0',
          }}
        >
          Get instant answers from Crystal AI. Browse expert docs. Connect with enterprise specialists.
        </p>

        {/* Trust badges */}
        <div
          style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
          }}
        >
          {['SOC 2 Type II', 'GDPR Compliant', '99.9% Uptime'].map(badge => (
            <div
              key={badge}
              style={{
                padding: '8px 20px',
                background: 'rgba(42, 75, 217, 0.08)',
                borderRadius: '999px',
                fontSize: '16px',
                color: '#2a4bd9',
                fontWeight: '600',
                border: '1px solid rgba(42,75,217,0.2)',
              }}
            >
              {badge}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
