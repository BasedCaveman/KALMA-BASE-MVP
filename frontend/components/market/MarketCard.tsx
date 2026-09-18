//frontend/components/market/MarketCard.tsx

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReadContract } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/hooks/useWallet';
import { formatUnits, parseUnits } from 'viem';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext } from '@/lib/currency-context';
import { usePredictWithApproval } from '@/hooks/usePredictWithApproval';
import { CONTRACTS, MARKET_TYPES, usdcAbi, USDM_DECIMALS, decodeColdLine } from '@/lib/contracts';
import {
  TypeIcon,
  ClockIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/shared/icons';
import {
  PhaseIndicator,
  ResolutionBanner,
  derivePhase,
} from '@/components/shared/MarketLifecycle';
import type { Market } from '@/hooks/useMarkets';
import { formatPlaceLabel, localizeCountry } from '@/lib/place-format';
import { marketQuestion } from '@/lib/market-question';
import { useUnits } from '@/lib/units-context';
import { convertThreshold, thresholdTemp, type UnitSystem } from '@/lib/units';
import { useHistoricalWeather } from '@/hooks/useHistoricalWeather';
import ShareButton from '@/components/shared/ShareButton';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import {
  patchMarketSnapshotAfterPredict,
  refreshMarketSnapshotAfterPredict,
} from '@/lib/market-snapshot-client';

const MIN_POSITION = 1;
const PRIMARY_BG = '#173126';
const PRIMARY_TEXT = '#F3EBDD';

type EntryState =
  | 'open'
  | 'prediction_closed'
  | 'awaiting_resolution'
  | 'resolved'
  | 'cancelled';

function getEntryState(m: Market): EntryState {
  const now = Math.floor(Date.now() / 1000);

  if (m.cancelled) return 'cancelled';
  if (m.resolved) return 'resolved';
  if (now >= m.endTime) return 'awaiting_resolution';
  if (now >= m.predictionDeadline) return 'prediction_closed';
  return 'open';
}

// Localized High/Medium/Low for the weather-confidence indicator. The weather
// hook returns the level in English; this maps it for display.
function confidenceLabel(confidence: string, language: string): string {
  const map: Record<string, Record<string, string>> = {
    High: { en: 'High', pt: 'Alta', es: 'Alta', fr: 'Élevée', de: 'Hoch', zh: '高' },
    Medium: { en: 'Medium', pt: 'Média', es: 'Media', fr: 'Moyenne', de: 'Mittel', zh: '中' },
    Low: { en: 'Low', pt: 'Baixa', es: 'Baja', fr: 'Faible', de: 'Niedrig', zh: '低' },
  };
  const row = map[confidence];
  return row ? row[language] ?? row.en : confidence;
}

function tr(language: string, map: Record<string, string>) {
  return map[language] ?? map.en;
}

function localizedDayUnit(language: string, days: number) {
  return tr(language, {
    en: days === 1 ? 'day' : 'days',
    pt: days === 1 ? 'dia' : 'dias',
    es: days === 1 ? 'día' : 'días',
    fr: days === 1 ? 'jour' : 'jours',
    de: days === 1 ? 'Tag' : 'Tage',
    zh: '天',
  });
}

function localizedDayWindow(language: string, days: number) {
  const unit = localizedDayUnit(language, days);
  return tr(language, {
    // English compound adjectives take the singular: "2-day window".
    en: `${days}-day`,
    pt: `${days} ${unit}`,
    es: `${days} ${unit}`,
    fr: `${days} ${unit}`,
    de: `${days} ${unit}`,
    zh: `${days}${unit}`,
  });
}

function marketCardCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      yes: 'Yes',
      no: 'No',
      weatherContext: 'Weather context',
      loadingWeather: 'Checking 10-year weather pattern...',
      weatherUnavailable: 'Weather context unavailable',
      crowdSplit: 'Crowd split',
      crowd: 'Crowd',
      pool: 'Total',
      betterPay: 'Stronger protection',
      moreChosen: 'More chosen',
      exactReturn: 'Estimated protection depends on the answer and amount you choose.',
      actionGuideTitle: 'Answer this question',
      actionGuideBody:
        'This is the on-chain action. Choose Yes or No when you are ready to answer.',
      quickSideHint:
        'Choose Yes if you think the answer to this weather question is yes. Choose No if you think it is no.',
      testnetBalanceHint: 'Your test credits balance appears here after you connect.',
      bothSidesSimilar: 'Both answers have similar support right now.',
      oneSideEmpty: 'Only one answer has support right now.',
      otherSideCouldPayMore: 'The opposite answer may offer stronger protection if opened.',
      yesMayPayMore: 'Yes may protect more because fewer people chose it.',
      noMayPayMore: 'No may protect more because fewer people chose it.',
      rainMarket: 'Rain window',
      temperatureMarket: 'Temperature window',
      lowTempMarket: 'Low temp window',
      snowMarket: 'Snow window',
      coldSpellMarket: 'Cold spell window',
      dryStretchMarket: 'Dry stretch window',
      frostRiskMarket: 'Frost risk window',
      heavyRainMarket: 'Heavy rain event window',
      threshold: 'threshold',
      accumulatedRain: 'Accumulated rain over',
      averageHighs: 'Average of daily highs over',
      days: 'days',
      day: 'day',
      loading: 'Loading',
      quickPredict: 'Quick answer',
      chooseSide: 'Choose an answer',
      balance: 'Balance',
      allowed: 'Allowed',
      amount: 'Amount',
      confirmPrediction: 'Confirm answer',
      allowAndPredict: 'Allow and answer',
      connectToPredict: 'Connect to answer',
      predictionClosed: 'Answers closed',
      predictionClosedShort: 'Closed for answers',
      awaitingResolution: 'Awaiting resolution',
      openForPositions: 'Protection window open',
      ifYourSideWins: 'If your answer is correct',
      beforeFees: 'Before fees',
      afterFee: 'After est. fee',
      winnerFee:
        'Estimated winner fee. Final values move as the pool changes.',
      marketClosed: 'This window is closed.',
      marketPredictionClosed:
        'This window is still active, but it is no longer accepting new answers.',
      notEnoughBalance: 'Not enough balance for this amount.',
      confirmAccess: 'Please confirm access to your test dollars.',
      confirmPredict: 'Please confirm your answer.',
      predictionAdded: 'Answer added.',
      close: 'Close',
      selected: 'selected',
      viewMarket: 'View details',
      noSelected: 'No selected',
      yesSelected: 'Yes selected',
      rain: 'Rain',
      temperature: 'Temperature',
      yourPosition: 'Your position',
      on: 'on',
      won: 'Won',
      lost: 'Lost',
      protectHintTitle: 'Using Kalma for protection',
      protectHintBody:
        'If you want protection, choose the answer that matches the weather outcome that would hurt you.',
      protectHintFoot:
        'Your return comes from your share of the winning side and the size of the opposite pool.',
      gotIt: 'Got it',
      learnRiskTitle: 'Pick the risky outcome for you',
      learnRiskBody:
        'If heavy rain would damage your crops or business, choose Yes when the signal asks whether that heavy rain will happen. Choose No if the safer outcome for you is that it does not happen.',
      learnReturnTitle: 'How estimated protection works',
      learnReturnBody:
        'Returns are not fixed. They depend on your share of the winning side and how much money is on the losing side.',
      learnLiquidityTitle: 'Check the opposite answer',
      learnLiquidityBody:
        'A position cannot protect more than the pool can support. If the opposite side is small, your possible protection is limited even if you are right.',
      learnEarlyTitle: 'Small early positions can help',
      learnEarlyBody:
        'A smaller position placed early can secure a better share. You can monitor the city and adjust later if support grows.',
    },
    pt: {
      yes: 'Sim',
      no: 'Não',
      weatherContext: 'Contexto climático',
      loadingWeather: 'Consultando padrão climático de 10 anos...',
      weatherUnavailable: 'Contexto climático indisponível',
      crowdSplit: 'Divisão da multidão',
      crowd: 'Multidão',
      pool: 'Total',
      betterPay: 'Proteção mais forte',
      moreChosen: 'Mais escolhido',
      exactReturn: 'A proteção estimada depende da resposta e do valor que você escolher.',
      actionGuideTitle: 'Escolha um lado',
      actionGuideBody:
        'Este sinal já existe. Escolha Sim ou Não quando estiver pronto para abrir uma posição.',
      quickSideHint:
        'Escolha Sim se você acredita que a resposta para esta pergunta climática é sim. Escolha Não se acredita que é não.',
      testnetBalanceHint: 'Seu saldo de dinheiro de teste aparece aqui depois da conexão.',
      bothSidesSimilar: 'As duas respostas têm apoio parecido agora.',
      oneSideEmpty: 'Só uma resposta tem apoio agora.',
      otherSideCouldPayMore: 'A resposta oposta pode oferecer proteção mais forte se for aberta.',
      yesMayPayMore: 'Sim pode proteger mais porque menos pessoas escolheram essa resposta.',
      noMayPayMore: 'Não pode proteger mais porque menos pessoas escolheram essa resposta.',
      rainMarket: 'Janela de chuva',
      temperatureMarket: 'Janela de temperatura',
      lowTempMarket: 'Janela de temp. baixa',
      snowMarket: 'Janela de neve',
      coldSpellMarket: 'Janela de frio prolongado',
      dryStretchMarket: 'Janela de estiagem',
      frostRiskMarket: 'Janela de risco de geada',
      heavyRainMarket: 'Janela de chuva forte',
      threshold: 'limite',
      accumulatedRain: 'Chuva acumulada em',
      averageHighs: 'Média das máximas diárias em',
      days: 'dias',
      day: 'dia',
      loading: 'Carregando',
      quickPredict: 'Resposta rápida',
      chooseSide: 'Escolha uma resposta',
      balance: 'Saldo',
      allowed: 'Permitido',
      amount: 'Valor',
      confirmPrediction: 'Confirmar resposta',
      allowAndPredict: 'Permitir e responder',
      connectToPredict: 'Conectar para responder',
      predictionClosed: 'Respostas encerradas',
      predictionClosedShort: 'Fechado para respostas',
      awaitingResolution: 'Aguardando resolução',
      openForPositions: 'Janela de proteção aberta',
      ifYourSideWins: 'Se sua resposta estiver certa',
      beforeFees: 'Antes das taxas',
      afterFee: 'Após taxa estimada',
      winnerFee:
        'Taxa estimada do vencedor. O valor final muda conforme o pool muda.',
      marketClosed: 'Esta janela está fechada.',
      marketPredictionClosed:
        'Esta janela ainda está ativa, mas não aceita novas respostas.',
      notEnoughBalance: 'Saldo insuficiente para esse valor.',
      confirmAccess: 'Confirme o acesso aos seus dólares de teste.',
      confirmPredict: 'Confirme a sua resposta.',
      predictionAdded: 'Resposta adicionada.',
      close: 'Fechar',
      selected: 'selecionado',
      viewMarket: 'Ver detalhes',
      noSelected: 'Não selecionado',
      yesSelected: 'Sim selecionado',
      rain: 'Chuva',
      temperature: 'Temperatura',
      yourPosition: 'Sua posição',
      on: 'em',
      won: 'Ganhou',
      lost: 'Perdeu',
      protectHintTitle: 'Usando a Kalma para proteção',
      protectHintBody:
        'Se você quer proteção, escolha a resposta que corresponde ao resultado climático que prejudicaria você.',
      protectHintFoot:
        'Seu retorno vem da sua fatia do lado vencedor e do tamanho do pool do lado oposto.',
      gotIt: 'Entendi',
      learnRiskTitle: 'Escolha o resultado desfavorável para você',
      learnRiskBody:
        'Se chuva forte prejudicaria seus cultivos ou negócio, escolha Sim quando o sinal perguntar se essa chuva forte vai acontecer. Escolha Não se o cenário mais seguro para você for que ela não aconteça.',
      learnReturnTitle: 'Como a proteção estimada funciona',
      learnReturnBody:
        'Os retornos não são fixos. Eles dependem da sua fatia do lado vencedor e de quanto dinheiro está no lado perdedor.',
      learnLiquidityTitle: 'Olhe a resposta oposta',
      learnLiquidityBody:
        'Uma posição não pode proteger mais do que o pool suporta. Se o lado oposto é pequeno, sua proteção possível é limitada mesmo que você esteja certo.',
      learnEarlyTitle: 'Posições pequenas e cedo podem ajudar',
      learnEarlyBody:
        'Uma posição menor feita cedo pode garantir uma fatia melhor. Você pode acompanhar a cidade e ajustar depois se o apoio crescer.',
    },
    es: {
      yes: 'Sí',
      no: 'No',
      weatherContext: 'Contexto climático',
      loadingWeather: 'Consultando patrón climático de 10 años...',
      weatherUnavailable: 'Contexto climático no disponible',
      crowdSplit: 'División de la multitud',
      crowd: 'Multitud',
      pool: 'Total',
      betterPay: 'Protección más fuerte',
      moreChosen: 'Más elegido',
      exactReturn: 'La protección estimada depende de la respuesta y el monto que elijas.',
      actionGuideTitle: 'Elige un lado',
      actionGuideBody:
        'Esta señal ya existe. Elige Sí o No cuando estés listo para abrir una posición.',
      quickSideHint:
        'Elige Sí si crees que la respuesta a esta pregunta climática es sí. Elige No si crees que es no.',
      testnetBalanceHint: 'Tus fondos de prueba aparecen aquí después de conectar.',
      bothSidesSimilar: 'Las dos respuestas tienen apoyo similar ahora.',
      oneSideEmpty: 'Solo una respuesta tiene apoyo ahora.',
      otherSideCouldPayMore: 'La respuesta opuesta podría ofrecer protección más fuerte si se abre.',
      yesMayPayMore: 'Sí puede proteger más porque menos personas lo eligieron.',
      noMayPayMore: 'No puede proteger más porque menos personas lo eligieron.',
      rainMarket: 'Ventana de lluvia',
      temperatureMarket: 'Ventana de temperatura',
      lowTempMarket: 'Ventana de temp. baja',
      snowMarket: 'Ventana de nieve',
      coldSpellMarket: 'Ventana de ola de frío',
      dryStretchMarket: 'Ventana de sequía',
      frostRiskMarket: 'Ventana de riesgo de helada',
      heavyRainMarket: 'Ventana de lluvia fuerte',
      threshold: 'umbral',
      accumulatedRain: 'Lluvia acumulada en',
      averageHighs: 'Promedio de máximas diarias en',
      days: 'días',
      day: 'día',
      loading: 'Cargando',
      quickPredict: 'Respuesta rápida',
      chooseSide: 'Elige una respuesta',
      balance: 'Saldo',
      allowed: 'Permitido',
      amount: 'Monto',
      confirmPrediction: 'Confirmar respuesta',
      allowAndPredict: 'Permitir y responder',
      connectToPredict: 'Conectar para responder',
      predictionClosed: 'Respuestas cerradas',
      predictionClosedShort: 'Cerrada para respuestas',
      awaitingResolution: 'Esperando resolución',
      openForPositions: 'Ventana de protección abierta',
      ifYourSideWins: 'Si tu respuesta es correcta',
      beforeFees: 'Antes de comisiones',
      afterFee: 'Tras comisión estimada',
      winnerFee:
        'Comisión estimada del ganador. El valor final cambia con el pool.',
      marketClosed: 'Esta ventana está cerrada.',
      marketPredictionClosed:
        'Esta ventana sigue activa, pero ya no acepta nuevas respuestas.',
      notEnoughBalance: 'Saldo insuficiente para ese monto.',
      confirmAccess: 'Confirma el acceso a tus dólares de prueba.',
      confirmPredict: 'Confirma tu respuesta.',
      predictionAdded: 'Respuesta añadida.',
      close: 'Cerrar',
      selected: 'seleccionado',
      viewMarket: 'Ver detalles',
      noSelected: 'No seleccionado',
      yesSelected: 'Sí seleccionado',
      rain: 'Lluvia',
      temperature: 'Temperatura',
      yourPosition: 'Tu posición',
      on: 'en',
      won: 'Ganó',
      lost: 'Perdió',
      protectHintTitle: 'Usando Kalma para protección',
      protectHintBody:
        'Si buscas protección, elige la respuesta que corresponde al resultado climático que te perjudicaría.',
      protectHintFoot:
        'Tu retorno viene de tu parte del lado ganador y del tamaño del pool del lado opuesto.',
      gotIt: 'Entendido',
      learnRiskTitle: 'Elige el resultado que te perjudica',
      learnRiskBody:
        'Si una lluvia fuerte dañaría tus cultivos o negocio, elige Sí cuando la señal pregunte si esa lluvia fuerte ocurrirá. Elige No si el escenario más seguro para ti es que no ocurra.',
      learnReturnTitle: 'Cómo funciona la protección estimada',
      learnReturnBody:
        'Los retornos no son fijos. Dependen de tu parte del lado ganador y de cuánto dinero hay en el lado perdedor.',
      learnLiquidityTitle: 'Mira la respuesta opuesta',
      learnLiquidityBody:
        'Una posición no puede proteger más de lo que el pool soporta. Si el lado opuesto es pequeño, tu protección posible es limitada incluso si aciertas.',
      learnEarlyTitle: 'Posiciones pequeñas y temprano pueden ayudar',
      learnEarlyBody:
        'Una posición menor hecha temprano puede asegurar una mejor parte. Puedes seguir la ciudad y ajustar después si el apoyo crece.',
    },
    fr: {
      yes: 'Oui',
      no: 'Non',
      weatherContext: 'Contexte météo',
      loadingWeather: 'Consultation du motif météo sur 10 ans...',
      weatherUnavailable: 'Contexte météo indisponible',
      crowdSplit: 'Répartition de la foule',
      crowd: 'Foule',
      pool: 'Total',
      betterPay: 'Protection plus forte',
      moreChosen: 'Plus choisi',
      exactReturn: 'La protection estimée dépend de la réponse et du montant que tu choisis.',
      actionGuideTitle: 'Choisis un côté',
      actionGuideBody:
        'Ce signal existe déjà. Choisis Oui ou Non quand tu es prêt à ouvrir une position.',
      quickSideHint:
        "Choisis Oui si tu penses que la réponse à cette question météo est oui. Choisis Non si tu penses que c'est non.",
      testnetBalanceHint: 'Tes fonds de test apparaissent ici après connexion.',
      bothSidesSimilar: 'Les deux réponses ont un soutien similaire en ce moment.',
      oneSideEmpty: "Une seule réponse a du soutien pour l'instant.",
      otherSideCouldPayMore: "La réponse opposée pourrait offrir une protection plus forte si elle s'ouvre.",
      yesMayPayMore: "Oui peut protéger davantage car moins de personnes l'ont choisi.",
      noMayPayMore: "Non peut protéger davantage car moins de personnes l'ont choisi.",
      rainMarket: 'Fenêtre de pluie',
      temperatureMarket: 'Fenêtre de température',
      lowTempMarket: 'Fenêtre de temp. basse',
      snowMarket: 'Fenêtre de neige',
      coldSpellMarket: 'Fenêtre de vague de froid',
      dryStretchMarket: 'Fenêtre de sécheresse',
      frostRiskMarket: 'Fenêtre de risque de gel',
      heavyRainMarket: 'Fenêtre de pluie forte',
      threshold: 'seuil',
      accumulatedRain: 'Pluie accumulée sur',
      averageHighs: 'Moyenne des maximales journalières sur',
      days: 'jours',
      day: 'jour',
      loading: 'Chargement',
      quickPredict: 'Réponse rapide',
      chooseSide: 'Choisis une réponse',
      balance: 'Solde',
      allowed: 'Autorisé',
      amount: 'Montant',
      confirmPrediction: 'Confirmer la réponse',
      allowAndPredict: 'Autoriser et répondre',
      connectToPredict: 'Connecte-toi pour répondre',
      predictionClosed: 'Réponses fermées',
      predictionClosedShort: 'Fermée aux réponses',
      awaitingResolution: 'En attente de résolution',
      openForPositions: 'Fenêtre de protection ouverte',
      ifYourSideWins: 'Si ta réponse est correcte',
      beforeFees: 'Avant frais',
      afterFee: 'Après frais estimés',
      winnerFee:
        'Frais estimés du gagnant. La valeur finale change avec le pool.',
      marketClosed: 'Cette fenêtre est fermée.',
      marketPredictionClosed:
        "Cette fenêtre reste active, mais elle n'accepte plus de nouvelles réponses.",
      notEnoughBalance: 'Solde insuffisant pour ce montant.',
      confirmAccess: "Confirme l'accès à tes dollars de test.",
      confirmPredict: 'Confirme ta réponse.',
      predictionAdded: 'Réponse ajoutée.',
      close: 'Fermer',
      selected: 'sélectionné',
      viewMarket: 'Voir les détails',
      noSelected: 'Non sélectionné',
      yesSelected: 'Oui sélectionné',
      rain: 'Pluie',
      temperature: 'Température',
      yourPosition: 'Ta position',
      on: 'sur',
      won: 'Gagné',
      lost: 'Perdu',
      protectHintTitle: 'Utiliser Kalma pour se protéger',
      protectHintBody:
        'Si tu cherches une protection, choisis la réponse qui correspond au résultat météo qui te ferait du tort.',
      protectHintFoot:
        'Ton retour vient de ta part du côté gagnant et de la taille du pool du côté opposé.',
      gotIt: 'Compris',
      learnRiskTitle: 'Choisis le résultat défavorable pour toi',
      learnRiskBody:
        "Si de fortes pluies endommageraient tes cultures ou ton activité, choisis Oui quand le signal demande si cette forte pluie va se produire. Choisis Non si le scénario le plus sûr pour toi est qu'elle ne se produise pas.",
      learnReturnTitle: 'Comment fonctionne la protection estimée',
      learnReturnBody:
        "Les retours ne sont pas fixes. Ils dépendent de ta part du côté gagnant et de l'argent présent du côté perdant.",
      learnLiquidityTitle: 'Regarde la réponse opposée',
      learnLiquidityBody:
        "Une position ne peut pas protéger plus que le pool ne le permet. Si le côté opposé est petit, ta protection possible est limitée même si tu as raison.",
      learnEarlyTitle: 'Petites positions tôt peuvent aider',
      learnEarlyBody:
        'Une position plus petite faite tôt peut garantir une meilleure part. Tu peux suivre la ville et ajuster plus tard si le soutien augmente.',
    },
    de: {
      yes: 'Ja',
      no: 'Nein',
      weatherContext: 'Wetter-Kontext',
      loadingWeather: '10-Jahres-Wettermuster wird geprüft...',
      weatherUnavailable: 'Wetter-Kontext nicht verfügbar',
      crowdSplit: 'Aufteilung der Menge',
      crowd: 'Menge',
      pool: 'Total',
      betterPay: 'Stärkerer Schutz',
      moreChosen: 'Häufiger gewählt',
      exactReturn: 'Der geschätzte Schutz hängt von Antwort und Betrag ab, die du wählst.',
      actionGuideTitle: 'Wähle eine Seite',
      actionGuideBody:
        'Dieses Signal existiert bereits. Wähle Ja oder Nein, wenn du bereit bist, eine Position zu eröffnen.',
      quickSideHint:
        'Wähle Ja, wenn du glaubst, dass die Antwort auf diese Wetterfrage ja ist. Wähle Nein, wenn du glaubst, dass sie nein ist.',
      testnetBalanceHint: 'Dein Test-Cash-Guthaben erscheint hier nach dem Verbinden.',
      bothSidesSimilar: 'Beide Antworten haben gerade ähnliche Unterstützung.',
      oneSideEmpty: 'Nur eine Antwort hat aktuell Unterstützung.',
      otherSideCouldPayMore: 'Die Gegenantwort könnte stärkeren Schutz bieten, wenn sie geöffnet wird.',
      yesMayPayMore: 'Ja kann stärker schützen, weil weniger Leute es gewählt haben.',
      noMayPayMore: 'Nein kann stärker schützen, weil weniger Leute es gewählt haben.',
      rainMarket: 'Regen-Fenster',
      temperatureMarket: 'Temperatur-Fenster',
      lowTempMarket: 'Tiefsttemp.-Fenster',
      snowMarket: 'Schnee-Fenster',
      coldSpellMarket: 'Kältewellen-Fenster',
      dryStretchMarket: 'Trockenheits-Fenster',
      frostRiskMarket: 'Frostrisiko-Fenster',
      heavyRainMarket: 'Starkregen-Fenster',
      threshold: 'Schwelle',
      accumulatedRain: 'Akkumulierter Regen über',
      averageHighs: 'Durchschnitt der Tageshöchstwerte über',
      days: 'Tagen',
      day: 'Tag',
      loading: 'Wird geladen',
      quickPredict: 'Schnelle Antwort',
      chooseSide: 'Wähle eine Antwort',
      balance: 'Guthaben',
      allowed: 'Freigegeben',
      amount: 'Betrag',
      confirmPrediction: 'Antwort bestätigen',
      allowAndPredict: 'Freigeben und antworten',
      connectToPredict: 'Verbinden, um zu antworten',
      predictionClosed: 'Antworten geschlossen',
      predictionClosedShort: 'Keine Antworten mehr',
      awaitingResolution: 'Wartet auf Auflösung',
      openForPositions: 'Schutzfenster offen',
      ifYourSideWins: 'Wenn deine Antwort richtig ist',
      beforeFees: 'Vor Gebühren',
      afterFee: 'Nach geschätzter Gebühr',
      winnerFee:
        'Geschätzte Gewinner-Gebühr. Endwerte ändern sich mit dem Pool.',
      marketClosed: 'Dieses Fenster ist geschlossen.',
      marketPredictionClosed:
        'Dieses Fenster ist noch aktiv, nimmt aber keine neuen Antworten mehr an.',
      notEnoughBalance: 'Nicht genug Guthaben für diesen Betrag.',
      confirmAccess: 'Bitte bestätige den Zugriff auf dein Test-Guthaben.',
      confirmPredict: 'Bitte bestätige deine Antwort.',
      predictionAdded: 'Antwort hinzugefügt.',
      close: 'Schließen',
      selected: 'ausgewählt',
      viewMarket: 'Details ansehen',
      noSelected: 'Nein ausgewählt',
      yesSelected: 'Ja ausgewählt',
      rain: 'Regen',
      temperature: 'Temperatur',
      yourPosition: 'Deine Position',
      on: 'auf',
      won: 'Gewonnen',
      lost: 'Verloren',
      protectHintTitle: 'Kalma zum Schutz nutzen',
      protectHintBody:
        'Wenn du Schutz willst, wähle die Antwort, die dem Wetter-Ergebnis entspricht, das dir schaden würde.',
      protectHintFoot:
        'Dein Rückfluss kommt aus deinem Anteil an der Gewinner-Seite und der Größe des Pools auf der Gegenseite.',
      gotIt: 'Verstanden',
      learnRiskTitle: 'Wähle das für dich nachteilige Ergebnis',
      learnRiskBody:
        'Wenn starker Regen deinen Ernten oder deinem Geschäft schaden würde, wähle Ja, wenn das Signal fragt, ob dieser starke Regen eintreten wird. Wähle Nein, wenn für dich das sicherere Ergebnis ist, dass er nicht eintritt.',
      learnReturnTitle: 'Wie geschätzter Schutz funktioniert',
      learnReturnBody:
        'Rückgaben sind nicht fest. Sie hängen von deinem Anteil an der Gewinner-Seite und vom Geld auf der Verlierer-Seite ab.',
      learnLiquidityTitle: 'Schau auf die Gegenantwort',
      learnLiquidityBody:
        'Eine Position kann nicht mehr schützen, als der Pool trägt. Wenn die Gegenseite klein ist, ist dein möglicher Schutz begrenzt — selbst wenn du Recht hast.',
      learnEarlyTitle: 'Kleine, frühe Positionen können helfen',
      learnEarlyBody:
        'Eine kleinere Position früh gesetzt kann einen besseren Anteil sichern. Du kannst die Stadt verfolgen und später anpassen, wenn die Unterstützung wächst.',
    },
    zh: {
      yes: '是',
      no: '否',
      weatherContext: '天气上下文',
      loadingWeather: '正在查询 10 年气候模式...',
      weatherUnavailable: '天气上下文不可用',
      crowdSplit: '人群分布',
      crowd: '人群',
      pool: '总额',
      betterPay: '更强保护',
      moreChosen: '更多人选择',
      exactReturn: '预估保护取决于你选择的答案和金额。',
      actionGuideTitle: '选择一边',
      actionGuideBody:
        '这个信号已经存在。准备好开仓时，选择“是”或“否”。',
      quickSideHint:
        '如果你认为这道天气问题的答案是“是”，就选“是”；如果你认为答案是“否”，就选“否”。',
      testnetBalanceHint: '连接后，这里会显示你的测试资金余额。',
      bothSidesSimilar: '当前两个答案的支持度相近。',
      oneSideEmpty: '当前只有一个答案有支持。',
      otherSideCouldPayMore: '如果对面答案打开，可能提供更强保护。',
      yesMayPayMore: '“是”可能保护更多，因为选择它的人更少。',
      noMayPayMore: '“否”可能保护更多，因为选择它的人更少。',
      rainMarket: '降雨窗口',
      temperatureMarket: '气温窗口',
      lowTempMarket: '低温窗口',
      snowMarket: '降雪窗口',
      coldSpellMarket: '寒潮窗口',
      dryStretchMarket: '干旱窗口',
      frostRiskMarket: '霜冻风险窗口',
      heavyRainMarket: '强降雨事件窗口',
      threshold: '阈值',
      accumulatedRain: '累计降雨周期',
      averageHighs: '日最高气温平均周期',
      days: '天',
      day: '天',
      loading: '加载中',
      quickPredict: '快速回答',
      chooseSide: '选择一个答案',
      balance: '余额',
      allowed: '已允许',
      amount: '金额',
      confirmPrediction: '确认回答',
      allowAndPredict: '允许并回答',
      connectToPredict: '连接以回答',
      predictionClosed: '回答已关闭',
      predictionClosedShort: '已停止接收回答',
      awaitingResolution: '等待结算',
      openForPositions: '保护窗口开放',
      ifYourSideWins: '如果你的答案正确',
      beforeFees: '扣费前',
      afterFee: '扣除预估费用后',
      winnerFee: '预估的赢家手续费。最终值随 pool 变化。',
      marketClosed: '此窗口已关闭。',
      marketPredictionClosed: '此窗口仍然活跃，但已不再接受新回答。',
      notEnoughBalance: '余额不足以支付该金额。',
      confirmAccess: '请确认对测试资金的访问权限。',
      confirmPredict: '请确认你的回答。',
      predictionAdded: '回答已添加。',
      close: '关闭',
      selected: '已选择',
      viewMarket: '查看详情',
      noSelected: '已选择否',
      yesSelected: '已选择是',
      rain: '雨',
      temperature: '气温',
      yourPosition: '你的仓位',
      on: '在',
      won: '已赢',
      lost: '已输',
      protectHintTitle: '把 Kalma 用作保护',
      protectHintBody:
        '如果你想要保护，请选择对应那个会让你受损的天气结果的答案。',
      protectHintFoot:
        '你的收益来自你在胜方的份额和败方 pool 的规模。',
      gotIt: '明白了',
      learnRiskTitle: '选择对你不利的结果',
      learnRiskBody:
        '如果强降雨会损害你的作物或生意，当信号询问这种强降雨是否会发生时请选择“是”。如果对你更安全的结果是它不会发生，就请选择“否”。',
      learnReturnTitle: '预估保护如何运作',
      learnReturnBody: '保护不是固定的，取决于你在胜方的份额和败方有多少资金。',
      learnLiquidityTitle: '看看对面的答案',
      learnLiquidityBody:
        '一个仓位最多只能保护 pool 所能承担的范围。如果对面规模太小，即使你判断正确，可能获得的保护也是有限的。',
      learnEarlyTitle: '小额且早入的仓位会有帮助',
      learnEarlyBody:
        '较小但较早的仓位可能确保更好的份额。你可以持续关注这个城市，等支持增长后再调整。',
    },
  };

  return table[language] ?? table.en;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function estimateReturn(params: {
  abovePool: number;
  belowPool: number;
  amount: number;
  isAbove: boolean;
  feeBps?: number;
}) {
  const { abovePool, belowPool, amount, isAbove, feeBps = 50 } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { gross: 0, net: 0, fee: 0 };
  }

  const nextAbove = isAbove ? abovePool + amount : abovePool;
  const nextBelow = isAbove ? belowPool : belowPool + amount;
  const total = nextAbove + nextBelow;
  const winningPool = isAbove ? nextAbove : nextBelow;

  if (winningPool <= 0) {
    return { gross: 0, net: 0, fee: 0 };
  }

  const gross = (amount * total) / winningPool;
  const profit = Math.max(0, gross - amount);
  const fee = (profit * feeBps) / 10000;
  const net = gross - fee;

  return {
    gross: round1(gross),
    net: round1(net),
    fee: round1(fee),
  };
}

