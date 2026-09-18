// kalma/frontend/components/landing/LandingContent.tsx
//
// Localised body of the public landing page (`/`). The page itself
// (app/page.tsx) stays a server component: it fetches the signal
// teaser + place count, emits the WebSite + FAQPage JSON-LD (EN
// canonical — what crawlers cite), and hands the data to this client
// component.
//
// Why a client component for the visible copy:
//   - SSR still renders this in EN (useTranslation's initial state is
//     'en'), so GPTBot / ClaudeBot / Googlebot get the full English
//     body + FAQ in the first HTML payload. The SEO/GEO value the
//     landing was built for is preserved.
//   - After hydration, useTranslation reads the user's saved language
//     from localStorage and re-renders the copy in pt/es/fr/de/zh.
//
// The JSON-LD (FAQPage etc.) deliberately stays EN in the server
// component — structured data should be stable + canonical, not
// per-visitor.

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import KalmaMark from '@/components/design/KalmaMark';
import LandingNow from '@/components/landing/LandingNow';
import LandingPrefs from '@/components/landing/LandingPrefs';
import IntentLauncher from '@/components/landing/IntentLauncher';

// Loaded after hydration: the preview pulls the wagmi/viem/privy stack
// through useMarketsSnapshot, and a static import put all of it in the
// landing's critical path. It client-fetches and renders null when nothing
// is live, so deferring it costs no SSR content and no layout shift.
const LandingQuestionPreview = dynamic(
  () => import('@/components/landing/LandingQuestionPreview'),
  { ssr: false, loading: () => null },
);

const fontDisplay = "var(--font-display), 'Playfair Display', serif";
const fontMono = "var(--font-mono), 'JetBrains Mono', monospace";

export type LandingTeaser = {
  id: string;
  signalTypeId: string;
  severity: string;
  placeName: string;
  placeRegion: string | null;
  placeCountry: string | null;
  placeSlug: string;
};

type AudienceCard = { title: string; body: string };
type HowStep = { title: string; body: string };
type Faq = { q: string; a: string };
type PathStep = { label: string; body: string };

type LandingStrings = {
  eyebrowHero: string;
  heroTitle: string;
  heroSub: string;
  openKalma: string;
  seeSignals: string;
  pathTitle: string;
  pathSteps: PathStep[];
  testnetNote: string;
  battleNote: string;
  whoFor: string;
  audience: AudienceCard[];
  liveSignals: string;
  signalsHeadWithCount: (n: number) => string;
  signalsHeadNoCount: string;
  noSignals: string;
  seeAllSignals: string;
  howItWorks: string;
  howSteps: HowStep[];
  commonQuestions: string;
  faq: Faq[];
  footerData: string; // text before the Open-Meteo link
  footerData2: string; // text after the link
  socialFollow: string;
  navToday: string;
  navSignals: string;
  navCities: string;
  navProfile: string;
  signalLabels: Record<string, string>;
  severityLabels: Record<string, string>;
};

// ── Signal / severity labels per language (teaser display only) ─────────────

const SIGNAL_LABELS: Record<string, Record<string, string>> = {
  rainfall_risk_rising: {
    en: 'Heavy rainfall risk rising', pt: 'Risco de chuva forte subindo',
    es: 'Riesgo de lluvia fuerte en aumento', fr: 'Risque de forte pluie en hausse',
    de: 'Starkregen-Risiko steigt', zh: '强降雨风险上升',
  },
  heat_stress_window: {
    en: 'Heat stress window forming', pt: 'Janela de estresse térmico se formando',
    es: 'Ventana de estrés térmico formándose', fr: 'Fenêtre de stress thermique se forme',
    de: 'Hitzestress-Fenster bildet sich', zh: '热应激窗口正在形成',
  },
  water_recovery_signal: {
    en: 'Water recovery conditions improving', pt: 'Condições de recuperação hídrica melhorando',
    es: 'Condiciones de recuperación hídrica mejorando', fr: 'Conditions de récupération hydrique en amélioration',
    de: 'Wasserregeneration verbessert sich', zh: '水资源恢复条件改善',
  },
  consecutive_cold_below: {
    en: 'Prolonged cold spell ahead', pt: 'Período de frio prolongado à frente',
    es: 'Ola de frío prolongada por delante', fr: 'Vague de froid prolongée à venir',
    de: 'Anhaltende Kältewelle voraus', zh: '持续寒潮将至',
  },
  dry_stretch_window: {
    en: 'Dry stretch developing', pt: 'Estiagem se desenvolvendo',
    es: 'Sequía en desarrollo', fr: 'Période sèche en formation',
    de: 'Trockenphase entwickelt sich', zh: '干旱期正在形成',
  },
  frost_risk: {
    en: 'Frost risk this week', pt: 'Risco de geada esta semana',
    es: 'Riesgo de helada esta semana', fr: 'Risque de gel cette semaine',
    de: 'Frostrisiko diese Woche', zh: '本周有霜冻风险',
  },
  heavy_rain_event: {
    en: 'Heavy rain event likely', pt: 'Evento de chuva forte provável',
    es: 'Evento de lluvia fuerte probable', fr: 'Événement de pluie forte probable',
    de: 'Starkregen-Ereignis wahrscheinlich', zh: '可能出现强降雨事件',
  },
};

const SEVERITY_LABELS: Record<string, Record<string, string>> = {
  extreme: { en: 'Extreme', pt: 'Extremo', es: 'Extremo', fr: 'Extrême', de: 'Extrem', zh: '极端' },
  high: { en: 'High', pt: 'Alto', es: 'Alto', fr: 'Élevé', de: 'Hoch', zh: '高' },
  medium: { en: 'Medium', pt: 'Médio', es: 'Medio', fr: 'Moyen', de: 'Mittel', zh: '中' },
  low: { en: 'Low', pt: 'Baixo', es: 'Bajo', fr: 'Faible', de: 'Niedrig', zh: '低' },
  strong: { en: 'Strong', pt: 'Forte', es: 'Fuerte', fr: 'Fort', de: 'Stark', zh: '强' },
  active: { en: 'Active', pt: 'Ativo', es: 'Activo', fr: 'Actif', de: 'Aktiv', zh: '活跃' },
};

