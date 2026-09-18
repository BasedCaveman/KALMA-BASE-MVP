//kalma/frontend/app/today/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { useRouter } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';
import { useLocationContext } from '@/hooks/useLocationContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useProfile } from '@/hooks/useProfile';
import { useFollowedPlaces } from '@/hooks/useFollow';
import { useFaucet } from '@/hooks/useFaucet';
import { useTodayPreferences } from '@/hooks/useTodayPreferences';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import FaucetBanner from '@/components/shared/FaucetBanner';
import { ProtocolStats } from '@/components/shared/ProtocolStats';
import MarketCard, { CompactMarketGrid } from '@/components/market/MarketCard';
import ObservationFeed from '@/components/social/ObservationFeed';
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import SignalQuestionCard from '@/components/market/SignalQuestionCard';
import LocationPicker from '@/components/location/LocationPicker';
import CitySearchBox from '@/components/location/CitySearchBox';
import StartButton from '@/components/shared/StartButton';
import { SignalCard } from '@/components/signal/SignalCard';
import { MoonIcon } from '@/components/shared/icons';
import WeatherLayersPreview from '@/components/weather/WeatherLayersPreview';
import { useLocalSignalsNearby } from '@/hooks/useLocalSignals';
import { CHAIN } from '@/lib/contracts';
import {
  TODAY_FEATURED_ACTIVITY_IDS,
  TODAY_FEATURED_RISK_IDS,
  getActivityLabel,
  getRiskLabel,
  type ActivityTaxonomyId,
  type RiskTaxonomyId,
} from '@/lib/activity-taxonomy';
import { readWalletErrorMessage } from '@/lib/wallet-errors';
import { haversineKm, type Market } from '@/hooks/useMarkets';
import type { LocalSignalWithPlace } from '@/hooks/useLocalSignals';

function labelFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type LocalContextLocation = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
};

type LocalContextData = {
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  isDay: number | null;
  sunset: string | null;
  moonPhase: number;
};

function localContextCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Local context',
      loading: 'Reading the local sky...',
      unavailable: 'Local context is unavailable right now.',
      temperature: 'Now',
      feels: 'Feels',
      humidity: 'Humidity',
      wind: 'Wind',
      sunset: 'Sunset',
      moon: 'Moon',
      source: 'Open-Meteo forecast API + local moon phase estimate',
    },
    pt: {
      title: 'Contexto local',
      loading: 'Lendo o céu local...',
      unavailable: 'O contexto local está indisponível agora.',
      temperature: 'Agora',
      feels: 'Sensação',
      humidity: 'Umidade',
      wind: 'Vento',
      sunset: 'Pôr do sol',
      moon: 'Lua',
      source: 'API de previsão Open-Meteo + estimativa local da fase lunar',
    },
    es: {
      title: 'Contexto local',
      loading: 'Leyendo el cielo local...',
      unavailable: 'El contexto local no está disponible ahora.',
      temperature: 'Ahora',
      feels: 'Sensación',
      humidity: 'Humedad',
      wind: 'Viento',
      sunset: 'Atardecer',
      moon: 'Luna',
      source: 'API de pronóstico Open-Meteo + estimación local de fase lunar',
    },
    fr: {
      title: 'Contexte local',
      loading: 'Lecture du ciel local...',
      unavailable: 'Le contexte local est indisponible pour le moment.',
      temperature: 'Maintenant',
      feels: 'Ressenti',
      humidity: 'Humidité',
      wind: 'Vent',
      sunset: 'Coucher',
      moon: 'Lune',
      source: 'API de prévision Open-Meteo + estimation locale de la phase lunaire',
    },
    de: {
      title: 'Lokaler Kontext',
      loading: 'Lese den lokalen Himmel...',
      unavailable: 'Lokaler Kontext ist gerade nicht verfügbar.',
      temperature: 'Jetzt',
      feels: 'Gefühlt',
      humidity: 'Feuchte',
      wind: 'Wind',
      sunset: 'Sonnenuntergang',
      moon: 'Mond',
      source: 'Open-Meteo Forecast API + lokale Mondphasen-Schätzung',
    },
    zh: {
      title: '本地背景',
      loading: '正在读取本地天空...',
      unavailable: '当前无法获取本地背景。',
      temperature: '当前',
      feels: '体感',
      humidity: '湿度',
      wind: '风速',
      sunset: '日落',
      moon: '月相',
      source: 'Open-Meteo 预报 API + 本地月相估算',
    },
  };
  return table[language] ?? table.en;
}

function weatherCodeLabel(code: number | null, isDay: number | null, language: string) {
  const key =
    code === 0 ? (isDay === 0 ? 'clearNight' : 'clearSky')
    : code === 1 ? 'mainlyClear'
    : code === 2 ? 'partlyCloudy'
    : code === 3 ? 'overcast'
    : code === 45 || code === 48 ? 'fog'
    : code != null && code >= 51 && code <= 67 ? 'drizzle'
    : code != null && code >= 71 && code <= 77 ? 'snow'
    : code != null && code >= 80 && code <= 82 ? 'rainShowers'
    : code != null && code >= 95 ? 'thunderstorm'
    : code != null && code >= 61 && code <= 65 ? 'rain'
    : 'weather';

  const T: Record<string, Record<string, string>> = {
    clearSky: { en: 'Clear sky', pt: 'Céu limpo', es: 'Cielo despejado', fr: 'Ciel dégagé', de: 'Klarer Himmel', zh: '晴朗' },
    clearNight: { en: 'Clear night', pt: 'Noite limpa', es: 'Noche despejada', fr: 'Nuit dégagée', de: 'Klare Nacht', zh: '晴夜' },
    mainlyClear: { en: 'Mainly clear', pt: 'Praticamente limpo', es: 'Mayormente despejado', fr: 'Plutôt dégagé', de: 'Überwiegend klar', zh: '大致晴朗' },
    partlyCloudy: { en: 'Partly cloudy', pt: 'Parcialmente nublado', es: 'Parcialmente nublado', fr: 'Partiellement nuageux', de: 'Teils bewölkt', zh: '局部多云' },
    overcast: { en: 'Overcast', pt: 'Nublado', es: 'Cubierto', fr: 'Couvert', de: 'Bedeckt', zh: '阴天' },
    fog: { en: 'Fog', pt: 'Nevoeiro', es: 'Niebla', fr: 'Brouillard', de: 'Nebel', zh: '雾' },
    drizzle: { en: 'Drizzle', pt: 'Garoa', es: 'Llovizna', fr: 'Bruine', de: 'Nieselregen', zh: '毛毛雨' },
    snow: { en: 'Snow', pt: 'Neve', es: 'Nieve', fr: 'Neige', de: 'Schnee', zh: '雪' },
    rainShowers: { en: 'Rain showers', pt: 'Pancadas', es: 'Chubascos', fr: 'Averses', de: 'Regenschauer', zh: '阵雨' },
    thunderstorm: { en: 'Thunderstorm', pt: 'Tempestade', es: 'Tormenta', fr: 'Orage', de: 'Gewitter', zh: '雷暴' },
    rain: { en: 'Rain', pt: 'Chuva', es: 'Lluvia', fr: 'Pluie', de: 'Regen', zh: '雨' },
    weather: { en: 'Weather', pt: 'Tempo', es: 'Clima', fr: 'Météo', de: 'Wetter', zh: '天气' },
  };
  const row = T[key] ?? T.weather;
  return row[language] ?? row.en;
}

// Four principal phases instead of eight technical names ("Waxing gibbous") —
// clearer at a glance and shorter in every language. Rendered with MoonIcon.
function moonPhaseKey(phase: number): 'new' | 'waxing' | 'full' | 'waning' {
  if (phase < 0.03 || phase > 0.97) return 'new';
  if (phase < 0.47) return 'waxing';
  if (phase < 0.53) return 'full';
  return 'waning';
}

function moonPhaseName(phase: number, language: string) {
  const index = language === 'pt' ? 1 : language === 'es' ? 2 : language === 'fr' ? 3 : language === 'de' ? 4 : language === 'zh' ? 5 : 0;
  const names: Record<string, string[]> = {
    new: ['New', 'Nova', 'Nueva', 'Nouvelle', 'Neumond', '新月'],
    waxing: ['Waxing', 'Crescente', 'Creciente', 'Croissante', 'Zunehmend', '盈月'],
    full: ['Full', 'Cheia', 'Llena', 'Pleine', 'Vollmond', '满月'],
    waning: ['Waning', 'Minguante', 'Menguante', 'Décroissante', 'Abnehmend', '亏月'],
  };
  return names[moonPhaseKey(phase)][index];
}

