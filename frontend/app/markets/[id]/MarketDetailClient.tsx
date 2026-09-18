//frontend/app/markets/[id]/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { formatUnits, parseUnits } from 'viem';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import FaucetBanner from '@/components/shared/FaucetBanner';
import StickyActionBar from '@/components/shared/StickyActionBar';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext } from '@/lib/currency-context';
import {
  CHAIN,
  CONTRACTS,
  MARKET_TYPES,
  climatePoolAbi,
  usdcAbi,
  USDM_DECIMALS,
  decodeColdLine,
} from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';
import { useMarkets } from '@/hooks/useMarkets';
import { marketQuestion } from '@/lib/market-question';
import { useUnits } from '@/lib/units-context';
import { formatThreshold, thresholdTemp, thresholdPrecip, type UnitSystem } from '@/lib/units';
import ShareQuestionButton from '@/components/shared/ShareQuestionButton';
import ResolutionOutcomeCard from '@/components/market/ResolutionOutcomeCard';
import CommunityPulse from '@/components/market/CommunityPulse';
import ObservationFeed from '@/components/social/ObservationFeed';
import { useLocationContext } from '@/hooks/useLocationContext';
import { useActionGate } from '@/hooks/useActionGate';
import { useFaucet } from '@/hooks/useFaucet';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import { ChallengeStatusPanel } from '@/components/shared/ChallengeStatusPanel';
import { ResolutionEvidencePanel } from '@/components/shared/ResolutionEvidencePanel';
import { ReturnSummary } from '@/components/market/ReturnSummary';
import {
  PhaseIndicator,
  ResolutionBanner,
  derivePhase,
} from '@/components/shared/MarketLifecycle';
import {
  patchMarketSnapshotAfterPredict,
  refreshMarketSnapshotAfterPredict,
} from '@/lib/market-snapshot-client';

const MIN_POSITION = 1;

// Scoped CSS for the /markets/[id] desktop two-column layout. At ≥1024px
// the page splits into [main column | sticky side column]. The main column
// flows the predict card + context/confidence (read the question, act, then
// the supporting data); the side column holds the secondary read ("what are
// you seeing?") + details, hoisted to column 2 via grid-column/grid-row.
// Mobile keeps the single-column flow: main first, then side.
const marketDetailLayoutCSS = `
  .k-market-grid { display: block; }
  .k-market-side { display: block; }
  @media (min-width: 1024px) {
    .k-market-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      column-gap: 28px;
      align-items: start;
    }
    .k-market-grid > * { min-width: 0; }
    .k-market-side {
      grid-column: 2;
      grid-row: 1 / span 99;
      position: sticky;
      top: 24px;
      align-self: start;
    }
  }
`;

type EntryState =
  | 'open'
  | 'prediction_closed'
  | 'awaiting_resolution'
  | 'resolved'
  | 'cancelled';

