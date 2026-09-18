// kalma/frontend/lib/side-labels.ts
//
// Unified answer labels. The QUESTION carries the weather semantics; the
// answer should stay stable across risk types so people only decide "yes" or
// "no" instead of re-learning "more rain / less rain / warmer / drier".
//
// Shared by SignalQuestionCard (the calm lead card) and CommunityPulse (the
// crowd split on the market detail page) so both speak the same answer model.

export type SidePair = { above: string; below: string };

export function sideLabels(marketTypeId: number, language: string): SidePair {
  const L = (en: SidePair, pt: SidePair, es: SidePair, fr: SidePair, de: SidePair, zh: SidePair): SidePair =>
    ({ en, pt, es, fr, de, zh } as Record<string, SidePair>)[language] ?? en;
  return L(
    { above: 'Yes', below: 'No' },
    { above: 'Sim', below: 'Não' },
    { above: 'Sí', below: 'No' },
    { above: 'Oui', below: 'Non' },
    { above: 'Ja', below: 'Nein' },
    { above: '是', below: '否' },
  );
}