function durationDaysFromMarket(m: Market) {
  return Math.max(1, Math.round(Math.max(86400, m.endTime - m.startTime) / 86400));
}

// CO-5: the community split is the social headline — "62% say Above · 41
// people". Self-contained copy so it doesn't touch the 6 big card-copy blocks.
function splitCopy(language: string) {
  const t: Record<string, { say: string; person: string; people: string; beFirst: string }> = {
    en: { say: 'say', person: 'person', people: 'people', beFirst: 'Be the first to answer this one.' },
    pt: { say: 'escolheram', person: 'pessoa', people: 'pessoas', beFirst: 'Seja o primeiro a responder.' },
    es: { say: 'eligen', person: 'persona', people: 'personas', beFirst: 'Sé el primero en responder.' },
    fr: { say: 'penchent', person: 'personne', people: 'personnes', beFirst: 'Sois le premier à répondre.' },
    de: { say: 'tippen', person: 'Person', people: 'Personen', beFirst: 'Beantworte diese als Erster.' },
    zh: { say: '选择', person: '人', people: '人', beFirst: '成为第一个回答的人。' },
  };
  return t[language] ?? t.en;
}

function displayMeasureForMarket(
  m: Pick<Market, 'marketTypeId' | 'thresholdValue' | 'unit' | 'startTime' | 'endTime'>,
  language = 'en',
  system: UnitSystem = 'metric',
) {
  const raw = m.thresholdValue ?? 0;
  const converted = convertThreshold(raw, m.unit ?? '', system);
  const threshold = converted.value;
  const unit = converted.unit;
  const days = Math.max(1, Math.round(Math.max(86400, m.endTime - m.startTime) / 86400));

  if (m.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return tr(language, {
      en: `${days}-day heavy-rain check`,
      pt: `Chuva forte em ${days} ${localizedDayUnit(language, days)}`,
      es: `Lluvia fuerte en ${days} ${localizedDayUnit(language, days)}`,
      fr: `Forte pluie sur ${days} ${localizedDayUnit(language, days)}`,
      de: `Starkregen über ${days} ${localizedDayUnit(language, days)}`,
      zh: `${days}${localizedDayUnit(language, days)}强降雨`,
    });
  }
  if (m.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return tr(language, {
      en: `${days} dry ${localizedDayUnit(language, days)}`,
      pt: `${days} ${localizedDayUnit(language, days)} sem chuva`,
      es: `${days} ${localizedDayUnit(language, days)} sin lluvia`,
      fr: `${days} ${localizedDayUnit(language, days)} sans pluie`,
      de: `${days} trockene ${localizedDayUnit(language, days)}`,
      zh: `${days}${localizedDayUnit(language, days)}干燥`,
    });
  }
  if (m.marketTypeId === MARKET_TYPES.COLD_SPELL) {
    // Cold line is stored inverted-encoded on an axis the registry calls
    // 'days', so it never went through convertThreshold — decode, then convert.
    const cold = thresholdTemp(decodeColdLine(raw), system);
    return tr(language, {
      en: `${cold} cold line`,
      pt: `Linha de frio de ${cold}`,
      es: `Línea de frío de ${cold}`,
      fr: `Seuil de froid ${cold}`,
      de: `Kältelinie ${cold}`,
      zh: `${cold} 寒冷线`,
    });
  }
  if (m.marketTypeId === MARKET_TYPES.FROST_RISK) {
    const frost = thresholdTemp(2, system);
    return tr(language, {
      en: `Below ${frost}`,
      pt: `Abaixo de ${frost}`,
      es: `Por debajo de ${frost}`,
      fr: `En dessous de ${frost}`,
      de: `Unter ${frost}`,
      zh: `低于 ${frost}`,
    });
  }
  return `${threshold}${unit}`;
}

