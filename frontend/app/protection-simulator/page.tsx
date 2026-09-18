//frontend/app/protection-simulator/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';
import { convertThreshold, type UnitSystem } from '@/lib/units';
import { useCurrencyContext } from '@/lib/currency-context';
import { useMarkets } from '@/hooks/useMarkets';
import { useLocationContext } from '@/hooks/useLocationContext';
import { MARKET_TYPES, decodeColdLine } from '@/lib/contracts';

function copyFor(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Protection Simulator',
      subtitle: 'Estimate how much a market could help offset a weather loss.',
      selectMarket: 'Select city',
      noMarkets: 'No active cities available right now.',
      weatherContext: 'Weather context',
      tenYearAverage: '10-year average',
      confidence: 'Confidence',
      confidenceHigh: 'High',
      confidenceMedium: 'Medium',
      confidenceLow: 'Low',
      currentPool: 'Current total',
      targetLoss: 'Estimated business loss',
      protectionBudget: 'Protection budget',
      budgetHint:
        'This is the amount you are willing to put into the position, not the total damage you want to cover.',
      riskyOutcome: 'Bad outcome for you',
      yes: 'Yes',
      no: 'No',
      budgetPct: 'Budget as % of loss',
      estReturn: 'If your answer is right, you collect',
      estNetProtection: 'Estimated net protection',
      estLossOffset: 'Estimated loss offset',
      oppositeLiquidity: 'Opposite-side liquidity',
      uncoveredDamage: 'Uncovered damage',
      interpretation: 'Interpretation',
      thinMarket:
        'This market is still thin. Your protection is limited unless more liquidity enters the opposite side.',
      partialCoverage:
        'This market may help, but current liquidity would only cover part of your target loss.',
      strongCoverage:
        'This market could meaningfully offset your target loss if this outcome happens.',
      growthHint:
        'A larger or earlier position can help attract the opposite side and deepen the market, but future liquidity is never guaranteed.',
      openMarket: 'Open city',
      protectionWorks: 'How protection works',
      protectionLine1:
        'Use a small protection budget to soften a larger weather-related loss.',
      protectionLine2:
        'If the bad outcome does not happen, your protection budget is the amount you risk losing.',
      liveMarket: 'Live',
      activeOnly: 'Active cities only',
      rain: 'Rain',
      tempHigh: 'High temp',
      tempLow: 'Low temp',
      snow: 'Snow',
      coldSpell: 'Cold spell',
      dryStretch: 'Dry stretch',
      frostRisk: 'Frost risk',
      heavyRain: 'Heavy rain',
      day: 'day',
      days: 'days',
      questionRain: 'Will it rain more than',
      questionTempHigh: 'Will the average high temperature exceed',
      questionTempLow: 'Will the average low temperature be below',
      questionSnow: 'Will snowfall accumulate more than',
      questionColdSpell: 'Will cold conditions stay below',
      questionDryStretch: 'Will daily rainfall stay at or below',
      questionFrostRisk: 'Will any night drop below',
      questionHeavyRain: 'Will a single day bring unusually heavy rainfall',
      // "over", not "in" — an imperial rain threshold renders as "1.1 in",
      // and "1.1 in in the next 7 days" is unreadable.
      inNext: 'over the next',
      marketQuestion: 'Forecast question',
    },
    pt: {
      title: 'Simulador de Proteção',
      subtitle: 'Estime quanto um mercado pode ajudar a compensar uma perda climática.',
      selectMarket: 'Selecionar mercado',
      noMarkets: 'Não há cidades ativas disponíveis agora.',
      weatherContext: 'Contexto climático',
      tenYearAverage: 'Média de 10 anos',
      confidence: 'Confiança',
      confidenceHigh: 'Alta',
      confidenceMedium: 'Média',
      confidenceLow: 'Baixa',
      currentPool: 'Total atual',
      targetLoss: 'Perda estimada do negócio',
      protectionBudget: 'Orçamento de proteção',
      budgetHint:
        'Este é o valor que você está disposto a colocar na posição, não o total do dano que deseja cobrir.',
      riskyOutcome: 'Resultado ruim para você',
      yes: 'Sim',
      no: 'Não',
      budgetPct: 'Orçamento como % da perda',
      estReturn: 'Se acertar, você resgata',
      estNetProtection: 'Proteção líquida estimada',
      estLossOffset: 'Compensação estimada da perda',
      oppositeLiquidity: 'Liquidez do lado oposto',
      uncoveredDamage: 'Danos sem proteção',
      interpretation: 'Interpretação',
      thinMarket:
        'Este mercado ainda está raso. Sua proteção é limitada a menos que mais liquidez entre no lado oposto.',
      partialCoverage:
        'Este mercado pode ajudar, mas a liquidez atual cobriria apenas parte da sua perda alvo.',
      strongCoverage:
        'Este mercado pode compensar de forma relevante sua perda alvo se esse resultado acontecer.',
      growthHint:
        'Uma posição maior ou mais cedo pode ajudar a atrair o lado oposto e aprofundar o mercado, mas liquidez futura nunca é garantida.',
      openMarket: 'Abrir mercado',
      protectionWorks: 'Como a proteção funciona',
      protectionLine1:
        'Use um orçamento pequeno de proteção para suavizar uma perda climática maior.',
      protectionLine2:
        'Se o resultado ruim não acontecer, seu orçamento de proteção é o valor que você arrisca perder.',
      liveMarket: 'Mercado ao vivo',
      activeOnly: 'Somente cidades ativas',
      rain: 'Chuva',
      tempHigh: 'Temp. alta',
      tempLow: 'Temp. baixa',
      snow: 'Neve',
      coldSpell: 'Frio prolongado',
      dryStretch: 'Estiagem',
      frostRisk: 'Risco de geada',
      heavyRain: 'Chuva forte',
      day: 'dia',
      days: 'dias',
      questionRain: 'Vai chover mais que',
      questionTempHigh: 'A média das máximas vai passar de',
      questionTempLow: 'A média das mínimas vai ficar abaixo de',
      questionSnow: 'O acúmulo de neve vai passar de',
      questionColdSpell: 'Condições frias vão ficar abaixo de',
      questionDryStretch: 'A chuva diária vai ficar em no máximo',
      questionFrostRisk: 'Alguma noite vai cair abaixo de',
      questionHeavyRain: 'Um único dia terá chuva forte incomum',
      inNext: 'nos próximos',
      marketQuestion: 'Pergunta do mercado',
    },
    es: {
      title: 'Simulador de Protección',
      subtitle: 'Estima cuánto puede ayudar una ciudad a compensar una pérdida climática.',
      selectMarket: 'Seleccionar ciudad',
      noMarkets: 'No hay ciudades activas disponibles ahora.',
      weatherContext: 'Contexto climático',
      tenYearAverage: 'Promedio de 10 años',
      confidence: 'Confianza',
      confidenceHigh: 'Alta',
      confidenceMedium: 'Media',
      confidenceLow: 'Baja',
      currentPool: 'Total actual',
      targetLoss: 'Pérdida estimada del negocio',
      protectionBudget: 'Presupuesto de protección',
      budgetHint:
        'Este es el monto que estás dispuesto a poner en la posición, no el daño total que quieres cubrir.',
      riskyOutcome: 'Resultado malo para ti',
      yes: 'Sí',
      no: 'No',
      budgetPct: 'Presupuesto como % de la pérdida',
      estReturn: 'Si aciertas, recibes',
      estNetProtection: 'Protección neta estimada',
      estLossOffset: 'Compensación estimada de la pérdida',
      oppositeLiquidity: 'Liquidez del lado opuesto',
      uncoveredDamage: 'Daño sin cobertura',
      interpretation: 'Interpretación',
      thinMarket:
        'Esta ciudad todavía es delgada. Tu protección es limitada salvo que entre más liquidez al lado opuesto.',
      partialCoverage:
        'Esta ciudad puede ayudar, pero la liquidez actual solo cubriría parte de tu pérdida objetivo.',
      strongCoverage:
        'Esta ciudad podría compensar de forma significativa tu pérdida objetivo si ocurre ese resultado.',
      growthHint:
        'Una posición mayor o más temprana puede ayudar a atraer el lado opuesto y profundizar la ciudad, pero la liquidez futura nunca está garantizada.',
      openMarket: 'Abrir ciudad',
      protectionWorks: 'Cómo funciona la protección',
      protectionLine1:
        'Usa un presupuesto pequeño de protección para suavizar una pérdida climática mayor.',
      protectionLine2:
        'Si el resultado malo no ocurre, tu presupuesto de protección es el monto que arriesgas perder.',
      liveMarket: 'En vivo',
      activeOnly: 'Solo ciudades activas',
      rain: 'Lluvia',
      tempHigh: 'Temp. alta',
      tempLow: 'Temp. baja',
      snow: 'Nieve',
      coldSpell: 'Ola de frío',
      dryStretch: 'Período seco',
      frostRisk: 'Riesgo de helada',
      heavyRain: 'Lluvia fuerte',
      day: 'día',
      days: 'días',
      questionRain: '¿Lloverá más de',
      questionTempHigh: '¿La temperatura máxima promedio superará',
      questionTempLow: '¿La temperatura mínima promedio estará por debajo de',
      questionSnow: '¿La acumulación de nieve superará',
      questionColdSpell: '¿Las condiciones frías se mantendrán por debajo de',
      questionDryStretch: '¿La lluvia diaria se mantendrá en o por debajo de',
      questionFrostRisk: '¿Alguna noche bajará de',
      questionHeavyRain: '¿Un solo día tendrá lluvia inusualmente fuerte',
      inNext: 'en los próximos',
      marketQuestion: 'Pregunta de la ciudad',
    },
    fr: {
      title: 'Simulateur de Protection',
      subtitle: "Estime à quel point une ville peut aider à compenser une perte météo.",
      selectMarket: 'Sélectionner une ville',
      noMarkets: "Aucune ville active disponible pour le moment.",
      weatherContext: 'Contexte météo',
      tenYearAverage: 'Moyenne sur 10 ans',
      confidence: 'Confiance',
      confidenceHigh: 'Élevée',
      confidenceMedium: 'Moyenne',
      confidenceLow: 'Faible',
      currentPool: 'Total actuel',
      targetLoss: "Perte estimée de l'activité",
      protectionBudget: 'Budget de protection',
      budgetHint:
        'Il s’agit du montant que tu es prêt·e à mettre dans la position, pas du dommage total à couvrir.',
      riskyOutcome: 'Mauvais résultat pour toi',
      yes: 'Oui',
      no: 'Non',
      budgetPct: 'Budget en % de la perte',
      estReturn: 'Si ta réponse est correcte, tu reçois',
      estNetProtection: 'Protection nette estimée',
      estLossOffset: 'Compensation estimée de la perte',
      oppositeLiquidity: 'Liquidité du côté opposé',
      uncoveredDamage: 'Dommages non couverts',
      interpretation: 'Interprétation',
      thinMarket:
        "Cette ville est encore mince. Ta protection est limitée tant qu'il n'y a pas plus de liquidité de l'autre côté.",
      partialCoverage:
        'Cette ville peut aider, mais la liquidité actuelle ne couvrirait qu’une partie de ta perte cible.',
      strongCoverage:
        'Cette ville pourrait compenser significativement ta perte cible si ce résultat se produit.',
      growthHint:
        'Une position plus grosse ou plus tôt peut aider à attirer le côté opposé et approfondir la ville, mais la liquidité future n’est jamais garantie.',
      openMarket: 'Ouvrir la ville',
      protectionWorks: 'Comment fonctionne la protection',
      protectionLine1:
        'Utilise un petit budget de protection pour adoucir une perte météo plus importante.',
      protectionLine2:
        "Si le mauvais résultat n'arrive pas, ton budget de protection est ce que tu risques de perdre.",
      liveMarket: 'En direct',
      activeOnly: 'Villes actives uniquement',
      rain: 'Pluie',
      tempHigh: 'Temp. haute',
      tempLow: 'Temp. basse',
      snow: 'Neige',
      coldSpell: 'Vague de froid',
      dryStretch: 'Période sèche',
      frostRisk: 'Risque de gel',
      heavyRain: 'Forte pluie',
      day: 'jour',
      days: 'jours',
      questionRain: 'Pleuvra-t-il plus de',
      questionTempHigh: 'La température maximale moyenne dépassera-t-elle',
      questionTempLow: 'La température minimale moyenne sera-t-elle en dessous de',
      questionSnow: "L'accumulation de neige dépassera-t-elle",
      questionColdSpell: 'Les conditions froides resteront-elles sous',
      questionDryStretch: 'La pluie quotidienne restera-t-elle au plus à',
      questionFrostRisk: 'Une nuit descendra-t-elle sous',
      questionHeavyRain: 'Une seule journée apportera-t-elle une pluie inhabituellement forte',
      inNext: 'dans les prochains',
      marketQuestion: 'Question de la ville',
    },
    de: {
      title: 'Schutz-Simulator',
      subtitle: 'Schätze, wie viel eine Stadt helfen kann, einen Wetter-Verlust auszugleichen.',
      selectMarket: 'Stadt auswählen',
      noMarkets: 'Derzeit keine aktiven Städte verfügbar.',
      weatherContext: 'Wetter-Kontext',
      tenYearAverage: '10-Jahres-Durchschnitt',
      confidence: 'Vertrauen',
      confidenceHigh: 'Hoch',
      confidenceMedium: 'Mittel',
      confidenceLow: 'Niedrig',
      currentPool: 'Aktuelles Total',
      targetLoss: 'Geschätzter Geschäftsverlust',
      protectionBudget: 'Schutz-Budget',
      budgetHint:
        'Das ist der Betrag, den du in die Position einsetzen willst — nicht der gesamte zu deckende Schaden.',
      riskyOutcome: 'Schlechtes Ergebnis für dich',
      yes: 'Ja',
      no: 'Nein',
      budgetPct: 'Budget als % des Verlusts',
      estReturn: 'Wenn du richtig liegst, bekommst du',
      estNetProtection: 'Geschätzter Netto-Schutz',
      estLossOffset: 'Geschätzter Verlust-Ausgleich',
      oppositeLiquidity: 'Liquidität der Gegenseite',
      uncoveredDamage: 'Ungedeckter Schaden',
      interpretation: 'Interpretation',
      thinMarket:
        'Diese Stadt ist noch dünn. Dein Schutz ist begrenzt, solange nicht mehr Liquidität auf der Gegenseite eintrifft.',
      partialCoverage:
        'Diese Stadt kann helfen, aber die aktuelle Liquidität würde nur einen Teil deines Ziel-Verlusts decken.',
      strongCoverage:
        'Diese Stadt könnte deinen Ziel-Verlust spürbar ausgleichen, wenn dieses Ergebnis eintritt.',
      growthHint:
        'Eine größere oder frühere Position kann die Gegenseite anziehen und die Stadt vertiefen — zukünftige Liquidität ist aber nie garantiert.',
      openMarket: 'Stadt öffnen',
      protectionWorks: 'So funktioniert der Schutz',
      protectionLine1:
        'Nutze ein kleines Schutz-Budget, um einen größeren Wetter-Verlust abzufedern.',
      protectionLine2:
        'Wenn das schlechte Ergebnis nicht eintritt, ist dein Schutz-Budget der Betrag, den du riskierst zu verlieren.',
      liveMarket: 'Live',
      activeOnly: 'Nur aktive Städte',
      rain: 'Regen',
      tempHigh: 'Höchsttemp.',
      tempLow: 'Tiefsttemp.',
      snow: 'Schnee',
      coldSpell: 'Kälteperiode',
      dryStretch: 'Trockenperiode',
      frostRisk: 'Frostrisiko',
      heavyRain: 'Starkregen',
      day: 'Tag',
      days: 'Tagen',
      questionRain: 'Wird es mehr regnen als',
      questionTempHigh: 'Wird der durchschnittliche Höchstwert übersteigen',
      questionTempLow: 'Wird der durchschnittliche Tiefstwert unter',
      questionSnow: 'Wird die Schneeakkumulation mehr betragen als',
      questionColdSpell: 'Bleiben kalte Bedingungen unter',
      questionDryStretch: 'Bleibt der tägliche Niederschlag höchstens bei',
      questionFrostRisk: 'Fällt eine Nacht unter',
      questionHeavyRain: 'Bringt ein einzelner Tag ungewöhnlich starken Regen',
      inNext: 'in den nächsten',
      marketQuestion: 'Stadt-Frage',
    },
    zh: {
      title: '保护模拟器',
      subtitle: '估算一个城市能在多大程度上帮你抵消天气带来的损失。',
      selectMarket: '选择城市',
      noMarkets: '当前没有可用的活跃城市。',
      weatherContext: '天气上下文',
      tenYearAverage: '10 年平均',
      confidence: '置信度',
      confidenceHigh: '高',
      confidenceMedium: '中',
      confidenceLow: '低',
      currentPool: '当前总额',
      targetLoss: '预估业务损失',
      protectionBudget: '保护预算',
      budgetHint: '这是你愿意投入仓位的金额，而不是你想要覆盖的全部损失。',
      riskyOutcome: '对你不利的结果',
      yes: '是',
      no: '否',
      budgetPct: '预算占损失的比例',
      estReturn: '判断正确时你将获得',
      estNetProtection: '预估净保护',
      estLossOffset: '预估损失抵消',
      oppositeLiquidity: '对面流动性',
      uncoveredDamage: '未覆盖的损失',
      interpretation: '解读',
      thinMarket:
        '这个城市的流动性仍然较薄。除非对面出现更多流动性，否则你的保护有限。',
      partialCoverage:
        '这个城市可以帮上一些忙，但当前流动性只能覆盖你目标损失的一部分。',
      strongCoverage:
        '如果该结果发生，这个城市可以有意义地抵消你的目标损失。',
      growthHint:
        '更大或更早的仓位有助于吸引对面方并加深这个城市，但未来的流动性永远没有保证。',
      openMarket: '打开城市',
      protectionWorks: '保护是如何工作的',
      protectionLine1: '用一个小的保护预算来缓解更大的天气相关损失。',
      protectionLine2:
        '如果坏结果没有发生，你的保护预算就是你愿意承担的损失。',
      liveMarket: '运行中',
      activeOnly: '仅活跃城市',
      rain: '雨',
      tempHigh: '高温',
      tempLow: '低温',
      snow: '雪',
      coldSpell: '寒冷期',
      dryStretch: '干旱期',
      frostRisk: '霜冻风险',
      heavyRain: '强降雨',
      day: '天',
      days: '天',
      questionRain: '降雨量是否会超过',
      questionTempHigh: '平均最高气温是否会超过',
      questionTempLow: '平均最低气温是否会低于',
      questionSnow: '降雪量是否会超过',
      questionColdSpell: '寒冷条件是否会低于',
      questionDryStretch: '每日降雨是否会不高于',
      questionFrostRisk: '是否有夜晚会低于',
      questionHeavyRain: '单日是否会出现异常强降雨',
      inNext: '在接下来的',
      marketQuestion: '城市问题',
    },
  };

  return table[language] ?? table.en;
}

