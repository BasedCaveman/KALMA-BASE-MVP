'use client';

import type { CSSProperties } from 'react';

export type PublicIdentityProvider = 'twitter_oauth' | 'instagram_oauth' | 'farcaster';

export type PublicIdentityItem = {
  provider: PublicIdentityProvider;
  username: string | null;
  displayName?: string | null;
  profileUrl: string | null;
  badgeLabel: string;
  disconnectable?: boolean;
};

export type ProfilePublicIdentityCopy = {
  title: string;
  intro: string;
  addX: string;
  addInstagram: string;
  addFarcaster: string;
  instagramSoon: string;
  connectedAs: string;
  disconnect: string;
  pending: string;
  empty: string;
};

export default function ProfilePublicIdentity({
  C,
  fonts,
  neu,
  R,
  copy,
  accounts,
  pendingProvider,
  onConnect,
  onDisconnect,
}: {
  C: any;
  fonts: any;
  neu: any;
  R: any;
  copy: ProfilePublicIdentityCopy;
  accounts: PublicIdentityItem[];
  pendingProvider: PublicIdentityProvider | null;
  onConnect: (provider: PublicIdentityProvider) => void;
  onDisconnect: (provider: PublicIdentityProvider) => void;
}) {
  const providers: Array<{ key: PublicIdentityProvider; label: string }> = [
    { key: 'twitter_oauth', label: copy.addX },
    { key: 'instagram_oauth', label: copy.addInstagram },
    { key: 'farcaster', label: copy.addFarcaster },
  ];

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: 16,
        marginBottom: 14,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <SectionTitle fonts={fonts} C={C}>
        {copy.title}
      </SectionTitle>

      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: C.textSoft,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {copy.intro}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {providers.map((provider) => {
          const linked = accounts.find((item) => item.provider === provider.key);
          const pending = pendingProvider === provider.key;
          const isComingSoon = provider.key === 'instagram_oauth';

          if (linked) {
            const label = linked.username
              ? `@${linked.username}`
              : linked.displayName || provider.key;

            return (
              <div
                key={provider.key}
                style={{
                  ...neu.controlPressed,
                  borderRadius: R.lg,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.textMutedStrong,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {linked.badgeLabel}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {linked.profileUrl ? (
                        <a
                          href={linked.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontFamily: fonts.sans,
                            fontSize: 15,
                            fontWeight: 700,
                            color: C.text,
                            textDecoration: 'none',
                            wordBreak: 'break-word',
                          }}
                        >
                          {copy.connectedAs} {label}
                        </a>
                      ) : (
                        <div
                          style={{
                            fontFamily: fonts.sans,
                            fontSize: 15,
                            fontWeight: 700,
                            color: C.text,
                            wordBreak: 'break-word',
                          }}
                        >
                          {copy.connectedAs} {label}
                        </div>
                      )}
                    </div>
                  </div>

                  {linked.disconnectable !== false ? (
                    <button
                      type="button"
                      onClick={() => onDisconnect(provider.key)}
                      style={disconnectBtn(C, fonts, R)}
                    >
                      {copy.disconnect}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }

          return (
            <button
              key={provider.key}
              type="button"
              onClick={() => onConnect(provider.key)}
              disabled={pending || isComingSoon}
              style={connectBtn(C, fonts, R, pending)}
            >
              {isComingSoon ? copy.instagramSoon : pending ? copy.pending : provider.label}
            </button>
          );
        })}
      </div>

      {accounts.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textMuted,
            lineHeight: 1.5,
          }}
        >
          {copy.empty}
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ children, fonts, C }: { children: React.ReactNode; fonts: any; C: any }) {
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 700,
        color: C.textMutedStrong,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function connectBtn(C: any, fonts: any, R: any, disabled = false): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '15px 16px',
    borderRadius: R.lg,
    border: 'none',
    background: C.surface,
    color: C.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    boxShadow: `4px 4px 10px ${C.shadowA}76, -4px -4px 10px ${C.shadowB}96`,
    textAlign: 'center',
  };
}

function disconnectBtn(C: any, fonts: any, R: any): CSSProperties {
  return {
    border: 'none',
    background: 'transparent',
    color: C.below,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  };
}