function ratioText(value: number, baseline: number, language: string) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) {
    return null;
  }
  const ratio = value / baseline;
  if (!Number.isFinite(ratio)) return null;
  const rounded = round1(ratio);
  return tr(language, {
    en: `${rounded}× usual`,
    pt: `${rounded}× o habitual`,
    es: `${rounded}× lo habitual`,
    fr: `${rounded}× l'habituel`,
    de: `${rounded}× üblich`,
    zh: `通常的 ${rounded}×`,
  });
}

function weatherContextSummary(params: {
  marketMetric: string;
  threshold: number;
  durationDays: number;
  language: string;
  weather: { avg: number; unit: string } | null | undefined;
}) {
  const { marketMetric, threshold, durationDays, language, weather } = params;
  if (!weather) return null;
  const avg = weather.avg;
  const unit = weather.unit;

  if (marketMetric === 'rain') {
    const ratio = ratioText(threshold, avg, language);
    const suffix = ratio ? ` (${ratio})` : '';
    return tr(language, {
      en: `This asks about ${threshold}${unit}; usual here is ${avg}${unit}${suffix}.`,
      pt: `Este sinal pergunta sobre ${threshold}${unit}; o habitual aqui é ${avg}${unit}${suffix}.`,
      es: `Esta señal pregunta por ${threshold}${unit}; lo habitual aquí es ${avg}${unit}${suffix}.`,
      fr: `Ce signal porte sur ${threshold}${unit}; l'habituel ici est ${avg}${unit}${suffix}.`,
      de: `Dieses Signal fragt nach ${threshold}${unit}; üblich sind hier ${avg}${unit}${suffix}.`,
      zh: `这个信号关注 ${threshold}${unit}；这里通常是 ${avg}${unit}${suffix}。`,
    });
  }

  if (marketMetric === 'heavy_rain') {
    if (threshold > 0 && threshold < 9000) {
      const ratio = ratioText(threshold, avg, language);
      const suffix = ratio ? ` (${ratio})` : '';
      return tr(language, {
        en: `This asks about a ${threshold}${unit} heavy-rain day; usual wettest day here is ${avg}${unit}${suffix}.`,
        pt: `Pergunta sobre um dia de chuva forte com ${threshold}${unit}; o dia mais chuvoso habitual aqui tem ${avg}${unit}${suffix}.`,
        es: `Pregunta por un día de lluvia fuerte con ${threshold}${unit}; el día más lluvioso habitual aquí tiene ${avg}${unit}${suffix}.`,
        fr: `Demande un jour de forte pluie à ${threshold}${unit}; le jour le plus pluvieux habituel ici est à ${avg}${unit}${suffix}.`,
        de: `Fragt nach einem Starkregentag mit ${threshold}${unit}; der übliche nasseste Tag hier hat ${avg}${unit}${suffix}.`,
        zh: `关注 ${threshold}${unit} 的强降雨日；这里通常最湿的一天是 ${avg}${unit}${suffix}。`,
      });
    }
    return tr(language, {
      en: `This asks whether an unusually heavy rain day appears; usual wettest day here is ${avg}${unit}.`,
      pt: `Pergunta se aparece um dia de chuva muito forte; o dia mais chuvoso habitual aqui tem ${avg}${unit}.`,
      es: `Pregunta si aparece un día de lluvia muy fuerte; el día más lluvioso habitual aquí tiene ${avg}${unit}.`,
      fr: `Demande si un jour de pluie très forte apparaît; le jour le plus pluvieux habituel ici est à ${avg}${unit}.`,
      de: `Fragt, ob ein ungewöhnlich starker Regentag auftritt; der übliche nasseste Tag hier hat ${avg}${unit}.`,
      zh: `关注是否会出现异常强降雨日；这里通常最湿的一天是 ${avg}${unit}。`,
    });
  }

  if (marketMetric === 'dry_stretch') {
    const ratio = ratioText(durationDays, avg, language);
    const suffix = ratio ? ` (${ratio})` : '';
    return tr(language, {
      en: `This asks for ${durationDays} dry days; usual here is ${avg} dry days${suffix}.`,
      pt: `Pergunta por ${durationDays} dias secos; o habitual aqui é ${avg} dias secos${suffix}.`,
      es: `Pregunta por ${durationDays} días secos; lo habitual aquí es ${avg} días secos${suffix}.`,
      fr: `Demande ${durationDays} jours secs; l'habituel ici est ${avg} jours secs${suffix}.`,
      de: `Fragt nach ${durationDays} trockenen Tagen; üblich sind hier ${avg} trockene Tage${suffix}.`,
      zh: `关注 ${durationDays} 个干燥天；这里通常是 ${avg} 个干燥天${suffix}。`,
    });
  }

  if (marketMetric === 'temp_low' || marketMetric === 'cold_spell' || marketMetric === 'frost_risk') {
    const windowLabel = localizedDayWindow(language, durationDays);
    return tr(language, {
      en: `Typical low here is ${avg}${unit} over this ${windowLabel} window.`,
      pt: `A mínima típica aqui é ${avg}${unit} nesta janela de ${windowLabel}.`,
      es: `La mínima típica aquí es ${avg}${unit} en esta ventana de ${windowLabel}.`,
      fr: `La minimale typique ici est de ${avg}${unit} sur cette fenêtre de ${windowLabel}.`,
      de: `Der typische Tiefstwert hier liegt bei ${avg}${unit} in diesem ${windowLabel}-Fenster.`,
      zh: `这里在这个 ${windowLabel} 窗口中的典型低温是 ${avg}${unit}。`,
    });
  }

  if (marketMetric === 'snow') {
    const ratio = ratioText(threshold, avg, language);
    const suffix = ratio ? ` (${ratio})` : '';
    return tr(language, {
      en: `This asks about ${threshold}${unit} of snow; usual here is ${avg}${unit}${suffix}.`,
      pt: `Este sinal pergunta sobre ${threshold}${unit} de neve; o habitual aqui é ${avg}${unit}${suffix}.`,
      es: `Esta señal pregunta por ${threshold}${unit} de nieve; lo habitual aquí es ${avg}${unit}${suffix}.`,
      fr: `Ce signal porte sur ${threshold}${unit} de neige; l'habituel ici est ${avg}${unit}${suffix}.`,
      de: `Dieses Signal fragt nach ${threshold}${unit} Schnee; üblich sind hier ${avg}${unit}${suffix}.`,
      zh: `这个信号关注 ${threshold}${unit} 的降雪；这里通常是 ${avg}${unit}${suffix}。`,
    });
  }

  const windowLabel = localizedDayWindow(language, durationDays);
  return tr(language, {
    en: `Typical high here is ${avg}${unit} over this ${windowLabel} window.`,
    pt: `A máxima típica aqui é ${avg}${unit} nesta janela de ${windowLabel}.`,
    es: `La máxima típica aquí es ${avg}${unit} en esta ventana de ${windowLabel}.`,
    fr: `La maximale typique ici est de ${avg}${unit} sur cette fenêtre de ${windowLabel}.`,
    de: `Der typische Höchstwert hier liegt bei ${avg}${unit} in diesem ${windowLabel}-Fenster.`,
    zh: `这里在这个 ${windowLabel} 窗口中的典型高温是 ${avg}${unit}。`,
  });
}

