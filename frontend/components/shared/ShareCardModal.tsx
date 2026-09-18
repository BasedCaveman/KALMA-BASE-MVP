// kalma/frontend/components/shared/ShareCardModal.tsx
//
// CO-3/CO-4/CO-6: the branded "share poster" sheet. A question, an outcome, or
// a creator's own signal becomes a clean image a person can drop into a
// WhatsApp group or save — the coordination loop runs in those groups, so the
// artifact has to look like Kalma and speak in its weather voice.
//
// The poster itself is the per-market Open Graph PNG we already render
// server-side (app/markets/[id]/opengraph-image.tsx), so the preview, the
// saved file, and the WhatsApp link-unfurl are always the same image.

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

export type ShareVariant = 'signal' | 'resolution' | 'creator';

function modalCopy(language: string) {
  const t: Record<string, {
    heading: Record<ShareVariant, string>;
    sub: Record<ShareVariant, string>;
    message: string;
    save: string;
    saving: string;
    saved: string;
    copy: string;
    copied: string;
    share: string;
    close: string;
  }> = {
    en: {
      heading: { signal: 'Share this question', resolution: 'Share the result', creator: 'Share your signal' },
      sub: {
        signal: 'Drop it in the group — Yes or No?',
        resolution: 'See how it turned out 👇',
        creator: 'You opened this. Bring your people in and earn your creator share.',
      },
      message: 'Your message', save: 'Save image', saving: 'Saving…', saved: 'Saved',
      copy: 'Copy link', copied: 'Link copied', share: 'Share', close: 'Close',
    },
    pt: {
      heading: { signal: 'Compartilhar esta pergunta', resolution: 'Compartilhar o resultado', creator: 'Compartilhar seu sinal' },
      sub: {
        signal: 'Joga no grupo — Sim ou Não?',
        resolution: 'Veja como ficou 👇',
        creator: 'Você abriu este sinal. Chame sua galera e ganhe sua parte de criador.',
      },
      message: 'Sua mensagem', save: 'Salvar imagem', saving: 'Salvando…', saved: 'Salvo',
      copy: 'Copiar link', copied: 'Link copiado', share: 'Compartilhar', close: 'Fechar',
    },
    es: {
      heading: { signal: 'Compartir esta pregunta', resolution: 'Compartir el resultado', creator: 'Compartir tu señal' },
      sub: {
        signal: 'Mándalo al grupo — ¿Sí o No?',
        resolution: 'Mira cómo quedó 👇',
        creator: 'Tú abriste esto. Trae a tu gente y gana tu parte de creador.',
      },
      message: 'Tu mensaje', save: 'Guardar imagen', saving: 'Guardando…', saved: 'Guardado',
      copy: 'Copiar enlace', copied: 'Enlace copiado', share: 'Compartir', close: 'Cerrar',
    },
    fr: {
      heading: { signal: 'Partager cette question', resolution: 'Partager le résultat', creator: 'Partager ton signal' },
      sub: {
        signal: 'Envoie-le au groupe — Oui ou Non ?',
        resolution: 'Regarde le résultat 👇',
        creator: 'Tu as ouvert ce signal. Fais venir ton monde et gagne ta part de créateur.',
      },
      message: 'Ton message', save: "Enregistrer l'image", saving: 'Enregistrement…', saved: 'Enregistré',
      copy: 'Copier le lien', copied: 'Lien copié', share: 'Partager', close: 'Fermer',
    },
    de: {
      heading: { signal: 'Diese Frage teilen', resolution: 'Ergebnis teilen', creator: 'Dein Signal teilen' },
      sub: {
        signal: 'Ab in die Gruppe — Ja oder Nein?',
        resolution: 'Sieh dir das Ergebnis an 👇',
        creator: 'Du hast das eröffnet. Hol deine Leute dazu und verdiene deinen Creator-Anteil.',
      },
      message: 'Deine Nachricht', save: 'Bild speichern', saving: 'Speichern…', saved: 'Gespeichert',
      copy: 'Link kopieren', copied: 'Link kopiert', share: 'Teilen', close: 'Schließen',
    },
    zh: {
      heading: { signal: '分享这个问题', resolution: '分享结果', creator: '分享你的信号' },
      sub: {
        signal: '发到群里——是还是否？',
        resolution: '来看看结果 👇',
        creator: '这是你发起的。叫上大家，赚取你的创建者分成。',
      },
      message: '你的留言', save: '保存图片', saving: '保存中…', saved: '已保存',
      copy: '复制链接', copied: '链接已复制', share: '分享', close: '关闭',
    },
  };
  return t[language] ?? t.en;
}