function getMarketTypeLabel(typeId: number, copy: Record<string, string>) {
  if (typeId === MARKET_TYPES.RAIN) return copy.rain;
  if (typeId === MARKET_TYPES.TEMP_LOW) return copy.tempLow;
  if (typeId === MARKET_TYPES.SNOW) return copy.snow;
  if (typeId === MARKET_TYPES.COLD_SPELL) return copy.coldSpell;
  if (typeId === MARKET_TYPES.DRY_STRETCH) return copy.dryStretch;
  if (typeId === MARKET_TYPES.FROST_RISK) return copy.frostRisk;
  if (typeId === MARKET_TYPES.HEAVY_RAIN) return copy.heavyRain;
  return copy.tempHigh;
}

function getDisplayThreshold(m: any, system: UnitSystem = 'metric') {
  const raw = Number(m.thresholdValue ?? 0);
  if (!Number.isFinite(raw)) return { value: '0', unit: m.unit ?? '' };
  const days = Math.max(1, Math.round(Math.max(86400, m.endTime - m.startTime) / 86400));

  if (
    m.marketTypeId === MARKET_TYPES.COLD_SPELL ||
    m.marketTypeId === MARKET_TYPES.FROST_RISK
  ) {
    const c = convertThreshold(decodeColdLine(raw), '°C', system);
    return { value: String(c.value), unit: c.unit };
  }
  if (m.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return { value: `${days} dry ${days === 1 ? 'day' : 'days'}`, unit: '' };
  }
  if (m.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return { value: `${days}-day heavy-rain check`, unit: '' };
  }

  const c = convertThreshold(raw, m.unit ?? '', system);
  return { value: String(c.value), unit: c.unit };
}