function getEntryState(market: {
  resolved: boolean;
  cancelled: boolean;
  predictionDeadline: number;
  endTime: number;
}): EntryState {
  const now = Math.floor(Date.now() / 1000);

  if (market.cancelled) return 'cancelled';
  if (market.resolved) return 'resolved';
  if (now >= market.endTime) return 'awaiting_resolution';
  if (now >= market.predictionDeadline) return 'prediction_closed';
  return 'open';
}

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      loading: 'Loading market...',
      notFound: 'Market not found.',
      question: 'Question',
      average: '10-year average',
      pool: 'Total',
      crowd: 'Crowd split',
      participants: 'Participants',
      predict: 'Answer this question',
      yes: 'Yes',
      no: 'No',
      amount: 'Amount',
      balance: 'Balance',
      allowed: 'Allowed',
      allowFunds: 'Allow funds',
      confirmPrediction: 'Confirm answer',
      predictAgain: 'Answer again',
      predictionAddedDetail: 'Answer added — you can close this or answer again.',
      connectToPredict: 'Connect to answer',
      fundToPredict: 'Fund to answer',
      gettingReady: 'Getting you ready…',
      authorizingSilently: 'Authorizing securely with your social wallet…',
      predictionClosed: 'Answers closed',
      predictionClosedBody:
        'This window is still active, but it is no longer accepting new answers.',
      awaitingResolution: 'Awaiting resolution',
      marketClosed: 'This window is closed.',
      notEnoughBalance: 'Not enough balance for this amount.',
      beforeFees: 'Before fees',
      afterFee: 'After est. fee',
      ifYourAnswerIsRight: 'If your answer is correct',
      winnerFee: 'Estimated winner fee. Final values move as the pool changes.',
      yourAnswer: 'Your answer',
      on: 'on',
      won: 'Won',
      lost: 'Lost',
      details: 'Details',
      threshold: 'Threshold',
      starts: 'Starts',
      ends: 'Ends',
      distance: 'Distance',
      rain: 'Rain',
      temperature: 'Temperature',
      lowTemp: 'Low temp',
      snow: 'Snow',
      createQuestionRain: 'Will it rain more than',
      createQuestionTempHigh: 'Will the average high temperature exceed',
      createQuestionTempLow: 'Will the average low temperature be below',
      createQuestionSnow: 'Will snowfall accumulate more than',
      inNext: 'in the next',
      day: 'day',
      days: 'days',
      predictionAdded: 'Answer added.',
      confirmAccess: 'Please confirm access to your test dollars.',
      confirmPredict: 'Please confirm your answer.',
      backToMarkets: 'Back to markets',
    },
    pt: {
      loading: 'Carregando sinal de risco...',
      notFound: 'Sinal de risco não encontrado.',
      question: 'Pergunta',
      average: 'Média de 10 anos',
      pool: 'Total',
      crowd: 'Divisão da multidão',
      participants: 'Participantes',
      predict: 'Responder à pergunta',
      yes: 'Sim',
      no: 'Não',
      amount: 'Valor',
      balance: 'Saldo',
      allowed: 'Permitido',
      allowFunds: 'Permitir fundos',
      confirmPrediction: 'Confirmar resposta',
      predictAgain: 'Responder de novo',
      predictionAddedDetail: 'Resposta adicionada — você pode fechar ou responder de novo.',
      connectToPredict: 'Conectar para responder',
      fundToPredict: 'Adicionar fundos para responder',
      gettingReady: 'Preparando tudo…',
      authorizingSilently: 'Autorizando com segurança pela sua carteira social…',
      predictionClosed: 'Respostas encerradas',
      predictionClosedBody:
        'Esta janela ainda está ativa, mas não aceita novas respostas.',
      awaitingResolution: 'Aguardando resolução',
      marketClosed: 'Esta janela está fechada.',
      notEnoughBalance: 'Saldo insuficiente para esse valor.',
      beforeFees: 'Antes das taxas',
      afterFee: 'Após taxa estimada',
      ifYourAnswerIsRight: 'Se sua resposta estiver certa',
      winnerFee: 'Taxa estimada do vencedor. O valor final muda conforme o pool muda.',
      yourAnswer: 'Sua resposta',
      on: 'em',
      won: 'Ganhou',
      lost: 'Perdeu',
      details: 'Detalhes',
      threshold: 'Limite',
      starts: 'Começa',
      ends: 'Termina',
      distance: 'Distância',
      rain: 'Chuva',
      temperature: 'Temperatura',
      lowTemp: 'Temp. baixa',
      snow: 'Neve',
      createQuestionRain: 'A chuva vai atingir ou superar',
      createQuestionTempHigh: 'A média das máximas vai passar de',
      createQuestionTempLow: 'A média das mínimas vai ficar abaixo de',
      createQuestionSnow: 'O acúmulo de neve vai atingir ou superar',
      inNext: 'nos próximos',
      day: 'dia',
      days: 'dias',
      predictionAdded: 'Resposta adicionada.',
      confirmAccess: 'Confirme o acesso aos seus dólares de teste.',
      confirmPredict: 'Confirme a sua resposta.',
      backToMarkets: 'Voltar às cidades',
    },
    es: {
      loading: 'Cargando ciudad...',
      notFound: 'Ciudad no encontrada.',
      question: 'Pregunta',
      average: 'Promedio de 10 años',
      pool: 'Total',
      crowd: 'División de la multitud',
      participants: 'Participantes',
      predict: 'Responder la pregunta',
      yes: 'Sí',
      no: 'No',
      amount: 'Monto',
      balance: 'Saldo',
      allowed: 'Permitido',
      allowFunds: 'Permitir fondos',
      confirmPrediction: 'Confirmar respuesta',
      predictAgain: 'Responder otra vez',
      predictionAddedDetail: 'Respuesta añadida — puedes cerrar o responder otra vez.',
      connectToPredict: 'Conectar para responder',
      fundToPredict: 'Agregar fondos para responder',
      gettingReady: 'Preparando todo…',
      authorizingSilently: 'Autorizando de forma segura con tu wallet social…',
      predictionClosed: 'Respuestas cerradas',
      predictionClosedBody:
        'Esta ventana sigue activa, pero ya no acepta nuevas respuestas.',
      awaitingResolution: 'Esperando resolución',
      marketClosed: 'Esta ventana está cerrada.',
      notEnoughBalance: 'Saldo insuficiente para esa cantidad.',
      beforeFees: 'Antes de comisiones',
      afterFee: 'Tras comisión estimada',
      ifYourAnswerIsRight: 'Si tu respuesta es correcta',
      winnerFee: 'Comisión estimada del ganador. El valor final cambia con el pool.',
      yourAnswer: 'Tu respuesta',
      on: 'en',
      won: 'Ganó',
      lost: 'Perdió',
      details: 'Detalles',
      threshold: 'Umbral',
      starts: 'Inicio',
      ends: 'Fin',
      distance: 'Distancia',
      rain: 'Lluvia',
      temperature: 'Temperatura',
      lowTemp: 'Temp. baja',
      snow: 'Nieve',
      createQuestionRain: '¿Lloverá más de',
      createQuestionTempHigh: '¿La temperatura máxima promedio superará',
      createQuestionTempLow: '¿La temperatura mínima promedio estará por debajo de',
      createQuestionSnow: '¿La acumulación de nieve superará',
      inNext: 'en los próximos',
      day: 'día',
      days: 'días',
      predictionAdded: 'Respuesta añadida.',
      confirmAccess: 'Confirma el acceso a tus dólares de prueba.',
      confirmPredict: 'Confirma tu respuesta.',
      backToMarkets: 'Volver a las ciudades',
    },
    fr: {
      loading: 'Chargement de la ville...',
      notFound: 'Ville introuvable.',
      question: 'Question',
      average: 'Moyenne sur 10 ans',
      pool: 'Total',
      crowd: 'Répartition',
      participants: 'Participants',
      predict: 'Répondre à la question',
      yes: 'Oui',
      no: 'Non',
      amount: 'Montant',
      balance: 'Solde',
      allowed: 'Autorisé',
      allowFunds: 'Autoriser les fonds',
      confirmPrediction: 'Confirmer la réponse',
      predictAgain: 'Répondre à nouveau',
      predictionAddedDetail: 'Réponse ajoutée — tu peux fermer ou répondre à nouveau.',
      connectToPredict: 'Connecte-toi pour répondre',
      fundToPredict: 'Ajouter des fonds pour répondre',
      gettingReady: 'Préparation…',
      authorizingSilently: 'Autorisation sécurisée avec ton wallet social…',
      predictionClosed: 'Réponses fermées',
      predictionClosedBody:
        "Cette fenêtre reste active, mais elle n'accepte plus de nouvelles réponses.",
      awaitingResolution: 'En attente de résolution',
      marketClosed: 'Cette fenêtre est fermée.',
      notEnoughBalance: 'Solde insuffisant pour ce montant.',
      beforeFees: 'Avant frais',
      afterFee: 'Après frais estimés',
      ifYourAnswerIsRight: 'Si ta réponse est correcte',
      winnerFee: 'Frais estimés du gagnant. La valeur finale évolue avec le pool.',
      yourAnswer: 'Ta réponse',
      on: 'sur',
      won: 'Gagné',
      lost: 'Perdu',
      details: 'Détails',
      threshold: 'Seuil',
      starts: 'Début',
      ends: 'Fin',
      distance: 'Distance',
      rain: 'Pluie',
      temperature: 'Température',
      lowTemp: 'Temp. basse',
      snow: 'Neige',
      createQuestionRain: "Pleuvra-t-il plus de",
      createQuestionTempHigh: 'La température maximale moyenne dépassera-t-elle',
      createQuestionTempLow: 'La température minimale moyenne sera-t-elle en dessous de',
      createQuestionSnow: "L'accumulation de neige dépassera-t-elle",
      inNext: 'dans les prochains',
      day: 'jour',
      days: 'jours',
      predictionAdded: 'Réponse ajoutée.',
      confirmAccess: "Confirme l'accès à tes dollars de test.",
      confirmPredict: 'Confirme ta réponse.',
      backToMarkets: 'Retour aux villes',
    },
    de: {
      loading: 'Stadt wird geladen...',
      notFound: 'Stadt nicht gefunden.',
      question: 'Frage',
      average: '10-Jahres-Durchschnitt',
      pool: 'Total',
      crowd: 'Aufteilung der Menge',
      participants: 'Teilnehmer:innen',
      predict: 'Frage beantworten',
      yes: 'Ja',
      no: 'Nein',
      amount: 'Betrag',
      balance: 'Guthaben',
      allowed: 'Freigegeben',
      allowFunds: 'Mittel freigeben',
      confirmPrediction: 'Antwort bestätigen',
      predictAgain: 'Erneut antworten',
      predictionAddedDetail: 'Antwort hinzugefügt — du kannst schließen oder erneut antworten.',
      connectToPredict: 'Verbinden, um zu antworten',
      fundToPredict: 'Mittel zum Antworten hinzufügen',
      gettingReady: 'Wird vorbereitet…',
      authorizingSilently: 'Sichere Autorisierung über dein Social Wallet…',
      predictionClosed: 'Antworten geschlossen',
      predictionClosedBody:
        'Dieses Fenster ist noch aktiv, nimmt aber keine neuen Antworten mehr an.',
      awaitingResolution: 'Wartet auf Auflösung',
      marketClosed: 'Dieses Fenster ist geschlossen.',
      notEnoughBalance: 'Nicht genug Guthaben für diesen Betrag.',
      beforeFees: 'Vor Gebühren',
      afterFee: 'Nach geschätzter Gebühr',
      ifYourAnswerIsRight: 'Wenn deine Antwort richtig ist',
      winnerFee: 'Geschätzte Gewinner-Gebühr. Endwerte ändern sich mit dem Pool.',
      yourAnswer: 'Deine Antwort',
      on: 'auf',
      won: 'Gewonnen',
      lost: 'Verloren',
      details: 'Details',
      threshold: 'Schwelle',
      starts: 'Beginnt',
      ends: 'Endet',
      distance: 'Entfernung',
      rain: 'Regen',
      temperature: 'Temperatur',
      lowTemp: 'Tiefsttemp.',
      snow: 'Schnee',
      createQuestionRain: 'Wird es mehr regnen als',
      createQuestionTempHigh: 'Wird der durchschnittliche Höchstwert übersteigen',
      createQuestionTempLow: 'Wird der durchschnittliche Tiefstwert unter',
      createQuestionSnow: 'Wird die Schneeakkumulation mehr betragen als',
      inNext: 'in den nächsten',
      day: 'Tag',
      days: 'Tagen',
      predictionAdded: 'Antwort hinzugefügt.',
      confirmAccess: 'Bitte bestätige den Zugriff auf dein Test-Guthaben.',
      confirmPredict: 'Bitte bestätige deine Antwort.',
      backToMarkets: 'Zurück zu den Städten',
    },
    zh: {
      loading: '正在加载城市...',
      notFound: '未找到城市。',
      question: '问题',
      average: '10 年平均',
      pool: '总额',
      crowd: '人群分布',
      participants: '参与者',
      predict: '回答这个问题',
      yes: '是',
      no: '否',
      amount: '金额',
      balance: '余额',
      allowed: '已允许',
      allowFunds: '允许资金',
      confirmPrediction: '确认回答',
      predictAgain: '再次回答',
      predictionAddedDetail: '回答已添加——可以关闭或再次回答。',
      connectToPredict: '连接以回答',
      fundToPredict: '充值以回答',
      gettingReady: '正在为你准备…',
      authorizingSilently: '正在通过社交钱包安全授权…',
      predictionClosed: '回答已关闭',
      predictionClosedBody: '此窗口仍然活跃，但已不再接受新的回答。',
      awaitingResolution: '等待结算',
      marketClosed: '此窗口已关闭。',
      notEnoughBalance: '余额不足以支付该金额。',
      beforeFees: '扣费前',
      afterFee: '扣除预估费用后',
      ifYourAnswerIsRight: '如果你的答案正确',
      winnerFee: '预估的赢家手续费。最终值随 pool 变化而变化。',
      yourAnswer: '你的答案',
      on: '在',
      won: '已赢',
      lost: '已输',
      details: '详情',
      threshold: '阈值',
      starts: '开始',
      ends: '结束',
      distance: '距离',
      rain: '雨',
      temperature: '气温',
      lowTemp: '低温',
      snow: '雪',
      createQuestionRain: '降雨量是否会超过',
      createQuestionTempHigh: '平均最高气温是否会超过',
      createQuestionTempLow: '平均最低气温是否会低于',
      createQuestionSnow: '降雪量是否会超过',
      inNext: '在接下来的',
      day: '天',
      days: '天',
      predictionAdded: '回答已添加。',
      confirmAccess: '请确认对测试资金的访问权限。',
      confirmPredict: '请确认你的回答。',
      backToMarkets: '返回城市列表',
    },
  };

  return table[language] ?? table.en;
}