export default function ShareCardModal({
  open,
  onClose,
  marketId,
  question,
  defaultMessage,
  variant = 'signal',
}: {
  open: boolean;
  onClose: () => void;
  marketId: number | string;
  question: string;
  defaultMessage: string;
  variant?: ShareVariant;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = modalCopy(language);

  const [message, setMessage] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setMessage(defaultMessage); }, [open, defaultMessage]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const ogUrl = `/markets/${marketId}/opengraph-image?flavor=${variant}`;
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/markets/${marketId}` : '';

  async function fetchPng(): Promise<Blob | null> {
    try {
      const res = await fetch(ogUrl, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async function onSave() {
    setSaveState('saving');
    const blob = await fetchPng();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kalma-${marketId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
    } else {
      setSaveState('idle');
    }
  }

  async function onShare() {
    // Share the LINK, not the image file. WhatsApp/Telegram/X unfurl the link
    // into the branded OG poster (question + split + days) on their own — that
    // unfurl is the whole point. Attaching the raw PNG instead replaces that
    // rich card with a bare picture, and some targets then drop the URL so only
    // text goes through (the reported bug). "Save image" covers the raw-PNG
    // case; the message stays short so the unfurl is the star.
    const text = `${message}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: question, text, url: shareUrl });
        return;
      } catch { /* dismissed / unsupported — fall through */ }
    }
    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* nothing */ }
  }

  const btn = (label: string, onClick: () => void, primary = false) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...(primary ? {} : neu.controlRaised),
        flex: 1,
        minHeight: 48,
        padding: '12px 14px',
        borderRadius: R.md,
        border: 'none',
        cursor: 'pointer',
        fontFamily: fonts.sans,
        fontSize: 14,
        fontWeight: 800,
        color: primary ? C.bg : C.text,
        background: primary ? C.accent : C.surface,
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(4, 9, 6, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...neu.panelRaised,
          width: 'min(440px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: R.xl,
          background: C.surface,
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.15 }}>
              {copy.heading[variant]}
            </div>
            <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft, marginTop: 4, lineHeight: 1.4 }}>
              {copy.sub[variant]}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.textMutedStrong, fontFamily: fonts.mono, fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Poster preview — the exact image that unfurls in chat */}
        <div
          style={{
            borderRadius: R.lg,
            overflow: 'hidden',
            border: `1px solid ${C.divider}`,
            marginBottom: 14,
            aspectRatio: '1200 / 630',
            background: C.surfaceDeep,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl}
            alt={question}
            width={1200}
            height={630}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          />
        </div>

        {/* Editable message */}
        <div style={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textMutedStrong, marginBottom: 6 }}>
          {copy.message}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          style={{
            ...neu.controlPressed,
            width: '100%',
            boxSizing: 'border-box',
            resize: 'none',
            border: 'none',
            borderRadius: R.md,
            padding: '10px 12px',
            marginBottom: 14,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.text,
            background: C.surfaceDeep,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {btn(saveState === 'saving' ? copy.saving : saveState === 'saved' ? copy.saved : copy.save, onSave)}
          {btn(copied ? copy.copied : copy.copy, onCopy)}
        </div>
        {btn(copy.share, onShare, true)}
      </div>
    </div>,
    document.body,
  );
}