function weatherContextDetail(params: {
  marketMetric: string;
  durationDays: number;
  language: string;
  weather: { avg: number; unit: string } | null | undefined;
}) {
  const { marketMetric, durationDays, language, weather } = params;
  if (!weather) return null;
  const dayWindow = localizedDayWindow(language, durationDays);

  if (marketMetric === 'dry_stretch') {
    const dayLabel = localizedDayUnit(language, weather.avg === 1 ? 1 : 2);
    return tr(language, {
      en: `Average longest dry run over this period: ${weather.avg} ${dayLabel}.`,
      pt: `Maior sequência seca média neste período: ${weather.avg} ${dayLabel}.`,
      es: `Racha seca máxima promedio en este período: ${weather.avg} ${dayLabel}.`,
      fr: `Plus longue période sèche moyenne sur cette période : ${weather.avg} ${dayLabel}.`,
      de: `Durchschnittlich längste Trockenserie in diesem Zeitraum: ${weather.avg} ${dayLabel}.`,
      zh: `这一时期平均最长干燥连续天数：${weather.avg}${dayLabel}。`,
    });
  }
  if (marketMetric === 'heavy_rain') {
    return tr(language, {
      en: `Average wettest single day over this ${dayWindow} window.`,
      pt: `Dia mais chuvoso médio nesta janela de ${dayWindow}.`,
      es: `Día más lluvioso promedio en esta ventana de ${dayWindow}.`,
      fr: `Jour le plus pluvieux moyen sur cette fenêtre de ${dayWindow}.`,
      de: `Durchschnittlich nassester Einzeltag in diesem ${dayWindow}-Fenster.`,
      zh: `这个 ${dayWindow} 窗口中的平均最湿单日。`,
    });
  }
  if (marketMetric === 'rain') {
    return tr(language, {
      en: `Average total rain over this ${dayWindow} window.`,
      pt: `Chuva total média nesta janela de ${dayWindow}.`,
      es: `Lluvia total promedio en esta ventana de ${dayWindow}.`,
      fr: `Pluie totale moyenne sur cette fenêtre de ${dayWindow}.`,
      de: `Durchschnittlicher Gesamtniederschlag in diesem ${dayWindow}-Fenster.`,
      zh: `这个 ${dayWindow} 窗口中的平均总降雨。`,
    });
  }
  if (marketMetric === 'snow') {
    return tr(language, {
      en: `Average total snowfall over this ${dayWindow} window.`,
      pt: `Neve total média nesta janela de ${dayWindow}.`,
      es: `Nieve total promedio en esta ventana de ${dayWindow}.`,
      fr: `Chute de neige totale moyenne sur cette fenêtre de ${dayWindow}.`,
      de: `Durchschnittlicher Gesamtschneefall in diesem ${dayWindow}-Fenster.`,
      zh: `这个 ${dayWindow} 窗口中的平均总降雪。`,
    });
  }
  if (marketMetric === 'temp_low' || marketMetric === 'cold_spell' || marketMetric === 'frost_risk') {
    return tr(language, {
      en: `Average daily low over this ${dayWindow} window.`,
      pt: `Média das mínimas diárias nesta janela de ${dayWindow}.`,
      es: `Promedio de mínimas diarias en esta ventana de ${dayWindow}.`,
      fr: `Moyenne des minimales quotidiennes sur cette fenêtre de ${dayWindow}.`,
      de: `Durchschnittlicher Tages-Tiefstwert in diesem ${dayWindow}-Fenster.`,
      zh: `这个 ${dayWindow} 窗口中的日低温平均值。`,
    });
  }
  return tr(language, {
    en: `Average daily high over this ${dayWindow} window.`,
    pt: `Média das máximas diárias nesta janela de ${dayWindow}.`,
    es: `Promedio de máximas diarias en esta ventana de ${dayWindow}.`,
    fr: `Moyenne des maximales quotidiennes sur cette fenêtre de ${dayWindow}.`,
    de: `Durchschnittlicher Tages-Höchstwert in diesem ${dayWindow}-Fenster.`,
    zh: `这个 ${dayWindow} 窗口中的日高温平均值。`,
  });
}

