//kalma/frontend/app/operator-console-9f3x/gnn4cd-lab/page.tsx

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Gnn4cdLabClient from './Gnn4cdLabClient';
import {
  GNN4CD_LAB_COOKIE,
  isGnn4cdLabConfigured,
  verifyGnn4cdLabSession,
} from '@/lib/server/gnn4cd-lab-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'GNN4CD evaluation lab',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const shellStyle = {
  minHeight: '100vh',
  padding: '40px 18px 80px',
  background: '#0D1710',
  color: '#E9E2D6',
  fontFamily: 'var(--font-sans), sans-serif',
} as const;

export default async function Gnn4cdLabPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const authorized = verifyGnn4cdLabSession(cookieStore.get(GNN4CD_LAB_COOKIE)?.value);
  const params = searchParams ? await searchParams : {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  if (!authorized) {
    return (
      <main style={shellStyle}>
        <section
          style={{
            width: 'min(460px, 100%)',
            margin: '10vh auto 0',
            padding: 24,
            border: '1px solid #35523D',
            borderRadius: 22,
            background: '#162019',
            boxShadow: '12px 12px 30px #08100B, -8px -8px 24px #223328',
          }}
        >
          <div style={{ color: '#C8A84A', fontSize: 12, letterSpacing: '0.14em' }}>
            PRIVATE RESEARCH SURFACE
          </div>
          <h1 style={{ margin: '10px 0 8px', fontFamily: 'var(--font-display), serif', fontSize: 32 }}>
            GNN4CD evaluation lab
          </h1>
          <p style={{ color: '#BFB6A8', lineHeight: 1.55, margin: '0 0 22px' }}>
            Restricted access. Runs and evidence in this area are not public Kalma signals.
          </p>

          {!isGnn4cdLabConfigured() || error === 'not-configured' ? (
            <div style={{ padding: 12, borderRadius: 12, background: '#402B22', color: '#F0C7B8' }}>
              Set GNN4CD_LAB_SECRET, or CRON_SECRET as a fallback, before opening the lab.
            </div>
          ) : (
            <form method="post" action="/operator-console-9f3x/gnn4cd-lab/access">
              <label htmlFor="secret" style={{ display: 'block', color: '#BFB6A8', marginBottom: 8 }}>
                Lab secret
              </label>
              <input
                id="secret"
                name="secret"
                type="password"
                autoComplete="current-password"
                required
                style={{
                  width: '100%',
                  minHeight: 50,
                  boxSizing: 'border-box',
                  padding: '0 14px',
                  color: '#E9E2D6',
                  background: '#0D1710',
                  border: '1px solid #35523D',
                  borderRadius: 12,
                  fontSize: 16,
                }}
              />
              {error === 'invalid' ? (
                <p role="alert" style={{ color: '#E4957D', margin: '10px 0 0' }}>
                  Invalid secret.
                </p>
              ) : null}
              {error === 'rate-limited' ? (
                <p role="alert" style={{ color: '#E4957D', margin: '10px 0 0' }}>
                  Too many attempts. Wait 15 minutes before trying again.
                </p>
              ) : null}
              {error === 'payload-too-large' ? (
                <p role="alert" style={{ color: '#E4957D', margin: '10px 0 0' }}>
                  The access request was too large.
                </p>
              ) : null}
              <button
                type="submit"
                style={{
                  width: '100%',
                  minHeight: 52,
                  marginTop: 14,
                  border: 0,
                  borderRadius: 14,
                  background: '#5AAF72',
                  color: '#08100B',
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                Open private lab
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <Gnn4cdLabClient />
    </main>
  );
}