function estimateMoonPhase(date = new Date()) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86400000;
  return ((days % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
}

function formatLocalTime(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(11, 16) || value;
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      eyebrow: 'Weather intelligence for real decisions',
      title: 'More clarity to understand the weather. More confidence to act at the right time.',
      intro: 'Kalma helps people notice local weather shifts earlier, compare what the crowd expects, and coordinate action around the same signal.',
      startHint: 'Find your city, read what is changing on the ground, and act before the weather turns against you.',
      startCta: 'Join Kalma',
      joinTitle: 'Join when you want to report, follow, or answer',
      joinBody: 'Start by reading what is already live. Connect only when you want to share field observations, follow places, or answer a live question.',
      chooseLocation: 'Place context',
      chooseLocationHint: 'Start with an approximate area, then switch to a city only when you want a more specific place.',
      nearYou: 'Live signals you can join',
      moreCities: 'More live signals',
      exploreCities: 'Read live signals',
      simulator: 'Open simulator',
      create: 'Open a missing risk signal',
      createHint: "Browse live signals to interact with existing places. Open a new risk signal only when you want to add your own place and weather window.",
      loadingLocation: 'Finding your nearest cities...',
      loadingMarkets: 'Loading cities...',
      noLocation: 'Set your location to see the cities closest to where your risk is.',
      noMarkets: 'No cities near you yet.',
      noMoreMarkets: 'More cities will appear as new ones are created.',
      protocol: 'Protocol',
      network: 'Why Kalma',
      networkBody: 'Weather risk is local. Kalma turns each place into a shared weather checkpoint where people can read the signal, compare field observations, and act with more coordination.',
      browseAction: 'See all',
      externalWalletNeeded: 'To add cities on Base Sepolia, connect an external wallet in Profile.',
      guestGuideTitle: 'Start with what already exists',
      guestGuideBody: 'Browse live risk signals first. Connect a wallet when you want to answer Yes or No, deposit test credits, or create a new risk signal for a place that is missing.',
      guestGuideAccount: 'Wallet and balance appear after you connect.',
      horizonsEyebrow: 'Coordination rhythm',
      horizonsTitle: 'Read what matters now, prepare for what is coming, and keep a longer view on the places you care about.',
      horizonsBody: 'This is the first step toward a time-based Kalma routine: today, this week, and later.',
      horizonToday: 'Today',
      horizonWeek: 'This week',
      horizonLater: 'Later',
      horizonTodayHint: 'What needs attention now around your place.',
      horizonWeekHint: 'Weather windows and signals likely to matter soon.',
      horizonLaterHint: 'Longer-view signals, memory, and places to keep watching.',
      searchCity: 'Search city',
      coordinationNow: 'Read and coordinate now',
      humanLayer: 'Field reports',
      humanLayerHint: 'Short local reports help everyone read the place before deciding what to do next.',
      actionLayer: 'Ways to act now',
      filtersLabel: 'Your lens',
      riskLabel: 'Risk focus',
      filtersHint: 'Use these lenses to narrow the coordination feed by work context and risk type.',
      filterAll: 'All',
      filterMyWork: 'My work',
      filterRoads: 'Roads',
      filterCrops: 'Crops',
      filterHeat: 'Heat',
      filterRain: 'Rain',
      weeklySignals: 'Signals coming into focus',
      weeklySignalsHint: 'Active questions, live signals, and places you may want to prepare for before they move closer.',
      laterSignals: 'Longer-view watchlist',
      laterSignalsHint: 'This is where longer-window signals, followed places, and local memory can settle without crowding the urgent layer.',
      noWeeklySignals: 'No active signals are grouped into the week view yet.',
      noLaterSignals: 'No longer-view places yet.',
    },
    pt: {
      eyebrow: 'Inteligência climática para decisões reais',
      title: 'Mais clareza para entender o clima. Mais confiança para agir na hora certa.',
      intro: 'A Kalma ajuda pessoas a perceber mudanças locais no clima mais cedo, comparar o que a multidão espera e coordenar ação em torno do mesmo sinal.',
      startHint: 'Encontre sua cidade, leia o que está mudando no local e aja antes que o tempo vire contra você.',
      startCta: 'Entrar na Kalma',
      joinTitle: 'Entre quando quiser relatar, seguir ou responder',
      joinBody: 'Comece lendo o que já está ativo. Conecte-se só quando quiser compartilhar observações de campo, seguir lugares ou responder um sinal ao vivo.',
      chooseLocation: 'Contexto do lugar',
      chooseLocationHint: 'Comece pela área aproximada e mude para uma cidade só quando quiser um lugar mais específico.',
      nearYou: 'Sinais ativos para participar',
      moreCities: 'Mais sinais ativos',
      exploreCities: 'Ler sinais ativos',
      simulator: 'Abrir simulador',
      create: 'Abrir sinal de risco faltante',
      createHint: 'Explore sinais ativos para interagir com lugares existentes. Abra um novo sinal de risco apenas quando quiser adicionar seu próprio lugar e janela climática.',
      loadingLocation: 'Buscando as cidades mais próximas...',
      loadingMarkets: 'Carregando cidades...',
      noLocation: 'Defina sua localização para ver as cidades mais próximas de onde está seu risco.',
      noMarkets: 'Ainda não há cidades perto de você.',
      noMoreMarkets: 'Mais cidades vão aparecer conforme novas forem criadas.',
      protocol: 'Protocolo',
      network: 'Por que Kalma',
      networkBody: 'O risco climático é local. A Kalma transforma cada lugar em um ponto compartilhado de leitura do tempo, onde as pessoas podem ler o sinal, comparar relatos de campo e agir com mais coordenação.',
      browseAction: 'Ver tudo',
      externalWalletNeeded: 'Para abrir cidades na Base Sepolia, conecte uma carteira externa no Perfil.',
      guestGuideTitle: 'Comece pelo que já existe',
      guestGuideBody: 'Explore os sinais ativos primeiro. Conecte a carteira quando quiser responder Sim ou Não, depositar dinheiro de teste ou criar um novo sinal para um lugar que ainda falta.',
      guestGuideAccount: 'Carteira e saldo aparecem depois da conexão.',
      horizonsEyebrow: 'Ritmo de coordenação',
      horizonsTitle: 'Leia o que é essencial agora, prepare-se para os próximos dias e mantenha uma visão conjunta dos lugares que importam para você.',
      horizonsBody: 'Assim começa a rotina Kalma organizada pelo tempo: hoje, esta semana e depois.',
      horizonToday: 'Hoje',
      horizonWeek: 'Esta semana',
      horizonLater: 'Depois',
      horizonTodayHint: 'O que pede atenção agora perto do seu lugar.',
      horizonWeekHint: 'Janelas climáticas e sinais que devem importar em breve.',
      horizonLaterHint: 'Sinais mais longos, memória local e lugares para seguir observando.',
      searchCity: 'Buscar cidade',
      coordinationNow: 'Ler e coordenar agora',
      humanLayer: 'Relatos de campo',
      humanLayerHint: 'Relatos curtos do local ajudam todo mundo a entender o lugar antes de decidir o próximo passo.',
      actionLayer: 'Onde agir agora',
      filtersLabel: 'Sua lente',
      riskLabel: 'Foco de risco',
      filtersHint: 'Use estas lentes para afinar o feed de coordenação pelo contexto do trabalho e pelo tipo de risco.',
      filterAll: 'Tudo',
      filterMyWork: 'Meu trabalho',
      filterRoads: 'Estradas',
      filterCrops: 'Cultivos',
      filterHeat: 'Calor',
      filterRain: 'Chuva',
      weeklySignals: 'Sinais entrando no foco',
      weeklySignalsHint: 'Perguntas ativas, sinais vivos e lugares que talvez precisem de preparo antes de ficarem mais urgentes.',
      laterSignals: 'Vigilância de prazo maior',
      laterSignalsHint: 'Aqui entram sinais mais longos, lugares seguidos e memória local, sem apertar a camada urgente.',
      noWeeklySignals: 'Ainda não há sinais ativos agrupados na visão da semana.',
      noLaterSignals: 'Ainda não há lugares de visão mais longa.',
    },
    es: {
      eyebrow: 'Inteligencia climática para decisiones reales',
      title: 'Más claridad para entender el clima. Más confianza para actuar en el momento justo.',
      intro: 'Kalma ayuda a las personas a notar antes los cambios locales del clima, comparar lo que espera la multitud y coordinar acciones alrededor de la misma señal.',
      startHint: 'Encuentra tu ciudad, lee lo que está cambiando en el terreno y actúa antes de que el clima se vuelva en tu contra.',
      startCta: 'Entrar en Kalma',
      joinTitle: 'Entra cuando quieras reportar, seguir o responder',
      joinBody: 'Empieza leyendo lo que ya está activo. Conéctate solo cuando quieras compartir observaciones de campo, seguir lugares o responder una señal en vivo.',
      chooseLocation: 'Contexto del lugar',
      chooseLocationHint: 'Empieza con un área aproximada y cambia a una ciudad solo cuando quieras un lugar más específico.',
      nearYou: 'Señales activas para participar',
      moreCities: 'Más señales activas',
      exploreCities: 'Leer señales activas',
      simulator: 'Abrir simulador',
      create: 'Abrir señal de riesgo faltante',
      createHint: 'Explora primero las señales activas para interactuar con lugares existentes. Abre una nueva señal de riesgo solo cuando quieras añadir tu propio lugar y ventana climática.',
      loadingLocation: 'Buscando las ciudades más cercanas...',
      loadingMarkets: 'Cargando ciudades...',
      noLocation: 'Define tu ubicación para ver las ciudades más cercanas donde está tu riesgo.',
      noMarkets: 'Aún no hay ciudades cerca de ti.',
      noMoreMarkets: 'Más ciudades aparecerán a medida que se creen nuevas.',
      protocol: 'Protocolo',
      network: 'Por qué Kalma',
      networkBody: 'El riesgo climático es local. Kalma convierte cada lugar en un punto compartido para leer el clima, comparar observaciones de campo y actuar con más coordinación.',
      browseAction: 'Ver todo',
      externalWalletNeeded: 'Para agregar ciudades en Base Sepolia, conecta una wallet externa en Perfil.',
      guestGuideTitle: 'Empieza con lo que ya existe',
      guestGuideBody: 'Explora señales activas primero. Conecta una wallet cuando quieras responder Sí o No, depositar fondos de prueba o crear una nueva señal para un lugar que falta.',
      guestGuideAccount: 'Wallet y balance aparecen después de conectar.',
      horizonsEyebrow: 'Ritmo de coordinación',
      horizonsTitle: 'Lee lo que importa ahora, prepárate para lo que viene y mantén una visión más larga de los lugares que te importan.',
      horizonsBody: 'Este es el primer paso hacia una rutina Kalma organizada por tiempo: hoy, esta semana y después.',
      horizonToday: 'Hoy',
      horizonWeek: 'Esta semana',
      horizonLater: 'Después',
      horizonTodayHint: 'Qué necesita atención ahora cerca de tu lugar.',
      horizonWeekHint: 'Ventanas climáticas y señales que probablemente importen pronto.',
      horizonLaterHint: 'Señales de más largo plazo, memoria local y lugares para seguir observando.',
      searchCity: 'Buscar ciudad',
      coordinationNow: 'Leer y coordinar ahora',
      humanLayer: 'Reportes de campo',
      humanLayerHint: 'Los reportes cortos desde el lugar ayudan a todos a entender el terreno antes de decidir qué hacer.',
      actionLayer: 'Dónde actuar ahora',
      filtersLabel: 'Tu lente',
      riskLabel: 'Enfoque de riesgo',
      filtersHint: 'Usa estas lentes para afinar el feed de coordinación por contexto de trabajo y tipo de riesgo.',
      filterAll: 'Todo',
      filterMyWork: 'Mi trabajo',
      filterRoads: 'Caminos',
      filterCrops: 'Cultivos',
      filterHeat: 'Calor',
      filterRain: 'Lluvia',
      weeklySignals: 'Señales que entran en foco',
      weeklySignalsHint: 'Preguntas activas, señales vivas y lugares para preparar antes de que se vuelvan más urgentes.',
      laterSignals: 'Vigilancia de más largo plazo',
      laterSignalsHint: 'Aquí pueden vivir señales de plazo mayor, lugares seguidos y memoria local sin apretar la capa urgente.',
      noWeeklySignals: 'Aún no hay señales activas agrupadas en la vista semanal.',
      noLaterSignals: 'Aún no hay lugares para la vista más larga.',
    },
    fr: {
      eyebrow: 'Intelligence météo pour des décisions réelles',
      title: 'Plus de clarté pour comprendre la météo. Plus de confiance pour agir au bon moment.',
      intro: "Kalma aide chacun à repérer plus tôt les changements météo locaux, à comparer ce que la foule attend et à coordonner l'action autour d'un même signal.",
      startHint: 'Trouvez votre ville, lisez ce qui change sur le terrain et agissez avant que la météo se retourne contre vous.',
      startCta: 'Entrer dans Kalma',
      joinTitle: 'Entrez quand vous voulez signaler, suivre ou répondre',
      joinBody: 'Commencez par lire ce qui est déjà actif. Connectez-vous seulement pour partager des retours du terrain, suivre des lieux ou répondre à un signal actif.',
      chooseLocation: 'Contexte du lieu',
      chooseLocationHint: 'Commencez par une zone approximative, puis passez à une ville seulement si vous voulez un lieu plus précis.',
      nearYou: 'Signaux actifs à rejoindre',
      moreCities: 'Plus de signaux actifs',
      exploreCities: 'Lire les signaux actifs',
      simulator: 'Ouvrir le simulateur',
      create: 'Ouvrir un signal de risque manquant',
      createHint: 'Explorez d’abord les signaux actifs pour interagir avec les lieux existants. Ouvrez un nouveau signal de risque seulement pour ajouter votre propre lieu et fenêtre météo.',
      loadingLocation: 'Recherche des villes les plus proches...',
      loadingMarkets: 'Chargement des villes...',
      noLocation: 'Définissez votre position pour voir les villes les plus proches de votre zone de risque.',
      noMarkets: 'Aucune ville près de vous pour le moment.',
      noMoreMarkets: "D'autres villes apparaîtront au fur et à mesure de leur création.",
      protocol: 'Protocole',
      network: 'Pourquoi Kalma',
      networkBody: "Le risque climatique est local. Kalma transforme chaque lieu en point de repère météo partagé où l'on peut lire le signal, comparer les observations du terrain et agir avec plus de coordination.",
      browseAction: 'Voir tout',
      externalWalletNeeded: 'Pour créer des signaux sur Base Sepolia, connectez un wallet externe dans Profil.',
      guestGuideTitle: 'Commencez par ce qui existe déjà',
      guestGuideBody: 'Explorez d’abord les signaux actifs. Connectez un wallet pour répondre Oui ou Non, déposer des fonds de test ou créer un nouveau signal pour un lieu manquant.',
      guestGuideAccount: 'Wallet et solde apparaissent après connexion.',
      horizonsEyebrow: 'Rythme de coordination',
      horizonsTitle: 'Lisez ce qui compte maintenant, préparez ce qui arrive et gardez une vue plus longue sur les lieux qui comptent pour vous.',
      horizonsBody: 'Ceci est la première étape vers une routine Kalma organisée par le temps : aujourd’hui, cette semaine et plus tard.',
      horizonToday: "Aujourd'hui",
      horizonWeek: 'Cette semaine',
      horizonLater: 'Plus tard',
      horizonTodayHint: 'Ce qui demande de l’attention maintenant autour de votre lieu.',
      horizonWeekHint: 'Fenêtres météo et signaux qui risquent de compter bientôt.',
      horizonLaterHint: 'Signaux de plus long terme, mémoire locale et lieux à continuer de suivre.',
      searchCity: 'Chercher une ville',
      coordinationNow: 'Lire et coordonner maintenant',
      humanLayer: 'Relevés de terrain',
      humanLayerHint: 'De courts retours du terrain aident chacun à comprendre le lieu avant de décider du prochain geste.',
      actionLayer: 'Où agir maintenant',
      filtersLabel: 'Votre filtre',
      riskLabel: 'Focal risque',
      filtersHint: "Utilisez ces filtres pour resserrer le flux de coordination selon le contexte de travail et le type de risque.",
      filterAll: 'Tout',
      filterMyWork: 'Mon travail',
      filterRoads: 'Routes',
      filterCrops: 'Cultures',
      filterHeat: 'Chaleur',
      filterRain: 'Pluie',
      weeklySignals: 'Signaux qui entrent dans le champ',
      weeklySignalsHint: "Questions actives, signaux vivants et lieux à préparer avant qu'ils deviennent plus urgents.",
      laterSignals: 'Veille plus longue',
      laterSignalsHint: 'Les signaux de plus long terme, les lieux suivis et la mémoire locale peuvent vivre ici sans encombrer la couche urgente.',
      noWeeklySignals: "Aucun signal actif n'est encore regroupé dans la vue de la semaine.",
      noLaterSignals: "Aucun lieu n'alimente encore la vue de plus long terme.",
    },
    de: {
      eyebrow: 'Wetterkompetenz für echte Entscheidungen',
      title: 'Mehr Klarheit beim Wetter. Mehr Sicherheit, zum richtigen Zeitpunkt zu handeln.',
      intro: 'Kalma hilft Menschen, lokale Wetteränderungen früher zu erkennen, mit den Erwartungen der Menge abzugleichen und gemeinsamer rund um dasselbe Signal zu handeln.',
      startHint: 'Finde deine Stadt, lies, was sich vor Ort verändert, und handle, bevor sich das Wetter gegen dich dreht.',
      startCta: 'Kalma beitreten',
      joinTitle: 'Verbinde dich, wenn du melden, folgen oder antworten willst',
      joinBody: 'Lies zuerst, was bereits live ist. Verbinde dich erst, wenn du Feldberichte teilen, Orte verfolgen oder auf ein Live-Signal antworten willst.',
      chooseLocation: 'Ortskontext',
      chooseLocationHint: 'Starte mit einem ungefähren Gebiet und wechsle nur dann zu einer Stadt, wenn du einen genaueren Ort brauchst.',
      nearYou: 'Live-Signale zum Mitmachen',
      moreCities: 'Mehr Live-Signale',
      exploreCities: 'Live-Signale ansehen',
      simulator: 'Simulator öffnen',
      create: 'Fehlendes Risiko-Signal öffnen',
      createHint: 'Sieh dir zuerst Live-Signale an, um mit bestehenden Orten zu interagieren. Öffne ein neues Risiko-Signal nur, wenn du eigenen Ort und Wetterfenster hinzufügen willst.',
      loadingLocation: 'Suche nach den nächstgelegenen Städten...',
      loadingMarkets: 'Städte werden geladen...',
      noLocation: 'Setze deinen Standort, um die Städte in deiner Risikozone zu sehen.',
      noMarkets: 'Noch keine Städte in deiner Nähe.',
      noMoreMarkets: 'Weitere Städte erscheinen, sobald neue erstellt werden.',
      protocol: 'Protokoll',
      network: 'Warum Kalma',
      networkBody: 'Wetterrisiko ist lokal. Kalma macht jeden Ort zu einem gemeinsamen Wetter-Checkpoint, an dem Menschen das Signal lesen, Beobachtungen vergleichen und koordinierter handeln können.',
      browseAction: 'Alle ansehen',
      externalWalletNeeded: 'Um Städte auf Base Sepolia hinzuzufügen, verbinde eine externe Wallet in Profil.',
      guestGuideTitle: 'Beginne mit dem, was schon existiert',
      guestGuideBody: 'Sieh dir zuerst Live-Signale an. Verbinde eine Wallet, wenn du mit Ja oder Nein antworten, Test-Cash einzahlen oder ein neues Signal für einen fehlenden Ort erstellen willst.',
      guestGuideAccount: 'Wallet und Guthaben erscheinen nach dem Verbinden.',
      horizonsEyebrow: 'Koordinationsrhythmus',
      horizonsTitle: 'Lies, was jetzt zählt, bereite vor, was kommt, und behalte Orte mit längerem Blick im Auge.',
      horizonsBody: 'Das ist der erste Schritt zu einer zeitbasierten Kalma-Routine: heute, diese Woche und später.',
      horizonToday: 'Heute',
      horizonWeek: 'Diese Woche',
      horizonLater: 'Später',
      horizonTodayHint: 'Was rund um deinen Ort jetzt Aufmerksamkeit braucht.',
      horizonWeekHint: 'Wetterfenster und Signale, die bald wichtig werden können.',
      horizonLaterHint: 'Länger laufende Signale, lokales Gedächtnis und Orte, die du weiter beobachten willst.',
      searchCity: 'Stadt suchen',
      coordinationNow: 'Jetzt lesen und koordinieren',
      humanLayer: 'Feldmeldungen',
      humanLayerHint: 'Kurze Berichte vor Ort helfen allen, den Ort besser zu lesen, bevor der nächste Schritt entschieden wird.',
      actionLayer: 'Wo jetzt gehandelt werden kann',
      filtersLabel: 'Deine Linse',
      riskLabel: 'Risikofokus',
      filtersHint: 'Nutze diese Filter, um den Koordinations-Feed nach Arbeitskontext und Risikotyp einzugrenzen.',
      filterAll: 'Alles',
      filterMyWork: 'Meine Arbeit',
      filterRoads: 'Straßen',
      filterCrops: 'Anbau',
      filterHeat: 'Hitze',
      filterRain: 'Regen',
      weeklySignals: 'Signale, die näher rücken',
      weeklySignalsHint: 'Aktive Fragen, laufende Signale und Orte, die du vorbereiten solltest, bevor sie dringlicher werden.',
      laterSignals: 'Längerer Blick',
      laterSignalsHint: 'Hier können länger laufende Signale, gefolgte Orte und lokales Gedächtnis leben, ohne die dringende Ebene zu überladen.',
      noWeeklySignals: 'Noch sind keine aktiven Signale in der Wochenansicht gruppiert.',
      noLaterSignals: 'Noch keine Orte für die längere Ansicht.',
    },
    zh: {
      eyebrow: '面向真实决策的天气智能',
      title: '更清晰地读懂天气。更自信地在正确时机行动。',
      intro: 'Kalma 帮助人们更早察觉本地天气变化，对比群体预期，并围绕同一个信号协调行动。',
      startHint: '找到你的城市，看看当地正在发生什么，并在天气转坏之前行动。',
      startCta: '加入 Kalma',
      joinTitle: '当你想报告、关注或作答时再加入',
      joinBody: '先阅读当前已经活跃的内容。只有当你想分享现场观察、关注地点或回应实时信号时再连接。',
      chooseLocation: '地点背景',
      chooseLocationHint: '先从大致区域开始，只有在你想看更具体地点时再切换到城市。',
      nearYou: '可参与的实时信号',
      moreCities: '更多实时信号',
      exploreCities: '阅读实时信号',
      simulator: '打开模拟器',
      create: '开通缺失的风险信号',
      createHint: '先浏览实时信号以参与已有地点。只有当你想添加自己的地点和天气窗口时，才开通新的风险信号。',
      loadingLocation: '正在寻找最近的城市...',
      loadingMarkets: '正在加载城市...',
      noLocation: '设置你的位置，查看距离你风险所在地最近的城市。',
      noMarkets: '你附近暂时没有城市。',
      noMoreMarkets: '随着新城市的创建，更多城市将会出现。',
      protocol: '协议',
      network: '为什么选择 Kalma',
      networkBody: '天气风险是本地化的。Kalma 把每个地点变成共享的天气检查点，让人们可以读取信号、比较现场观察，并更协调地采取行动。',
      browseAction: '查看全部',
      externalWalletNeeded: '要在 Base Sepolia 上开通风险信号，请在个人页连接外部钱包。',
      guestGuideTitle: '先从已有内容开始',
      guestGuideBody: '先浏览实时信号。想回答是或否、存入测试资金，或为缺失地点开通风险信号时再连接钱包。',
      guestGuideAccount: '连接后会显示钱包和余额。',
      horizonsEyebrow: '协同节奏',
      horizonsTitle: '先读懂当下要紧的，再为接下来做准备，同时保留对重要地点的更长视角。',
      horizonsBody: '这是把 Kalma 变成按时间组织的日常入口的第一步：今天、本周、之后。',
      horizonToday: '今天',
      horizonWeek: '本周',
      horizonLater: '之后',
      horizonTodayHint: '你所在地点现在需要注意的事。',
      horizonWeekHint: '接下来更可能变得重要的天气窗口和风险信号。',
      horizonLaterHint: '更长周期的信号、本地记忆，以及值得继续关注的地点。',
      searchCity: '搜索城市',
      coordinationNow: '现在先读懂并协调',
      humanLayer: '现场报告',
      humanLayerHint: '来自现场的简短报告能帮助大家先理解这个地方，再决定下一步行动。',
      actionLayer: '现在可以行动的地方',
      filtersLabel: '你的视角',
      riskLabel: '风险焦点',
      filtersHint: '用这些筛选器按工作场景和风险类型收窄协同信息流。',
      filterAll: '全部',
      filterMyWork: '我的工作',
      filterRoads: '道路',
      filterCrops: '作物',
      filterHeat: '高温',
      filterRain: '降雨',
      weeklySignals: '进入视野的信号',
      weeklySignalsHint: '这里会放即将变得重要的活跃问题、实时信号和需要提前准备的地点。',
      laterSignals: '更长视角的观察',
      laterSignalsHint: '更长周期的信号、已关注地点和本地记忆可以放在这里，而不会挤占紧急层。',
      noWeeklySignals: '本周视图里还没有被归组的活跃信号。',
      noLaterSignals: '更长视角里还没有地点。',
    },
  };
  return table[language] ?? table.en;
}