export default function MarketCard({ m }: { m: Market }) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const { system } = useUnits();
  const copy = marketCardCopy(language);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSide, setQuickSide] = useState<'above' | 'below' | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem('kalma-protection-hint-seen');
      if (!seen) setShowHint(true);
    } catch {}
    // Once the user dismisses the hint on any card, every other mounted card
    // hides it too — no need to tap "Got it" on each one.
    const onDismissed = () => setShowHint(false);
    window.addEventListener('kalma-protection-hint-dismissed', onDismissed);
    return () => window.removeEventListener('kalma-protection-hint-dismissed', onDismissed);
  }, []);

  const threshold = m.thresholdValue ?? 0;
  const unit = m.unit ?? (m.marketTypeId === 1 ? 'mm' : m.marketTypeId === 4 ? 'cm' : '°C');
  const marketDurationDays = durationDaysFromMarket(m);

  const { data: weather, isLoading: weatherLoading } = useHistoricalWeather({
    lat: m.lat,
    lon: m.lon,
    marketTypeId: m.marketTypeId,
    thresholdValue: threshold,
    startTime: m.startTime,
    endTime: m.endTime,
  });

  const oneSideEmpty =
    (m.abovePoolValue === 0 && m.belowPoolValue > 0) ||
    (m.belowPoolValue === 0 && m.abovePoolValue > 0);

  let pricingText = copy.bothSidesSimilar;
  if (oneSideEmpty) {
    pricingText = `${copy.oneSideEmpty} ${copy.otherSideCouldPayMore}`;
  } else if (m.contrarianSide === 'above') {
    pricingText = copy.yesMayPayMore;
  } else if (m.contrarianSide === 'below') {
    pricingText = copy.noMayPayMore;
  }

  // V6 types (5-8) are signal-based markets — different label semantics.
  // Falling through to 'temp_high' mislabels them as "Temperature market"
  // even when the market is e.g. a heavy rainfall event.
  const marketMetric =
    m.marketTypeId === 1 ? 'rain'
    : m.marketTypeId === 3 ? 'temp_low'
    : m.marketTypeId === 4 ? 'snow'
    : m.marketTypeId === 5 ? 'cold_spell'
    : m.marketTypeId === 6 ? 'dry_stretch'
    : m.marketTypeId === 7 ? 'frost_risk'
    : m.marketTypeId === 8 ? 'heavy_rain'
    : 'temp_high';
  const typeIconKind =
    marketMetric === 'rain' || marketMetric === 'heavy_rain' || marketMetric === 'dry_stretch'
      ? 'rain'
      : marketMetric === 'snow'
        ? 'snow'
        : 'temp';

  // Hero number. dry_stretch/heavy_rain show the day window; cold_spell stores
  // its cold line INVERTED-ENCODED (decodeColdLine, not a plain +100 offset —
  // see lib/contracts/addresses.ts), so decode it; frost_risk is a fixed 2°C
  // line. Everything else shows the raw threshold. Matches the question + the
  // detail page (must never read "9788°C" for a 13°C line).
  //
  // The temperature/rain lines then convert to the reader's system, so the
  // hero number and the question below it never disagree (82°F over 28°C).
  const heroMetricValue =
    marketMetric === 'cold_spell'
      ? decodeColdLine(threshold)
      : marketMetric === 'frost_risk'
        ? 2
        : threshold;
  const heroMetricUnit =
    marketMetric === 'cold_spell' || marketMetric === 'frost_risk' ? '°C' : unit;
  const heroConverted = convertThreshold(heroMetricValue, heroMetricUnit, system);
  const isDayWindowHero =
    marketMetric === 'dry_stretch' || marketMetric === 'heavy_rain';

  const heroValue = isDayWindowHero ? marketDurationDays : heroConverted.value;
  const heroUnit = isDayWindowHero
    ? localizedDayUnit(language, marketDurationDays)
    : heroConverted.unit;

  const confidenceColor =
    weather?.confidence === 'High'
      ? C.above
      : weather?.confidence === 'Medium'
        ? C.accent
        : C.below;

  const weatherSummary = weatherContextSummary({
    marketMetric,
    threshold,
    durationDays: marketDurationDays,
    language,
    weather,
  });
  const metricText = weatherContextDetail({
    marketMetric,
    durationDays: marketDurationDays,
    language,
    weather,
  });

  const entryState = getEntryState(m);
  const muted = entryState === 'resolved' || entryState === 'awaiting_resolution' || entryState === 'cancelled';

  const phase = derivePhase({
    startTime: m.startTime,
    endTime: m.endTime,
    resolved: m.resolved,
    cancelled: m.cancelled,
  });

  const isActionable = entryState === 'open';

  function openQuick(side: 'above' | 'below') {
    if (!isActionable) return;
    setQuickSide(side);
    setQuickOpen(true);
  }

  function dismissHint() {
    setShowHint(false);
    try {
      window.localStorage.setItem('kalma-protection-hint-seen', '1');
    } catch {}
    // Tell sibling cards to drop their hint as well.
    try {
      window.dispatchEvent(new Event('kalma-protection-hint-dismissed'));
    } catch {}
  }

  const userAboveValue = Number(formatUnits(m.userAboveRaw, USDM_DECIMALS));
  const userBelowValue = Number(formatUnits(m.userBelowRaw, USDM_DECIMALS));
  const userHasBothSides = userAboveValue > 0 && userBelowValue > 0;
  const userPositionParts: string[] = [];
  if (userAboveValue > 0) userPositionParts.push(`▲ ${copy.yes} ${formatLocal(userAboveValue)}`);
  if (userBelowValue > 0) userPositionParts.push(`▼ ${copy.no} ${formatLocal(userBelowValue)}`);
  const userResultSuffix =
    m.resolved && !userHasBothSides
      ? m.userWon
        ? ` · ${copy.won}`
        : ` · ${copy.lost}`
      : '';

  const yesBetterReturn = !oneSideEmpty && m.betterReturnSide === 'above';
  const noBetterReturn = !oneSideEmpty && m.betterReturnSide === 'below';

  const entryPill =
    entryState === 'open'
      ? copy.openForPositions
      : entryState === 'prediction_closed'
        ? copy.predictionClosedShort
        : entryState === 'awaiting_resolution'
          ? copy.awaitingResolution
          : entryState === 'cancelled'
            ? copy.marketClosed
            : copy.marketClosed;

  const entryPillBg =
    entryState === 'open'
      ? `${C.above}12`
      : entryState === 'prediction_closed'
        ? `${C.accent}14`
        : `${C.surfaceHigh}`;

  const entryPillColor =
    entryState === 'open'
      ? C.above
      : entryState === 'prediction_closed'
        ? C.accent
        : C.textSoft;

  return (
    <>
      <div
        style={{
          ...neu.panelRaised,
          borderRadius: R.xl,
          padding: '20px 22px 18px',
          transition: 'transform 0.2s ease',
          marginBottom: 16,
          opacity: muted ? 0.92 : 1,
          overflow: 'hidden',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {showHint ? (
          <div
            style={{
              ...neu.controlPressed,
              borderRadius: R.lg,
              padding: '12px 14px',
              marginBottom: 12,
              background: `${C.accent}10`,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {copy.protectHintTitle}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.text,
                lineHeight: 1.5,
                marginBottom: 6,
              }}
            >
              {copy.protectHintBody}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 13,
                color: C.textSoft,
                lineHeight: 1.45,
                marginBottom: 10,
              }}
            >
              {copy.protectHintFoot}
            </div>
            <button
              type="button"
              onClick={dismissHint}
              style={{
                border: 'none',
                borderRadius: R.md,
                padding: '10px 12px',
                background: C.dark,
                color: '#FFFDF8',
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copy.gotIt}
            </button>
          </div>
        ) : null}

        <Link
          href={`/markets/${m.id}`}
          style={{
            textDecoration: 'none',
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* Header row: TypeIcon + place eyebrow on the left, meta
              pill cluster on the right. The old layout had two rows —
              an eyebrow line ("MADRID, COMUNIDAD DE MADRID, SPAIN")
              and a separate title line (TypeIcon + "Madrid") — which
              duplicated the city name. On narrow mobile columns the
              standalone "Madrid" was breaking as "Madr / id" because
              of overflow-wrap. Merging into one row removes the
              duplicate; threshold + description below keep doing the
              "what is this market" work. */}
          {/* Place eyebrow on its own full-width line (same model as
              SignalCard), so a long "City, Region, Country" wraps cleanly by
              whole words instead of stacking one word per line in the cramped
              header row next to the badges. */}
          {(() => {
            const p = formatPlaceLabel(m.cityName);
            const parts = [p.city, p.region, localizeCountry(p.country, language)].filter(Boolean);
            const label = parts.length > 0 ? parts.join(', ') : m.cityName;
            return (
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: C.textMutedStrong,
                  lineHeight: 1.3,
                  marginBottom: 8,
                  overflowWrap: 'break-word',
                  wordBreak: 'normal',
                }}
              >
                {label}
              </div>
            );
          })()}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 12,
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                flex: 1,
              }}
            >
              <TypeIcon type={typeIconKind} />
            </div>

            <div style={{ display: 'grid', gap: 6, justifyItems: 'end', flexShrink: 0 }}>
              <div
                style={{
                  ...neu.controlPressed,
                  borderRadius: 12,
                  padding: '5px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ClockIcon color={C.textSoft} />
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.textSoft,
                  }}
                >
                  {m.daysLeft}d
                </span>
              </div>

              <PhaseIndicator phase={phase} />

              <div
                style={{
                  borderRadius: 999,
                  padding: '5px 10px',
                  background: entryPillBg,
                  color: entryPillColor,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                }}
              >
                {entryPill}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: 40,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1,
              }}
            >
              {heroValue}
            </span>
            <span
              style={{
                fontFamily: fonts.sans,
                fontSize: 18,
                fontWeight: 500,
                color: C.textMutedStrong,
                marginLeft: 4,
              }}
            >
              {heroUnit}
            </span>
          </div>

          {/* CO-1: the signal leads with one plain question — Above/Below
              become answers to it. The type icon + big number above keep
              carrying the "what kind / how much" detail. */}
          <div
            style={{
              marginBottom: 14,
              fontFamily: fonts.sans,
              fontSize: 15,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.4,
            }}
          >
            {marketQuestion(language, {
              marketTypeId: m.marketTypeId,
              thresholdValue: threshold,
              unit,
              startTime: m.startTime,
              endTime: m.endTime,
            }, system)}
          </div>

          {/* CO-5: community split as the headline — who's answering and which
              way they lean. The magnet is disagreement, so this leads; the
              per-side multiplier stays down on the SideCards (the choosing
              moment). */}
          {isActionable ? (() => {
            const hasSplit = m.abovePoolValue + m.belowPoolValue > 0 && m.participantCount > 0;
            const sc = splitCopy(language);
            const majAbove = m.aboveCrowdPct >= m.belowCrowdPct;
            const majPct = Math.max(m.aboveCrowdPct, m.belowCrowdPct);
            const peopleWord = m.participantCount === 1 ? sc.person : sc.people;
            return (
              <div style={{ marginBottom: 14 }}>
                {hasSplit ? (
                  <div
                    style={{
                      display: 'flex',
                      height: 8,
                      borderRadius: R.pill,
                      overflow: 'hidden',
                      background: C.surfaceDeep,
                      marginBottom: 7,
                    }}
                  >
                    <div style={{ width: `${m.aboveCrowdPct}%`, background: C.above }} />
                    <div style={{ width: `${m.belowCrowdPct}%`, background: C.below }} />
                  </div>
                ) : null}
                <div style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: C.textSoft }}>
                  {hasSplit
                    ? `${majPct}% ${sc.say} ${majAbove ? `▲ ${copy.yes}` : `▼ ${copy.no}`} · ${m.participantCount} ${peopleWord}`
                    : sc.beFirst}
                </div>
              </div>
            );
          })() : null}

          {entryState === 'prediction_closed' ? (
            <div
              style={{
                ...neu.controlPressed,
                borderRadius: R.lg,
                padding: '12px 14px',
                marginBottom: 12,
                background: `${C.accent}10`,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.accent,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                {copy.predictionClosed}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: C.textSoft,
                  lineHeight: 1.45,
                }}
              >
                {copy.marketPredictionClosed}
              </div>
            </div>
          ) : null}

          {m.userHasPosition ? (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: R.md,
                background: m.userWon
                  ? `${C.above}10`
                  : m.resolved
                    ? `${C.below}08`
                    : `${C.accent}10`,
                border: m.resolved
                  ? `1px solid ${m.userWon ? C.above : C.below}20`
                  : 'none',
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.text,
                lineHeight: 1.45,
              }}
            >
              {`${copy.yourPosition}: ${userPositionParts.join(' · ')}${userResultSuffix}`}
            </div>
          ) : null}

          {m.resolved || m.cancelled ? (
            <div style={{ marginBottom: 12 }}>
              <ResolutionBanner
                market={{
                  resolved: m.resolved,
                  cancelled: m.cancelled,
                  outcome: m.outcome,
                  marketTypeId: m.marketTypeId,
                  thresholdValue: m.thresholdValue,
                  unit: m.unit,
                  actualValue: m.actualValue ?? undefined,
                  userHasPosition: m.userHasPosition,
                  userWon: m.userWon,
                  userSide: m.userSide ?? undefined,
                  userPositionValue: m.userPositionValue,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                ...neu.controlPressed,
                borderRadius: R.lg,
                padding: '13px 14px',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    color: C.textMutedStrong,
                    letterSpacing: 1.15,
                    textTransform: 'uppercase',
                  }}
                >
                  {copy.weatherContext}
                </span>

              </div>

              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.text,
                  marginBottom: 5,
                  lineHeight: 1.45,
                }}
              >
                {weatherLoading ? copy.loadingWeather : weatherSummary ?? copy.weatherUnavailable}
              </div>

              {metricText ? (
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 12,
                    color: C.textSoft,
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {metricText}
                </div>
              ) : null}

              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: C.textMutedStrong,
                  marginBottom: 5,
                }}
              >
                {({ en: 'Confidence level:', pt: 'Nível de confiança:', es: 'Nivel de confianza:', fr: 'Niveau de confiance :', de: 'Konfidenzniveau:', zh: '置信水平：' } as Record<string, string>)[language] ?? 'Confidence level:'}
              </div>
              <div
                style={{
                  height: 7,
                  borderRadius: R.pill,
                  overflow: 'hidden',
                  background: C.surfaceDeep,
                }}
              >
                <div
                  style={{
                    width: `${weather?.confidenceScore ?? 0}%`,
                    height: '100%',
                    background: confidenceColor || C.textMuted,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              {!weatherLoading && weather?.confidence ? (
                <div
                  style={{
                    marginTop: 5,
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    color: confidenceColor || C.textMutedStrong,
                  }}
                >
                  {confidenceLabel(weather.confidence, language)}
                </div>
              ) : null}
              {/* Golden rule 8: official data cites its source, so readers can
                  tell forecast context apart from community observations. */}
              {!weatherLoading && weather ? (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: C.textMutedStrong,
                  }}
                >
                  {tr(language, {
                    en: `Source: ${weather.source} · ${weather.yearsUsed ?? 10}-year history, ${weather.durationDays}-day window`,
                    pt: `Fonte: ${weather.source} · ${weather.yearsUsed ?? 10} anos de histórico, janela de ${weather.durationDays} dias`,
                    es: `Fuente: ${weather.source} · ${weather.yearsUsed ?? 10} años de historial, ventana de ${weather.durationDays} días`,
                    fr: `Source : ${weather.source} · ${weather.yearsUsed ?? 10} ans d'historique, fenêtre de ${weather.durationDays} jours`,
                    de: `Quelle: ${weather.source} · ${weather.yearsUsed ?? 10} Jahre Historie, ${weather.durationDays}-Tage-Fenster`,
                    zh: `数据来源：${weather.source} · ${weather.yearsUsed ?? 10}年历史，${weather.durationDays}天窗口`,
                  })}
                </div>
              ) : null}
            </div>
          )}

          {isActionable ? (
            <div
              style={{
                ...neu.controlPressed,
                borderRadius: R.lg,
                padding: '12px 14px',
                marginBottom: 12,
                background: `${C.accent}0E`,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: C.accent,
                  marginBottom: 5,
                }}
              >
                {copy.actionGuideTitle}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: C.textSoft,
                }}
              >
                {copy.actionGuideBody}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <SideCard
              side={copy.yes}
              icon="▲"
              crowdPct={m.aboveCrowdPct}
              multiplier={m.aboveMultiplier}
              poolValue={m.abovePoolValue}
              accent={C.above}
              soft={`${C.above}12`}
              isPopular={m.popularSide === 'above'}
              isBetterReturn={yesBetterReturn}
              copy={copy}
              clickable={isActionable}
              muted={!isActionable}
              onClick={() => openQuick('above')}
            />

            <SideCard
              side={copy.no}
              icon="▼"
              crowdPct={m.belowCrowdPct}
              multiplier={m.belowMultiplier}
              poolValue={m.belowPoolValue}
              accent={C.below}
              soft={`${C.below}12`}
              isPopular={m.popularSide === 'below'}
              isBetterReturn={noBetterReturn}
              copy={copy}
              clickable={isActionable}
              muted={!isActionable}
              onClick={() => openQuick('below')}
            />
          </div>

          {/* Crowd-split bar removed: redundant now that each side box shows a
              people icon + its share %, and the bottom shows total participants. */}

          <div
            style={{
              marginBottom: 12,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: C.textSoft,
              lineHeight: 1.48,
            }}
          >
            {pricingText} {copy.exactReturn}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <UsersIcon color={C.textMutedStrong} />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 13,
                  color: C.textMutedStrong,
                }}
              >
                {m.participantCount}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {m.distanceKm != null ? (
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: C.textMutedStrong,
                  }}
                >
                  {m.distanceKm.toFixed(1)} km
                </span>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <WalletIcon color={C.textSoft} />
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.textSoft,
                  }}
                >
                  {formatLocal(m.pool)}
                </span>
              </div>
            </div>
          </div>
        </Link>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {/* Share affordance — useful for people who added a city and
              want to send the market to a neighbour or co-op. Sits on
              the left so it doesn't compete with the primary "View
              market" link on the right. */}
          <ShareButton
            url={`/markets/${m.id}`}
            title={`${m.displayCityName ?? m.cityName} — ${displayMeasureForMarket(m, language, system)}`}
            text={`${m.displayCityName ?? m.cityName} on Kalma`}
            size="sm"
          />

          <Link
            href={`/markets/${m.id}`}
            style={{
              textDecoration: 'none',
              fontFamily: fonts.sans,
              fontSize: 14,
              fontWeight: 700,
              color: isActionable ? C.accent : C.textSoft,
            }}
          >
            {isActionable ? copy.actionGuideTitle : copy.viewMarket}
          </Link>
        </div>
      </div>

      <QuickPredictSheet
        market={m}
        open={quickOpen}
        initialSide={quickSide}
        onClose={() => {
          setQuickOpen(false);
          setQuickSide(null);
        }}
        copy={copy}
      />
    </>
  );
}