function pickLabels(map: Record<string, Record<string, string>>, language: string) {
  const out: Record<string, string> = {};
  for (const key of Object.keys(map)) {
    out[key] = map[key][language] ?? map[key].en;
  }
  return out;
}

// ── Section copy per language ───────────────────────────────────────────────

function landingCopy(language: string): LandingStrings {
  const table: Record<string, LandingStrings> = {
    en: {
      eyebrowHero: 'Weather intelligence for real decisions',
      heroTitle: "Not a forecast. What is unusual where you are.",
      heroSub:
        "Every signal comes with what is normal for that place, who it usually affects, and what people there are seeing in the field today.",
      openKalma: "Open today's dashboard",
      seeSignals: 'Browse live signals',
      pathTitle: 'Start with what already exists',
      pathSteps: [
        { label: 'Browse', body: 'Find live risk signals and see what places are already covered.' },
        { label: 'Answer the question', body: 'Act only when a threshold matters to you: answer Yes or No.' },
        { label: 'Create if missing', body: 'Add a new risk signal only when the place or weather window is not live yet.' },
      ],
      testnetNote: 'Base Sepolia testnet · throwaway test USDC',
      battleNote: 'Public battle-test is live: creators and responders climb the board through useful signals and real participation.',
      whoFor: 'Who Kalma is for',
      audience: [
        {
          title: 'Farmers and growers',
          body: 'Coffee, beans, soy, grapes. Track frost, dry stretches, and heat stress for your fields — and protect against losses when forecasts move against you.',
        },
        {
          title: 'Rural hospitality',
          body: 'Pousadas, agro-tourism, outdoor venues. Anticipate cold weekends, washouts, and tourism-disrupting weather windows.',
        },
        {
          title: 'Outdoor events & logistics',
          body: 'Construction, drainage, delivery routes, outdoor events. Re-plan before the weather forces it.',
        },
      ],
      liveSignals: 'Live signals',
      signalsHeadWithCount: (n) => `Signals from ${n}+ cities, updated daily`,
      signalsHeadNoCount: 'Signals updated daily',
      noSignals:
        'No active signals at this moment. New signals refresh every six hours via Open-Meteo data.',
      seeAllSignals: 'See all live signals →',
      howItWorks: 'How Kalma works',
      howSteps: [
        { title: 'Set your place.', body: 'Pick a city. Kalma surfaces the weather signals that matter most for that location.' },
        { title: 'Follow daily signals.', body: "Open-Meteo forecast data, compared against each place's 10-year historical baseline. Rainfall risk, heat stress, cold spells, frost, dry stretches." },
        { title: 'Answer Yes or No.', body: 'When a risk signal exists for a place you care about, answer it. The decision is simple: answer the weather question with Yes or No.' },
        { title: 'Claim if you were right.', body: 'When the observation window closes, the oracle reports the actual value. The correct side claims pro-rata.' },
      ],
      commonQuestions: 'Common questions',
      faq: EN_FAQ,
      footerData: 'Weather data from',
      footerData2: '. Currently on Base Sepolia testnet — all positions use test USDC.',
      socialFollow: 'Follow @kalmadotme',
      navToday: 'Today',
      navSignals: 'Signals',
      navCities: 'Cities',
      navProfile: 'Profile',
      signalLabels: pickLabels(SIGNAL_LABELS, 'en'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'en'),
    },
    pt: {
      eyebrowHero: 'Inteligência climática para decisões reais',
      heroTitle: "Não é previsão do tempo. É o que está fora do normal no seu lugar.",
      heroSub:
        "Cada sinal vem com o que é normal naquele lugar, quem ele costuma atingir e o que as pessoas de lá estão vendo no campo hoje.",
      openKalma: 'Abrir o painel de hoje',
      seeSignals: 'Explorar sinais ativos',
      pathTitle: 'Comece pelo que já existe',
      pathSteps: [
        { label: 'Explore', body: 'Encontre sinais de risco ativos e veja quais lugares já têm cobertura.' },
        { label: 'Responda a pergunta', body: 'Aja apenas quando um limite importar para você: responda Sim ou Não.' },
        { label: 'Crie se faltar', body: 'Adicione um novo sinal de risco só quando o lugar ou janela climática ainda não estiver ativo.' },
      ],
      testnetNote: 'Base Sepolia testnet · USDC de teste descartável',
      battleNote: 'Battle-test público ativo: criadores e respondentes sobem no ranking com sinais úteis e participação real.',
      whoFor: 'Para quem é a Kalma',
      audience: [
        {
          title: 'Agricultores e produtores',
          body: 'Café, feijão, soja, uva. Acompanhe geada, estiagem e estresse térmico para suas lavouras — e proteja-se de perdas quando a previsão virar contra você.',
        },
        {
          title: 'Hospitalidade rural',
          body: 'Pousadas, agroturismo, espaços ao ar livre. Antecipe fins de semana frios, temporais e janelas de clima que afastam turistas.',
        },
        {
          title: 'Eventos ao ar livre e logística',
          body: 'Construção, drenagem, rotas de entrega, eventos ao ar livre. Replaneje antes que o tempo force.',
        },
      ],
      liveSignals: 'Sinais ao vivo',
      signalsHeadWithCount: (n) => `Sinais de ${n}+ cidades, atualizados diariamente`,
      signalsHeadNoCount: 'Sinais atualizados diariamente',
      noSignals:
        'Nenhum sinal ativo neste momento. Novos sinais são atualizados a cada seis horas via dados do Open-Meteo.',
      seeAllSignals: 'Ver todos os sinais ao vivo →',
      howItWorks: 'Como a Kalma funciona',
      howSteps: [
        { title: 'Defina seu lugar.', body: 'Escolha uma cidade. A Kalma destaca os sinais climáticos que mais importam para aquele lugar.' },
        { title: 'Acompanhe os sinais diários.', body: 'Dados de previsão do Open-Meteo, comparados com a linha de base histórica de 10 anos de cada lugar. Risco de chuva, estresse térmico, frio, geada, estiagem.' },
        { title: 'Responda Sim ou Não.', body: 'Quando existe um sinal de risco para um lugar que importa para você, assuma uma posição. A decisão é simples: responder Sim ou Não para a pergunta climática.' },
        { title: 'Colete se acertou.', body: 'Quando a janela de observação fecha, o oráculo reporta o valor real. O lado correto coleta proporcionalmente.' },
      ],
      commonQuestions: 'Perguntas frequentes',
      faq: PT_FAQ,
      footerData: 'Dados climáticos do',
      footerData2: '. Atualmente na testnet Base Sepolia — todas as posições usam USDC de teste.',
      socialFollow: 'Siga @kalmadotme',
      navToday: 'Hoje',
      navSignals: 'Sinais',
      navCities: 'Cidades',
      navProfile: 'Perfil',
      signalLabels: pickLabels(SIGNAL_LABELS, 'pt'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'pt'),
    },
    es: {
      eyebrowHero: 'Inteligencia climática para decisiones reales',
      heroTitle: "No es el pronóstico. Es lo que está fuera de lo normal en tu lugar.",
      heroSub:
        "Cada señal viene con lo que es normal en ese lugar, a quién suele afectar y lo que la gente de allí está viendo en el campo hoy.",
      openKalma: 'Abrir el panel de hoy',
      seeSignals: 'Explorar señales activas',
      pathTitle: 'Empieza con lo que ya existe',
      pathSteps: [
        { label: 'Explora', body: 'Encuentra señales de riesgo activas y mira qué lugares ya tienen cobertura.' },
        { label: 'Responde la pregunta', body: 'Actúa solo cuando un umbral importa para ti: responde Sí o No.' },
        { label: 'Crea si falta', body: 'Añade una nueva señal de riesgo solo cuando el lugar o la ventana climática aún no está activa.' },
      ],
      testnetNote: 'Base Sepolia testnet · USDC de prueba desechable',
      battleNote: 'Battle-test público activo: creadores y respondedores suben en la tabla con señales útiles y participación real.',
      whoFor: 'Para quién es Kalma',
      audience: [
        {
          title: 'Agricultores y productores',
          body: 'Café, frijoles, soja, uva. Sigue heladas, sequías y estrés térmico para tus campos — y protégete de pérdidas cuando el pronóstico se vuelve en tu contra.',
        },
        {
          title: 'Hospitalidad rural',
          body: 'Posadas, agroturismo, espacios al aire libre. Anticipa fines de semana fríos, lluvias y ventanas de clima que ahuyentan al turismo.',
        },
        {
          title: 'Eventos al aire libre y logística',
          body: 'Construcción, drenaje, rutas de entrega, eventos al aire libre. Replanifica antes de que el clima te obligue.',
        },
      ],
      liveSignals: 'Señales en vivo',
      signalsHeadWithCount: (n) => `Señales de ${n}+ ciudades, actualizadas a diario`,
      signalsHeadNoCount: 'Señales actualizadas a diario',
      noSignals:
        'No hay señales activas en este momento. Las nuevas señales se actualizan cada seis horas con datos de Open-Meteo.',
      seeAllSignals: 'Ver todas las señales en vivo →',
      howItWorks: 'Cómo funciona Kalma',
      howSteps: [
        { title: 'Define tu lugar.', body: 'Elige una ciudad. Kalma destaca las señales climáticas que más importan para ese lugar.' },
        { title: 'Sigue las señales diarias.', body: 'Datos de pronóstico de Open-Meteo, comparados con la línea base histórica de 10 años de cada lugar. Riesgo de lluvia, estrés térmico, olas de frío, heladas, sequías.' },
        { title: 'Responde Sí o No.', body: 'Cuando existe una señal de riesgo para un lugar que te importa, toma una posición. La decisión es simple: responder Sí o No a la pregunta climática.' },
        { title: 'Cobra si acertaste.', body: 'Cuando la ventana de observación cierra, el oráculo reporta el valor real. El lado correcto cobra de forma proporcional.' },
      ],
      commonQuestions: 'Preguntas frecuentes',
      faq: ES_FAQ,
      footerData: 'Datos climáticos de',
      footerData2: '. Actualmente en la testnet Base Sepolia — todas las posiciones usan USDC de prueba.',
      socialFollow: 'Sigue a @kalmadotme',
      navToday: 'Hoy',
      navSignals: 'Señales',
      navCities: 'Ciudades',
      navProfile: 'Perfil',
      signalLabels: pickLabels(SIGNAL_LABELS, 'es'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'es'),
    },
    fr: {
      eyebrowHero: 'Intelligence météo pour des décisions réelles',
      heroTitle: "Pas une prévision. Ce qui sort de l'ordinaire là où tu es.",
      heroSub:
        "Chaque signal arrive avec ce qui est normal pour ce lieu, qui il touche d'habitude et ce que les gens sur place voient sur le terrain aujourd'hui.",
      openKalma: "Ouvrir le tableau d'aujourd'hui",
      seeSignals: 'Explorer les signaux actifs',
      pathTitle: 'Commence par ce qui existe déjà',
      pathSteps: [
        { label: 'Explore', body: 'Trouve les signaux de risque actifs et vois quels lieux sont déjà couverts.' },
        { label: 'Réponds à la question', body: 'Agis seulement quand un seuil compte pour toi : réponds Oui ou Non.' },
        { label: 'Crée si absent', body: 'Ajoute un nouveau signal de risque seulement si le lieu ou la fenêtre météo manque encore.' },
      ],
      testnetNote: 'Base Sepolia testnet · USDC de test jetable',
      battleNote: 'Battle-test public actif : créateurs et répondeurs montent au classement grâce aux signaux utiles et à la participation réelle.',
      whoFor: 'À qui s’adresse Kalma',
      audience: [
        {
          title: 'Agriculteurs et producteurs',
          body: 'Café, haricots, soja, vignes. Suis le gel, les sécheresses et le stress thermique pour tes champs — et protège-toi des pertes quand les prévisions tournent contre toi.',
        },
        {
          title: 'Hospitalité rurale',
          body: 'Gîtes, agrotourisme, lieux en plein air. Anticipe les week-ends froids, les averses et les fenêtres météo qui font fuir le tourisme.',
        },
        {
          title: 'Événements en plein air et logistique',
          body: 'Construction, drainage, tournées de livraison, événements en plein air. Replanifie avant que la météo ne t’y oblige.',
        },
      ],
      liveSignals: 'Signaux en direct',
      signalsHeadWithCount: (n) => `Signaux de ${n}+ villes, mis à jour chaque jour`,
      signalsHeadNoCount: 'Signaux mis à jour chaque jour',
      noSignals:
        'Aucun signal actif pour le moment. Les nouveaux signaux se rafraîchissent toutes les six heures via les données Open-Meteo.',
      seeAllSignals: 'Voir tous les signaux en direct →',
      howItWorks: 'Comment fonctionne Kalma',
      howSteps: [
        { title: 'Définis ton lieu.', body: 'Choisis une ville. Kalma fait remonter les signaux météo qui comptent le plus pour ce lieu.' },
        { title: 'Suis les signaux quotidiens.', body: "Données de prévision Open-Meteo, comparées à la référence historique sur 10 ans de chaque lieu. Risque de pluie, stress thermique, vagues de froid, gel, sécheresses." },
        { title: 'Réponds Oui ou Non.', body: "Quand un signal de risque existe pour un lieu qui t'importe, prends une position. La décision est simple : répondre Oui ou Non à la question météo." },
        { title: 'Réclame si tu avais raison.', body: "Quand la fenêtre d'observation se ferme, l'oracle rapporte la valeur réelle. Le bon côté réclame au prorata." },
      ],
      commonQuestions: 'Questions fréquentes',
      faq: FR_FAQ,
      footerData: 'Données météo de',
      footerData2: '. Actuellement sur le testnet Base Sepolia — toutes les positions utilisent du USDC de test.',
      socialFollow: 'Suivre @kalmadotme',
      navToday: "Aujourd'hui",
      navSignals: 'Signaux',
      navCities: 'Villes',
      navProfile: 'Profil',
      signalLabels: pickLabels(SIGNAL_LABELS, 'fr'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'fr'),
    },
    de: {
      eyebrowHero: 'Wetterkompetenz für echte Entscheidungen',
      heroTitle: "Keine Wettervorhersage. Was an deinem Ort ungewöhnlich ist.",
      heroSub:
        "Jedes Signal kommt mit dem, was an diesem Ort normal ist, wen es üblicherweise trifft und was die Menschen dort heute im Feld sehen.",
      openKalma: 'Heutiges Dashboard öffnen',
      seeSignals: 'Live-Signale ansehen',
      pathTitle: 'Beginne mit dem, was schon existiert',
      pathSteps: [
        { label: 'Ansehen', body: 'Finde aktive Risiko-Signale und sieh, welche Orte schon abgedeckt sind.' },
        { label: 'Frage beantworten', body: 'Handle nur, wenn eine Schwelle für dich zählt: antworte mit Ja oder Nein.' },
        { label: 'Erstellen, wenn es fehlt', body: 'Füge ein neues Risiko-Signal nur hinzu, wenn Ort oder Wetterfenster noch nicht live sind.' },
      ],
      testnetNote: 'Base Sepolia-Testnet · wegwerfbares Test-USDC',
      battleNote: 'Öffentlicher Battle-Test ist live: Ersteller und Antwortende steigen mit nützlichen Signalen und echter Teilnahme im Ranking.',
      whoFor: 'Für wen Kalma ist',
      audience: [
        {
          title: 'Landwirt:innen und Erzeuger:innen',
          body: 'Kaffee, Bohnen, Soja, Trauben. Verfolge Frost, Trockenphasen und Hitzestress für deine Felder — und schütze dich vor Verlusten, wenn die Prognose gegen dich läuft.',
        },
        {
          title: 'Ländliche Gastronomie & Unterkünfte',
          body: 'Pensionen, Agrotourismus, Outdoor-Locations. Antizipiere kalte Wochenenden, Regenfälle und tourismusstörende Wetterfenster.',
        },
        {
          title: 'Outdoor-Events & Logistik',
          body: 'Bau, Entwässerung, Lieferrouten, Outdoor-Events. Plane neu, bevor das Wetter dich dazu zwingt.',
        },
      ],
      liveSignals: 'Live-Signale',
      signalsHeadWithCount: (n) => `Signale aus ${n}+ Städten, täglich aktualisiert`,
      signalsHeadNoCount: 'Signale täglich aktualisiert',
      noSignals:
        'Derzeit keine aktiven Signale. Neue Signale werden alle sechs Stunden über Open-Meteo-Daten aktualisiert.',
      seeAllSignals: 'Alle Live-Signale ansehen →',
      howItWorks: 'So funktioniert Kalma',
      howSteps: [
        { title: 'Lege deinen Ort fest.', body: 'Wähle eine Stadt. Kalma zeigt die Wettersignale, die für diesen Ort am wichtigsten sind.' },
        { title: 'Verfolge tägliche Signale.', body: 'Open-Meteo-Prognosedaten, verglichen mit der 10-Jahres-Baseline jedes Orts. Regenrisiko, Hitzestress, Kältewellen, Frost, Trockenphasen.' },
        { title: 'Antworte mit Ja oder Nein.', body: 'Wenn ein Risiko-Signal für einen Ort existiert, der dich betrifft, beziehe Position. Die Entscheidung ist einfach: die Wetterfrage mit Ja oder Nein beantworten.' },
        { title: 'Hole ab, wenn du richtig lagst.', body: 'Wenn das Beobachtungsfenster schließt, meldet das Orakel den echten Wert. Die richtige Seite holt anteilig ab.' },
      ],
      commonQuestions: 'Häufige Fragen',
      faq: DE_FAQ,
      footerData: 'Wetterdaten von',
      footerData2: '. Derzeit im Base Sepolia-Testnet — alle Positionen nutzen Test-USDC.',
      socialFollow: '@kalmadotme folgen',
      navToday: 'Heute',
      navSignals: 'Signale',
      navCities: 'Städte',
      navProfile: 'Profil',
      signalLabels: pickLabels(SIGNAL_LABELS, 'de'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'de'),
    },
    zh: {
      eyebrowHero: '面向真实决策的天气智能',
      heroTitle: "不是天气预报。是你所在地的异常。",
      heroSub:
        "每条信号都会附上：这个地方的常态、它通常会影响谁，以及当地的人今天在现场看到了什么。",
      openKalma: '打开今日面板',
      seeSignals: '浏览实时信号',
      pathTitle: '先从已有内容开始',
      pathSteps: [
        { label: '浏览', body: '找到实时风险信号，看看哪些地点已经有覆盖。' },
        { label: '回答问题', body: '只有当阈值与你有关时再行动：回答“是”或“否”。' },
        { label: '缺失时创建', body: '只有当地点或天气窗口还未上线时，才添加新的风险信号。' },
      ],
      testnetNote: 'Base Sepolia 测试网 · 可丢弃的测试 USDC',
      battleNote: '公开 battle-test 已上线：创建者和回应者通过有用信号与真实参与提升排名。',
      whoFor: 'Kalma 适合谁',
      audience: [
        {
          title: '农户与种植者',
          body: '咖啡、豆类、大豆、葡萄。为你的田地追踪霜冻、干旱和热应激 — 当预报对你不利时保护自己免受损失。',
        },
        {
          title: '乡村住宿与接待',
          body: '民宿、农业旅游、户外场地。提前预判寒冷的周末、暴雨以及打乱旅游的天气窗口。',
        },
        {
          title: '户外活动与物流',
          body: '施工、排水、配送路线、户外活动。在天气逼你之前重新规划。',
        },
      ],
      liveSignals: '实时信号',
      signalsHeadWithCount: (n) => `来自 ${n}+ 个城市的信号，每日更新`,
      signalsHeadNoCount: '信号每日更新',
      noSignals: '此刻没有活跃信号。新信号每六小时通过 Open-Meteo 数据刷新一次。',
      seeAllSignals: '查看所有实时信号 →',
      howItWorks: 'Kalma 如何运作',
      howSteps: [
        { title: '设置你的地点。', body: '选择一个城市。Kalma 会呈现对该地点最重要的天气信号。' },
        { title: '关注每日信号。', body: 'Open-Meteo 预报数据，与每个地点的 10 年历史基线对比。降雨风险、热应激、寒潮、霜冻、干旱。' },
        { title: '回答“是”或“否”。', body: '当你关心的地点存在风险信号时，建立一个仓位。决策很简单：用“是”或“否”回答这个天气问题。' },
        { title: '判断正确就领取。', body: '当观测窗口关闭时，预言机报告实际值。正确的一方按比例领取。' },
      ],
      commonQuestions: '常见问题',
      faq: ZH_FAQ,
      footerData: '天气数据来自',
      footerData2: '。当前运行在 Base Sepolia 测试网 — 所有仓位使用测试 USDC。',
      socialFollow: '关注 @kalmadotme',
      navToday: '今天',
      navSignals: '信号',
      navCities: '城市',
      navProfile: '我的',
      signalLabels: pickLabels(SIGNAL_LABELS, 'zh'),
      severityLabels: pickLabels(SEVERITY_LABELS, 'zh'),
    },
  };
  return table[language] ?? table.en;
}

