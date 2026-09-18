//frontend/components/profile/ProfileVerifiedAccounts.tsx
'use client';

import type { CSSProperties } from 'react';

export type VerifiedAccountProvider = 'google_oauth' | 'apple_oauth' | 'passkey' | 'wallet';

export type VerifiedAccountItem = {
  provider: string;
  username: string | null;
  profileUrl: string | null;
  avatarUrl?: string | null;
  verifiedAt: string | null;
  badgeLabel?: string | null;
  disconnectable?: boolean;
};

export type ProfileVerifiedAccountsCopy = {
  title: string;
  intro: string;
  addGoogle: string;
  addApple: string;
  addPasskey: string;
  addWallet: string;
  disconnect: string;
  connectedAs: string;
  pending: string;
  empty: string;
};

export type ProfileVerifiedAccountsProps = {
  C: any;
  fonts: any;
  neu: any;
  R: any;
  copy: ProfileVerifiedAccountsCopy;
  accounts: VerifiedAccountItem[];
  pendingProvider: VerifiedAccountProvider | null;
  onConnect: (provider: VerifiedAccountProvider) => void;
  onDisconnect: (provider: VerifiedAccountProvider) => void;
  /** Transient feedback shown when a disconnect attempt was blocked or
   *  failed — the button gives no other signal, so this is the only way
   *  the user learns why nothing changed. */
  notice?: string | null;
};

export default function ProfileVerifiedAccounts({
  C,
  fonts,
  neu,
  R,
  copy,
  accounts,
  pendingProvider,
  onConnect,
  onDisconnect,
  notice,
}: ProfileVerifiedAccountsProps) {
  const providers: Array<{
    key: VerifiedAccountProvider;
    connectLabel: string;
    canConnect: boolean;
  }> = [
    { key: 'google_oauth', connectLabel: copy.addGoogle, canConnect: true },
    { key: 'apple_oauth', connectLabel: copy.addApple, canConnect: false },
    { key: 'passkey', connectLabel: copy.addPasskey, canConnect: true },
    { key: 'wallet', connectLabel: copy.addWallet, canConnect: true },
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

          if (!linked && !provider.canConnect) {
            return null;
          }

          if (linked) {
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
                      {linked.badgeLabel ?? linked.provider}
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
                          {copy.connectedAs} {linked.username ?? provider.key}
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
                          {copy.connectedAs} {linked.username ?? provider.key}
                        </div>
                      )}

                      {linked.badgeLabel ? (
                        <span style={badgeStyle(C, fonts, R)}>{linked.badgeLabel}</span>
                      ) : null}
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
              disabled={pending}
              style={connectBtn(C, fonts, R, pending)}
            >
              {pending ? copy.pending : provider.connectLabel}
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

      {notice ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: R.md,
            background: `${C.below}14`,
            border: `1px solid ${C.below}44`,
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.below,
            lineHeight: 1.45,
          }}
        >
          {notice}
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
    border: `1px solid ${disabled ? C.divider : C.dividerStrong}`,
    background: disabled
      ? `linear-gradient(180deg, ${C.surface} 0%, ${C.surfacePressed} 100%)`
      : `linear-gradient(180deg, ${C.surfaceHigh} 0%, ${C.surfaceSoft} 100%)`,
    color: disabled ? C.textMutedStrong : C.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.82 : 1,
    boxShadow: disabled
      ? `inset 3px 3px 8px ${C.shadowA}AA, inset -2px -2px 7px ${C.shadowB}42`
      : `5px 5px 12px ${C.shadowA}A8, -5px -5px 12px ${C.shadowB}48, inset 0 1px 0 ${C.surfaceHigh}`,
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

function badgeStyle(C: any, fonts: any, R: any): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px 10px',
    borderRadius: R.sm,
    background: `${C.accent}12`,
    color: C.text,
    textDecoration: 'none',
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
  };
}