type ActivityFilterId = ActivityTaxonomyId;
type RiskFilterId = RiskTaxonomyId;

function normalizeContextText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMarketLiveOrUpcoming(market: Market) {
  return !market.resolved && !market.cancelled;
}

function isNearSelectedPlace(market: Market) {
  const distance = market.distanceKm;
  if (distance == null) return false;
  return distance <= 250;
}

function isRegionalMarket(market: Market) {
  const distance = market.distanceKm;
  if (distance == null) return false;
  return distance <= 1200;
}

function marketMatchesActivityFilter(market: Market, filter: ActivityFilterId) {
  if (filter === 'all') return true;

  if (filter === 'my_work') {
    return market.userHasPosition || market.isFavorite || isNearSelectedPlace(market);
  }

  if (filter === 'destination') {
    return [
      'rain',
      'heavy_rain',
      'snow',
      'frost_risk',
      'cold_spell',
      'temp_high',
      'temp_low',
      'dry_stretch',
    ].includes(market.metricKey);
  }

  if (filter === 'hospitality') {
    return [
      'rain',
      'heavy_rain',
      'snow',
      'frost_risk',
      'cold_spell',
      'temp_high',
      'temp_low',
    ].includes(market.metricKey);
  }

  if (filter === 'roads') {
    return ['rain', 'heavy_rain', 'snow', 'frost_risk', 'cold_spell'].includes(market.metricKey);
  }

  if (filter === 'crops') {
    return [
      'rain',
      'heavy_rain',
      'dry_stretch',
      'snow',
      'frost_risk',
      'cold_spell',
      'temp_high',
      'temp_low',
    ].includes(market.metricKey);
  }

  if (filter === 'heat') {
    return ['temp_high'].includes(market.metricKey);
  }

  if (filter === 'rain') {
    return ['rain', 'heavy_rain', 'dry_stretch'].includes(market.metricKey);
  }

  return true;
}