function getMarketLabel(marketTypeId: number, copy: Record<string, string>, language: string) {
  if (marketTypeId === MARKET_TYPES.RAIN) return copy.rain;
  if (marketTypeId === MARKET_TYPES.TEMP_LOW) return copy.lowTemp;
  if (marketTypeId === MARKET_TYPES.SNOW) return copy.snow;
  // V6 binary types — localized inline (the markets/[id] copy table doesn't
  // carry these yet). Falling through to copy.temperature mislabels them.
  const tr = (m: Record<string, string>) => m[language] ?? m.en;
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) return tr({ en: 'Cold spell', pt: 'Onda de frio', es: 'Ola de frío', fr: 'Vague de froid', de: 'Kältewelle', zh: '寒潮' });
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) return tr({ en: 'Dry stretch', pt: 'Período seco', es: 'Racha seca', fr: 'Période sèche', de: 'Trockenperiode', zh: '干旱期' });
  if (marketTypeId === MARKET_TYPES.FROST_RISK) return tr({ en: 'Frost risk', pt: 'Risco de geada', es: 'Riesgo de helada', fr: 'Risque de gel', de: 'Frostgefahr', zh: '霜冻风险' });
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) return tr({ en: 'Heavy rain event', pt: 'Chuva forte', es: 'Lluvia fuerte', fr: 'Forte pluie', de: 'Starkregen', zh: '强降雨' });
  return copy.temperature;
}