function getQuestionText(m: any, copy: Record<string, string>, system: UnitSystem = 'metric') {
  const days = Math.max(1, Math.round((m.endTime - m.startTime) / 86400));
  const dayLabel = days === 1 ? copy.day : copy.days;
  const threshold = getDisplayThreshold(m, system);

  if (m.marketTypeId === MARKET_TYPES.RAIN) {
    return `${copy.questionRain} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.TEMP_LOW) {
    return `${copy.questionTempLow} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.SNOW) {
    return `${copy.questionSnow} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.COLD_SPELL) {
    return `${copy.questionColdSpell} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return `${copy.questionDryStretch} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.FROST_RISK) {
    return `${copy.questionFrostRisk} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  if (m.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return `${copy.questionHeavyRain} ${copy.inNext} ${days} ${dayLabel}?`;
  }
  return `${copy.questionTempHigh} ${threshold.value}${threshold.unit} ${copy.inNext} ${days} ${dayLabel}?`;
}

function inferConfidenceKey(m: any): 'confidenceHigh' | 'confidenceMedium' | 'confidenceLow' {
  const avg = Number(m.thresholdValue ?? 0);
  if (!Number.isFinite(avg) || avg === 0) return 'confidenceLow';

  if (
    m.marketTypeId === MARKET_TYPES.RAIN ||
    m.marketTypeId === MARKET_TYPES.SNOW ||
    m.marketTypeId === MARKET_TYPES.DRY_STRETCH
  ) {
    if (avg >= 50) return 'confidenceMedium';
    if (avg >= 10) return 'confidenceHigh';
    return 'confidenceLow';
  }

  if (
    m.marketTypeId === MARKET_TYPES.COLD_SPELL ||
    m.marketTypeId === MARKET_TYPES.FROST_RISK ||
    m.marketTypeId === MARKET_TYPES.HEAVY_RAIN
  ) {
    return 'confidenceMedium';
  }

  return 'confidenceMedium';
}

export default function ProtectionSimulatorPage() {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { system } = useUnits();
  const { formatLocal } = useCurrencyContext();
  const { location } = useLocationContext();
  const { markets, isLoading } = useMarkets(location);
  const copy = copyFor(language);

  const liveMarkets = useMemo(
    () => markets.filter((m) => !m.resolved && !m.cancelled),
    [markets]
  );

  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [targetLoss, setTargetLoss] = useState('1000');
  const [budgetMode, setBudgetMode] = useState<'2' | '5' | '10' | 'custom'>('5');
  const [customBudget, setCustomBudget] = useState('50');
  const [riskyOutcome, setRiskyOutcome] = useState<'yes' | 'no'>('yes');

  const selectedMarket =
    liveMarkets.find((m) => m.id.toString() === selectedMarketId) ?? liveMarkets[0] ?? null;

  const parsedTargetLoss = Math.max(0, Number(targetLoss) || 0);

  const protectionBudget = useMemo(() => {
    if (!parsedTargetLoss) return 0;
    if (budgetMode === '2') return parsedTargetLoss * 0.02;
    if (budgetMode === '5') return parsedTargetLoss * 0.05;
    if (budgetMode === '10') return parsedTargetLoss * 0.1;
    return Math.max(0, Number(customBudget) || 0);
  }, [parsedTargetLoss, budgetMode, customBudget]);

  const selectedIsYes = riskyOutcome === 'yes';

  const estimate = useMemo(() => {
    if (!selectedMarket || protectionBudget <= 0) {
      return {
        gross: 0,
        net: 0,
        netProtection: 0,
        budgetPct: 0,
        lossOffsetPct: 0,
        oppositeLiquidity: 0,
        uncoveredDamage: parsedTargetLoss,
      };
    }

    const yesPool = Number(selectedMarket.abovePoolValue ?? 0);
    const noPool = Number(selectedMarket.belowPoolValue ?? 0);

    const sidePool = selectedIsYes ? yesPool : noPool;
    const oppositePool = selectedIsYes ? noPool : yesPool;

    const nextSidePool = sidePool + protectionBudget;
    const totalPool = nextSidePool + oppositePool;

    const gross = nextSidePool > 0 ? (protectionBudget * totalPool) / nextSidePool : 0;
    const profit = Math.max(0, gross - protectionBudget);
    const fee = profit * 0.005;
    const net = gross - fee;
    const netProtection = Math.max(0, net - protectionBudget);

    const budgetPct = parsedTargetLoss > 0 ? (protectionBudget / parsedTargetLoss) * 100 : 0;
    const lossOffsetPct = parsedTargetLoss > 0 ? (netProtection / parsedTargetLoss) * 100 : 0;
    const uncoveredDamage = Math.max(0, parsedTargetLoss - netProtection);

    return {
      gross,
      net,
      netProtection,
      budgetPct,
      lossOffsetPct,
      oppositeLiquidity: oppositePool,
      uncoveredDamage,
    };
  }, [selectedMarket, protectionBudget, selectedIsYes, parsedTargetLoss]);

  const interpretation = useMemo(() => {
    if (estimate.lossOffsetPct >= 25) return copy.strongCoverage;
    if (estimate.lossOffsetPct >= 5) return copy.partialCoverage;
    return copy.thinMarket;
  }, [estimate.lossOffsetPct, copy]);

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <AppHeader section={copy.title} />

      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ marginBottom: 18, paddingLeft: 16, paddingRight: 16 }}>
          <h1
            style={{
              margin: '0 0 8px',
              fontFamily: fonts.display,
              fontSize: 30,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.08,
            }}
          >
            {copy.title}
          </h1>

          <p
            style={{
              margin: 0,
              fontFamily: fonts.sans,
              fontSize: 16,
              color: C.textSoft,
              lineHeight: 1.55,
            }}
          >
            {copy.subtitle}
          </p>
        </div>

        <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
          <Field label={copy.selectMarket} fonts={fonts} C={C}>
            {isLoading ? (
              <div style={mutedBox(C, fonts, R, neu)}>...</div>
            ) : liveMarkets.length === 0 ? (
              <div style={mutedBox(C, fonts, R, neu)}>{copy.noMarkets}</div>
            ) : (
              <select
                id="simulator-market"
                name="market"
                value={selectedMarket?.id.toString() ?? ''}
                onChange={(e) => setSelectedMarketId(e.target.value)}
                style={inputStyle(C, fonts, R)}
              >
                {liveMarkets.map((market) => (
                  <option key={market.id.toString()} value={market.id.toString()}>
                    {market.cityName} · {getMarketTypeLabel(market.marketTypeId, copy)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {selectedMarket ? (
          <>
            <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
              <div style={sectionTitle(fonts, C)}>{copy.marketQuestion}</div>

              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 20,
                  fontWeight: 700,
                  color: C.text,
                  lineHeight: 1.35,
                  marginBottom: 12,
                }}
              >
                {getQuestionText(selectedMarket, copy, system)}
              </div>

              <div
                style={{
                  ...neu.controlPressed,
                  borderRadius: R.lg,
                  padding: '12px 14px',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setRiskyOutcome('yes')}
                    aria-pressed={riskyOutcome === 'yes'}
                    style={segmentedBtn(C, fonts, R, riskyOutcome === 'yes')}
                  >
                    {copy.yes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskyOutcome('no')}
                    aria-pressed={riskyOutcome === 'no'}
                    style={segmentedBtn(C, fonts, R, riskyOutcome === 'no')}
                  >
                    {copy.no}
                  </button>
                </div>
              </div>

              <div style={{ ...neu.controlPressed, borderRadius: R.lg, padding: '12px 14px' }}>
                <Row
                  label={copy.tenYearAverage}
                  value={`${getDisplayThreshold(selectedMarket, system).value}${getDisplayThreshold(selectedMarket, system).unit}`}
                  fonts={fonts}
                  C={C}
                />
                <Row
                  label={copy.confidence}
                  value={copy[inferConfidenceKey(selectedMarket)]}
                  fonts={fonts}
                  C={C}
                />
                <Row
                  label={copy.currentPool}
                  value={formatLocal(selectedMarket.pool)}
                  fonts={fonts}
                  C={C}
                />
              </div>
            </div>

            <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
              <Field label={copy.targetLoss} fonts={fonts} C={C}>
                <input
                  id="simulator-target-loss"
                  name="target-loss"
                  value={targetLoss}
                  onChange={(e) => setTargetLoss(e.target.value)}
                  inputMode="decimal"
                  style={inputStyle(C, fonts, R)}
                />
              </Field>

              <div style={{ height: 14 }} />

              <Field label={copy.protectionBudget} fonts={fonts} C={C}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {(['2', '5', '10', 'custom'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setBudgetMode(option)}
                        aria-pressed={budgetMode === option}
                        style={{
                          ...neu.subtle,
                          border: 'none',
                          borderRadius: R.md,
                          minHeight: 48,
                          padding: '12px 10px',
                          background: budgetMode === option ? C.surfaceHigh : C.surface,
                          color: C.text,
                          fontFamily: fonts.sans,
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {option === 'custom' ? 'Custom' : `${option}%`}
                      </button>
                    ))}
                  </div>

                  {budgetMode === 'custom' ? (
                    <input
                      id="simulator-custom-budget"
                      name="custom-budget"
                      value={customBudget}
                      onChange={(e) => setCustomBudget(e.target.value)}
                      inputMode="decimal"
                      style={inputStyle(C, fonts, R)}
                    />
                  ) : null}

                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 14,
                      color: C.textSoft,
                      lineHeight: 1.5,
                    }}
                  >
                    {copy.budgetHint}
                  </div>
                </div>
              </Field>
            </div>

            <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
              <Row
                label={copy.protectionBudget}
                value={formatLocal(protectionBudget)}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.budgetPct}
                value={`${estimate.budgetPct.toFixed(1)}%`}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.estReturn}
                value={formatLocal(estimate.net)}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.estNetProtection}
                value={formatLocal(estimate.netProtection)}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.estLossOffset}
                value={`${estimate.lossOffsetPct.toFixed(1)}%`}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.oppositeLiquidity}
                value={formatLocal(estimate.oppositeLiquidity)}
                fonts={fonts}
                C={C}
              />
              <Row
                label={copy.uncoveredDamage}
                value={formatLocal(estimate.uncoveredDamage)}
                fonts={fonts}
                C={C}
              />
            </div>

            <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
              <div style={sectionTitle(fonts, C)}>{copy.interpretation}</div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  color: C.text,
                  lineHeight: 1.55,
                  marginBottom: 12,
                }}
              >
                {interpretation}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.textSoft,
                  lineHeight: 1.5,
                }}
              >
                {copy.growthHint}
              </div>
            </div>

            <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: 18, marginBottom: 16 }}>
              <div style={sectionTitle(fonts, C)}>{copy.protectionWorks}</div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  color: C.text,
                  lineHeight: 1.55,
                  marginBottom: 8,
                }}
              >
                {copy.protectionLine1}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.textSoft,
                  lineHeight: 1.5,
                }}
              >
                {copy.protectionLine2}
              </div>
            </div>

            <Link href={`/markets/${selectedMarket.id}`} style={primaryLink(C, fonts, R)}>
              {copy.openMarket}
            </Link>
          </>
        ) : null}
      </div>

      <BottomNav />
    </div>
  );
}

function Field({
  label,
  children,
  fonts,
  C,
}: {
  label: string;
  children: React.ReactNode;
  fonts: any;
  C: any;
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, fonts, C }: any) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 16,
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

function segmentedBtn(C: any, fonts: any, R: any, active: boolean): React.CSSProperties {
  return {
    border: 'none',
    borderRadius: R.md,
    minHeight: 48,
    padding: '15px 10px',
    background: active ? C.surfaceHigh : 'transparent',
    color: active ? C.text : C.textMutedStrong,
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function sectionTitle(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    color: C.textMutedStrong,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  };
}

function mutedBox(C: any, fonts: any, R: any, neu: any): React.CSSProperties {
  return {
    ...neu.controlPressed,
    borderRadius: R.lg,
    padding: '12px 14px',
    fontFamily: fonts.sans,
    fontSize: 14,
    color: C.textSoft,
  };
}

function primaryLink(C: any, fonts: any, R: any): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '17px 18px',
    borderRadius: R.lg,
    textAlign: 'center',
    textDecoration: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    boxShadow: `0 8px 24px ${C.dark}30, inset 0 1px 0 ${C.darkSoft}`,
  };
}