// ── FAQ per language ────────────────────────────────────────────────────────
// Kept module-level so landingCopy stays readable. EN_FAQ mirrors the
// EN FAQ in app/page.tsx that drives the JSON-LD (keep them in sync).

const EN_FAQ: Faq[] = [
  { q: 'What is Kalma?', a: 'Kalma is a local weather signal network. It surfaces daily weather signals — rainfall risk, heat stress, cold spells, drought stretches, frost risk — for cities around the world. People exposed to weather can follow signals for their place and answer local weather questions with Yes or No to protect what they have built.' },
  { q: 'Who is Kalma for?', a: 'Farmers and growers (coffee, beans, soy, grapes), rural hospitality operators, outdoor event organizers, logistics operators, construction sites, and local communities exposed to weather risk.' },
  { q: 'Is Kalma a gambling product?', a: 'No. Kalma surfaces weather-derived risk signals as its primary product. Yes/No positions are a secondary mechanism that lets users hedge against the conditions they observe. There is no roulette and no sports betting — only weather thresholds resolved against actual weather data.' },
  { q: 'Where does Kalma get its weather data?', a: 'Open-Meteo (open-meteo.com) — both the live forecast API and the 10-year historical archive. Every signal cites Open-Meteo as its source. Future versions will integrate higher-resolution data sources.' },
  { q: 'How are signals computed?', a: "For each place and signal type, the engine compares the forecast with what that place normally sees for the same time of year. Triggers fire when the forecast is meaningfully unusual — for example, much heavier rain than the local wettest day pattern, or several forecast days with minimum temperature below a user-set value." },
  { q: 'What cities does Kalma cover?', a: 'Currently 50+ signal cities across 6 continents, with new places added as users create city signals. Coverage includes São Paulo, Lavras (MG, Brazil), London, Mexico City, Lagos, Mumbai, Tokyo, Auckland, and more.' },
  { q: 'Is Kalma live on mainnet?', a: 'No. Kalma is currently on the Base Sepolia testnet (chain id 6343). All funds are throwaway test USDC. Mainnet launch follows public testnet validation.' },
];