function displayMetricValue(
  market: {
    marketTypeId: number;
    thresholdValue: number;
    unit: string;
    startTime: number;
    endTime: number;
  },
  language: string,
  system: UnitSystem = 'metric',
) {
  const tr = (m: Record<string, string>) => m[language] ?? m.en;
  const days = Math.max(1, Math.round((market.endTime - market.startTime) / 86400));
  const v = market.thresholdValue;
  // Display-only conversion — `v` stays the metric value the oracle resolves.
  const rain = thresholdPrecip(v, system);
  const cold = thresholdTemp(decodeColdLine(v), system);
  const frost = thresholdTemp(2, system);
  if (market.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return {
      average: tr({ en: `${days}-day heavy-rain check`, pt: `Chuva forte em ${days} ${days === 1 ? 'dia' : 'dias'}`, es: `Lluvia fuerte en ${days} ${days === 1 ? 'día' : 'días'}`, fr: `Forte pluie sur ${days} ${days === 1 ? 'jour' : 'jours'}`, de: `Starkregen über ${days} ${days === 1 ? 'Tag' : 'Tage'}`, zh: `${days}天强降雨` }),
      threshold: v >= 9000
        ? tr({ en: 'Well above the usual wettest day', pt: 'Bem acima do dia mais chuvoso habitual', es: 'Muy por encima del día más lluvioso habitual', fr: 'Bien au-dessus du jour le plus pluvieux habituel', de: 'Weit über dem üblichen nassesten Tag', zh: '远高于通常最多雨的一天' })
        : tr({ en: `${rain} in one day`, pt: `${rain} em um dia`, es: `${rain} en un día`, fr: `${rain} en un jour`, de: `${rain} an einem Tag`, zh: `一天 ${rain}` }),
    };
  }
  if (market.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return {
      average: tr({ en: `${days} dry ${days === 1 ? 'day' : 'days'}`, pt: `${days} ${days === 1 ? 'dia' : 'dias'} sem chuva`, es: `${days} ${days === 1 ? 'día' : 'días'} sin lluvia`, fr: `${days} ${days === 1 ? 'jour' : 'jours'} sans pluie`, de: `${days} trockene ${days === 1 ? 'Tag' : 'Tage'}`, zh: `${days}个干燥天` }),
      threshold: tr({ en: `Dry day: ≤${rain} rain`, pt: `Dia seco: ≤${rain} de chuva`, es: `Día seco: ≤${rain} de lluvia`, fr: `Jour sec : ≤${rain} de pluie`, de: `Trockener Tag: ≤${rain} Regen`, zh: `干燥日：≤${rain} 降雨` }),
    };
  }
  if (market.marketTypeId === MARKET_TYPES.COLD_SPELL) {
    return {
      average: tr({ en: `${cold} cold line`, pt: `Linha de frio de ${cold}`, es: `Línea de frío de ${cold}`, fr: `Seuil de froid ${cold}`, de: `Kältelinie ${cold}`, zh: `${cold} 寒冷线` }),
      threshold: cold,
    };
  }
  if (market.marketTypeId === MARKET_TYPES.FROST_RISK) {
    return {
      average: tr({ en: 'Frost-risk night', pt: 'Noite com risco de geada', es: 'Noche con riesgo de helada', fr: 'Nuit à risque de gel', de: 'Frostgefahr-Nacht', zh: '霜冻风险之夜' }),
      threshold: tr({ en: `Below ${frost}`, pt: `Abaixo de ${frost}`, es: `Por debajo de ${frost}`, fr: `En dessous de ${frost}`, de: `Unter ${frost}`, zh: `低于 ${frost}` }),
    };
  }
  const simple = formatThreshold(v, market.unit, system);
  return {
    average: simple,
    threshold: simple,
  };
}

function dateLocale(language: string) {
  return ({
    en: 'en-US',
    pt: 'pt-BR',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    zh: 'zh-CN',
  } as Record<string, string>)[language] ?? 'en-US';
}