function QuickPredictSheet({
  market,
  open,
  initialSide,
  onClose,
  copy,
}: {
  market: Market;
  open: boolean;
  initialSide: 'above' | 'below' | null;
  onClose: () => void;
  copy: Record<string, string>;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const { system } = useUnits();
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  // Hooks must run on every render — keep usePrivy() above the `if (!open)`
  // early return below, or opening the sheet renders an extra hook and trips
  // React error #310 ("rendered more hooks than during the previous render").
  const { login } = usePrivy();

  const [selectedSide, setSelectedSide] = useState<'above' | 'below' | null>(initialSide);
  const [amount, setAmount] = useState('10');
  const [showLearn, setShowLearn] = useState(false);
  const snapshotPatchRef = useRef<string | null>(null);
  const hadPositionBeforeSubmitRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem('kalma-quick-predict-learned');
      if (!seen && open) setShowLearn(true);
    } catch {}
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Land keyboard/screen-reader focus inside the dialog, keep Tab cycling
    // within it, and let Escape dismiss — the portal renders outside the
    // card's DOM order, so without this focus stays lost behind the overlay.
    // On close, focus returns to whatever triggered the sheet (WCAG 2.4.3).
    const trigger = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open, onClose]);

  const {
    data: balance = 0n,
    refetch: refetchBalance,
  } = useReadContract({
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: allowance = 0n,
    refetch: refetchAllowance,
  } = useReadContract({
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.CLIMATE_POOL] : undefined,
    query: { enabled: !!address },
  });

  const {
    startPredict,
    reset,
    phase,
    isBusy,
    errorMessage,
    error: predictError,
  } = usePredictWithApproval();

  const amountNumber = Number(amount);

  let amountWei = 0n;
  try {
    amountWei = parseUnits(amount || '0', USDM_DECIMALS);
  } catch {
    amountWei = 0n;
  }

  const needsApproval = allowance < amountWei;
  const hasEnoughBalance = balance >= amountWei;

  const now = Math.floor(Date.now() / 1000);
  const isPredictionClosed =
    market.resolved ||
    market.cancelled ||
    now >= market.predictionDeadline;

  const estimate = useMemo(() => {
    if (!selectedSide) return { gross: 0, net: 0, fee: 0 };

    return estimateReturn({
      abovePool: market.abovePoolValue,
      belowPool: market.belowPoolValue,
      amount: amountNumber,
      isAbove: selectedSide === 'above',
    });
  }, [selectedSide, amountNumber, market.abovePoolValue, market.belowPoolValue]);

  useEffect(() => {
    if (phase !== 'success') {
      snapshotPatchRef.current = null;
      return;
    }
    if (selectedSide && amountWei > 0n) {
      const patchKey = `${market.id.toString()}:${selectedSide}:${amountWei.toString()}`;
      if (snapshotPatchRef.current !== patchKey) {
        snapshotPatchRef.current = patchKey;

        patchMarketSnapshotAfterPredict({
          queryClient,
          marketId: market.id,
          side: selectedSide,
          amountWei,
          hadUserPosition: hadPositionBeforeSubmitRef.current,
        });
        void refreshMarketSnapshotAfterPredict({
          queryClient,
          marketId: market.id,
        }).catch((error) => {
          console.warn('[Kalma] market snapshot refresh failed:', error);
        });
      }
    }

    const run = async () => {
      await Promise.all([refetchBalance(), refetchAllowance()]);
      setSelectedSide(null);
      setAmount('10');
      hadPositionBeforeSubmitRef.current = false;
      reset();
      onClose();
    };

    void run();
  }, [
    phase,
    selectedSide,
    amountWei,
    market.id,
    queryClient,
    refetchBalance,
    refetchAllowance,
    reset,
    onClose,
  ]);

  useEffect(() => {
    if (open) {
      setSelectedSide(initialSide);
    }
  }, [open, initialSide]);

  useEffect(() => {
    if (!open) {
      setSelectedSide(null);
      setAmount('10');
      reset();
    }
  }, [open, reset]);

  if (!open) return null;

  const ctaText = isPredictionClosed
    ? copy.predictionClosed
    : !isConnected
      ? copy.connectToPredict
      : needsApproval
        ? copy.allowAndPredict
        : copy.confirmPrediction;

  const statusText =
    phase === 'approving'
      ? copy.confirmAccess
      : phase === 'predicting'
        ? copy.confirmPredict
        : phase === 'success'
          ? copy.predictionAdded
          : null;

  const canSubmit =
    isConnected &&
    !!selectedSide &&
    !isBusy &&
    !isPredictionClosed &&
    Number.isFinite(amountNumber) &&
    amountNumber >= MIN_POSITION &&
    amountWei > 0n &&
    hasEnoughBalance;

  function handleSubmit() {
    if (isPredictionClosed) return;

    if (!isConnected) {
      login();
      return;
    }

    if (!selectedSide) return;
    if (!Number.isFinite(amountNumber) || amountNumber < MIN_POSITION || amountWei <= 0n) return;
    if (!hasEnoughBalance) return;

    hadPositionBeforeSubmitRef.current = market.userHasPosition;
    startPredict({
      marketId: market.id,
      isAbove: selectedSide === 'above',
      amount: amountWei,
      needsApproval,
    });
  }

  function dismissLearn() {
    setShowLearn(false);
    try {
      window.localStorage.setItem('kalma-quick-predict-learned', '1');
    } catch {}
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.28)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        overflowY: 'auto',
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={market.displayCityName ?? market.cityName}
        tabIndex={-1}
        style={{
          ...neu.panelRaised,
          width: '100%',
          maxWidth: 480,
          maxHeight: '82vh',
          overflowY: 'auto',
          borderRadius: 24,
          padding: '16px 14px 14px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {copy.quickPredict}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 17,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.3,
              }}
            >
              {selectedSide
                ? selectedSide === 'above'
                  ? copy.yesSelected
                  : copy.noSelected
                : (market.displayCityName ?? market.cityName)}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: fonts.sans,
                fontSize: 13,
                color: C.textSoft,
              }}
            >
              {marketQuestion(language, {
                marketTypeId: market.marketTypeId,
                thresholdValue: market.thresholdValue ?? 0,
                unit: market.unit ?? (market.marketTypeId === 1 ? 'mm' : market.marketTypeId === 4 ? 'cm' : '°C'),
                startTime: market.startTime,
                endTime: market.endTime,
              }, system)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: fonts.mono,
              fontSize: 12,
              color: C.textMutedStrong,
              // 48px touch target (golden rule 4) without shifting the header
              // layout: pad the hit area and pull it back with negative margin.
              minWidth: 48,
              minHeight: 48,
              padding: '12px 8px',
              margin: '-12px -8px 0 0',
            }}
          >
            {copy.close}
          </button>
        </div>

        {showLearn ? (
          <div
            style={{
              ...neu.controlPressed,
              borderRadius: R.lg,
              padding: '12px 14px',
              marginBottom: 12,
              background: `${C.accent}10`,
            }}
          >
            <LearnBlock title={copy.learnRiskTitle} body={copy.learnRiskBody} fonts={fonts} C={C} />
            <LearnBlock title={copy.learnReturnTitle} body={copy.learnReturnBody} fonts={fonts} C={C} />
            <LearnBlock title={copy.learnLiquidityTitle} body={copy.learnLiquidityBody} fonts={fonts} C={C} />
            <LearnBlock title={copy.learnEarlyTitle} body={copy.learnEarlyBody} fonts={fonts} C={C} last />
            <button
              type="button"
              onClick={dismissLearn}
              style={{
                border: 'none',
                borderRadius: R.md,
                padding: '10px 12px',
                background: C.dark,
                color: '#FFFDF8',
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copy.gotIt}
            </button>
          </div>
        ) : null}

        {isPredictionClosed ? (
          <div
            style={{
              ...neu.controlPressed,
              borderRadius: R.lg,
              padding: '12px 14px',
              marginBottom: 12,
              background: `${C.accent}10`,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {copy.predictionClosed}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 13,
                color: C.textSoft,
                lineHeight: 1.45,
              }}
            >
              {copy.marketPredictionClosed}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <SideButton
            label={copy.yes}
            accent={C.above}
            selected={selectedSide === 'above'}
            onClick={() => !isPredictionClosed && setSelectedSide('above')}
            disabled={isPredictionClosed}
          />
          <SideButton
            label={copy.no}
            accent={C.below}
            selected={selectedSide === 'below'}
            onClick={() => !isPredictionClosed && setSelectedSide('below')}
            disabled={isPredictionClosed}
          />
        </div>

        <div
          style={{
            marginBottom: 10,
            fontFamily: fonts.sans,
            fontSize: 13,
            lineHeight: 1.45,
            color: C.textSoft,
          }}
        >
          {copy.quickSideHint}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <MiniStat
            label={copy.balance}
            value={`${Number(formatUnits(balance, USDM_DECIMALS)).toFixed(2)} USDC`}
          />
          <MiniStat
            label={copy.allowed}
            value={`${Number(formatUnits(allowance, USDM_DECIMALS)).toFixed(2)} USDC`}
          />
        </div>

        {!isConnected ? (
          <div
            style={{
              marginBottom: 10,
              fontFamily: fonts.sans,
              fontSize: 12,
              color: C.textMuted,
              lineHeight: 1.4,
            }}
          >
            {copy.testnetBalanceHint}
          </div>
        ) : null}

        <label style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 600,
              color: C.textMuted,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
            }}
          >
            {copy.amount}
          </span>

          <input
            id={`market-${market.id.toString()}-amount`}
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10"
            inputMode="decimal"
            disabled={isPredictionClosed}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: `1px solid ${C.divider}`,
              background: C.surfaceHigh,
              color: C.text,
              borderRadius: 14,
              padding: '14px 14px',
              fontFamily: fonts.sans,
              fontSize: 16,
              outline: 'none',
              opacity: isPredictionClosed ? 0.72 : 1,
            }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
          {[5, 10, 25, 50].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              disabled={isPredictionClosed}
              style={{
                border: `1px solid ${C.divider}`,
                borderRadius: 12,
                minHeight: 48,
                padding: '10px 4px',
                background: amount === String(preset) ? C.surfaceDeep : C.surface,
                color: C.text,
                fontFamily: fonts.mono,
                fontSize: 12,
                cursor: isPredictionClosed ? 'default' : 'pointer',
                opacity: isPredictionClosed ? 0.72 : 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {`${preset} USDC`}
            </button>
          ))}
        </div>

        {selectedSide ? (
          <div
            style={{
              ...neu.controlPressed,
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              {copy.ifYourSideWins}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <MiniStat label={copy.beforeFees} value={`${estimate.gross.toFixed(2)} USDC`} />
              <MiniStat label={copy.afterFee} value={`${estimate.net.toFixed(2)} USDC`} />
            </div>

            <div
              style={{
                marginTop: 8,
                fontFamily: fonts.sans,
                fontSize: 12,
                color: C.textSoft,
                lineHeight: 1.45,
              }}
            >
              {copy.winnerFee}
            </div>
          </div>
        ) : null}

        {!hasEnoughBalance && isConnected && amountWei > 0n && !isPredictionClosed ? (
          <div
            style={{
              marginBottom: 10,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: C.below,
            }}
          >
            {copy.notEnoughBalance}
          </div>
        ) : null}

        {statusText ? (
          <div
            style={{
              marginBottom: 10,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: phase === 'success' ? C.above : C.textSoft,
            }}
          >
            {statusText}
          </div>
        ) : null}

        {predictError || errorMessage ? (
          <div style={{ marginBottom: 10 }}>
            <WalletErrorPanel
              error={predictError ?? errorMessage}
              onAfterReset={reset}
              compact
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isConnected ? !canSubmit : false}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '16px 18px',
            borderRadius: R.lg,
            border: 'none',
            background: PRIMARY_BG,
            color: PRIMARY_TEXT,
            fontFamily: fonts.sans,
            fontSize: 16,
            fontWeight: 800,
            cursor: isPredictionClosed ? 'default' : 'pointer',
            boxShadow: `0 8px 24px ${C.shadowA}38, inset 0 1px 0 rgba(255,255,255,0.08)`,
            opacity: isConnected && !canSubmit ? 0.72 : 1,
          }}
        >
          {isBusy ? copy.loading : ctaText}
        </button>
      </div>
    </div>,
    document.body
  );
}