const PT_FAQ: Faq[] = [
  { q: 'O que é a Kalma?', a: 'A Kalma é uma rede de sinais climáticos locais. Ela destaca sinais climáticos diários — risco de chuva, estresse térmico, frio, estiagem, geada — para cidades no mundo todo. Pessoas expostas ao clima podem acompanhar sinais do seu lugar e responder perguntas climáticas com Sim ou Não para proteger o que construíram.' },
  { q: 'Para quem é a Kalma?', a: 'Agricultores e produtores (café, feijão, soja, uva), operadores de hospitalidade rural, organizadores de eventos ao ar livre, operadores de logística, canteiros de obra e comunidades locais expostas ao risco climático.' },
  { q: 'A Kalma é um produto de aposta?', a: 'Não. A Kalma destaca sinais de risco derivados do clima como seu produto principal. As posições de Sim/Não são um mecanismo secundário que permite às pessoas se protegerem das condições que observam. Não há roleta, apostas esportivas nem prêmios no sentido de jogo — apenas limites climáticos resolvidos contra dados reais.' },
  { q: 'De onde a Kalma tira os dados climáticos?', a: 'Open-Meteo (open-meteo.com) — tanto a API de previsão ao vivo quanto o arquivo histórico de 10 anos. Cada sinal cita o Open-Meteo como fonte. Versões futuras integrarão fontes de dados de maior resolução.' },
  { q: 'Como os sinais são calculados?', a: 'Para cada lugar e tipo de sinal, o motor compara a previsão com o que esse lugar normalmente vê na mesma época do ano. Os gatilhos disparam quando a previsão fica claramente fora do comum — por exemplo, chuva muito mais forte que o padrão dos dias mais chuvosos do lugar, ou vários dias previstos com temperatura mínima abaixo de um valor definido pelo usuário.' },
  { q: 'Quais cidades a Kalma cobre?', a: 'Atualmente 50+ cidades-sinal em 6 continentes, com novos lugares adicionados conforme usuários criam sinais de cidade. A cobertura inclui São Paulo, Lavras (MG, Brasil), Londres, Cidade do México, Lagos, Mumbai, Tóquio, Auckland e mais.' },
  { q: 'A Kalma está na mainnet?', a: 'Não. A Kalma está atualmente na testnet Base Sepolia (chain id 6343). Todos os fundos são USDC de teste descartáveis. O lançamento na mainnet ocorre após a validação na testnet pública.' },
];