function marketMatchesRiskFilter(market: Market, filter: RiskFilterId) {
  if (filter === 'all') return true;
  if (filter === 'rain') return ['rain', 'heavy_rain'].includes(market.metricKey);
  if (filter === 'heat') return ['temp_high'].includes(market.metricKey);
  if (filter === 'cold') return ['temp_low', 'cold_spell', 'frost_risk'].includes(market.metricKey);
  if (filter === 'dry') return ['dry_stretch'].includes(market.metricKey);
  if (filter === 'snow') return ['snow'].includes(market.metricKey);
  return true;
}

function signalMatchesActivityFilter(
  signal: LocalSignalWithPlace,
  filter: ActivityFilterId,
) {
  if (filter === 'all') return true;

  const affected = signal.affectedGroups ?? [];
  const category = signal.category ?? '';
  const typeId = signal.signalTypeId ?? '';

  if (filter === 'my_work') {
    return affected.length > 0 || category === 'rainfall' || category === 'temperature';
  }

  if (filter === 'destination') {
    return (
      affected.includes('commuters') ||
      affected.includes('logistics_operators') ||
      affected.includes('event_crews') ||
      ['rainfall', 'temperature', 'water'].includes(category) ||
      [
        'heavy_rain_event',
        'rainfall_risk_rising',
        'frost_risk',
        'consecutive_cold_below',
        'heat_stress_window',
        'dry_stretch_window',
      ].includes(typeId)
    );
  }

  if (filter === 'hospitality') {
    return (
      affected.includes('event_crews') ||
      affected.includes('commuters') ||
      ['rainfall', 'temperature'].includes(category) ||
      [
        'heavy_rain_event',
        'rainfall_risk_rising',
        'frost_risk',
        'consecutive_cold_below',
        'heat_stress_window',
      ].includes(typeId)
    );
  }

  if (filter === 'roads') {
    return (
      affected.includes('logistics_operators') ||
      affected.includes('commuters') ||
      ['rainfall', 'temperature'].includes(category) ||
      ['heavy_rain_event', 'frost_risk', 'consecutive_cold_below'].includes(typeId)
    );
  }

  if (filter === 'crops') {
    return (
      affected.includes('farmers') ||
      affected.includes('growers') ||
      affected.includes('vineyards') ||
      affected.includes('orchards') ||
      ['rainfall', 'temperature', 'water'].includes(category)
    );
  }

  if (filter === 'heat') {
    return typeId === 'heat_stress_window';
  }

  if (filter === 'rain') {
    return ['rainfall_risk_rising', 'heavy_rain_event', 'dry_stretch_window', 'water_recovery_signal'].includes(typeId);
  }

  return true;
}

function signalMatchesRiskFilter(
  signal: LocalSignalWithPlace,
  filter: RiskFilterId,
) {
  if (filter === 'all') return true;

  const typeId = signal.signalTypeId ?? '';

  if (filter === 'rain') {
    return ['rainfall_risk_rising', 'heavy_rain_event', 'water_recovery_signal'].includes(typeId);
  }
  if (filter === 'heat') {
    return typeId === 'heat_stress_window';
  }
  if (filter === 'cold') {
    return ['consecutive_cold_below', 'frost_risk'].includes(typeId);
  }
  if (filter === 'dry') {
    return typeId === 'dry_stretch_window';
  }
  if (filter === 'snow') {
    return false;
  }

  return true;
}

function followedPlaceMatchesMarket(
  followedPlace: { slug: string; name: string; region: string | null; country: string },
  market: Market,
) {
  const marketContext = normalizeContextText(
    `${market.cityName} ${market.displayCityName} ${market.regionCode} ${market.countryCode}`,
  );
  const placeContext = normalizeContextText(
    `${followedPlace.slug.split('-').join(' ')} ${followedPlace.name} ${followedPlace.region ?? ''} ${followedPlace.country}`,
  );

  if (!marketContext || !placeContext) return false;

  const primaryTokens = [followedPlace.name, followedPlace.region, followedPlace.country]
    .filter(Boolean)
    .map((part) => normalizeContextText(part))
    .filter(Boolean);

  return primaryTokens.some((token) => marketContext.includes(token)) || placeContext.includes(normalizeContextText(market.cityName));
}

function scoreCoordinationMarket(market: Market) {
  let score = 0;

  if (market.userHasPosition) score += 40;
  if (market.isFavorite) score += 24;
  if (market.uiState === 'live') score += 32;
  if (market.uiState === 'cooldown') score += 18;
  if (market.uiState === 'expired') score += 10;
  if (isNearSelectedPlace(market)) score += 22;
  else if (isRegionalMarket(market)) score += 12;

  if (market.participantCount > 0) {
    score += Math.min(market.participantCount, 6) * 2;
  }

  if (market.daysLeft >= 0) {
    score += Math.max(0, 12 - Math.min(market.daysLeft, 12));
  }

  if (market.contrarianSide !== 'none') score += 3;
  if (market.popularSide === 'balanced') score += 2;

  return score;
}

function horizonObservationCopy(language: string, placeName?: string | null) {
  const place = placeName?.trim();
  const table: Record<string, Record<'today' | 'week' | 'later', { title: string; empty: string }>> = {
    en: {
      today: {
        title: place ? `What people in ${place} are seeing` : 'What people on the ground are seeing',
        empty: 'No field reports yet for this live window.',
      },
      week: {
        title: 'What people are noticing this week',
        empty: 'No early reports yet for this week window.',
      },
      later: {
        title: 'What is building over time',
        empty: 'No longer-view notes yet for this horizon.',
      },
    },
    pt: {
      today: {
        title: place ? `O que as pessoas em ${place} estão observando` : 'O que as pessoas no local estão observando',
        empty: 'Ainda não há relatos de campo para esta janela ativa.',
      },
      week: {
        title: 'O que as pessoas estão percebendo nesta semana',
        empty: 'Ainda não há relatos iniciais para esta janela da semana.',
      },
      later: {
        title: 'O que está se formando ao longo do tempo',
        empty: 'Ainda não há notas de horizonte longo aqui.',
      },
    },
    es: {
      today: {
        title: place ? `Lo que la gente en ${place} está viendo` : 'Lo que la gente en el lugar está viendo',
        empty: 'Aún no hay reportes de campo para esta ventana activa.',
      },
      week: {
        title: 'Lo que la gente nota esta semana',
        empty: 'Aún no hay reportes tempranos para esta ventana semanal.',
      },
      later: {
        title: 'Lo que se está formando con el tiempo',
        empty: 'Aún no hay notas de horizonte largo aquí.',
      },
    },
    fr: {
      today: {
        title: place ? `Ce que les personnes à ${place} voient` : 'Ce que les personnes sur place voient',
        empty: "Pas encore de retours terrain pour cette fenêtre active.",
      },
      week: {
        title: 'Ce que les gens remarquent cette semaine',
        empty: "Pas encore de retours précoces pour cette fenêtre hebdomadaire.",
      },
      later: {
        title: 'Ce qui se construit dans le temps',
        empty: "Pas encore de notes de plus long terme pour cet horizon.",
      },
    },
    de: {
      today: {
        title: place ? `Was Menschen in ${place} gerade sehen` : 'Was Menschen vor Ort gerade sehen',
        empty: 'Noch keine Feldberichte für dieses aktive Zeitfenster.',
      },
      week: {
        title: 'Was Menschen diese Woche bemerken',
        empty: 'Noch keine frühen Berichte für dieses Wochenfenster.',
      },
      later: {
        title: 'Was sich über die Zeit aufbaut',
        empty: 'Noch keine längerfristigen Notizen für diesen Horizont.',
      },
    },
    zh: {
      today: {
        title: place ? `${place}的人正在看到什么` : '现场的人正在看到什么',
        empty: '这个活跃窗口还没有现场报告。',
      },
      week: {
        title: '人们本周正在注意什么',
        empty: '这个周度窗口还没有早期报告。',
      },
      later: {
        title: '随着时间形成的变化',
        empty: '这个时间层还没有长期备注。',
      },
    },
  };

  return table[language] ?? table.en;
}

function horizonObservationIntroCopy(language: string) {
  const table: Record<string, { today: string; week: string; later: string }> = {
    en: {
      today: 'Read what people on the ground are noticing before deciding what needs action now.',
      week: 'Early local notes make the next few days easier to prepare for together.',
      later: 'Longer-view notes help places keep memory around slower climate shifts.',
    },
    pt: {
      today: 'Leia primeiro o que as pessoas no local estão percebendo antes de decidir o que pede ação agora.',
      week: 'Notas locais antecipadas ajudam todo mundo a se preparar melhor para os próximos dias.',
      later: 'Notas de horizonte mais longo ajudam o lugar a guardar memória sobre mudanças climáticas mais lentas.',
    },
    es: {
      today: 'Lee primero lo que la gente en el lugar está notando antes de decidir qué necesita acción ahora.',
      week: 'Las notas locales tempranas ayudan a todos a prepararse mejor para los próximos días.',
      later: 'Las notas de más largo plazo ayudan al lugar a conservar memoria sobre cambios climáticos más lentos.',
    },
    fr: {
      today: 'Lis d’abord ce que les personnes sur place remarquent avant de décider ce qui demande une action maintenant.',
      week: 'Les notes locales précoces aident chacun à mieux se préparer pour les prochains jours.',
      later: 'Les notes de plus long terme aident un lieu à garder la mémoire des évolutions climatiques plus lentes.',
    },
    de: {
      today: 'Lies zuerst, was Menschen vor Ort beobachten, bevor du entscheidest, was jetzt Handlung braucht.',
      week: 'Frühe lokale Notizen helfen allen, sich besser auf die nächsten Tage vorzubereiten.',
      later: 'Längerfristige Notizen helfen einem Ort, Erinnerung an langsamere Klimaveränderungen zu bewahren.',
    },
    zh: {
      today: '先看看现场的人注意到了什么，再决定现在什么最需要行动。',
      week: '更早的本地记录能帮助大家一起为接下来几天做好准备。',
      later: '更长周期的备注能帮助一个地方保留对缓慢气候变化的记忆。',
    },
  };

  return table[language] ?? table.en;
}