function formatMarketDateTime(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(dateLocale(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function estimateReturn(params: {
  abovePool: number;
  belowPool: number;
  amount: number;
  isAbove: boolean;
  feeBps?: number;
}) {
  const { abovePool, belowPool, amount, isAbove, feeBps = 50 } = params;
  if (!Number.isFinite(amount) || amount <= 0) return { gross: 0, net: 0, fee: 0 };

  const nextAbove = isAbove ? abovePool + amount : abovePool;
  const nextBelow = isAbove ? belowPool : belowPool + amount;
  const total = nextAbove + nextBelow;
  const winningPool = isAbove ? nextAbove : nextBelow;
  if (winningPool <= 0) return { gross: 0, net: 0, fee: 0 };

  const gross = (amount * total) / winningPool;
  const profit = Math.max(0, gross - amount);
  const fee = (profit * feeBps) / 10000;
  const net = gross - fee;

  return { gross, net, fee };
}

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const marketId = params?.id ? BigInt(params.id) : 0n;
  const faucetRef = useRef<HTMLDivElement | null>(null);

  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const { system } = useUnits();
  const queryClient = useQueryClient();
  const copy = pageCopy(language);

  const { location } = useLocationContext();
  const { markets, isLoading, refetchAll } = useMarkets(location);
  const market = markets.find((m) => m.id === marketId);

  const { address, isConnected } = useAccount();
  const [selectedSide, setSelectedSide] = useState<'above' | 'below' | null>(() => {
    // Preselect from ?side= so the SignalQuestionCard's "More rain / Less rain"
    // buttons land here with the answer already chosen — one tap to confirm.
    const s = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('side')
      : null;
    return s === 'above' || s === 'below' ? s : null;
  });
  const [amount, setAmount] = useState('10');

  const {
    data: balance = 0n,
    refetch: refetchBalance,
  } = useReadContract({
    chainId: CHAIN.id,
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
    chainId: CHAIN.id,
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.CLIMATE_POOL] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();

  // VL-1: frictionless first answer. claimFaucet() already chains eth-drip +
  // test credits; we run it automatically when the visitor is short on funds
  // instead of sending them to hunt for the faucet banner. lastWriteRef lets us
  // chain approve -> predict in one tap (no second "Confirm" for first-timers).
  const { claimFaucet } = useFaucet();
  const [funding, setFunding] = useState(false);
  // Hard-lock the CTA for a few seconds right after a prediction lands, so a
  // second tap can't add an accidental position before the user notices the
  // confirmation. Independent of isSuccess (which gets reset ~1.2s in).
  const [justPredicted, setJustPredicted] = useState(false);
  const postSubmitLockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotPatchRef = useRef<string | null>(null);
  const hadPositionBeforeSubmitRef = useRef(false);
  const lastWriteRef = useRef<'approve' | 'predict' | null>(null);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    chainId: CHAIN.id,
    hash: txHash,
    pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    query: { enabled: !!txHash },
  });


  const amountNumber = Number(amount);
  let amountWei = 0n;
  try {
    amountWei = parseUnits(amount || '0', USDM_DECIMALS);
  } catch {
    amountWei = 0n;
  }

  const needsApproval = allowance < amountWei;
  const hasEnoughBalance = balance >= amountWei;

  const phase = market
    ? derivePhase({
        startTime: market.startTime,
        endTime: market.endTime,
        resolved: market.resolved,
        cancelled: market.cancelled,
      })
    : 'live';

  const entryState: EntryState = market
    ? getEntryState({
        resolved: market.resolved,
        cancelled: market.cancelled,
        predictionDeadline: market.predictionDeadline,
        endTime: market.endTime,
      })
    : 'resolved';

  const isClosed = !market || entryState !== 'open';

  const estimate = useMemo(() => {
    if (!market || !selectedSide) return { gross: 0, net: 0, fee: 0 };
    return estimateReturn({
      abovePool: market.abovePoolValue,
      belowPool: market.belowPoolValue,
      amount: amountNumber,
      isAbove: selectedSide === 'above',
    });
  }, [market, selectedSide, amountNumber]);

  const hasValidInputs =
    !!market &&
    !!selectedSide &&
    !isClosed &&
    amountWei > 0n &&
    amountNumber >= MIN_POSITION;

  const needsFunding = isConnected && hasValidInputs && !hasEnoughBalance;
  const isBusy = isPending || isConfirming;

  function handleSubmit() {
    if (!market || !selectedSide) return;

    hadPositionBeforeSubmitRef.current = market.userHasPosition;

    if (needsApproval) {
      lastWriteRef.current = 'approve';
      void writeContract({
        address: CONTRACTS.USDC,
        abi: usdcAbi,
        functionName: 'approve',
        args: [CONTRACTS.CLIMATE_POOL, parseUnits('1000', USDM_DECIMALS)],
      }).catch(() => undefined);
      return;
    }

    lastWriteRef.current = 'predict';
    void writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'predict',
      args: [market.id, selectedSide === 'above', amountWei],
    }).catch(() => undefined);
  }

  const predictGate = useActionGate({
    action: 'predict',
    isConnected,
    requiresFunds: hasValidInputs,
    hasFunds: !needsFunding,
    onReadyAction: async () => {
      handleSubmit();
    },
    onNeedsFunding: async () => {
      // VL-1: auto-fund (gas + test credits) then proceed, instead of sending the
      // visitor to find the faucet. Falls back to the banner only if it fails.
      setFunding(true);
      try {
        await claimFaucet();
        await refetchBalance();
        handleSubmit();
      } catch {
        faucetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        setFunding(false);
      }
    },
  });

  // Ref so the effect below can call the LATEST callbacks without listing
  // them as deps. refetchBalance/refetchAllowance/refetchAll/writeContract/
  // reset are all new references every render (none memoized upstream) —
  // having them in the dep array made this effect re-fire on every render
  // while isSuccess stayed true, and each re-fire's cleanup cancelled the
  // pending reset timeout and rescheduled it, so isSuccess never actually
  // got cleared. That produced an unbounded refetch storm against
  // /api/Base Sepolia-rpc after every predict, which is what tripped Vercel's
  // edge DDoS mitigation in production (same bug as the claim flow).
  const latestPredictEffectRef = useRef({
    market,
    selectedSide,
    amountWei,
    txHash,
    queryClient,
    writeContract,
    refetchBalance,
    refetchAllowance,
    refetchAll,
    reset,
  });
  latestPredictEffectRef.current = {
    market,
    selectedSide,
    amountWei,
    txHash,
    queryClient,
    writeContract,
    refetchBalance,
    refetchAllowance,
    refetchAll,
    reset,
  };

  useEffect(() => {
    if (!isSuccess) return;

    const {
      market,
      selectedSide,
      amountWei,
      txHash,
      queryClient,
      writeContract,
      refetchBalance,
      refetchAllowance,
      refetchAll,
      reset,
    } = latestPredictEffectRef.current;

    // VL-1: when the approval confirms, chain straight into the prediction so a
    // first-timer never taps twice. Otherwise it's the prediction itself —
    // refresh reads and clear the write state.
    if (lastWriteRef.current === 'approve' && market && selectedSide && amountWei > 0n) {
      lastWriteRef.current = 'predict';
      void refetchAllowance();
      reset();
      void writeContract({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'predict',
        args: [market.id, selectedSide === 'above', amountWei],
      }).catch(() => undefined);
      return;
    }

    if (market && selectedSide && amountWei > 0n) {
      const patchKey =
        txHash ?? `${market.id.toString()}:${selectedSide}:${amountWei.toString()}`;
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
        }).catch((snapshotError) => {
          console.warn('[Kalma] market snapshot refresh failed:', snapshotError);
        });
      }
    }

    void Promise.all([refetchBalance(), refetchAllowance(), refetchAll()]);
    const t = setTimeout(() => {
      reset();
      lastWriteRef.current = null;
      snapshotPatchRef.current = null;
      hadPositionBeforeSubmitRef.current = false;
    }, 1200);
    return () => clearTimeout(t);
  }, [isSuccess]);

  // Post-submit hard-lock. Set on the predict receipt; held for ~3.5s on a
  // ref timer so it survives the reset() above (which flips isSuccess back to
  // false at ~1.2s). The approve step of the auto-approve→predict chain keeps
  // the button busy anyway, so re-arming here is harmless.
  useEffect(() => {
    if (!isSuccess || lastWriteRef.current === 'approve') return;
    setJustPredicted(true);
    if (postSubmitLockRef.current) clearTimeout(postSubmitLockRef.current);
    postSubmitLockRef.current = setTimeout(() => setJustPredicted(false), 3500);
  }, [isSuccess]);

  useEffect(
    () => () => {
      if (postSubmitLockRef.current) clearTimeout(postSubmitLockRef.current);
    },
    [],
  );

  if (isLoading) {
    return (
      <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
        <AppHeader section={copy.question} />
        <div style={{ padding: '0 16px' }}>
          <div style={panel(neu, R, fonts, C)}>{copy.loading}</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!market) {
    return (
      <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
        <AppHeader section={copy.question} />
        <div style={{ padding: '0 16px' }}>
          <div style={panel(neu, R, fonts, C)}>{copy.notFound}</div>
          <Link href="/markets" style={backLink(fonts, C)}>
            {copy.backToMarkets}
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  // CO-1: shared question builder — same words as the cards and the
  // quick-predict sheet, with V6 types properly translated in all 6
  // languages (the old getQuestionText only had English fallbacks for them).
  const question = marketQuestion(language, {
    marketTypeId: market.marketTypeId,
    thresholdValue: market.thresholdValue,
    unit: market.unit,
    startTime: market.startTime,
    endTime: market.endTime,
  }, system);

  const metricLabel = getMarketLabel(market.marketTypeId, copy, language);
  const displayMetric = displayMetricValue(market, language, system);

  // If the user already holds a position, the CTA is "Answer again" — makes it
  // clear a second tap adds to the position rather than being a stuck retry.
  let primaryLabel = market.userHasPosition ? copy.predictAgain : copy.confirmPrediction;
  if (entryState !== 'open') {
    primaryLabel = copy.predictionClosed;
  } else if (funding) {
    primaryLabel = copy.gettingReady ?? 'Getting you ready…';
  } else if (!isConnected) {
    primaryLabel = copy.connectToPredict;
  } else if (needsApproval) {
    // Auto-fund + approve→predict chain make this one tap; keep the wording
    // honest that an allowance step happens, but it no longer needs a 2nd tap.
    primaryLabel = copy.allowFunds;
  }

  const shouldDisablePrimary =
    entryState !== 'open' ||
    isBusy ||
    funding ||
    justPredicted ||
    (isConnected && !hasValidInputs);
  const showStickyPrimary = !isClosed && !market.userHasPosition;

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <style dangerouslySetInnerHTML={{ __html: marketDetailLayoutCSS }} />
      <AppHeader section={market.cityName} />

      <div style={{ padding: '0 16px 24px', maxWidth: 1140, margin: '0 auto' }}>
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 'clamp(24px, 6.6vw, 28px)',
              fontWeight: 700,
              lineHeight: 1.2,
              color: C.text,
              marginBottom: 10,
            }}
          >
            {question}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <PhaseIndicator phase={phase} />
            <span style={meta(fonts, C)}>{metricLabel}</span>
            {market.distanceKm != null ? (
              <span style={meta(fonts, C)}>{market.distanceKm.toFixed(1)} km</span>
            ) : null}
            <ShareQuestionButton
              marketId={market.id.toString()}
              question={question}
              split={`${market.aboveCrowdPct}% ▲ ${copy.yes} / ${market.belowCrowdPct}% ▼ ${copy.no} · ${market.participantCount} ${copy.participants}`}
              compact
            />
          </div>
        </div>

        {/* CO-4: resolved (non-cancelled) signals get the richer outcome
            card — what the weather did, whether the crowd called it, your
            result, and a share button. Cancelled/expired fall to the banner. */}
        <div style={{ marginBottom: 12 }}>
          {market.resolved && !market.cancelled ? (
            <ResolutionOutcomeCard m={market} question={question} />
          ) : (
            <ResolutionBanner
              market={{
                resolved: market.resolved,
                cancelled: market.cancelled,
                outcome: market.outcome,
                isRainMarket: market.isRainMarket,
                thresholdValue: market.thresholdValue,
                unit: market.unit,
                actualValue: market.actualValue ?? undefined,
                userHasPosition: market.userHasPosition,
                userWon: market.userWon,
                userSide: market.userSide ?? undefined,
                userPositionValue: market.userPositionValue,
              }}
            />
          )}
        </div>

        {/* ── Desktop two-column body ───────────────────────────────
            Read the question (above), then ACT: the predict card +
            context/confidence flow down the main (left) column. The
            secondary read — "what are you seeing?" + details — is hoisted
            into the sticky side (right) column via .k-market-side. Mobile
            stacks main then side, top-to-bottom. */}
        <div className="k-market-grid">

        {entryState === 'prediction_closed' ? (
          <div style={{ ...panel(neu, R, fonts, C), marginBottom: 12 }}>
            <div style={sectionTitle(fonts, C)}>{copy.predictionClosed}</div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
                lineHeight: 1.5,
              }}
            >
              {copy.predictionClosedBody}
            </div>
          </div>
        ) : null}

        {entryState === 'awaiting_resolution' ? (
          <div style={{ ...panel(neu, R, fonts, C), marginBottom: 12 }}>
            <div style={sectionTitle(fonts, C)}>{copy.awaitingResolution}</div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
                lineHeight: 1.5,
              }}
            >
              {copy.predictionClosedBody}
            </div>
          </div>
        ) : null}

        {!isClosed ? (
          <div style={{ ...panel(neu, R, fonts, C), marginBottom: 12 }}>
            <div style={sectionTitle(fonts, C)}>{copy.predict}</div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <SideBtn
                label={`▲ ${copy.yes}`}
                selected={selectedSide === 'above'}
                color={C.above}
                onClick={() => setSelectedSide('above')}
                fonts={fonts}
                R={R}
                C={C}
              />
              <SideBtn
                label={`▼ ${copy.no}`}
                selected={selectedSide === 'below'}
                color={C.below}
                onClick={() => setSelectedSide('below')}
                fonts={fonts}
                R={R}
                C={C}
              />
            </div>

            <label style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              <span style={miniLabel(fonts, C)}>{copy.amount}</span>
              <input
                id="market-detail-amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                style={inputStyle(C, fonts, R)}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <MiniStat
                label={copy.balance}
                value={`${Number(formatUnits(balance, USDM_DECIMALS)).toFixed(2)} USDC`}
                fonts={fonts}
                C={C}
                neu={neu}
                R={R}
              />
              <MiniStat
                label={copy.allowed}
                value={`${Number(formatUnits(allowance, USDM_DECIMALS)).toFixed(2)} USDC`}
                fonts={fonts}
                C={C}
                neu={neu}
                R={R}
              />
            </div>

            {selectedSide ? (
              <div style={{ ...neu.controlPressed, borderRadius: R.lg, padding: '12px 14px', marginBottom: 12 }}>
                <div style={miniLabel(fonts, C)}>{copy.ifYourAnswerIsRight}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  <MiniStat label={copy.beforeFees} value={`${estimate.gross.toFixed(2)} USDC`} fonts={fonts} C={C} neu={neu} R={R} />
                  <MiniStat label={copy.afterFee} value={`${estimate.net.toFixed(2)} USDC`} fonts={fonts} C={C} neu={neu} R={R} />
                </div>
                <div style={{ marginTop: 8, fontFamily: fonts.sans, fontSize: 12, color: C.textSoft }}>
                  {copy.winnerFee}
                </div>
              </div>
            ) : null}

            {!hasEnoughBalance && hasValidInputs ? (
              <div style={{ color: C.below, fontFamily: fonts.sans, fontSize: 14, marginBottom: 10 }}>
                {copy.notEnoughBalance}
              </div>
            ) : null}

            {error ? (
              <div style={{ marginBottom: 10 }}>
                <WalletErrorPanel error={error} onAfterReset={reset} />
              </div>
            ) : null}

            {/* Desktop inline button — hidden on mobile via
                .k-action-inline-desktop-only. The mobile path uses
                <StickyActionBar /> below so the CTA is always reachable
                without scrolling back into the Predict panel. */}
            <div className={showStickyPrimary ? 'k-action-inline-desktop-only' : undefined}>
              <button
                type="button"
                onClick={() => void predictGate.run()}
                disabled={shouldDisablePrimary}
                style={primaryBtn(C, fonts, R, shouldDisablePrimary)}
              >
                {primaryLabel}
              </button>
            </div>

            {/* Confirmation directly under the CTA (both surfaces) so a
                successful prediction is unmistakable and people don't tap
                "Confirm" again thinking the first one didn't land. Held for
                the full post-submit lock window (isSuccess resets earlier). */}
            {isSuccess || justPredicted ? (
              <div
                style={{
                  marginTop: 12,
                  padding: '11px 13px',
                  borderRadius: R.md,
                  background: `${C.above}16`,
                  border: `1px solid ${C.above}40`,
                  color: C.above,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  textAlign: 'center',
                }}
              >
                ✓ {copy.predictionAddedDetail}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Context + confidence, below the options: the crowd's read then the
            10-year baseline / pool / participants. */}
        {!market.resolved && !market.cancelled ? (
          <div style={{ marginBottom: 12 }}>
            <CommunityPulse
              marketTypeId={market.marketTypeId}
              aboveCrowdPct={market.aboveCrowdPct}
              belowCrowdPct={market.belowCrowdPct}
              participantCount={market.participantCount}
              daysLeft={market.daysLeft}
            />
          </div>
        ) : null}

        <div style={{ ...panel(neu, R, fonts, C), marginBottom: 12 }}>
          <Row label={copy.average} value={displayMetric.average} fonts={fonts} C={C} />
          <Row label={copy.pool} value={formatLocal(market.pool)} fonts={fonts} C={C} />
          <Row label={copy.participants} value={String(market.participantCount)} fonts={fonts} C={C} />
        </div>

        {market.userHasPosition ? (() => {
          // Show EACH side the user holds — a position can span both Above and
          // Below. Summing them under one side label (the old behaviour) made a
          // Colder (below) stake read as if it grew the Milder (above) side.
          const aboveVal = Number(formatUnits(market.userAboveRaw, USDM_DECIMALS));
          const belowVal = Number(formatUnits(market.userBelowRaw, USDM_DECIMALS));
          const bothSides = aboveVal > 0 && belowVal > 0;
          const parts: string[] = [];
          if (aboveVal > 0) parts.push(`▲ ${copy.yes} ${formatLocal(aboveVal)}`);
          if (belowVal > 0) parts.push(`▼ ${copy.no} ${formatLocal(belowVal)}`);
          // Won/lost is only unambiguous for a single-side position.
          const resultSuffix =
            market.resolved && !bothSides
              ? market.userWon ? ` · ${copy.won}` : ` · ${copy.lost}`
              : '';
          return (
            <div
              style={{
                ...panel(neu, R, fonts, C),
                marginBottom: 12,
                background: market.userWon ? `${C.above}10` : market.resolved ? `${C.below}08` : C.surface,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  color: C.text,
                  lineHeight: 1.45,
                }}
              >
                {`${copy.yourAnswer}: ${parts.join(' · ')}${resultSuffix}`}
              </div>
            </div>
          );
        })() : null}

        {/* Mobile sticky CTA (UX-1) — hidden on desktop via CSS in
            app/layout.tsx. Mirrors the inline button's label, click,
            and disabled state so there's no chance of divergent
            behavior between the two surfaces. */}
        {showStickyPrimary ? (
          <StickyActionBar
            label={primaryLabel}
            onClick={() => void predictGate.run()}
            disabled={shouldDisablePrimary}
            hint={isPending && !txHash ? copy.authorizingSilently : undefined}
          />
        ) : null}

        {(market.resolved || market.cancelled) && market.userHasPosition ? (
          <div style={{ marginBottom: 12 }}>
            <div ref={faucetRef} style={{ marginBottom: 12 }}>

              <FaucetBanner />

            </div>

            <ReturnSummary
              marketId={market.id}
              isAbove={market.resolved ? market.outcome : market.userSide === 'above'}
              amount={
                market.resolved && market.userWon
                  ? market.outcome
                    ? market.userAboveRaw
                    : market.userBelowRaw
                  : market.userAboveRaw > 0n
                    ? market.userAboveRaw
                    : market.userBelowRaw
              }
              resolved={market.resolved}
              userWon={market.userWon}
            />
          </div>
        ) : null}

        <div style={{ marginBottom: 12 }}>
          <ChallengeStatusPanel
            marketId={market.id}
            market={{
              resolved: market.resolved,
              cancelled: market.cancelled,
              marketTypeId: market.marketTypeId,
              lat: market.lat,
              lon: market.lon,
              startTime: market.startTime,
              endTime: market.endTime,
              actualValue: market.actualValue,
              thresholdValue: market.thresholdValue,
              unit: market.unit,
            }}
          />
        </div>

        {market.resolved && !market.cancelled ? (
          <div style={{ marginBottom: 12 }}>
            <ResolutionEvidencePanel
              marketId={market.id}
              marketTypeId={market.marketTypeId}
              unit={market.unit}
            />
          </div>
        ) : null}

        {/* Side (right) column — secondary read: what people are seeing on
            the ground + the static details. Hoisted to column 2 on desktop;
            stacks under the main column on mobile. */}
        <aside className="k-market-side">
          {/* CW-1: on-the-ground observations. */}
          <div style={{ marginBottom: 12 }}>
            <ObservationFeed marketId={Number(market.id)} />
          </div>

          <div style={{ ...panel(neu, R, fonts, C) }}>
            <div style={sectionTitle(fonts, C)}>{copy.details}</div>
            <Row label={copy.threshold} value={displayMetric.threshold} fonts={fonts} C={C} />
            <Row label={copy.starts} value={formatMarketDateTime(market.startTime, language)} fonts={fonts} C={C} />
            <Row label={copy.ends} value={formatMarketDateTime(market.endTime, language)} fonts={fonts} C={C} />
            {market.distanceKm != null ? (
              <Row label={copy.distance} value={`${market.distanceKm.toFixed(1)} km`} fonts={fonts} C={C} />
            ) : null}
          </div>
        </aside>

        </div>{/* end .k-market-grid */}
      </div>

      <BottomNav />
    </div>
  );
}

function panel(neu: any, R: any, fonts: any, C: any): React.CSSProperties {
  return {
    ...neu.panelRaised,
    borderRadius: R.xl,
    padding: 18,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: C.textSoft,
    lineHeight: 1.5,
  };
}

function Row({ label, value, fonts, C }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <span style={miniLabel(fonts, C)}>{label}</span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          color: C.text,
          fontWeight: 700,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value, fonts, C, neu, R }: any) {
  return (
    <div style={{ ...neu.subtle, borderRadius: R.md, padding: '10px 12px' }}>
      <div style={miniLabel(fonts, C)}>{label}</div>
      <div style={{ fontFamily: fonts.sans, fontSize: 15, fontWeight: 700, color: C.text, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function SideBtn({ label, selected, color, onClick, fonts, R, C }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        flex: 1,
        // Answer buttons: 64px minimum (golden rule 5).
        minHeight: 64,
        padding: '14px 12px',
        borderRadius: R.lg,
        border: `1px solid ${selected ? color : C.dividerStrong}`,
        background: selected ? `${color}12` : C.surface,
        color: selected ? color : C.text,
        fontFamily: fonts.sans,
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function primaryBtn(C: any, fonts: any, R: any, disabled = false): React.CSSProperties {
  return {
    width: '100%',
    padding: '16px 18px',
    borderRadius: R.lg,
    border: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
  };
}

function inputStyle(C: any, fonts: any, R: any): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.divider}`,
    background: C.surfaceHigh,
    color: C.text,
    borderRadius: R.lg,
    padding: '16px 15px',
    fontFamily: fonts.sans,
    fontSize: 16,
    outline: 'none',
  };
}

function sectionTitle(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    color: C.textMutedStrong,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  };
}

function miniLabel(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 700,
    color: C.textMutedStrong,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  };
}

function meta(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: C.textMutedStrong,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  };
}

function backLink(fonts: any, C: any): React.CSSProperties {
  return {
    display: 'inline-block',
    marginTop: 12,
    textDecoration: 'none',
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    color: C.text,
  };
}