function LearnBlock({
  title,
  body,
  fonts,
  C,
  last = false,
}: {
  title: string;
  body: string;
  fonts: any;
  C: any;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 12 : 10 }}>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: 700,
          color: C.text,
          marginBottom: 3,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: C.textSoft,
          lineHeight: 1.45,
        }}
      >
        {body}
      </div>
    </div>
  );
}

function SideButton({
  label,
  accent,
  selected,
  onClick,
  disabled = false,
}: {
  label: string;
  accent: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { C, fonts, R } = useColors();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={{
        flex: 1,
        // Answer buttons: 64px minimum (golden rule 5).
        minHeight: 64,
        borderRadius: R.lg,
        border: `1px solid ${selected ? accent : C.dividerStrong}`,
        background: selected ? `${accent}12` : C.surface,
        color: selected ? accent : C.text,
        fontFamily: fonts.sans,
        fontSize: 16,
        fontWeight: 700,
        padding: '15px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.72 : 1,
      }}
    >
      {label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { C, fonts, neu, R } = useColors();

  return (
    <div
      style={{
        ...neu.subtle,
        borderRadius: R.md,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          color: C.textMuted,
          letterSpacing: 1.3,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SideCard({
  side,
  icon,
  crowdPct,
  multiplier,
  poolValue,
  accent,
  soft,
  isPopular,
  isBetterReturn,
  copy,
  clickable = false,
  muted = false,
  onClick,
}: {
  side: string;
  icon: string;
  crowdPct: number;
  multiplier: number;
  poolValue: number;
  accent: string;
  soft: string;
  isPopular: boolean;
  isBetterReturn: boolean;
  copy: Record<string, string>;
  clickable?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const { C, neu, fonts, R } = useColors();
  const { formatLocal } = useCurrencyContext();

  const displayMultiplier = poolValue === 0 ? '—' : `${multiplier.toFixed(2)}×`;

  const content = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
          }}
        >
          {icon} {side}
        </span>

        {isBetterReturn ? (
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {copy.betterPay}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: fonts.mono,
          fontSize: 13,
          color: C.textSoft,
          marginBottom: 4,
        }}
      >
        <UsersIcon size={13} color={accent} />
        {crowdPct}%
      </div>

      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 18,
          fontWeight: 700,
          color: accent,
          marginBottom: 4,
        }}
      >
        {displayMultiplier}
      </div>

      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: C.textMutedStrong,
          marginBottom: 4,
        }}
      >
        {copy.pool} {formatLocal(poolValue)}
      </div>

      {isPopular ? (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            color: C.textMutedStrong,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {copy.moreChosen}
        </div>
      ) : null}
    </>
  );

  if (clickable && onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          ...neu.subtle,
          borderRadius: R.lg,
          padding: '12px 14px',
          background: `linear-gradient(135deg, ${C.surface} 0%, ${soft} 100%)`,
          boxSizing: 'border-box',
          overflow: 'hidden',
          border: `1px solid ${C.dividerStrong}`,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        ...neu.subtle,
        borderRadius: R.lg,
        padding: '12px 14px',
        background: `linear-gradient(135deg, ${C.surface} 0%, ${soft} 100%)`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        opacity: muted ? 0.74 : 1,
      }}
    >
      {content}
    </div>
  );
}

