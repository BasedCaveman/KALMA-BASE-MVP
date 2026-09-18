//frontend/components/profile/ProfileIdentityEditor.tsx
'use client';

import type { CSSProperties } from 'react';

export type HandleValidationState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid'
  | 'reserved';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type VerifiedBadge = {
  type: 'verified-x' | 'verified-facebook' | 'verified-instagram';
  label: string;
  href: string | null;
};

type PreviewIdentity = {
  displayName: string;
  handle: string | null;
  shortenedAddress: string;
  badges: VerifiedBadge[];
};

export type ProfileIdentityEditorCopy = {
  title: string;
  identityHint: string;
  displayName: string;
  detectedIdentity: string;
  customDisplayName: string;
  customDisplayPlaceholder: string;
  handle: string;
  handlePlaceholder: string;
  handleHint: string;
  saveDisplayName: string;
  resetDisplayName: string;
  preview: string;
  available: string;
  checking: string;
  taken: string;
  reserved: string;
  invalid: string;
  saved: string;
  saving: string;
  saveError: string;
};

export type ProfileIdentityEditorProps = {
  C: any;
  fonts: any;
  neu: any;
  R: any;
  copy: ProfileIdentityEditorCopy;
  detectedIdentity: string;
  displayName: string;
  handle: string;
  preview: PreviewIdentity;
  validation: {
    status: HandleValidationState;
    message: string | null;
  };
  saveState: SaveState;
  disabled?: boolean;
  onDisplayNameChange: (value: string) => void;
  onHandleChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
};

export default function ProfileIdentityEditor({
  C,
  fonts,
  neu,
  R,
  copy,
  detectedIdentity,
  displayName,
  handle,
  preview,
  validation,
  saveState,
  disabled = false,
  onDisplayNameChange,
  onHandleChange,
  onSave,
  onReset,
}: ProfileIdentityEditorProps) {
  const validationColor =
    validation.status === 'available'
      ? C.above
      : validation.status === 'checking'
        ? C.textSoft
        : validation.status === 'idle'
          ? C.textMuted
          : C.below;

  const saveLabel =
    saveState === 'saving'
      ? copy.saving
      : saveState === 'saved'
        ? copy.saved
        : saveState === 'error'
          ? copy.saveError
          : copy.saveDisplayName;

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

      <HelperText fonts={fonts} C={C}>
        {copy.identityHint}
      </HelperText>

      <div style={{ ...neu.controlPressed, borderRadius: R.lg, padding: '12px 14px', marginBottom: 10 }}>
        <div style={fieldLabel(fonts, C)}>{copy.displayName}</div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 16,
            fontWeight: 700,
            color: C.text,
          }}
        >
          {preview.displayName}
        </div>
      </div>

      <div style={{ ...neu.controlPressed, borderRadius: R.lg, padding: '12px 14px', marginBottom: 12 }}>
        <div style={fieldLabel(fonts, C)}>{copy.detectedIdentity}</div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
            wordBreak: 'break-word',
          }}
        >
          {detectedIdentity}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={fieldLabel(fonts, C)}>{copy.customDisplayName}</span>
          <input
            id="profile-display-name"
            name="display-name"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder={copy.customDisplayPlaceholder}
            disabled={disabled}
            style={inputStyle(C, fonts, R, disabled)}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span style={fieldLabel(fonts, C)}>{copy.handle}</span>
          <input
            id="profile-handle"
            name="handle"
            value={handle}
            onChange={(e) => onHandleChange(e.target.value)}
            placeholder={copy.handlePlaceholder}
            disabled={disabled}
            style={inputStyle(C, fonts, R, disabled)}
          />
        </label>

        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: validationColor,
            lineHeight: 1.45,
            minHeight: 20,
          }}
        >
          {validation.message ?? copy.handleHint}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saveState === 'saving'}
          style={primaryBtn(C, fonts, R, disabled || saveState === 'saving')}
        >
          {saveLabel}
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          style={actionBtn(C, fonts, R, disabled)}
        >
          {copy.resetDisplayName}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          ...neu.controlPressed,
          borderRadius: R.lg,
          padding: '14px 14px 12px',
        }}
      >
        <div style={fieldLabel(fonts, C)}>{copy.preview}</div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: C.surfaceHigh,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: fonts.mono,
              fontSize: 14,
              fontWeight: 700,
              color: C.textMutedStrong,
              flexShrink: 0,
            }}
          >
            {(preview.displayName || preview.shortenedAddress).slice(0, 2).toUpperCase()}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 16,
                fontWeight: 700,
                color: C.text,
                wordBreak: 'break-word',
              }}
            >
              {preview.displayName}
            </div>

            <div
              style={{
                marginTop: 2,
                fontFamily: fonts.sans,
                fontSize: 13,
                color: C.textSoft,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {preview.handle ? <span>@{preview.handle}</span> : null}
              <span>{preview.shortenedAddress}</span>
            </div>

            {preview.badges.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {preview.badges.map((badge) =>
                  badge.href ? (
                    <a
                      key={`${badge.type}-${badge.label}`}
                      href={badge.href}
                      target="_blank"
                      rel="noreferrer"
                      style={badgeStyle(C, fonts, R)}
                    >
                      {badge.label}
                    </a>
                  ) : (
                    <span key={`${badge.type}-${badge.label}`} style={badgeStyle(C, fonts, R)}>
                      {badge.label}
                    </span>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
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

function HelperText({ children, fonts, C }: { children: React.ReactNode; fonts: any; C: any }) {
  return (
    <div
      style={{
        fontFamily: fonts.sans,
        fontSize: 13,
        color: C.textSoft,
        lineHeight: 1.5,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function fieldLabel(fonts: any, C: any): CSSProperties {
  return {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: C.textSoft,
    marginBottom: 4,
  };
}

function inputStyle(C: any, fonts: any, R: any, disabled = false): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.divider}`,
    background: C.surfaceHigh,
    color: C.text,
    borderRadius: R.lg,
    padding: '14px 14px',
    fontFamily: fonts.sans,
    fontSize: 15,
    outline: 'none',
    opacity: disabled ? 0.72 : 1,
  };
}

function primaryBtn(C: any, fonts: any, R: any, disabled = false): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '16px 18px',
    borderRadius: R.lg,
    border: 'none',
    background: '#173126',
    color: '#F3EBDD',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    boxShadow: `0 8px 24px ${C.shadowA}38, inset 0 1px 0 rgba(255,255,255,0.08)`,
  };
}

function actionBtn(C: any, fonts: any, R: any, disabled = false): CSSProperties {
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
    marginTop: 0,
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
