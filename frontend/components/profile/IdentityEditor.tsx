//kalma/frontend/components/profile/IdentityEditor.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/hooks/useWallet';
import {
  clearStoredProfileDisplayName,
  setStoredProfileDisplayName,
} from '@/lib/identity/profileIdentityStorage';
import { useDisplayIdentity } from '@/hooks/useDisplayIdentity';
import { useTranslation } from '@/hooks/useTranslation';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const IDENTITY_COPY: Record<string, Record<string, string>> = {
  en: {
    identity: 'Identity', displayName: 'Display name', detectedIdentity: 'Detected identity',
    customDisplayName: 'Custom display name', placeholder: 'Your name on Kalma',
    saving: 'Saving…', saved: '✓ Saved', saveError: 'Could not save', save: 'Save display name',
    reset: 'Reset to detected identity',
  },
  pt: {
    identity: 'Identidade', displayName: 'Nome de exibição', detectedIdentity: 'Identidade detectada',
    customDisplayName: 'Nome de exibição personalizado', placeholder: 'Seu nome na Kalma',
    saving: 'Salvando…', saved: '✓ Salvo', saveError: 'Não foi possível salvar', save: 'Salvar nome de exibição',
    reset: 'Voltar à identidade detectada',
  },
  es: {
    identity: 'Identidad', displayName: 'Nombre visible', detectedIdentity: 'Identidad detectada',
    customDisplayName: 'Nombre visible personalizado', placeholder: 'Tu nombre en Kalma',
    saving: 'Guardando…', saved: '✓ Guardado', saveError: 'No se pudo guardar', save: 'Guardar nombre visible',
    reset: 'Restablecer a la identidad detectada',
  },
  fr: {
    identity: 'Identité', displayName: "Nom d'affichage", detectedIdentity: 'Identité détectée',
    customDisplayName: "Nom d'affichage personnalisé", placeholder: 'Ton nom sur Kalma',
    saving: 'Enregistrement…', saved: '✓ Enregistré', saveError: "Impossible d'enregistrer", save: "Enregistrer le nom d'affichage",
    reset: "Réinitialiser à l'identité détectée",
  },
  de: {
    identity: 'Identität', displayName: 'Anzeigename', detectedIdentity: 'Erkannte Identität',
    customDisplayName: 'Eigener Anzeigename', placeholder: 'Dein Name auf Kalma',
    saving: 'Speichern…', saved: '✓ Gespeichert', saveError: 'Konnte nicht speichern', save: 'Anzeigename speichern',
    reset: 'Auf erkannte Identität zurücksetzen',
  },
  zh: {
    identity: '身份', displayName: '显示名称', detectedIdentity: '检测到的身份',
    customDisplayName: '自定义显示名称', placeholder: '你在 Kalma 上的名字',
    saving: '保存中…', saved: '✓ 已保存', saveError: '无法保存', save: '保存显示名称',
    reset: '重置为检测到的身份',
  },
};

export default function IdentityEditor({
  C,
  fonts,
  R,
  neu,
}: {
  C: any;
  fonts: any;
  R: any;
  neu: any;
}) {
  const { address } = useAccount();
  const { language } = useTranslation();
  const copy = IDENTITY_COPY[language] ?? IDENTITY_COPY.en;
  const {
    identity,
    resolvedIdentity,
    profileIdentity,
    socialName,
    authProvider,
    megaName,
    ensName,
  } = useDisplayIdentity();

  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    setDraft(profileIdentity?.displayNameOverride ?? '');
  }, [profileIdentity?.displayNameOverride]);

  // What was auto-detected (before any custom override)
  const detectedLabel = resolvedIdentity?.resolvedName ?? identity?.shortenedAddress ?? '';

  // Badge label + color
  const badge =
    megaName                  ? { label: '.mega', highlight: true }
    : ensName                 ? { label: '.eth',  highlight: true }
    : authProvider === 'google'   ? { label: 'Google',   highlight: false }
    : authProvider === 'apple'    ? { label: 'Apple',    highlight: false }
    : authProvider === 'facebook' ? { label: 'Facebook', highlight: false }
    : authProvider === 'x'        ? { label: 'X',        highlight: false }
    : authProvider === 'instagram' ? { label: 'Instagram', highlight: false }
    : authProvider === 'farcaster' ? { label: 'Farcaster', highlight: false }
    : authProvider === 'discord'  ? { label: 'Discord',  highlight: false }
    : null;

  const handleSave = useCallback(() => {
    if (!address) return;
    setSaveState('saving');
    setTimeout(() => {
      try {
        setStoredProfileDisplayName(address, draft);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      } catch {
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 3000);
      }
    }, 180);
  }, [address, draft]);

  const handleReset = useCallback(() => {
    if (!address) return;
    clearStoredProfileDisplayName(address);
    setDraft('');
    setSaveState('idle');
  }, [address]);

  const saveLabel =
    saveState === 'saving' ? copy.saving
    : saveState === 'saved'  ? copy.saved
    : saveState === 'error'  ? copy.saveError
    : copy.save;

  const saveBg =
    saveState === 'saved'  ? C.above
    : saveState === 'error' ? C.below
    : '#173126';

  if (!address || !identity) return null;

  return (
    <div
      style={{
        ...neu.controlPressed,
        borderRadius: R.lg,
        padding: 14,
        marginTop: 12,
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {copy.identity}
      </div>

      {/* Current active display name */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft, marginBottom: 2 }}>
          {copy.displayName}
        </div>
        <div style={{ fontFamily: fonts.sans, fontSize: 16, fontWeight: 700, color: C.text }}>
          {identity.displayName}
        </div>
      </div>

      {/* Detected identity */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft }}>
            {copy.detectedIdentity}
          </span>
          {badge ? (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                color: badge.highlight ? C.accent : C.textMutedStrong,
                background: badge.highlight ? `${C.accent}14` : C.surfaceHigh,
                borderRadius: 6,
                padding: '2px 6px',
                letterSpacing: 0.8,
              }}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            color: C.text,
            wordBreak: 'break-word',
          }}
        >
          {detectedLabel}
        </div>
      </div>

      {/* Custom display name input */}
      <label style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft }}>
          {copy.customDisplayName}
        </span>
        <input
          id="identity-display-name"
          name="display-name"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (saveState === 'saved') setSaveState('idle');
          }}
          placeholder={copy.placeholder}
          style={{
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
          }}
        />
      </label>

      {/* Save / Reset */}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{
            border: 'none',
            borderRadius: R.lg,
            padding: '14px 14px',
            background: saveBg,
            color: '#FFFDF8',
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            cursor: saveState === 'saving' ? 'default' : 'pointer',
            transition: 'background 0.25s ease',
          }}
        >
          {saveLabel}
        </button>

        <button
          type="button"
          onClick={handleReset}
          style={{
            border: 'none',
            borderRadius: R.lg,
            padding: '14px 14px',
            background: C.surface,
            color: C.text,
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {copy.reset}
        </button>
      </div>
    </div>
  );
}