const ES_FAQ: Faq[] = [
  { q: '¿Qué es Kalma?', a: 'Kalma es una red de señales climáticas locales. Destaca señales climáticas diarias — riesgo de lluvia, estrés térmico, olas de frío, sequías, heladas — para ciudades de todo el mundo. Las personas expuestas al clima pueden seguir señales de su lugar y responder preguntas climáticas con Sí o No para proteger lo que han construido.' },
  { q: '¿Para quién es Kalma?', a: 'Agricultores y productores (café, frijoles, soja, uva), operadores de hospitalidad rural, organizadores de eventos al aire libre, operadores de logística, obras de construcción y comunidades locales expuestas al riesgo climático.' },
  { q: '¿Kalma es un producto de apuestas?', a: 'No. Kalma destaca señales de riesgo derivadas del clima como su producto principal. Las posiciones de Sí/No son un mecanismo secundario que permite a las personas cubrirse de las condiciones que observan. No hay ruleta, apuestas deportivas ni premios en el sentido del juego — solo umbrales climáticos resueltos contra datos reales.' },
  { q: '¿De dónde obtiene Kalma sus datos climáticos?', a: 'Open-Meteo (open-meteo.com) — tanto la API de pronóstico en vivo como el archivo histórico de 10 años. Cada señal cita a Open-Meteo como fuente. Las versiones futuras integrarán fuentes de datos de mayor resolución.' },
  { q: '¿Cómo se calculan las señales?', a: 'Para cada lugar y tipo de señal, el motor compara el pronóstico con lo que ese lugar normalmente ve en la misma época del año. Los disparadores se activan cuando el pronóstico es claramente inusual — por ejemplo, lluvia mucho más fuerte que el patrón de los días más lluviosos del lugar, o varios días pronosticados con temperatura mínima por debajo de un valor definido por el usuario.' },
  { q: '¿Qué ciudades cubre Kalma?', a: 'Actualmente 50+ ciudades-señal en 6 continentes, con nuevos lugares añadidos conforme los usuarios crean señales de ciudad. La cobertura incluye São Paulo, Lavras (MG, Brasil), Londres, Ciudad de México, Lagos, Mumbai, Tokio, Auckland y más.' },
  { q: '¿Kalma está en mainnet?', a: 'No. Kalma está actualmente en la testnet Base Sepolia (chain id 6343). Todos los fondos son USDC de prueba desechables. El lanzamiento en mainnet sigue a la validación en la testnet pública.' },
];