/**
 * CollapsedMarketCard — compact single-row card for secondary market lists.
 * Tapping expands to full MarketCard in place.
 */
export function CompactMarketGrid({
  markets,
  className,
}: {
  markets: Market[];
  className: string;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    function updateColumns() {
      if (window.matchMedia('(min-width: 1181px)').matches) {
        setColumns(3);
      } else if (window.matchMedia('(min-width: 1024px)').matches) {
        setColumns(2);
      } else {
        setColumns(1);
      }
    }

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const expandedRow =
    expandedIndex == null ? null : Math.floor(expandedIndex / Math.max(1, columns));

  return (
    <div className={className}>
      {markets.map((market, index) => {
        const isExpanded =
          expandedRow != null && Math.floor(index / Math.max(1, columns)) === expandedRow;

        return (
          <CollapsedMarketCard
            key={market.id.toString()}
            m={market}
            expanded={isExpanded}
            spanExpanded={false}
            onExpandedChange={(nextExpanded) => {
              setExpandedIndex(nextExpanded ? index : null);
            }}
          />
        );
      })}
    </div>
  );
}

export function CollapsedMarketCard({
  m,
  expanded: controlledExpanded,
  spanExpanded = true,
  onExpandedChange,
}: {
  m: Market;
  expanded?: boolean;
  spanExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const { system } = useUnits();
  const copy = marketCardCopy(language);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = onExpandedChange ?? setLocalExpanded;

  const threshold = m.thresholdValue ?? 0;
  const unit = m.unit ?? (m.marketTypeId === 1 ? 'mm' : m.marketTypeId === 4 ? 'cm' : '°C');

  // V6 types (5-8) are signal-based markets — different label semantics.
  // Falling through to 'temp_high' mislabels them as "Temperature market"
  // even when the market is e.g. a heavy rainfall event.
  const marketMetric =
    m.marketTypeId === 1 ? 'rain'
    : m.marketTypeId === 3 ? 'temp_low'
    : m.marketTypeId === 4 ? 'snow'
    : m.marketTypeId === 5 ? 'cold_spell'
    : m.marketTypeId === 6 ? 'dry_stretch'
    : m.marketTypeId === 7 ? 'frost_risk'
    : m.marketTypeId === 8 ? 'heavy_rain'
    : 'temp_high';
  const typeIconKind =
    marketMetric === 'rain' || marketMetric === 'heavy_rain' || marketMetric === 'dry_stretch'
      ? 'rain'
      : marketMetric === 'snow'
        ? 'snow'
        : 'temp';

  const phase = derivePhase({
    startTime: m.startTime,
    endTime: m.endTime,
    resolved: m.resolved,
    cancelled: m.cancelled,
  });
  const entryState = getEntryState(m);
  const isActionable = entryState === 'open';

  if (expanded) {
    return (
      <div style={{ gridColumn: spanExpanded ? '1 / -1' : undefined, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: fonts.mono,
            fontSize: 11,
            color: C.textMuted,
            letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '0 0 8px',
            display: 'block',
          }}
        >
          ↑ Collapse
        </button>
        <MarketCard m={m} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      style={{
        width: '100%',
        maxWidth: '100%',
        textAlign: 'left',
        background: C.surfaceSoft,
        boxShadow: `2px 2px 6px ${C.shadowA}55, -1px -1px 4px ${C.shadowB}66`,
        borderRadius: R.xl,
        padding: '14px 16px',
        border: `1px solid ${C.divider}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxSizing: 'border-box',
        overflow: 'visible',
        minWidth: 0,
      }}
    >
      {/* Type icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: R.md,
          background: C.surfaceHigh,
          boxShadow: `1px 1px 3px ${C.shadowA}45, -1px -1px 3px ${C.shadowB}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 16,
        }}
      >
        <TypeIcon type={typeIconKind} size={18} />
      </div>

      {/* City + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.displayCityName ?? m.cityName}
        </div>
        <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textSoft, marginTop: 2, lineHeight: 1.35 }}>
          {marketQuestion(language, {
            marketTypeId: m.marketTypeId,
            thresholdValue: threshold,
            unit,
            startTime: m.startTime,
            endTime: m.endTime,
          }, system)}
        </div>
        {isActionable ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 7,
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: C.accent,
              }}
            >
              {copy.actionGuideTitle}
            </span>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMutedStrong,
              }}
            >
              {copy.yes} {m.aboveCrowdPct}% / {copy.no} {m.belowCrowdPct}%
            </span>
          </div>
        ) : null}
      </div>

      {/* Phase + pool */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <PhaseIndicator phase={phase} compact />
        <div style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMutedStrong, marginTop: 4 }}>
          {formatLocal(m.pool)}
        </div>
      </div>

      {/* Chevron */}
      <div style={{ flexShrink: 0, fontFamily: fonts.mono, fontSize: 16, color: C.textMuted, lineHeight: 1 }}>
        ›
      </div>
    </button>
  );
}