function dedupeMarkets(markets: Market[]) {
  const seen = new Set<string>();
  return markets.filter((market) => {
    const key = market.id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FilterPill({
  active,
  label,
  onClick,
  fonts,
  C,
  R,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  fonts: any;
  C: any;
  R: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.accent : C.divider}`,
        borderRadius: R.pill,
        minHeight: 34,
        padding: '7px 12px',
        background: active ? C.accent : C.surfaceSoft,
        color: active ? C.dark : C.text,
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: active
          ? `0 8px 20px ${C.shadowA}55`
          : `2px 2px 5px ${C.shadowA}45, -1px -1px 3px ${C.shadowB}55`,
      }}
    >
      {label}
    </button>
  );
}

function HorizonShell({
  eyebrow,
  title,
  hint,
  children,
  fonts,
  C,
  neu,
  R,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  children: React.ReactNode;
  fonts: any;
  C: any;
  neu: any;
  R: any;
}) {
  return (
    <section
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 16px 18px',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 700,
            color: C.textMutedStrong,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 22,
            lineHeight: 1.15,
            fontWeight: 800,
            color: C.text,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            lineHeight: 1.5,
            color: C.textMuted,
            maxWidth: 760,
          }}
        >
          {hint}
        </div>
      </div>
      {children}
    </section>
  );
}


function PlacePillRows({
  rows,
  note,
  fonts,
  C,
  R,
}: {
  rows: Array<{
    label: string;
    items: Array<{ id: bigint; cityPillName?: string; displayCityName?: string; cityName: string }>;
    emptyLabel?: string;
  }>;
  note?: string;
  fonts: any;
  C: any;
  R: any;
}) {
  const row = (
    label: string,
    items: Array<{ id: bigint; cityPillName?: string; displayCityName?: string; cityName: string }>,
    emptyLabel = 'No places yet'
  ) => (
    <div
      className="k-today-place-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '110px minmax(0, 1fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div className="k-today-place-items" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
        {items.length ? items.map((market) => (
          <Link
            className="k-today-place-pill"
            key={market.id.toString()}
            href={`/markets/${market.id.toString()}`}
            style={{
              border: `1px solid ${C.divider}`,
              borderRadius: R.pill,
              padding: '7px 14px',
              minHeight: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              background: C.surfaceSoft,
              color: C.textSoft,
              fontFamily: fonts.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.6,
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textDecoration: 'none',
              cursor: 'pointer',
              boxShadow: `2px 2px 5px ${C.shadowA}55, -1px -1px 3px ${C.shadowB}55`,
            }}
          >
            {market.cityPillName ?? market.displayCityName ?? market.cityName}
          </Link>
        )) : (
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: 700,
              color: C.textMuted,
              minHeight: 32,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {emptyLabel}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        marginTop: 22,
        padding: '18px 16px',
        borderRadius: R.xl,
        background: `${C.surfaceSoft}CC`,
        boxShadow: `inset 4px 4px 14px ${C.shadowA}45, inset -4px -4px 14px ${C.shadowB}65`,
        display: 'grid',
        gap: 12,
      }}
    >
      {rows.map((item) => (
        <div key={item.label}>{row(item.label, item.items, item.emptyLabel)}</div>
      ))}
      {note ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: 700,
            color: C.textMutedStrong,
            lineHeight: 1.35,
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}


function SectionLabel({
  label,
  action,
  fonts,
  C,
}: {
  label: string;
  action?: React.ReactNode;
  fonts: any;
  C: any;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        margin: '20px 0 12px',
      }}
    >
      <div
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
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function CoordinationContextStrip({
  places,
  activityLabel,
  riskLabel,
  fonts,
  C,
  R,
}: {
  places: Array<{ id: string; name: string }>;
  activityLabel: string;
  riskLabel: string;
  fonts: any;
  C: any;
  R: any;
}) {
  const chips = [
    ...(places[0] ? [{ key: `place-${places[0].id}`, label: places[0].name }] : []),
    { key: 'activity', label: activityLabel },
    { key: 'risk', label: riskLabel },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          style={{
            border: `1px solid ${C.divider}`,
            borderRadius: R.pill,
            padding: '6px 11px',
            background: C.surfaceSoft,
            color: C.textSoft,
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function HorizonObservationBlock({
  sectionLabel,
  intro,
  title,
  emptyCopy,
  marketId,
  placeId,
  highlighted = false,
  placeNames = [],
  fonts,
  C,
  neu,
  R,
}: {
  sectionLabel: string;
  intro: string;
  title: string;
  emptyCopy: string;
  marketId?: number;
  placeId?: string;
  highlighted?: boolean;
  placeNames?: string[];
  fonts: any;
  C: any;
  neu: any;
  R: any;
}) {
  if (marketId == null && !placeId) return null;

  return (
    <div>
      <SectionLabel label={sectionLabel} fonts={fonts} C={C} />
      <div
        style={{
          ...neu.subtle,
          borderRadius: R.lg,
          padding: '14px 14px 12px',
          marginBottom: 10,
          display: 'grid',
          gap: 10,
        }}
      >
        {placeNames.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {placeNames.slice(0, 2).map((name) => (
              <span
                key={name}
                style={{
                  padding: '5px 10px',
                  borderRadius: R.pill,
                  border: `1px solid ${C.divider}`,
                  background: C.surfaceSoft,
                  color: C.textMutedStrong,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            lineHeight: 1.55,
            color: C.textMuted,
            maxWidth: 760,
          }}
        >
          {intro}
        </div>
      </div>
      <ObservationFeed
        marketId={marketId}
        placeId={placeId}
        highlighted={highlighted}
        title={title}
        emptyCopy={emptyCopy}
      />
    </div>
  );
}

function ActionLink({
  href,
  label,
  fonts,
  C,
  neu,
  R,
}: {
  href: string;
  label: string;
  fonts: any;
  C: any;
  neu: any;
  R: any;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: 'none',
        ...neu.controlRaised,
        borderRadius: R.md,
        padding: '10px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.text,
        fontFamily: fonts.sans,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}

function LocalContextPanel({
  location,
  language,
  fonts,
  C,
  neu,
  R,
}: {
  location: LocalContextLocation | null;
  language: string;
  fonts: any;
  C: any;
  neu: any;
  R: any;
}) {
  const { formatTemp, formatWind } = useUnits();
  const copy = localContextCopy(language);
  const [data, setData] = useState<LocalContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const lat = typeof location?.lat === 'number' ? location.lat : null;
    const lon = typeof location?.lon === 'number' ? location.lon : null;
    if (lat == null || lon == null) {
      setData(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m',
          daily: 'sunrise,sunset',
          forecast_days: '1',
          timezone: 'auto',
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData({
          temperature: typeof json?.current?.temperature_2m === 'number' ? json.current.temperature_2m : null,
          apparentTemperature: typeof json?.current?.apparent_temperature === 'number' ? json.current.apparent_temperature : null,
          humidity: typeof json?.current?.relative_humidity_2m === 'number' ? json.current.relative_humidity_2m : null,
          windSpeed: typeof json?.current?.wind_speed_10m === 'number' ? json.current.wind_speed_10m : null,
          weatherCode: typeof json?.current?.weather_code === 'number' ? json.current.weather_code : null,
          isDay: typeof json?.current?.is_day === 'number' ? json.current.is_day : null,
          sunset: Array.isArray(json?.daily?.sunset) ? json.daily.sunset[0] ?? null : null,
          moonPhase: estimateMoonPhase(),
        });
      } catch {
        if (!cancelled) {
          setData(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [location?.lat, location?.lon]);

  if (!location?.lat || !location?.lon) return null;

  const place = [location.city, location.region].filter(Boolean).join(', ');
  const weather = data ? weatherCodeLabel(data.weatherCode, data.isDay, language) : '';

  return (
    <div
      className="k-today-location-context"
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px',
      }}
    >
      <SectionLabel label={copy.title} fonts={fonts} C={C} />
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          lineHeight: 1.5,
          color: C.textMuted,
          marginBottom: 12,
        }}
      >
        {place || copy.title}
      </div>

      {loading && !data ? (
        <div style={{ fontFamily: fonts.sans, fontSize: 14, color: C.textSoft }}>
          {copy.loading}
        </div>
      ) : failed ? (
        <div style={{ fontFamily: fonts.sans, fontSize: 14, color: C.textSoft }}>
          {copy.unavailable}
        </div>
      ) : data ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <ContextMetric label={copy.temperature} value={data.temperature == null ? '—' : formatTemp(data.temperature)} sub={weather} fonts={fonts} C={C} R={R} />
            <ContextMetric label={copy.feels} value={data.apparentTemperature == null ? '—' : formatTemp(data.apparentTemperature)} sub={data.humidity == null ? '' : `${copy.humidity} ${Math.round(data.humidity)}%`} fonts={fonts} C={C} R={R} />
            <ContextMetric label={copy.sunset} value={formatLocalTime(data.sunset)} sub={data.windSpeed == null ? '' : `${copy.wind} ${formatWind(data.windSpeed)}`} fonts={fonts} C={C} R={R} />
            <ContextMetric
              label={copy.moon}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MoonIcon phase={moonPhaseKey(data.moonPhase)} color={C.text} size={15} />
                  {moonPhaseName(data.moonPhase, language)}
                </span>
              }
              sub={`${Math.round(data.moonPhase * 100)}%`}
              fonts={fonts}
              C={C}
              R={R}
            />
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: fonts.mono,
              fontSize: 9,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: C.textMuted,
              lineHeight: 1.5,
            }}
          >
            {copy.source}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ContextMetric({
  label,
  value,
  sub,
  fonts,
  C,
  R,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  fonts: any;
  C: any;
  R: any;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.divider}`,
        borderRadius: R.lg,
        padding: '10px 11px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: 800,
          color: C.text,
          lineHeight: 1.15,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 4,
            fontFamily: fonts.sans,
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.25,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function GuardedCreateActionLink({
  label,
  fonts,
  C,
  neu,
  R,
}: {
  label: string;
  fonts: any;
  C: any;
  neu: any;
  R: any;
}) {
  const router = useRouter();
  const { isConnected } = useAccount();
  const target = '/create';

  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      style={{
        ...neu.controlRaised,
        borderRadius: R.md,
        padding: '10px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.text,
        fontFamily: fonts.sans,
        fontSize: 13,
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        background: C.surface,
      }}
    >
      {label}
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { C, fonts, neu, R } = useColors();
  const { t, language } = useTranslation();
  const copy = pageCopy(language);
  const horizonObservationIntro = horizonObservationIntroCopy(language);
  const { isConnected } = useAccount();
  const { favorites } = useFavorites();
  const { profile } = useProfile();
  const { places: followedPlacesRemote } = useFollowedPlaces(profile?.id ?? null);
  const { preferences, setActivityFilter, setRiskFilter } = useTodayPreferences();
  const {
    claimFaucet,
    isPending: isFaucetPending,
    isGasDripping,
    isConfirming: isFaucetConfirming,
    stage: faucetStage,
    error: faucetError,
    testCashTxHash,
  } = useFaucet();
  const isTestnet = CHAIN.id === 84532;
  const activityFilter = preferences.activityFilter;
  const riskFilter = preferences.riskFilter;
  const activityFilterLabel = getActivityLabel(activityFilter, language);
  const riskFilterLabel = getRiskLabel(riskFilter, language);
  const depositBusy =
    isGasDripping ||
    isFaucetPending ||
    isFaucetConfirming ||
    ['checking_gas', 'signing_gas', 'waiting_gas', 'requesting_cash', 'refreshing_cash'].includes(faucetStage);
  const tr = (m: Record<string, string>) => m[language] ?? m.en;
  const depositLabel =
    faucetStage === 'checking_gas' || faucetStage === 'signing_gas' || faucetStage === 'waiting_gas'
      ? tr({ en: 'PREPARING TEST CASH…', pt: 'PREPARANDO DINHEIRO DE TESTE…', es: 'PREPARANDO SALDO DE PRUEBA…', fr: 'PRÉPARATION DES FONDS TEST…', de: 'TEST-GUTHABEN WIRD VORBEREITET…', zh: '正在准备测试资金…' })
      : faucetStage === 'requesting_cash' || faucetStage === 'refreshing_cash'
        ? tr({ en: 'REQUESTING TEST CASH…', pt: 'SOLICITANDO DINHEIRO DE TESTE…', es: 'SOLICITANDO SALDO DE PRUEBA…', fr: 'DEMANDE DES FONDS TEST…', de: 'TEST-GUTHABEN WIRD ANGEFORDERT…', zh: '正在申请测试资金…' })
        : isTestnet
          ? tr({ en: 'DEPOSIT TEST CASH', pt: 'DEPOSITAR DINHEIRO DE TESTE', es: 'DEPOSITAR SALDO DE PRUEBA', fr: 'DÉPOSER DES FONDS TEST', de: 'TEST-GUTHABEN EINZAHLEN', zh: '存入测试资金' })
          : tr({ en: 'DEPOSIT', pt: 'DEPOSITAR', es: 'DEPOSITAR', fr: 'DÉPOSER', de: 'EINZAHLEN', zh: '存入' });
  const depositHelp =
    isTestnet && isConnected
      ? faucetStage === 'signing_gas'
        ? tr({ en: 'Preparing test funds so USDC can arrive.', pt: 'Preparando fundos de teste para o USDC chegar.', es: 'Preparando fondos de prueba para que llegue el USDC.', fr: "Préparation des fonds de test pour recevoir l'USDC.", de: 'Test-Guthaben wird vorbereitet, damit USDC ankommt.', zh: '正在准备测试资金，以便 USDC 到账。' })
        : faucetStage === 'requesting_cash' || faucetStage === 'refreshing_cash'
          ? tr({ en: 'Test funds ready. Requesting USDC test credits.', pt: 'Fundos de teste prontos. Solicitando o USDC de teste.', es: 'Fondos de prueba listos. Solicitando el USDC de prueba.', fr: 'Fonds de test prêts. Demande de fonds USDC.', de: 'Test-Guthaben bereit. USDC-Testguthaben wird angefordert.', zh: '测试资金已准备好。正在申请 USDC 测试资金。' })
          : tr({ en: 'Adds test funds only when needed.', pt: 'Adiciona fundos de teste só quando necessário.', es: 'Agrega fondos de prueba solo cuando hace falta.', fr: 'Ajoute des fonds de test seulement si nécessaire.', de: 'Fügt Test-Guthaben nur bei Bedarf hinzu.', zh: '仅在需要时添加测试资金。' })
      : '';

  async function handleDepositCta() {
    if (!isTestnet || !isConnected) {
      router.push('/profile');
      return;
    }

    await claimFaucet().catch(() => {
      // useFaucet stores a visible error/fallback message; keep the page usable.
    });
  }

  const {
    location,
    isLoading: locationLoading,
    setManualLocation,
    clearManualLocation,
  } = useLocationContext();

  const {
    markets,
    primaryMarket,
    isLoading: marketsLoading,
  } = useMarketsSnapshot(location);

  // Weather signals from the engine, sorted by proximity to the user.
  // Capped at 3 — this is a teaser surface; the place page shows the
  // full per-place list.
  const { signals: nearbySignals, isLoading: signalsLoading } =
    useLocalSignalsNearby({
      lat: location?.lat ?? null,
      lon: location?.lon ?? null,
      limit: 3,
    });

  const filteredNearbySignals = useMemo(() => {
    return nearbySignals.filter((signal) => {
      return (
        signalMatchesActivityFilter(signal, activityFilter) &&
        signalMatchesRiskFilter(signal, riskFilter)
      );
    });
  }, [activityFilter, nearbySignals, riskFilter]);

  const contextPlaces = useMemo(() => {
    if (followedPlacesRemote.length > 0) return followedPlacesRemote;
    return favorites.slice(0, 6).map((slug, index) => ({
      id: `local-${index}`,
      slug,
      name: labelFromSlug(slug),
      region: null,
      country: '',
      country_code: '',
      lat: 0,
      lon: 0,
      created_at: '',
    }));
  }, [favorites, followedPlacesRemote]);

  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      return (
        marketMatchesActivityFilter(market, activityFilter) &&
        marketMatchesRiskFilter(market, riskFilter)
      );
    });
  }, [activityFilter, markets, riskFilter]);

  const rankedCoordinationMarkets = useMemo(() => {
    return [...filteredMarkets].sort((a, b) => {
      const scoreA =
        scoreCoordinationMarket(a) +
        (contextPlaces.some((place) => followedPlaceMatchesMarket(place, a)) ? 20 : 0);
      const scoreB =
        scoreCoordinationMarket(b) +
        (contextPlaces.some((place) => followedPlaceMatchesMarket(place, b)) ? 20 : 0);
      const scoreDiff = scoreB - scoreA;
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.id - a.id);
    });
  }, [contextPlaces, filteredMarkets]);

  const todayMarkets = useMemo(() => {
    const liveCandidates = rankedCoordinationMarkets.filter((market) => market.uiState === 'live');
    const leadId = primaryMarket?.id.toString();
    const withoutLead = liveCandidates.filter((market) => market.id.toString() !== leadId);
    const visible = withoutLead.length > 0 ? withoutLead : liveCandidates;
    return dedupeMarkets(visible).slice(0, 3);
  }, [primaryMarket, rankedCoordinationMarkets]);

  const weekMarkets = useMemo(() => {
    const todayIds = new Set(todayMarkets.map((market) => market.id.toString()));
    return dedupeMarkets(
      rankedCoordinationMarkets.filter((market) => {
        if (todayIds.has(market.id.toString())) return false;
        if (!isMarketLiveOrUpcoming(market)) return false;
        return market.daysLeft <= 7;
      }),
    ).slice(0, 3);
  }, [rankedCoordinationMarkets, todayMarkets]);

  const laterMarkets = useMemo(() => {
    const consumedIds = new Set(
      [...todayMarkets, ...weekMarkets].map((market) => market.id.toString()),
    );
    return dedupeMarkets(
      rankedCoordinationMarkets.filter((market) => {
        if (consumedIds.has(market.id.toString())) return false;
        if (!isMarketLiveOrUpcoming(market)) return false;
        return market.daysLeft > 7;
      }),
    ).slice(0, 3);
  }, [rankedCoordinationMarkets, todayMarkets, weekMarkets]);

  const moreMarkets = useMemo(() => {
    const consumedIds = new Set(
      [...todayMarkets, ...weekMarkets, ...laterMarkets].map((market) => market.id.toString()),
    );
    return dedupeMarkets(
      rankedCoordinationMarkets.filter((market) => !consumedIds.has(market.id.toString())),
    ).slice(0, 3);
  }, [laterMarkets, rankedCoordinationMarkets, todayMarkets, weekMarkets]);

  const followedPlaces = useMemo(() => {
    return contextPlaces.slice(0, 3).map((place, index) => ({
      id: BigInt(index + 1),
      cityPillName: place.name,
      displayCityName: place.name,
      cityName: place.name,
    }));
  }, [contextPlaces]);

  const weatherPreviewPlace = useMemo(() => {
    const remote = contextPlaces.find((place) => {
      return (
        !String(place.id).startsWith('local-') &&
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lon) &&
        (Math.abs(place.lat) > 0.0001 || Math.abs(place.lon) > 0.0001)
      );
    });
    if (remote) {
      return {
        lat: remote.lat,
        lon: remote.lon,
        name: remote.name,
        slug: remote.slug,
      };
    }
    if (location?.lat != null && location?.lon != null && location.city) {
      return {
        lat: location.lat,
        lon: location.lon,
        name: location.city,
        slug: null,
      };
    }
    return null;
  }, [contextPlaces, location]);

  // Followed places rank the feed, but labels describing the current
  // weather/context must use the current location first. Otherwise a
  // followed place can leak into a heading while the weather request is for
  // the user's actual location.
  const observationPlaceName =
    location?.city ??
    weatherPreviewPlace?.name ??
    contextPlaces[0]?.name ??
    primaryMarket?.cityPillName ??
    primaryMarket?.displayCityName ??
    primaryMarket?.cityName ??
    null;
  const horizonCopy = horizonObservationCopy(language, observationPlaceName);

  const positionPlaces = useMemo(() => {
    return markets.filter((m) => m.userHasPosition).slice(0, 3);
  }, [markets]);

  const heroObservationMarketId = todayMarkets[0]
    ? Number(todayMarkets[0].id)
    : primaryMarket
      ? Number(primaryMarket.id)
      : null;

  const heroObservationPlaceId =
    heroObservationMarketId == null && filteredNearbySignals[0]?.place.id
      ? filteredNearbySignals[0].place.id
      : null;

  // 2026-08-06: Destaques used to always lead with primaryMarket, the
  // nearest LIVE CONTRACT market, even when nothing was actually close — a
  // 1200km+ market with one participant beat "nothing" purely because no
  // closer market existed, and the card asked the visitor to stake money on
  // its very first appearance. Local signals (useLocalSignalsNearby, no
  // pool, no stake) are already sorted by real distance, so when the
  // nearest market isn't genuinely near (isNearSelectedPlace, <=250km) or
  // doesn't exist, or a signal is plainly closer, lead with the free signal
  // instead. The market is still one tap away via "Explorar cidades".
  const leadSignalCandidate = filteredNearbySignals[0] ?? null;
  const leadSignalDistanceKm =
    leadSignalCandidate && location?.lat != null && location?.lon != null
      ? haversineKm(
          location.lat,
          location.lon,
          leadSignalCandidate.place.lat,
          leadSignalCandidate.place.lon,
        )
      : null;
  const leadWithSignal =
    leadSignalCandidate != null &&
    (primaryMarket == null ||
      !isNearSelectedPlace(primaryMarket) ||
      (leadSignalDistanceKm != null &&
        primaryMarket.distanceKm != null &&
        leadSignalDistanceKm < primaryMarket.distanceKm));

  const belowFoldSignals = useMemo(() => {
    if (!leadWithSignal || !leadSignalCandidate) return filteredNearbySignals;
    return filteredNearbySignals.filter((s) => s.id !== leadSignalCandidate.id);
  }, [filteredNearbySignals, leadWithSignal, leadSignalCandidate]);

  // Revamp-4: the lead "Right now, near you" question is the Read→Sense→Act
  // entry point — it now leads for everyone, not just guests. Connected users
  // used to land on the faucet/location panel and never saw the calm question
  // card; the mockup puts this question first, then the faucet/location below.
  const nearYouLabel =
    ({
      en: 'Highlights',
      pt: 'Destaques',
      es: 'Destacados',
      fr: 'Temps forts',
      de: 'Highlights',
      zh: '重点看点',
    } as Record<string, string>)[language] ?? 'Right now, near you';

  const noLiveNearby =
    ({
      en: 'No live highlight fits this context yet — here is what is active elsewhere.',
      pt: 'Ainda não há um destaque ativo para este contexto — veja o que está ativo em outros lugares.',
      es: 'Todavía no hay un destacado activo para este contexto; mira lo que está activo en otros lugares.',
      fr: "Pas encore de point fort actif pour ce contexte — voici ce qui est actif ailleurs.",
      de: 'Noch kein aktives Highlight für diesen Kontext — sieh, was anderswo läuft.',
      zh: '这个情境下还没有活跃重点——先看看其他地方正在发生什么。',
    } as Record<string, string>)[language] ??
    'No live highlight fits this context yet — here is what is active elsewhere.';

  const citySearchBlock = (
    <div
      className="k-today-citysearch"
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '12px',
        marginBottom: 12,
      }}
    >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            color: C.textMutedStrong,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {copy.searchCity}
        </div>
        {/* Revamp-5: instant city question — pick a city and the lead question
            swaps to that place (setManualLocation → useMarkets recomputes the
            nearest live market). No configure step, no separate page. */}
        <CitySearchBox
          onPick={(r) => {
            setManualLocation({
              city: r.name,
              region: r.admin1 ?? null,
              country: r.country ?? null,
              lat: r.latitude,
              lon: r.longitude,
              timezone: r.timezone ?? null,
            });
          }}
        />
    </div>
  );

  const leadQuestionBlock = (
    <>
      <SectionLabel label={nearYouLabel} fonts={fonts} C={C} />
      {marketsLoading ? (
        <div
          style={{
            ...neu.panelRaised,
            borderRadius: R.xl,
            padding: '18px 16px',
            fontFamily: fonts.sans,
            fontSize: 15,
            color: C.textSoft,
          }}
        >
          {copy.loadingMarkets}
        </div>
      ) : leadWithSignal && leadSignalCandidate ? (
        <SignalCard
          signal={leadSignalCandidate}
          showPlace
          marketContext={leadSignalCandidate.marketContext}
        />
      ) : primaryMarket ? (
        <>
          <SignalQuestionCard m={primaryMarket} muted={!isConnected} />
        </>
      ) : (
        <div
          style={{
            ...neu.panelRaised,
            borderRadius: R.xl,
            padding: '18px 16px',
            display: 'grid',
            gap: 12,
            fontFamily: fonts.sans,
            fontSize: 15,
            lineHeight: 1.5,
            color: C.textSoft,
          }}
        >
          <span>{noLiveNearby}</span>
        </div>
      )}
      <Link
        href="/markets"
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: 700,
          color: C.accent,
          textDecoration: 'none',
          textAlign: 'center',
        }}
      >
        {copy.exploreCities} →
      </Link>
    </>
  );

  const locationAndContextBlock = (
    <div
      className="k-today-location-panel"
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 16px 14px',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {copy.chooseLocation}
      </div>

      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          lineHeight: 1.55,
          color: C.textSoft,
          marginBottom: 12,
        }}
      >
        {copy.chooseLocationHint}
      </div>

      <LocationPicker
        location={location}
        onSetManual={setManualLocation}
        onClearManual={clearManualLocation}
      />

      {locationLoading ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: fonts.mono,
            fontSize: 11,
            lineHeight: 1.5,
            color: C.textMutedStrong,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
          }}
        >
          {copy.loadingLocation}
        </div>
      ) : null}

      <LocalContextPanel
        location={location}
        language={language}
        fonts={fonts}
        C={C}
        neu={neu}
        R={R}
      />

      {location && location.lat != null && location.lon != null ? (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams({
              lat: String(location.lat),
              lon: String(location.lon),
              name: location.city ?? '',
            });
            // Region/country keep the on-chain city label canonical
            // ("City, Region, Country") without a geocoding round-trip.
            if (location.region) params.set('region', location.region);
            if (location.country) params.set('country', location.country);
            router.push(`/create?${params.toString()}`);
          }}
          style={{
            marginTop: 12,
            width: '100%',
            ...neu.controlRaised,
            border: 'none',
            borderRadius: R.lg,
            padding: '12px 14px',
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1, color: C.accent }}>+</span>
          {copy.create}
        </button>
      ) : null}
      <div style={{ paddingTop: 4 }}>
        <PlacePillRows
          rows={[
            {
              label: ({ en: 'Following', pt: 'Seguindo', es: 'Siguiendo', fr: 'Suivis', de: 'Folge ich', zh: '关注' } as Record<string, string>)[language] ?? 'Following',
              items: followedPlaces,
              emptyLabel: ({ en: 'No places yet', pt: 'Nenhum lugar ainda', es: 'Aún no hay lugares', fr: 'Aucun lieu pour le moment', de: 'Noch keine Orte', zh: '还没有地点' } as Record<string, string>)[language] ?? 'No places yet',
            },
          ]}
          fonts={fonts}
          C={C}
          R={R}
        />
      </div>
    </div>
  );

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Today page masonry — same column treatment as /signals
               and /markets. The Near you signals + Near you markets
               sections are the parts that benefit; the hero stays
               full width. Mobile keeps the natural single-column
               flow. */
            .k-today-fold {
              display: grid;
              gap: 14px;
              align-items: start;
              min-width: 0;
              max-width: 100%;
            }
            .k-today-fold > * {
              min-width: 0;
              max-width: 100%;
            }
            /* MOBILE-FIRST: the wrapper dissolves (display:contents) so the
               three blocks read in natural order — hero → location/lead
               question → rhythm — exactly as before. Order is set explicitly so
               the desktop wrapper (below) can't change the mobile sequence. */
            .k-today-hero-col { display: contents; }
            .k-today-hero-card { order: 1; }
            .k-today-citysearch { order: 2; }
            .k-today-side-column { order: 3; }
            .k-today-rhythm { order: 4; }
            .k-today-side-column {
              display: grid;
              gap: 14px;
              align-content: start;
              min-width: 0;
              max-width: 100%;
            }
            .k-today-side-column.is-connected {
              gap: 10px;
            }
            .k-today-location-context {
              margin-top: 14px;
            }
            .k-today-masonry {
              min-width: 0;
              max-width: 100%;
            }
            .k-today-masonry > * {
              min-width: 0;
              max-width: 100%;
            }
            .k-today-hero-title {
              min-width: 0;
              max-width: 100%;
              overflow-wrap: anywhere;
            }
            .k-today-hero-actions {
              display: grid;
              grid-template-columns: 1fr;
              gap: 10px;
              min-width: 0;
            }
            .k-today-deposit-action {
              grid-column: 1 / -1;
            }
            .k-today-compact-grid {
              display: grid;
              gap: 8px;
              min-width: 0;
              overflow: clip;
            }
            .k-today-place-items {
              min-width: 0;
            }
            .k-today-location-panel {
              min-width: 0;
              max-width: 100%;
              overflow: hidden;
            }
            @media (max-width: 360px) {
              .k-today-place-row {
                grid-template-columns: 1fr;
                gap: 8px;
              }
              .k-today-place-pill {
                max-width: 100%;
              }
              .k-today-hero-card {
                padding-left: 14px !important;
                padding-right: 14px !important;
              }
              .k-today-hero-title {
                font-size: 31px !important;
                line-height: 1.06 !important;
                letter-spacing: -0.7px !important;
              }
              .k-today-hero-actions.is-guest {
                grid-template-columns: 1fr;
              }
            }
            @media (min-width: 1024px) {
              .k-today-page { max-width: 1120px; margin: 0 auto; }
              .k-today-fold {
                grid-template-columns: minmax(0, 1.48fr) minmax(320px, 1fr);
                align-items: start;
              }
              /* DESKTOP: the wrapper becomes a real left column so the hero card
                 and the rhythm block stack together (col 1), with the side
                 column in col 2. The rhythm hugs the hero and fills the space a
                 shorter left column would leave — reflowing with connect state.
                 The order props above still keep hero above rhythm here. */
              .k-today-hero-col {
                display: flex;
                flex-direction: column;
                gap: 14px;
                min-width: 0;
              }
              /* No fixed min-height: the hero card shrinks to its content so
                 the rhythm block (stacked below it in .k-today-hero-col) rises
                 to fill the space instead of leaving a blank gap when connected. */
              .k-today-side-column {
                height: auto;
                display: grid;
                grid-auto-rows: max-content;
                gap: 14px;
              }
              .k-today-side-column.is-connected {
                gap: 10px;
              }
              .k-today-hero-actions {
                align-items: stretch;
              }
              .k-today-hero-actions.is-guest {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
              .k-today-hero-actions.is-connected {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .k-today-hero-actions.is-guest .k-today-deposit-action {
                grid-column: 2 / 4;
              }
              .k-today-hero-actions.is-connected .k-today-deposit-action {
                grid-column: 1 / -1;
              }
              .k-today-masonry {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
                /* First row always flush at the top — cards keep their natural
                   height instead of stretching to the tallest in the row. */
                align-items: start;
              }
              .k-today-masonry > * {
                margin: 0 0 12px 0 !important;
                min-width: 0;
              }
              .k-today-compact-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
            }
            @media (min-width: 1024px) and (max-width: 1180px) {
              .k-today-masonry {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
          `,
        }}
      />
      <AppHeader section={t('nav.home')} />

      <div
        className="k-today-page"
        style={{
          padding: '0 16px 28px',
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <div className="k-today-fold">
          <div className="k-today-hero-col">
          <section
            className="k-today-hero-card"
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              // Tighter padding post-login — frees ~18px of vertical
              // so signal+market sections start higher (UX-2).
              padding: isConnected ? '14px 16px 14px' : '22px 18px 18px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background:
                  'radial-gradient(circle at top right, rgba(90,130,108,0.14), transparent 38%), radial-gradient(circle at bottom left, rgba(54,97,77,0.10), transparent 42%)',
              }}
            />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Eyebrow chip — convicing first-touch context for
                guests; for logged-in users it eats vertical space
                without adding info, so we drop it post-login (UX-2). */}
            {!isConnected ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 14,
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: C.surfaceHigh,
                  color: C.textMutedStrong,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                <span>{copy.eyebrow}</span>
              </div>
            ) : null}

            <h1
              className="k-today-hero-title"
              style={{
                margin: 0,
                fontFamily: fonts.display,
                // Compact hero post-login (UX-2): big editorial title
                // belongs on the first-touch landing; once you're in,
                // it just pushes the actionable content down ~120px.
                fontSize: isConnected ? 24 : 36,
                lineHeight: isConnected ? 1.15 : 1.02,
                color: C.text,
                letterSpacing: isConnected ? -0.4 : -1.2,
                paddingLeft: isConnected ? 0 : 16,
                paddingRight: isConnected ? 0 : 16,
              }}
            >
              {copy.title}
            </h1>

            {/* Intro + startHint — both speak to "this is what Kalma
                does" framing. Post-login the user already knows. */}
            {/* One short line, not two paragraphs — the lead question card
                (in the guest slot below) does the teaching by being tappable. */}
            {!isConnected ? (
              <p
                style={{
                  margin: '14px 0 0',
                  fontFamily: fonts.sans,
                  fontSize: 16,
                  lineHeight: 1.58,
                  color: C.textSoft,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                {copy.intro}
              </p>
            ) : null}

            {!isConnected ? (
              <div
                style={{
                  marginTop: 12,
                  paddingLeft: 16,
                  paddingRight: 16,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  color: C.textMutedStrong,
                }}
              >
                {copy.startHint}
              </div>
            ) : null}

            <div
              className={`k-today-hero-actions ${isConnected ? 'is-connected' : 'is-guest'}`}
              style={{
                marginTop: isConnected ? 12 : 18,
              }}
            >
              {!isConnected ? (
                <>
                  <Link
                    href="/markets"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      minHeight: 43,
                      padding: '0 22px',
                      borderRadius: R.lg,
                      fontFamily: fonts.sans,
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: -0.3,
                      boxSizing: 'border-box',
                      background: C.accent,
                      color: C.dark,
                      boxShadow: `0 12px 32px ${C.shadowA}80`,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {copy.exploreCities}
                  </Link>
                  <Link
                    href="/protection-simulator"
                    style={{
                      textDecoration: 'none',
                      width: '100%',
                      minHeight: 43,
                      padding: '0 22px',
                      borderRadius: R.lg,
                      fontFamily: fonts.sans,
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: -0.3,
                      boxSizing: 'border-box',
                      color: C.text,
                      ...neu.controlRaised,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    SIMULATOR
                  </Link>
                  <div
                    style={{
                      ...neu.subtle,
                      borderRadius: R.lg,
                      padding: '14px',
                      display: 'grid',
                      gap: 10,
                      gridColumn: '1 / -1',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 16,
                        fontWeight: 800,
                        color: C.text,
                      }}
                    >
                      {copy.joinTitle}
                    </div>
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: C.textMuted,
                      }}
                    >
                      {copy.joinBody}
                    </div>
                    <StartButton
                      fullWidth
                      tone="soft"
                      label={copy.startCta}
                    />
                  </div>
                </>
              ) : null}
              {isConnected ? (
                <Link
                  href="/markets"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    minHeight: 50,
                    padding: '0 22px',
                    borderRadius: R.lg,
                    fontFamily: fonts.sans,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: -0.3,
                    boxSizing: 'border-box',
                    background: C.accent,
                    color: C.dark,
                    boxShadow: `0 12px 32px ${C.shadowA}80`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copy.exploreCities}
                </Link>
              ) : null}
              <Link
                href="/protection-simulator"
                style={{
                  textDecoration: 'none',
                  width: '100%',
                  minHeight: isConnected ? 50 : 43,
                  padding: '0 22px',
                  borderRadius: R.lg,
                  fontFamily: fonts.sans,
                  fontSize: isConnected ? 18 : 16,
                  fontWeight: 700,
                  letterSpacing: -0.3,
                  boxSizing: 'border-box',
                  color: C.text,
                  ...neu.controlRaised,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                SIMULATOR
              </Link>
              <button
                type="button"
                className="k-today-deposit-action"
                onClick={handleDepositCta}
                disabled={depositBusy}
                style={{
                  textDecoration: 'none',
                  width: '100%',
                  minHeight: 42,
                  padding: '0 22px',
                  borderRadius: R.lg,
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: -0.2,
                  boxSizing: 'border-box',
                  color: C.text,
                  opacity: depositBusy ? 0.72 : 1,
                  cursor: depositBusy ? 'default' : 'pointer',
                  ...neu.controlRaised,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {depositLabel}
              </button>
              {depositHelp || faucetError || testCashTxHash ? (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: faucetError ? C.below : C.textSoft,
                    textAlign: 'center',
                  }}
                >
                  {faucetError ? readWalletErrorMessage(faucetError) : depositHelp}
                  {testCashTxHash ? (
                    <div style={{ marginTop: 4 }}>
                      <a
                        href={`${CHAIN.blockExplorer}/tx/${testCashTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        {`Tx ${testCashTxHash.slice(0, 8)}...${testCashTxHash.slice(-6)}`}
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <PlacePillRows
              rows={[
                {
                  label: ({ en: 'Positions', pt: 'Posições', es: 'Posiciones', fr: 'Positions', de: 'Positionen', zh: '持仓' } as Record<string, string>)[language] ?? 'Positions',
                  items: positionPlaces,
                  emptyLabel: ({ en: 'No positions yet', pt: 'Nenhuma posição ainda', es: 'Aún no hay posiciones', fr: 'Aucune position', de: 'Noch keine Positionen', zh: '还没有持仓' } as Record<string, string>)[language] ?? 'No positions yet',
                },
              ]}
              note={({ en: 'Showing the three positions closest to their resolution date.', pt: 'Mostrando as três posições mais próximas da data de resolução.', es: 'Mostrando las tres posiciones más cercanas a su fecha de resolución.', fr: 'Affichage des trois positions les plus proches de leur date de résolution.', de: 'Zeigt die drei Positionen mit dem nächsten Auflösungsdatum.', zh: '显示最接近结算日期的三个持仓。' } as Record<string, string>)[language] ?? 'Showing the three positions closest to their resolution date.'}
              fonts={fonts}
              C={C}
              R={R}
            />
          </div>
          </section>

          {/* City search sits right under the hero (hero-column width on
              desktop), balancing the columns and freeing the highlight card to
              move up in the side column. */}
          {citySearchBlock}

          {/* Rhythm sits directly under the hero inside .k-today-hero-col, so
              it hugs the hero card and fills the left column's vertical space
              regardless of how tall the right (side) column is — and reflows
              when connect state changes the hero height. */}
        <section className="k-today-rhythm">
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: '16px',
              display: 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: 700,
                color: C.textMutedStrong,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              {copy.horizonsEyebrow}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 24,
                lineHeight: 1.18,
                fontWeight: 800,
                color: C.text,
                maxWidth: 860,
              }}
            >
              {copy.horizonsTitle}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                lineHeight: 1.55,
                color: C.textMuted,
                maxWidth: 860,
              }}
            >
              {copy.horizonsBody}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMutedStrong,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {copy.filtersLabel}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TODAY_FEATURED_ACTIVITY_IDS.map((id) => (
                  <FilterPill
                    key={id}
                    active={activityFilter === id}
                    label={getActivityLabel(id, language)}
                    onClick={() => setActivityFilter(id)}
                    fonts={fonts}
                    C={C}
                    R={R}
                  />
                ))}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMutedStrong,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {copy.riskLabel}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TODAY_FEATURED_RISK_IDS.map((id) => (
                  <FilterPill
                    key={id}
                    active={riskFilter === id}
                    label={getRiskLabel(id, language)}
                    onClick={() => setRiskFilter(id)}
                    fonts={fonts}
                    C={C}
                    R={R}
                  />
                ))}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: C.textMuted,
                }}
              >
                {copy.filtersHint}
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {contextPlaces.slice(0, 3).map((place) => (
                    <span
                      key={place.id}
                      style={{
                        border: `1px solid ${C.divider}`,
                        borderRadius: R.pill,
                        padding: '6px 12px',
                        background: C.surfaceSoft,
                        color: C.textSoft,
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.7,
                      }}
                    >
                      {place.name}
                    </span>
                  ))}
                </div>
                {weatherPreviewPlace ? (
                  <WeatherLayersPreview
                    lat={weatherPreviewPlace.lat}
                    lon={weatherPreviewPlace.lon}
                    placeName={weatherPreviewPlace.name}
                    placeSlug={weatherPreviewPlace.slug}
                    variant="graphic"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
          </div>{/* /k-today-hero-col */}

          <div className={`k-today-side-column ${isConnected ? 'is-connected' : ''}`}>
            {isConnected ? (
              <>
                {locationAndContextBlock}

                {/* Utility first: people should understand their place and
                    current context before the live signal asks for a
                    position. */}
                {leadQuestionBlock}

                <div>
                  <FaucetBanner />
                </div>
              </>
            ) : (
              <>
                {locationAndContextBlock}
                {leadQuestionBlock}
              </>
            )}
          </div>
        </div>

        <section style={{ marginTop: 24, display: 'grid', gap: 16 }}>
          <HorizonShell
            eyebrow={copy.horizonToday}
            title={copy.coordinationNow}
            hint={copy.horizonTodayHint}
            fonts={fonts}
            C={C}
            neu={neu}
            R={R}
          >
            <CoordinationContextStrip
              places={contextPlaces.slice(0, 1).map((place) => ({ id: String(place.id), name: place.name }))}
              activityLabel={activityFilterLabel}
              riskLabel={riskFilterLabel}
              fonts={fonts}
              C={C}
              R={R}
            />

            {weatherPreviewPlace ? (
              <WeatherLayersPreview
                lat={weatherPreviewPlace.lat}
                lon={weatherPreviewPlace.lon}
                placeName={weatherPreviewPlace.name}
                placeSlug={weatherPreviewPlace.slug}
                variant="strip"
              />
            ) : null}

            <HorizonObservationBlock
              sectionLabel={copy.humanLayer}
              intro={horizonObservationIntro.today}
              title={horizonCopy.today.title}
              emptyCopy={horizonCopy.today.empty}
              marketId={heroObservationMarketId ?? undefined}
              placeId={heroObservationPlaceId ?? undefined}
              highlighted
              placeNames={contextPlaces.slice(0, 1).map((place) => place.name)}
              fonts={fonts}
              C={C}
              neu={neu}
              R={R}
            />

            {belowFoldSignals.length > 0 || signalsLoading ? (
              <div>
                <SectionLabel
                  label={({
                    en: 'Local signals near you',
                    pt: 'Sinais locais perto de você',
                    es: 'Señales locales cerca de ti',
                    fr: 'Signaux locaux près de vous',
                    de: 'Lokale Signale in deiner Nähe',
                    zh: '附近的本地信号',
                  } as Record<string, string>)[language] ?? 'Local signals near you'}
                  fonts={fonts}
                  C={C}
                />
                {signalsLoading && belowFoldSignals.length === 0 ? (
                  <div
                    style={{
                      ...neu.subtle,
                      borderRadius: R.lg,
                      padding: '14px 16px',
                      fontFamily: fonts.sans,
                      fontSize: 13,
                      color: C.textMuted,
                    }}
                  >
                    ...
                  </div>
                ) : belowFoldSignals.length === 0 ? (
                  <div
                    style={{
                      ...neu.subtle,
                      borderRadius: R.lg,
                      padding: '14px 16px',
                      fontFamily: fonts.sans,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: C.textMuted,
                    }}
                  >
                    {({
                      en: 'No local signals match this lens yet.',
                      pt: 'Ainda não há sinais locais que combinem com esta lente.',
                      es: 'Aún no hay señales locales que coincidan con este filtro.',
                      fr: 'Aucun signal local ne correspond encore à ce filtre.',
                      de: 'Noch passen keine lokalen Signale zu diesem Filter.',
                      zh: '当前还没有符合这个视角的本地信号。',
                    } as Record<string, string>)[language] ?? 'No local signals match this lens yet.'}
                  </div>
                ) : (
                  <div className="k-today-masonry">
                    {belowFoldSignals.map((s) => (
                      <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div>
              <SectionLabel
                label={copy.actionLayer}
                fonts={fonts}
                C={C}
                action={
                  <GuardedCreateActionLink
                    label={copy.create}
                    fonts={fonts}
                    C={C}
                    neu={neu}
                    R={R}
                  />
                }
              />

              {marketsLoading ? (
                <div
                  style={{
                    ...neu.subtle,
                    borderRadius: R.lg,
                    padding: '18px 16px',
                    fontFamily: fonts.sans,
                    fontSize: 15,
                    color: C.textSoft,
                  }}
                >
                  {copy.loadingMarkets}
                </div>
              ) : todayMarkets.length > 0 ? (
                <div className="k-today-masonry">
                  {todayMarkets.map((market) =>
                    market ? <MarketCard key={market.id.toString()} m={market} /> : null
                  )}
                </div>
              ) : (
                <div
                  style={{
                    ...neu.subtle,
                    borderRadius: R.lg,
                    padding: '18px 16px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.text,
                      marginBottom: 8,
                    }}
                  >
                    {copy.noMarkets}
                  </div>
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: C.textMuted,
                    }}
                  >
                    {copy.createHint}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <GuardedCreateActionLink
                      label={copy.create}
                      fonts={fonts}
                      C={C}
                      neu={neu}
                      R={R}
                    />
                  </div>
                </div>
              )}
            </div>
          </HorizonShell>

          {/* More live signals: its own step (item 4). The overflow tier
              beyond today/week/later's top picks, no longer buried inside
              the Later card where it duplicated that card's own grid. */}
          {moreMarkets.length > 0 ? (
            <section>
              <SectionLabel
                label={copy.moreCities}
                fonts={fonts}
                C={C}
                action={
                  <ActionLink
                    href="/markets"
                    label={copy.browseAction}
                    fonts={fonts}
                    C={C}
                    neu={neu}
                    R={R}
                  />
                }
              />
              <CompactMarketGrid className="k-today-compact-grid" markets={moreMarkets} />
            </section>
          ) : null}

          <HorizonShell
            eyebrow={copy.horizonWeek}
            title={copy.weeklySignals}
            hint={copy.weeklySignalsHint}
            fonts={fonts}
            C={C}
            neu={neu}
            R={R}
          >
            {/* Field notes already led the page above (item 1); repeating
                the same observation widget in every horizon card was the
                redundancy Pedro flagged, so it's not repeated here. */}
            {weekMarkets.length > 0 ? (
              <CompactMarketGrid className="k-today-compact-grid" markets={weekMarkets as Market[]} />
            ) : (
              <div
                style={{
                  ...neu.subtle,
                  borderRadius: R.lg,
                  padding: '16px',
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: C.textMuted,
                }}
              >
                {copy.noWeeklySignals}
              </div>
            )}
          </HorizonShell>

          <HorizonShell
            eyebrow={copy.horizonLater}
            title={copy.laterSignals}
            hint={copy.laterSignalsHint}
            fonts={fonts}
            C={C}
            neu={neu}
            R={R}
          >
            {laterMarkets.length > 0 ? (
              <CompactMarketGrid className="k-today-compact-grid" markets={laterMarkets as Market[]} />
            ) : (
              <div
                style={{
                  ...neu.subtle,
                  borderRadius: R.lg,
                  padding: '16px',
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: C.textMuted,
                }}
              >
                {copy.noLaterSignals}
              </div>
            )}

            <SectionLabel label={copy.protocol} fonts={fonts} C={C} />
            <ProtocolStats />

            <SectionLabel label={copy.network} fonts={fonts} C={C} />
            <div
              style={{
                ...neu.subtle,
                borderRadius: R.lg,
                padding: '18px 16px',
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: C.textSoft,
                }}
              >
                {copy.networkBody}
              </div>
            </div>
          </HorizonShell>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