const FR_FAQ: Faq[] = [
  { q: "Qu'est-ce que Kalma ?", a: "Kalma est un réseau de signaux météo locaux. Il fait remonter des signaux météo quotidiens — risque de pluie, stress thermique, vagues de froid, sécheresses, gel — pour des villes du monde entier. Les personnes exposées à la météo peuvent suivre les signaux de leur lieu et répondre Oui ou Non à des questions météo pour protéger ce qu'elles ont bâti." },
  { q: 'À qui s’adresse Kalma ?', a: 'Agriculteurs et producteurs (café, haricots, soja, vignes), opérateurs d’hospitalité rurale, organisateurs d’événements en plein air, opérateurs logistiques, chantiers et communautés locales exposées au risque météo.' },
  { q: 'Kalma est-il un produit de jeu d’argent ?', a: "Non. Kalma fait remonter des signaux de risque dérivés de la météo comme produit principal. Les positions Oui/Non sont un mécanisme secondaire qui permet de se couvrir contre les conditions observées. Pas de roulette et pas de paris sportifs — seulement des seuils météo résolus contre des données réelles." },
  { q: 'D’où Kalma tire-t-il ses données météo ?', a: "Open-Meteo (open-meteo.com) — à la fois l'API de prévision en direct et l'archive historique de 10 ans. Chaque signal cite Open-Meteo comme source. Les versions futures intégreront des sources de données à plus haute résolution." },
  { q: 'Comment les signaux sont-ils calculés ?', a: "Pour chaque lieu et type de signal, le moteur compare la prévision avec ce que ce lieu observe normalement à la même période de l'année. Les déclencheurs se déclenchent quand la prévision devient clairement inhabituelle — par exemple, une pluie bien plus forte que le schéma des journées les plus pluvieuses du lieu, ou plusieurs jours prévus avec une température minimale sous une valeur définie par l'utilisateur." },
  { q: 'Quelles villes Kalma couvre-t-il ?', a: 'Actuellement 50+ villes-signal sur 6 continents, avec de nouveaux lieux ajoutés à mesure que les utilisateurs créent des signaux de ville. La couverture inclut São Paulo, Lavras (MG, Brésil), Londres, Mexico, Lagos, Mumbai, Tokyo, Auckland et plus.' },
  { q: 'Kalma est-il en ligne sur le mainnet ?', a: 'Non. Kalma est actuellement sur le testnet Base Sepolia (chain id 6343). Tous les fonds sont du USDC de test jetable. Le lancement mainnet suit la validation sur testnet public.' },
];

const DE_FAQ: Faq[] = [
  { q: 'Was ist Kalma?', a: 'Kalma ist ein lokales Wettersignal-Netzwerk. Es zeigt tägliche Wettersignale — Regenrisiko, Hitzestress, Kältewellen, Trockenphasen, Frostrisiko — für Städte weltweit. Wetter-exponierte Menschen können Signale für ihren Ort verfolgen und Über/Unter-Positionen eröffnen, um zu schützen, was sie aufgebaut haben.' },
  { q: 'Für wen ist Kalma?', a: 'Landwirt:innen und Erzeuger:innen (Kaffee, Bohnen, Soja, Trauben), ländliche Gastgewerbe-Betriebe, Outdoor-Event-Veranstalter, Logistikbetriebe, Baustellen und lokale Gemeinschaften, die dem Wetterrisiko ausgesetzt sind.' },
  { q: 'Ist Kalma ein Glücksspielprodukt?', a: 'Nein. Kalma zeigt wetterbasierte Risikosignale als Hauptprodukt. Über/Unter-Positionen sind ein sekundärer Mechanismus, mit dem sich Nutzer:innen gegen die beobachteten Bedingungen absichern. Kein Roulette, keine Sportwetten, keine Gewinne im Glücksspielsinn — nur Wetterschwellen, die gegen echte Wetterdaten aufgelöst werden.' },
  { q: 'Woher bezieht Kalma seine Wetterdaten?', a: 'Open-Meteo (open-meteo.com) — sowohl die Live-Prognose-API als auch das 10-Jahres-Archiv. Jedes Signal nennt Open-Meteo als Quelle. Künftige Versionen integrieren hochauflösendere Datenquellen.' },
  { q: 'Wie werden Signale berechnet?', a: 'Für jeden Ort und Signaltyp vergleicht die Engine die Prognose mit dem, was dieser Ort zur gleichen Jahreszeit normalerweise erlebt. Auslöser feuern, wenn die Prognose klar ungewöhnlich ist — zum Beispiel deutlich stärkerer Regen als das Muster der nassesten Tage vor Ort oder mehrere Prognosetage mit Mindesttemperatur unter einem nutzerdefinierten Wert.' },
  { q: 'Welche Städte deckt Kalma ab?', a: 'Derzeit 50+ Signal-Städte auf 6 Kontinenten, neue Orte kommen hinzu, wenn Nutzer:innen Stadt-Signale erstellen. Abgedeckt sind u. a. São Paulo, Lavras (MG, Brasilien), London, Mexiko-Stadt, Lagos, Mumbai, Tokio, Auckland und mehr.' },
  { q: 'Ist Kalma im Mainnet live?', a: 'Nein. Kalma ist derzeit im Base Sepolia-Testnet (chain id 6343). Alle Mittel sind wegwerfbares Test-USDC. Der Mainnet-Start folgt nach der öffentlichen Testnet-Validierung.' },
];

const ZH_FAQ: Faq[] = [
  { q: 'Kalma 是什么？', a: 'Kalma 是一个本地天气信号网络。它为世界各地的城市呈现每日天气信号 — 降雨风险、热应激、寒潮、干旱、霜冻。受天气影响的人可以关注所在地点的信号，并用“是/否”回答本地天气问题来保护他们所建立的一切。' },
  { q: 'Kalma 适合谁？', a: '农户与种植者（咖啡、豆类、大豆、葡萄）、乡村接待业经营者、户外活动组织者、物流运营商、施工现场，以及受天气风险影响的本地社区。' },
  { q: 'Kalma 是赌博产品吗？', a: '不是。Kalma 的核心产品是天气衍生的风险信号。“是/否”仓位是一个次要机制，让用户对所观察到的天气条件进行对冲。没有轮盘、没有体育博彩、没有赌博意义上的奖金 — 只有根据真实天气数据结算的天气阈值。' },
  { q: 'Kalma 的天气数据从哪里来？', a: 'Open-Meteo（open-meteo.com）— 既有实时预报 API，也有 10 年历史档案。每个信号都注明 Open-Meteo 为来源。未来版本将整合更高分辨率的数据源。' },
  { q: '信号是如何计算的？', a: '对于每个地点和信号类型，引擎会把预报与该地点在同一时节通常出现的天气进行比较。当预报明显异常时触发 — 例如，降雨远强于当地最湿日的常见模式，或连续多天预报最低气温低于用户设定值。' },
  { q: 'Kalma 覆盖哪些城市？', a: '目前覆盖 6 大洲 50+ 个信号城市，并随着用户为地点创建风险信号而增加新地点。覆盖范围包括圣保罗、拉夫拉斯（巴西米纳斯吉拉斯）、伦敦、墨西哥城、拉各斯、孟买、东京、奥克兰等。' },
  { q: 'Kalma 已在主网上线了吗？', a: '还没有。Kalma 目前运行在 Base Sepolia 测试网（chain id 6343）。所有资金都是可丢弃的测试 USDC。主网上线将在公开测试网验证之后进行。' },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function LandingContent({
  teasers,
  activePlaceCount,
  activeSignalCount,
  activeAlertCount,
  globalLead,
}: {
  teasers: LandingTeaser[];
  activePlaceCount: number;
  activeSignalCount: number;
  activeAlertCount: number;
  globalLead: {
    signalTypeId: string;
    severity: string;
    placeName: string;
    placeSlug: string;
    structuredData: Record<string, unknown> | null;
  } | null;
}) {
  const { language } = useTranslation();
  const copy = landingCopy(language);

  const eyebrowStyle: React.CSSProperties = {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: 12,
  };

  const sectionHeadStyle: React.CSSProperties = {
    fontFamily: fontDisplay,
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.2,
    margin: '0 0 12px',
    letterSpacing: '-0.01em',
  };

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 20px 96px',
        color: 'var(--k-text)',
        lineHeight: 1.55,
      }}
    >
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        {/* Wordmark left, preferences right. The landing is the only route
            that does not mount AppHeader (it would draw a second Kalma mark
            and a nav that competes with the one primary action), so theme and
            language live here instead, sharing the app's own hooks. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 26,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <KalmaMark size={44} />
            <span
              style={{
                fontFamily: fontDisplay,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              Kalma
            </span>
          </div>
          <LandingPrefs />
        </div>

        <div style={eyebrowStyle}>{copy.eyebrowHero}</div>
        <h1
          style={{
            fontFamily: fontDisplay,
            fontSize: 'clamp(26px, 4.4vw, 40px)',
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            margin: '0 0 20px',
            maxWidth: '17ch',
            textWrap: 'balance' as const,
          }}
        >
          {copy.heroTitle}
        </h1>

      {/* ── LIVE NOW — the first thing on the page ────────────────────
            Show, then ask. This block replaced a six-line serif promise as the
            opening move: the visitor now meets a real place, a real signal,
            and the deviation behind it before any explanation of the method.
            See LandingNow for the full reasoning. */}
      <LandingNow
        activeSignalCount={activeSignalCount}
        activePlaceCount={activePlaceCount}
        activeAlertCount={activeAlertCount}
        globalLead={globalLead}
      />

        <p className="k-measure"
          style={{ fontSize: 15, opacity: 0.85, margin: '18px 0 24px' }}>{copy.heroSub}</p>


      </section>

      {/* ── INTENT LAUNCHER — pick your city; the immediate action. The old
            "start path" explainer was deleted: if the home needs an instruction
            list, the UX failed. The launcher + live signals teach by doing. ── */}
      <IntentLauncher />

      {/* Revamp-5: a real, answerable live question right under the launcher —
          guests see the core loop before any explanation. Renders nothing when
          nothing is live. */}
      <LandingQuestionPreview />

      {/* Testnet + battle-test context — a slim line, not an instruction block. */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 8 }}>
        <span style={statusPill}>{copy.testnetNote}</span>
        <span style={statusPill}>{copy.battleNote}</span>
      </section>

      {/* ── SECONDARY ENTRY POINTS ────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/today" style={secondaryLink}>
            {copy.openKalma}
          </Link>
          <Link href="/signals" style={secondaryLink}>
            {copy.seeSignals}
          </Link>
        </div>
      </section>

      {/* ── WHO IT IS FOR ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={eyebrowStyle}>{copy.whoFor}</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {copy.audience.map((item) => (
            <li
              key={item.title}
              style={{
                padding: '16px 0',
                borderTop: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 14, opacity: 0.85 }}>{item.body}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── LIVE SIGNALS TEASER ───────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={eyebrowStyle}>{copy.liveSignals}</div>
        <h2 style={sectionHeadStyle}>
          {activePlaceCount > 0
            ? copy.signalsHeadWithCount(activePlaceCount)
            : copy.signalsHeadNoCount}
        </h2>
        {teasers.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.7 }}>{copy.noSignals}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {teasers.map((t) => (
              <li
                key={t.id}
                style={{
                  padding: '12px 14px',
                  marginBottom: 8,
                  borderRadius: 12,
                  background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--k-text) 10%, transparent)',
                }}
              >
                <div
                  style={{
                    fontFamily: fontMono,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    opacity: 0.7,
                    marginBottom: 4,
                  }}
                >
                  {copy.severityLabels[t.severity] ?? t.severity} · {t.placeName}
                  {t.placeRegion ? `, ${t.placeRegion}` : ''}
                  {t.placeCountry ? `, ${t.placeCountry}` : ''}
                </div>
                <Link
                  href={`/places/${t.placeSlug}`}
                  style={{ fontSize: 15, fontWeight: 600, color: 'var(--k-text)', textDecoration: 'none' }}
                >
                  {copy.signalLabels[t.signalTypeId] ?? t.signalTypeId}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/signals"
          style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--k-text)', opacity: 0.85 }}
        >
          {copy.seeAllSignals}
        </Link>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={eyebrowStyle}>{copy.howItWorks}</div>
        <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          {copy.howSteps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong> {step.body}
            </li>
          ))}
        </ol>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={eyebrowStyle}>{copy.commonQuestions}</div>
        {copy.faq.map((item) => (
          <div
            key={item.q}
            style={{
              padding: '14px 0',
              borderTop: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{item.q}</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>{item.a}</div>
          </div>
        ))}
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer
        style={{
          paddingTop: 24,
          marginTop: 16,
          borderTop: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
          fontSize: 13,
          opacity: 0.7,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          {copy.footerData}{' '}
          <a href="https://open-meteo.com" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Open-Meteo
          </a>
          {copy.footerData2}
        </div>
        <div style={{ marginBottom: 6 }}>
          {copy.socialFollow}{' '}
          <a href="https://x.com/kalmadotme" style={{ color: 'inherit', marginLeft: 8 }}>
            X
          </a>
          <a href="https://www.instagram.com/kalmadotme/" style={{ color: 'inherit', marginLeft: 12 }}>
            Instagram
          </a>
        </div>
        <div>
          <Link href="/today" style={{ color: 'inherit', marginRight: 14 }}>
            {copy.navToday}
          </Link>
          <Link href="/signals" style={{ color: 'inherit', marginRight: 14 }}>
            {copy.navSignals}
          </Link>
          <Link href="/markets" style={{ color: 'inherit', marginRight: 14 }}>
            {copy.navCities}
          </Link>
          <Link href="/profile" style={{ color: 'inherit' }}>
            {copy.navProfile}
          </Link>
        </div>
      </footer>
    </main>
  );
}

const secondaryLink: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--k-text)',
  textDecoration: 'none',
  padding: '12px 18px',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 13,
  border: '1px solid color-mix(in srgb, var(--k-text) 22%, transparent)',
};

const statusPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid color-mix(in srgb, var(--k-text) 14%, transparent)',
  fontFamily: fontMono,
  fontSize: 10,
  fontWeight: 750,
  letterSpacing: 0.7,
  textTransform: 'uppercase',
  opacity: 0.78,
};
