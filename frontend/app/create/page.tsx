//kalma/frontend/app/create/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useBalance,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { readContract } from 'wagmi/actions';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import StickyActionBar from '@/components/shared/StickyActionBar';
import { logPlaceCandidate } from '@/lib/place-candidate';
import { formatUnits, parseEventLogs, parseUnits } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { MARKETS_SNAPSHOT_QUERY_KEY } from '@/hooks/useMarketsSnapshot';
import { haversineKm } from '@/hooks/useMarkets';
import ShareQuestionButton from '@/components/shared/ShareQuestionButton';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import FaucetBanner from '@/components/shared/FaucetBanner';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext } from '@/lib/currency-context';
import { useUnits } from '@/lib/units-context';
import { convertThreshold, formatThreshold, thresholdTemp, thresholdPrecip, type UnitSystem } from '@/lib/units';
import { useActionGate } from '@/hooks/useActionGate';
import { useFaucet } from '@/hooks/useFaucet';
import { wagmiConfig } from '@/lib/wagmi';
import {
  CHAIN,
  CONTRACTS,
  MARKET_TYPES,
  climatePoolAbi,
  encodeHistoricalAvg,
  marketLauncherConfigAbi,
  marketTypeRegistryAbi,
  usdcAbi,
  USDM_DECIMALS,
} from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';
import { GAS_DRIP_MIN_BALANCE_WEI } from '@/lib/gas-drip';

// Observation always begins at this local hour on the chosen start date, so a
// market created late in the day still gets a meaningful lead window instead of
// a few minutes until local midnight. Noon mirrors the 12:00 seed markets.
const ANSWER_ANCHOR_HOUR = '12:00:00';

const MIN_SEED = parseUnits('10', USDM_DECIMALS);
const MIN_GAS_BUFFER = GAS_DRIP_MIN_BALANCE_WEI;
const APPROVAL_CAP = parseUnits('1000', USDM_DECIMALS);
const CREATE_DRAFT_KEY = 'kalma:create-draft:v1';
const APPROVAL_SETTLE_ATTEMPTS = 25;
const APPROVAL_SETTLE_DELAY_MS = 1000;

type GeoResult = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type MarketTypeOption = {
  id: number;
  name: string;
  metric: string;
  unit: string;
  active: boolean;
};

type PreviewData = {
  average: number;
  unit: string;
  label: string;
};

type CreateDraft = {
  cityQuery: string;
  selectedCity: GeoResult | null;
  marketTypeId: number;
  durationDays: number;
  seedAmount: string;
  seedSide: 'above' | 'below';
  startDate: string;
};

type WritePurpose = 'approval' | 'create' | null;

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Open a missing risk signal',
      intro: 'Use this flow when you want to create a new risk signal for a place. To interact with something already live, browse live signals first — here you choose the place, weather window, seed amount, and starting answer (Yes or No).',
      captainNote: 'Open your city’s question for the week and you’re its captain — you earn a creator share as people come to answer. A weekly window keeps everyone on the same rhythm.',
      place: 'City',
      find: 'Find',
      marketType: 'Weather type',
      starts: 'Observation starts',
      duration: 'Duration in days',
      seedAmount: 'Seed amount',
      startSide: 'Your starting answer',
      yes: 'Yes',
      no: 'No',
      publish: 'Open risk signal',
      connectToCreate: 'Start to open a risk signal',
      allowFunds: 'Allow funds',
      depositCash: 'Deposit test credits',
      getEth: 'Add test funds',
      loadingTypes: 'Loading market types...',
      loadingPool: 'Loading starting total...',
      noPlace: 'Search for a city first.',
      noType: 'Choose a weather type.',
      invalidDuration: 'Duration must be between 2 and 30 days.',
      seedLow: 'Seed must be at least 10 USDC.',
      notEnoughCash: 'You do not have enough test credits.',
      notEnoughGas: 'You need a little more test funds.',
      creating: 'Opening risk signal...',
      allowing: 'Allowing funds...',
      funding: 'Requesting test credits...',
      readyToResume: 'Your draft is saved. Complete the required step and continue.',
      draftSaved: 'Your draft stays saved while you create an account and prepare test funds.',
      defaultPool: 'Starting total',
      balance: 'Balance',
      allowed: 'Allowed',
      gas: 'Gas balance',
      currentAvg: 'Open-Meteo reference',
      cityPlaceholder: 'Perdões, MG',
      preview: 'Preview',
      previewWaiting: 'Preview appears after city, weather type, and duration are ready.',
      previewLoading: 'Checking Open-Meteo...',
      previewUnavailable: 'Could not load preview from Open-Meteo.',
      duplicateMarket: 'A similar risk signal already exists for this city and window.',
      successTitle: 'Your risk signal is open',
      successSubtitle: 'It is live and ready for answers. Share it so your network can answer Yes or No.',
      successShareHint: 'Signals grow when their creator shares them — send it to the people who feel this weather.',
      successEyebrow: 'Signal open',
      successPosterCaption: 'This is the card your network gets',
      successView: 'Open your signal',
      successBrowse: 'See all protections',
      rainQuestion: 'Will it rain more than',
      tempHighQuestion: 'Will the average high temperature exceed',
      tempLowQuestion: 'Will the average low temperature be below',
      snowQuestion: 'Will snowfall accumulate more than',
      coldSpellQuestion: 'Will a cold spell drop the minimum temperature below',
      dryStretchQuestion: 'Will daily rainfall stay at or below',
      frostRiskQuestion: 'Will any night drop below',
      heavyRainQuestion: 'Will any single day bring an unusually heavy rainfall — well above what this place normally sees',
      // "over", not "in" — an imperial rain threshold renders as "1.1 in",
      // and "1.1 in in the next 7 days" is unreadable.
      inNext: 'over the next',
      day: 'day',
      days: 'days',
      thresholdFromPreview: 'This reference is used as the threshold.',
      zeroSignalWarning: 'Heads up: this city shows no recent seasonal history for this weather type. You can still add it, but double-check your choice.',
      marketTypeRain: 'Rain',
      marketTypeTempHigh: 'High temp',
      marketTypeTempLow: 'Low temp',
      marketTypeSnow: 'Snow',
      marketTypeColdSpell: 'Cold spell',
      marketTypeDryStretch: 'Dry stretch',
      marketTypeFrostRisk: 'Frost risk',
      marketTypeHeavyRain: 'Heavy rain event',
      requirements: 'Requirements',
      walletReady: 'Account ready',
      walletMissing: 'Create an account',
      gasReady: 'Test funds ready',
      gasMissing: 'Test funds needed',
      cashReady: 'Cash ready',
      cashMissing: 'Cash needed',
      approvalReady: 'Approval ready',
      approvalMissing: 'Approval needed',
      diagnostics: 'Smart account diagnostics',
      diagnosticsState: 'State',
      diagnosticsSupported: 'Supported',
      diagnosticsConnected: 'Connected',
      diagnosticsAddress: 'Address',
      diagnosticsYes: 'yes',
      diagnosticsNo: 'no',
      diagnosticsNotConnected: 'not connected',
      diagnosticsError: 'Capabilities error',
      // Sentence-builder layer (3b-2a). Reads the form as a single
      // human sentence with tappable tokens instead of a stack of
      // labelled fields. Each verb-phrase wraps a pill that opens
      // the matching picker below.
      sbHeading: 'Create a risk signal',
      sbOpenA: 'Open a',
      sbMarketIn: 'signal in',
      sbStarting: 'starting',
      sbForSpan: 'for',
      sbSeedSentence: 'I seed it with',
      sbOnSide: 'on',
      sbChooseCity: 'choose a city',
      sbChooseType: 'pick a type',
      sbChooseDate: 'choose a start',
      sbChooseDuration: 'choose duration',
      sbChooseAmount: 'choose an amount',
      sbChooseSide: 'choose Yes or No',
      sbEditPrompt: 'Tap any underlined word to change it.',
      sbAllSet: 'Looks good — scroll for the preview and to publish.',
      sbDayShort: 'day',
      sbDaysShort: 'days',
    },
    pt: {
      title: 'Abrir um sinal de risco que falta',
      intro: 'Use este fluxo quando quiser criar um novo sinal de risco para um lugar. Para interagir com algo que já existe, explore os sinais ativos primeiro — aqui você escolhe o lugar, a janela climática, o valor inicial e a resposta inicial (Sim ou Não).',
      captainNote: 'Abra a pergunta da sua cidade para a semana e você vira o capitão dela — você ganha uma parte de criador conforme as pessoas vêm responder. Uma janela semanal mantém todo mundo no mesmo ritmo.',
      place: 'Cidade',
      find: 'Buscar',
      marketType: 'Tipo de clima',
      starts: 'Início da observação',
      duration: 'Duração em dias',
      seedAmount: 'Valor inicial',
      startSide: 'Sua resposta inicial',
      yes: 'Sim',
      no: 'Não',
      publish: 'Abrir sinal de risco',
      connectToCreate: 'Conectar para abrir sinal de risco',
      allowFunds: 'Permitir fundos',
      depositCash: 'Depositar dinheiro de teste',
      getEth: 'Adicionar fundos de teste',
      loadingTypes: 'Carregando tipos de clima...',
      loadingPool: 'Carregando total inicial...',
      noPlace: 'Busque uma cidade primeiro.',
      noType: 'Escolha um tipo de clima.',
      invalidDuration: 'A duração deve ficar entre 2 e 30 dias.',
      seedLow: 'O valor inicial deve ser de pelo menos 10 USDC.',
      notEnoughCash: 'Você não tem dinheiro de teste suficiente.',
      notEnoughGas: 'Você precisa de um pouco mais de fundos de teste.',
      creating: 'Abrindo sinal de risco...',
      allowing: 'Permitindo fundos...',
      funding: 'Depositando dinheiro de teste...',
      readyToResume: 'Seu rascunho está salvo. Complete a etapa necessária e continue.',
      draftSaved: 'Seu rascunho continua salvo enquanto você conecta, recebe fundos ou aprova.',
      defaultPool: 'Total inicial',
      balance: 'Saldo',
      allowed: 'Permitido',
      gas: 'Fundos de teste',
      currentAvg: 'Referência Open-Meteo',
      cityPlaceholder: 'Perdões, MG',
      preview: 'Prévia',
      previewWaiting: 'A prévia aparece depois que cidade, tipo de clima e duração estiverem prontos.',
      previewLoading: 'Consultando Open-Meteo...',
      previewUnavailable: 'Não foi possível carregar a prévia do Open-Meteo.',
      duplicateMarket: 'Já existe um sinal de risco parecido para esta cidade e janela.',
      successTitle: 'Seu sinal de risco está aberto',
      successSubtitle: 'Já está no ar, pronto para respostas. Compartilhe para sua rede responder Sim ou Não.',
      successShareHint: 'Sinais crescem quando o criador compartilha — envie para quem sente esse clima.',
      successEyebrow: 'Sinal aberto',
      successPosterCaption: 'É este o card que sua rede recebe',
      successView: 'Abrir seu sinal',
      successBrowse: 'Ver todas as proteções',
      rainQuestion: 'Vai chover mais que',
      tempHighQuestion: 'A média das máximas vai passar de',
      tempLowQuestion: 'A média das mínimas vai ficar abaixo de',
      snowQuestion: 'O acúmulo de neve vai passar de',
      coldSpellQuestion: 'Vai ter um período de frio com temperatura mínima abaixo de',
      dryStretchQuestion: 'A chuva diária vai ficar igual ou abaixo de',
      frostRiskQuestion: 'Alguma noite vai cair abaixo de',
      heavyRainQuestion: 'Algum dia vai trazer uma chuva muito acima do que esta região normalmente recebe',
      inNext: 'nos próximos',
      day: 'dia',
      days: 'dias',
      thresholdFromPreview: 'Esta referência é usada como limite.',
      zeroSignalWarning: 'Aviso: esta cidade não mostra histórico sazonal recente para esse tipo de clima. Você ainda pode adicionar, mas vale revisar a escolha.',
      marketTypeRain: 'Chuva',
      marketTypeTempHigh: 'Temp. alta',
      marketTypeTempLow: 'Temp. baixa',
      marketTypeSnow: 'Neve',
      marketTypeColdSpell: 'Frio prolongado',
      marketTypeDryStretch: 'Estiagem',
      marketTypeFrostRisk: 'Risco de geada',
      marketTypeHeavyRain: 'Chuva forte',
      requirements: 'Requisitos',
      walletReady: 'Conta pronta',
      walletMissing: 'Crie uma conta',
      gasReady: 'Fundos de teste prontos',
      gasMissing: 'Fundos de teste necessários',
      cashReady: 'Saldo pronto',
      cashMissing: 'Saldo necessário',
      approvalReady: 'Aprovação pronta',
      approvalMissing: 'Aprovação necessária',
      diagnostics: 'Status da conta',
      diagnosticsState: 'Estado',
      diagnosticsSupported: 'Suportado',
      diagnosticsConnected: 'Conectado',
      diagnosticsAddress: 'Endereço',
      diagnosticsYes: 'sim',
      diagnosticsNo: 'não',
      diagnosticsNotConnected: 'não conectado',
      diagnosticsError: 'Erro de capabilities',
      // Sentence-builder PT
      sbHeading: 'Criar sinal de risco',
      sbOpenA: 'Abrir um',
      sbMarketIn: 'sinal em',
      sbStarting: 'começando em',
      sbForSpan: 'por',
      sbSeedSentence: 'Eu semeio com',
      sbOnSide: 'em',
      sbChooseCity: 'escolher uma cidade',
      sbChooseType: 'escolher um tipo',
      sbChooseDate: 'escolher um início',
      sbChooseDuration: 'escolher duração',
      sbChooseAmount: 'escolher um valor',
      sbChooseSide: 'escolher Sim ou Não',
      sbEditPrompt: 'Toque em qualquer palavra sublinhada para alterar.',
      sbAllSet: 'Tudo certo — role para ver a prévia e publicar.',
      sbDayShort: 'dia',
      sbDaysShort: 'dias',
    },
    es: {
      title: 'Abrir una señal de riesgo que falta',
      intro: 'Usa este flujo cuando quieras crear una nueva señal de riesgo para un lugar. Para interactuar con algo que ya está activo, explora primero las señales activas — aquí eliges el lugar, la ventana climática, el monto inicial y la respuesta inicial (Sí o No).',
      captainNote: 'Abre la pregunta de tu ciudad para la semana y serás su capitán — ganas una parte de creador a medida que la gente viene a responder. Una ventana semanal mantiene a todos en el mismo ritmo.',
      place: 'Ciudad',
      find: 'Buscar',
      marketType: 'Tipo de clima',
      starts: 'Inicio de observación',
      duration: 'Duración en días',
      seedAmount: 'Monto inicial',
      startSide: 'Tu respuesta inicial',
      yes: 'Sí',
      no: 'No',
      publish: 'Abrir señal de riesgo',
      connectToCreate: 'Conectar para abrir señal de riesgo',
      allowFunds: 'Permitir fondos',
      depositCash: 'Depositar fondos de prueba',
      getEth: 'Añadir gas inicial',
      loadingTypes: 'Cargando tipos de clima...',
      loadingPool: 'Cargando total inicial...',
      noPlace: 'Busca una ciudad primero.',
      noType: 'Elige un tipo de clima.',
      invalidDuration: 'La duración debe estar entre 2 y 30 días.',
      seedLow: 'El monto inicial debe ser de al menos 10 USDC.',
      notEnoughCash: 'No tienes suficientes fondos de prueba.',
      notEnoughGas: 'Necesitas un poco de ETH para gas.',
      creating: 'Abriendo señal de riesgo...',
      allowing: 'Permitiendo fondos...',
      funding: 'Solicitando fondos de prueba...',
      readyToResume: 'Tu borrador está guardado. Completa el paso requerido y continúa.',
      draftSaved: 'Tu borrador se guarda mientras conectas, fondeas o apruebas.',
      defaultPool: 'Total inicial',
      balance: 'Saldo',
      allowed: 'Permitido',
      gas: 'Saldo de gas',
      currentAvg: 'Referencia Open-Meteo',
      cityPlaceholder: 'Buenos Aires',
      preview: 'Vista previa',
      previewWaiting: 'La vista previa aparece cuando ciudad, tipo de clima y duración estén listos.',
      previewLoading: 'Consultando Open-Meteo...',
      previewUnavailable: 'No se pudo cargar la vista previa de Open-Meteo.',
      duplicateMarket: 'Ya existe una señal de riesgo similar para esta ciudad y ventana.',
      successTitle: 'Tu señal de riesgo está abierta',
      successSubtitle: 'Ya está activa, lista para respuestas. Compártela para que tu red responda Sí o No.',
      successShareHint: 'Las señales crecen cuando su creador las comparte — envíala a quienes sienten este clima.',
      successEyebrow: 'Señal abierta',
      successPosterCaption: 'Esta es la tarjeta que recibe tu red',
      successView: 'Abrir tu señal',
      successBrowse: 'Ver todas las protecciones',
      rainQuestion: '¿Lloverá más de',
      tempHighQuestion: '¿La temperatura máxima promedio superará',
      tempLowQuestion: '¿La temperatura mínima promedio estará por debajo de',
      snowQuestion: '¿La acumulación de nieve superará',
      inNext: 'en los próximos',
      day: 'día',
      days: 'días',
      thresholdFromPreview: 'Esta referencia se usa como umbral.',
      zeroSignalWarning: 'Atención: esta ciudad no muestra historial estacional reciente para este tipo de clima. Puedes agregarla igual, pero verifica tu elección.',
      marketTypeRain: 'Lluvia',
      marketTypeTempHigh: 'Temp. alta',
      marketTypeTempLow: 'Temp. baja',
      marketTypeSnow: 'Nieve',
      requirements: 'Requisitos',
      walletReady: 'Wallet lista',
      walletMissing: 'Conexión requerida',
      gasReady: 'Gas listo',
      gasMissing: 'Gas necesario',
      cashReady: 'Saldo listo',
      cashMissing: 'Saldo necesario',
      approvalReady: 'Aprobación lista',
      approvalMissing: 'Aprobación necesaria',
      diagnostics: 'Diagnóstico smart account',
      diagnosticsState: 'Estado',
      diagnosticsSupported: 'Compatible',
      diagnosticsConnected: 'Conectado',
      diagnosticsAddress: 'Dirección',
      diagnosticsYes: 'sí',
      diagnosticsNo: 'no',
      diagnosticsNotConnected: 'no conectado',
      diagnosticsError: 'Error de capabilities',
      marketTypeColdSpell: 'Ola de frío',
      marketTypeDryStretch: 'Sequía',
      marketTypeFrostRisk: 'Riesgo de helada',
      marketTypeHeavyRain: 'Evento de lluvia fuerte',
      coldSpellQuestion: '¿Una ola de frío bajará la temperatura mínima por debajo de',
      dryStretchQuestion: '¿La lluvia diaria se mantendrá igual o por debajo de',
      frostRiskQuestion: '¿Alguna noche bajará de',
      heavyRainQuestion: '¿Algún día traerá una lluvia inusualmente fuerte — muy por encima de lo que este lugar suele ver',
      sbHeading: 'Crear señal de riesgo',
      sbOpenA: 'Abrir una',
      sbMarketIn: 'señal en',
      sbStarting: 'empezando el',
      sbForSpan: 'por',
      sbSeedSentence: 'La siembro con',
      sbOnSide: 'en',
      sbChooseCity: 'elige una ciudad',
      sbChooseType: 'elige un tipo',
      sbChooseDate: 'elige un inicio',
      sbChooseDuration: 'elige la duración',
      sbChooseAmount: 'elige un monto',
      sbChooseSide: 'elige Sí o No',
      sbEditPrompt: 'Toca cualquier palabra subrayada para cambiarla.',
      sbAllSet: 'Se ve bien — desplázate para ver la vista previa y publicar.',
      sbDayShort: 'día',
      sbDaysShort: 'días',
    },
    fr: {
  title: 'Ouvrir un signal de risque manquant',
  intro: "Utilisez ce flux pour créer un nouveau signal de risque pour un lieu. Pour interagir avec quelque chose déjà actif, explorez d'abord les signaux actifs — ici vous choisissez le lieu, la fenêtre météo, le montant initial et la réponse de départ (Oui ou Non).",
      captainNote: "Ouvre la question de ta ville pour la semaine et tu en deviens le capitaine — tu gagnes une part de créateur à mesure que les gens viennent répondre. Une fenêtre hebdomadaire garde tout le monde au même rythme.",
  place: 'Ville',
  find: 'Rechercher',
  marketType: 'Type de météo',
  starts: "Début d'observation",
  duration: 'Durée en jours',
  seedAmount: 'Mise de départ',
  startSide: 'Votre réponse initiale',
      yes: 'Oui',
      no: 'Non',
  publish: 'Ouvrir le signal de risque',
  connectToCreate: 'Se connecter pour ouvrir un signal de risque',
  allowFunds: 'Autoriser les fonds',
  depositCash: 'Déposer des fonds de test',
  getEth: 'Ajouter du gas de départ',
  loadingTypes: 'Chargement des types météo...',
  loadingPool: 'Chargement du total initial...',
  noPlace: "Recherchez une ville d'abord.",
  noType: 'Choisissez un type météo.',
  invalidDuration: 'La durée doit être entre 2 et 30 jours.',
  seedLow: "La mise doit être d'au moins 10 USDC.",
  notEnoughCash: "Vous n'avez pas assez de fonds de test.",
  notEnoughGas: "Vous avez besoin d'un peu de ETH pour le gas.",
  creating: 'Ouverture du signal de risque...',
  allowing: 'Autorisation des fonds...',
  funding: 'Demande de fonds de test...',
  readyToResume: "Votre brouillon est sauvegardé. Complétez l'étape requise et continuez.",
  draftSaved: 'Votre brouillon reste sauvegardé pendant que vous connectez, financez ou approuvez.',
  defaultPool: 'Total initial',
  balance: 'Solde',
  allowed: 'Autorisé',
  gas: 'Solde gas',
  currentAvg: 'Référence Open-Meteo',
  cityPlaceholder: 'Paris',
  preview: 'Aperçu',
  previewWaiting: "L'aperçu apparaît quand la ville, le type météo et la durée sont prêts.",
  previewLoading: 'Consultation Open-Meteo...',
  previewUnavailable: "Impossible de charger l'aperçu depuis Open-Meteo.",
  duplicateMarket: 'Un signal similaire existe déjà pour cette ville et cette fenêtre.',
  successTitle: 'Votre signal de risque est ouvert',
  successSubtitle: 'Il est en ligne, prêt pour les réponses. Partagez-le pour que votre réseau réponde Oui ou Non.',
  successShareHint: 'Un signal grandit quand son créateur le partage — envoyez-le à ceux qui vivent cette météo.',
  successEyebrow: 'Signal ouvert',
  successPosterCaption: 'Voici la carte que reçoit votre réseau',
  successView: 'Ouvrir votre signal',
  successBrowse: 'Voir toutes les protections',
  rainQuestion: "Est-ce qu'il pleuvra plus de",
  tempHighQuestion: 'La température maximale moyenne dépassera-t-elle',
  tempLowQuestion: 'La température minimale moyenne sera-t-elle inférieure à',
  snowQuestion: "L'accumulation de neige dépassera-t-elle",
  inNext: 'dans les',
  day: 'jour',
  days: 'jours',
  thresholdFromPreview: 'Cette référence est utilisée comme seuil.',
  zeroSignalWarning: "Attention : cette ville n'affiche pas d'historique saisonnier récent pour ce type météo. Vous pouvez l'ajouter quand même, mais vérifiez votre choix.",
  marketTypeRain: 'Pluie',
  marketTypeTempHigh: 'Temp. haute',
  marketTypeTempLow: 'Temp. basse',
  marketTypeSnow: 'Neige',
  requirements: 'Prérequis',
  walletReady: 'Portefeuille prêt',
  walletMissing: 'Connexion requise',
  gasReady: 'Gas prêt',
  gasMissing: 'Gas nécessaire',
  cashReady: 'Solde prêt',
  cashMissing: 'Solde nécessaire',
  approvalReady: 'Approbation prête',
  approvalMissing: 'Approbation nécessaire',
  diagnostics: 'Diagnostic smart account',
  diagnosticsState: 'État',
  diagnosticsSupported: 'Pris en charge',
  diagnosticsConnected: 'Connecté',
  diagnosticsAddress: 'Adresse',
  diagnosticsYes: 'oui',
  diagnosticsNo: 'non',
  diagnosticsNotConnected: 'non connecté',
  diagnosticsError: 'Erreur de capabilities',
  marketTypeColdSpell: 'Vague de froid',
  marketTypeDryStretch: 'Sécheresse',
  marketTypeFrostRisk: 'Risque de gel',
  marketTypeHeavyRain: 'Événement de pluie forte',
  coldSpellQuestion: 'Une vague de froid fera-t-elle descendre la température minimale en dessous de',
  dryStretchQuestion: 'La pluie quotidienne restera-t-elle égale ou inférieure à',
  frostRiskQuestion: 'Une nuit descendra-t-elle en dessous de',
  heavyRainQuestion: "Un seul jour apportera-t-il une pluie inhabituellement forte — bien au-dessus de ce que ce lieu voit normalement",
  sbHeading: 'Créer un signal de risque',
  sbOpenA: 'Ouvrir un',
  sbMarketIn: 'signal à',
  sbStarting: 'à partir du',
  sbForSpan: 'pendant',
  sbSeedSentence: "Je l'amorce avec",
  sbOnSide: 'sur',
  sbChooseCity: 'choisis une ville',
  sbChooseType: 'choisis un type',
  sbChooseDate: 'choisis un début',
  sbChooseDuration: 'choisis une durée',
  sbChooseAmount: 'choisis un montant',
  sbChooseSide: 'choisis Oui ou Non',
  sbEditPrompt: 'Touche un mot souligné pour le modifier.',
  sbAllSet: "Ça a l'air bon — fais défiler pour l'aperçu et pour publier.",
  sbDayShort: 'jour',
  sbDaysShort: 'jours',
},
    de: {
      title: 'Ein fehlendes Risiko-Signal öffnen',
      intro: 'Nutze diesen Ablauf, wenn du ein neues Risiko-Signal für einen Ort erstellen willst. Wenn du mit etwas interagieren willst, das bereits aktiv ist, sieh dir zuerst die Live-Signale an — hier wählst du Ort, Wetterfenster, Startbetrag und Startantwort (Ja oder Nein).',
      captainNote: 'Öffne die Frage deiner Stadt für die Woche und du bist ihr Kapitän — du verdienst einen Creator-Anteil, während die Leute zum Antworten kommen. Ein Wochenfenster hält alle im selben Rhythmus.',
      place: 'Stadt',
      find: 'Suchen',
      marketType: 'Wettertyp',
      starts: 'Beobachtung beginnt',
      duration: 'Dauer in Tagen',
      seedAmount: 'Startbetrag',
      startSide: 'Deine Startantwort',
      yes: 'Ja',
      no: 'Nein',
      publish: 'Risiko-Signal öffnen',
      connectToCreate: 'Verbinden, um ein Risiko-Signal zu öffnen',
      allowFunds: 'Mittel freigeben',
      depositCash: 'Test-Cash einzahlen',
      getEth: 'Startgas hinzufügen',
      loadingTypes: 'Wettertypen werden geladen...',
      loadingPool: 'Startbetrag wird geladen...',
      noPlace: 'Suche zuerst eine Stadt.',
      noType: 'Wähle einen Wettertyp.',
      invalidDuration: 'Die Dauer muss zwischen 2 und 30 Tagen liegen.',
      seedLow: 'Der Startbetrag muss mindestens 10 USDC betragen.',
      notEnoughCash: 'Du hast nicht genug Test-Cash.',
      notEnoughGas: 'Du brauchst etwas ETH für Gas.',
      creating: 'Risiko-Signal wird geöffnet...',
      allowing: 'Mittel werden freigegeben...',
      funding: 'Test-Cash wird angefordert...',
      readyToResume: 'Dein Entwurf ist gespeichert. Schließe den erforderlichen Schritt ab und fahre fort.',
      draftSaved: 'Dein Entwurf bleibt gespeichert, während du dich verbindest, Mittel aufstockst oder genehmigst.',
      defaultPool: 'Startbetrag',
      balance: 'Guthaben',
      allowed: 'Genehmigt',
      gas: 'Gas-Guthaben',
      currentAvg: 'Open-Meteo Referenz',
      cityPlaceholder: 'Berlin',
      preview: 'Vorschau',
      previewWaiting: 'Die Vorschau erscheint, wenn Stadt, Wettertyp und Dauer bereit sind.',
      previewLoading: 'Open-Meteo wird abgefragt...',
      previewUnavailable: 'Vorschau von Open-Meteo konnte nicht geladen werden.',
      duplicateMarket: 'Ein ähnliches Signal existiert bereits für diese Stadt und dieses Fenster.',
      successTitle: 'Dein Risikosignal ist offen',
      successSubtitle: 'Es ist live und bereit für Antworten. Teile es, damit dein Netzwerk mit Ja oder Nein antworten kann.',
      successShareHint: 'Signale wachsen, wenn ihr Ersteller sie teilt — schick es an alle, die dieses Wetter betrifft.',
      successEyebrow: 'Signal offen',
      successPosterCaption: 'Diese Karte bekommt dein Netzwerk',
      successView: 'Dein Signal öffnen',
      successBrowse: 'Alle Absicherungen ansehen',
      rainQuestion: 'Wird es mehr als',
      tempHighQuestion: 'Wird die durchschnittliche Höchsttemperatur',
      tempLowQuestion: 'Wird die durchschnittliche Tiefsttemperatur unter',
      snowQuestion: 'Wird die Schneeakkumulation mehr als',
      inNext: 'in den nächsten',
      day: 'Tag',
      days: 'Tagen',
      thresholdFromPreview: 'Diese Referenz wird als Schwellenwert verwendet.',
      zeroSignalWarning: 'Achtung: Diese Stadt zeigt keinen aktuellen saisonalen Verlauf für diesen Wettertyp. Du kannst sie trotzdem hinzufügen, aber überprüfe deine Wahl.',
      marketTypeRain: 'Regen',
      marketTypeTempHigh: 'Höchsttemp.',
      marketTypeTempLow: 'Tiefsttemp.',
      marketTypeSnow: 'Schnee',
      requirements: 'Voraussetzungen',
      walletReady: 'Wallet bereit',
      walletMissing: 'Verbindung erforderlich',
      gasReady: 'Gas bereit',
      gasMissing: 'Gas benötigt',
      cashReady: 'Guthaben bereit',
      cashMissing: 'Guthaben benötigt',
      approvalReady: 'Genehmigung bereit',
      approvalMissing: 'Genehmigung benötigt',
      diagnostics: 'Smart Account Diagnose',
      diagnosticsState: 'Status',
      diagnosticsSupported: 'Unterstützt',
      diagnosticsConnected: 'Verbunden',
      diagnosticsAddress: 'Adresse',
      diagnosticsYes: 'ja',
      diagnosticsNo: 'nein',
      diagnosticsNotConnected: 'nicht verbunden',
      diagnosticsError: 'Capabilities-Fehler',
      marketTypeColdSpell: 'Kältewelle',
      marketTypeDryStretch: 'Trockenheit',
      marketTypeFrostRisk: 'Frostrisiko',
      marketTypeHeavyRain: 'Starkregen-Ereignis',
      coldSpellQuestion: 'Wird eine Kältewelle die Tiefsttemperatur unter',
      dryStretchQuestion: 'Bleibt der Tagesniederschlag bei oder unter',
      frostRiskQuestion: 'Fällt eine Nacht unter',
      heavyRainQuestion: 'Bringt ein einzelner Tag ungewöhnlich starken Regen — weit über dem, was dieser Ort normalerweise sieht',
      sbHeading: 'Risiko-Signal erstellen',
      sbOpenA: 'Öffne ein',
      sbMarketIn: 'Signal in',
      sbStarting: 'ab',
      sbForSpan: 'für',
      sbSeedSentence: 'Ich starte es mit',
      sbOnSide: 'auf',
      sbChooseCity: 'wähle eine Stadt',
      sbChooseType: 'wähle einen Typ',
      sbChooseDate: 'wähle einen Start',
      sbChooseDuration: 'wähle eine Dauer',
      sbChooseAmount: 'wähle einen Betrag',
      sbChooseSide: 'wähle Ja oder Nein',
      sbEditPrompt: 'Tippe auf ein unterstrichenes Wort, um es zu ändern.',
      sbAllSet: 'Sieht gut aus — scrolle für die Vorschau und zum Veröffentlichen.',
      sbDayShort: 'Tag',
      sbDaysShort: 'Tage',
    },
    zh: {
      title: '开通缺失的风险信号',
      intro: '当你想为某个地点创建新的风险信号时使用此流程。若要参与已经存在的内容，请先浏览实时信号 — 这里用于选择地点、天气窗口、初始金额和初始回答（是或否）。',
      captainNote: '为你的城市开启本周的问题，你就是它的队长——随着大家前来回答，你将获得创建者分成。每周的窗口让所有人保持同一节奏。',
      place: '城市',
      find: '搜索',
      marketType: '天气类型',
      starts: '观察开始',
      duration: '持续天数',
      seedAmount: '启动金额',
      startSide: '你的初始回答',
      yes: '是',
      no: '否',
      publish: '开通风险信号',
      connectToCreate: '连接以开通风险信号',
      allowFunds: '授权资金',
      depositCash: '充值测试资金',
      getEth: '添加启动手续费',
      loadingTypes: '正在加载天气类型...',
      loadingPool: '正在加载初始总额...',
      noPlace: '请先搜索城市。',
      noType: '请选择天气类型。',
      invalidDuration: '持续时间必须在 2 到 30 天之间。',
      seedLow: '启动金额至少需要 10 USDC。',
      notEnoughCash: '你没有足够的测试资金。',
      notEnoughGas: '你需要一点 ETH 作为手续费。',
      creating: '正在开通风险信号...',
      allowing: '正在授权资金...',
      funding: '正在请求测试资金...',
      readyToResume: '你的草稿已保存。完成所需步骤后继续。',
      draftSaved: '连接、充值或授权期间草稿保持保存状态。',
      defaultPool: '初始总额',
      balance: '余额',
      allowed: '已授权',
      gas: '手续费余额',
      currentAvg: 'Open-Meteo 参考值',
      cityPlaceholder: '北京',
      preview: '预览',
      previewWaiting: '城市、天气类型和持续时间准备好后预览将显示。',
      previewLoading: '正在查询 Open-Meteo...',
      previewUnavailable: '无法从 Open-Meteo 加载预览。',
      duplicateMarket: '该城市和时间窗口已存在类似信号。',
      successTitle: '你的风险信号已开启',
      successSubtitle: '已经上线，等待回答。分享给你的网络，让大家回答“是”或“否”。',
      successShareHint: '信号因分享而成长——发给关心这片天气的人。',
      successEyebrow: '信号已开启',
      successPosterCaption: '这就是你的网络会看到的卡片',
      successView: '打开你的信号',
      successBrowse: '查看全部保护',
      rainQuestion: '降雨量是否会超过',
      tempHighQuestion: '平均最高气温是否会超过',
      tempLowQuestion: '平均最低气温是否会低于',
      snowQuestion: '积雪量是否会超过',
      inNext: '在接下来的',
      day: '天',
      days: '天',
      thresholdFromPreview: '此参考值用作阈值。',
      zeroSignalWarning: '注意：该城市没有此天气类型的近期季节性历史数据。你仍然可以添加，但请仔细确认你的选择。',
      marketTypeRain: '降雨',
      marketTypeTempHigh: '最高温',
      marketTypeTempLow: '最低温',
      marketTypeSnow: '降雪',
      requirements: '要求',
      walletReady: '钱包已就绪',
      walletMissing: '需要连接',
      gasReady: '手续费已就绪',
      gasMissing: '需要手续费',
      cashReady: '余额已就绪',
      cashMissing: '需要余额',
      approvalReady: '授权已就绪',
      approvalMissing: '需要授权',
      diagnostics: '智能账户诊断',
      diagnosticsState: '状态',
      diagnosticsSupported: '已支持',
      diagnosticsConnected: '已连接',
      diagnosticsAddress: '地址',
      diagnosticsYes: '是',
      diagnosticsNo: '否',
      diagnosticsNotConnected: '未连接',
      diagnosticsError: 'Capabilities 错误',
      marketTypeColdSpell: '寒潮',
      marketTypeDryStretch: '干旱',
      marketTypeFrostRisk: '霜冻风险',
      marketTypeHeavyRain: '强降雨事件',
      coldSpellQuestion: '寒潮是否会让最低气温降到低于',
      dryStretchQuestion: '每日降雨是否会保持在或低于',
      frostRiskQuestion: '是否会有任何一晚低于',
      heavyRainQuestion: '是否会有某一天带来异常强的降雨 — 远超这个地方通常所见',
      sbHeading: '创建风险信号',
      sbOpenA: '开通一个',
      sbMarketIn: '信号，地点',
      sbStarting: '开始于',
      sbForSpan: '持续',
      sbSeedSentence: '我用',
      sbOnSide: '在',
      sbChooseCity: '选择一个城市',
      sbChooseType: '选择类型',
      sbChooseDate: '选择开始日期',
      sbChooseDuration: '选择时长',
      sbChooseAmount: '选择金额',
      sbChooseSide: '选择是或否',
      sbEditPrompt: '点击任意带下划线的词即可更改。',
      sbAllSet: '看起来不错 — 向下滚动查看预览并发布。',
      sbDayShort: '天',
      sbDaysShort: '天',
    },
  };

  // Per-key fallback: a key missing from a translation renders the English
  // copy instead of `undefined`.
  return { ...table.en, ...(table[language] ?? {}) };
}

/**
 * Format a YYYY-MM-DD string as a short, locale-aware label for the
 * sentence-builder pill (e.g. "May 24"). Falls back to the raw string
 * if parsing fails.
 */
function formatDatePill(iso: string, locale: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
}

function formatDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildCityLabel(city: GeoResult) {
  return [city.name, city.admin1, city.country].filter(Boolean).join(', ');
}

function getDailyField(typeId: number) {
  if (typeId === MARKET_TYPES.RAIN) return 'precipitation_sum';
  if (typeId === MARKET_TYPES.TEMP_LOW) return 'temperature_2m_min';
  if (typeId === MARKET_TYPES.SNOW) return 'snowfall_sum';
  // V6 binary signal types — show a sensible historical reference even
  // though the on-chain semantics are binary. Helps users pick a
  // reasonable threshold from the preview panel.
  if (typeId === MARKET_TYPES.COLD_SPELL) return 'temperature_2m_min';
  if (typeId === MARKET_TYPES.DRY_STRETCH) return 'precipitation_sum';
  if (typeId === MARKET_TYPES.FROST_RISK) return 'temperature_2m_min';
  if (typeId === MARKET_TYPES.HEAVY_RAIN) return 'precipitation_sum';
  return 'temperature_2m_max';
}

// The setup screen must ask the question in the SAME units the reader sees
// everywhere else — a US grower who reads 82°F on Today should not be handed
// a 28°C question here. The threshold itself stays metric: it is what goes
// on-chain and what the oracle resolves against. `system` converts at the
// last moment, exactly like lib/market-question.ts does for live signals.
function getQuestionText(
  marketTypeId: number,
  threshold: number | string,
  unit: string,
  durationDays: number,
  copy: Record<string, string>,
  system: UnitSystem = 'metric'
) {
  const dayLabel = durationDays === 1 ? copy.day : copy.days;

  // While the preview is still loading, `threshold` is a placeholder string —
  // keep it, but still show the unit label the reader expects.
  const numeric = typeof threshold === 'number' && Number.isFinite(threshold);
  const conv = numeric
    ? convertThreshold(threshold as number, unit, system)
    : { value: threshold, unit: convertThreshold(0, unit, system).unit };
  const v = conv.value;
  const u = conv.unit;

  const coldLine = numeric ? thresholdTemp(threshold as number, system) : `${threshold}${convertThreshold(0, '°C', system).unit}`;
  const dryLine = numeric ? thresholdPrecip(threshold as number, system) : `${threshold}${convertThreshold(0, 'mm', system).unit}`;
  const frostLine = thresholdTemp(2, system);

  if (marketTypeId === MARKET_TYPES.RAIN) {
    return `${copy.rainQuestion} ${v}${u} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.TEMP_LOW) {
    return `${copy.tempLowQuestion} ${v}${u} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.SNOW) {
    return `${copy.snowQuestion} ${v}${u} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) {
    return `${copy.coldSpellQuestion ?? 'Will a cold spell hit with temperatures below'} ${coldLine} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return `${copy.dryStretchQuestion ?? 'Will a dry stretch with daily rainfall at most'} ${dryLine} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.FROST_RISK) {
    return `${copy.frostRiskQuestion ?? 'Will any night drop below'} ${frostLine} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return `${copy.heavyRainQuestion ?? 'Will any single day bring an unusually heavy rainfall — well above what this place normally sees'} ${copy.inNext} ${durationDays} ${dayLabel}?`;
  }
  return `${copy.tempHighQuestion} ${v}${u} ${copy.inNext} ${durationDays} ${dayLabel}?`;
}

function getMarketTypeLabel(typeId: number, copy: Record<string, string>) {
  if (typeId === MARKET_TYPES.RAIN) return copy.marketTypeRain;
  if (typeId === MARKET_TYPES.TEMP_LOW) return copy.marketTypeTempLow;
  if (typeId === MARKET_TYPES.SNOW) return copy.marketTypeSnow;
  if (typeId === MARKET_TYPES.COLD_SPELL) return copy.marketTypeColdSpell ?? 'Cold spell';
  if (typeId === MARKET_TYPES.DRY_STRETCH) return copy.marketTypeDryStretch ?? 'Dry stretch';
  if (typeId === MARKET_TYPES.FROST_RISK) return copy.marketTypeFrostRisk ?? 'Frost risk';
  if (typeId === MARKET_TYPES.HEAVY_RAIN) return copy.marketTypeHeavyRain ?? 'Heavy rain event';
  return copy.marketTypeTempHigh;
}

function marketGridKey(lat: number, lon: number, marketTypeId: number) {
  const step = 100000;
  const latScaled = Math.round(lat * 1_000_000);
  const lonScaled = Math.round(lon * 1_000_000);
  const gridLat = Math.trunc(latScaled / step) * step;
  const gridLon = Math.trunc(lonScaled / step) * step;
  return `${gridLat}:${gridLon}:${marketTypeId}`;
}

function readDraft(): CreateDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CREATE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CreateDraft;
  } catch {
    return null;
  }
}

function writeDraft(draft: CreateDraft) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CREATE_DRAFT_KEY);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function CreatePage() {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const { system } = useUnits();
  const copy = pageCopy(language);
  const router = useRouter();

  const { address, isConnected, chainId } = useAccount();

  const todayString = useMemo(() => formatDateLocal(new Date()), []);
  // Answering always closes when observation begins (the contract's future-start
  // branch). Forcing the earliest start to tomorrow means every market is
  // future-dated, so there is always a lead window (creation → start) for people
  // to answer, and no market is ever answerable mid-observation with the weather
  // already unfolding. See ANSWER_ANCHOR_HOUR for the time we pin the start to.
  const tomorrowString = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDateLocal(d);
  }, []);
  const initialDraft = useMemo<CreateDraft>(
    () => ({
      cityQuery: '',
      selectedCity: null,
      marketTypeId: MARKET_TYPES.RAIN,
      durationDays: 7,
      seedAmount: '10',
      seedSide: 'above',
      startDate: tomorrowString,
    }),
    [tomorrowString]
  );

  const [cityQuery, setCityQuery] = useState(initialDraft.cityQuery);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<GeoResult | null>(initialDraft.selectedCity);

  // Quick launch source — read from ?lat=&lon=&name= passed by the home panel.
  const searchParams = useSearchParams();

  const [marketTypeId, setMarketTypeId] = useState<number>(initialDraft.marketTypeId);
  const [durationDays, setDurationDays] = useState<number>(initialDraft.durationDays);
  const [seedAmount, setSeedAmount] = useState(initialDraft.seedAmount);
  const [seedSide, setSeedSide] = useState<'above' | 'below'>(initialDraft.seedSide);
  const [startDate, setStartDate] = useState(initialDraft.startDate);
  const [statusText, setStatusText] = useState('');
  const [lastWritePurpose, setLastWritePurpose] = useState<WritePurpose>(null);
  // Set when the create tx confirms — switches the page to the success +
  // share screen instead of silently redirecting to /markets.
  const [createdMarketId, setCreatedMarketId] = useState<bigint | null>(null);
  // Captured at submit time from the live preview — the success screen can't
  // recompute the question because the just-created market trips the duplicate
  // guard, which nulls `preview` (that was the "exceed …°C" bug).
  const [createdQuestion, setCreatedQuestion] = useState<string>('');
  const queryClient = useQueryClient();
  const [optimisticAllowance, setOptimisticAllowance] = useState(0n);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [hydratedDraft, setHydratedDraft] = useState(false);

  // Sentence-builder: which token in the sentence is currently being
  // edited. Only one picker is open at a time. `null` means "review
  // mode" — the sentence reads as a finished phrase with no open
  // editor.
  type PillId =
    | 'city'
    | 'type'
    | 'start'
    | 'duration'
    | 'seed-amount'
    | 'seed-side';
  const [activePill, setActivePill] = useState<PillId | null>(null);
  const activeStepRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activePill || typeof window === 'undefined') return;
    if (window.innerWidth > 720) return;
    const timeout = window.setTimeout(() => {
      activeStepRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [activePill]);

  useEffect(() => {
    // Hydrate from the saved draft first
    const draft = readDraft();
    let nextCity: GeoResult | null = draft?.selectedCity ?? null;

    // URL params take precedence so home quick-launch + signal-card CTAs
    // always land on the requested city/type/window even if a stale draft
    // exists in localStorage. Accepted query params:
    //   lat, lon, name             — place
    //   type                       — market type id (1-4 user-creatable)
    //   start                      — ISO date YYYY-MM-DD
    //   duration                   — integer days
    // Any subset can be provided; the rest fall back to the draft or
    // sensible defaults.
    const urlLat = searchParams.get('lat');
    const urlLon = searchParams.get('lon');
    const urlName = searchParams.get('name');
    if (urlLat && urlLon && urlName) {
      const parsedLat = Number(urlLat);
      const parsedLon = Number(urlLon);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
        nextCity = {
          id: Date.now(),
          name: urlName,
          // region/country are optional; when a link omits them the
          // geocoding backfill effect below fills them in, so the
          // on-chain city label stays "City, Region, Country".
          country: searchParams.get('country') ?? '',
          admin1: searchParams.get('region') ?? '',
          latitude: parsedLat,
          longitude: parsedLon,
        } as GeoResult;
      }
    }
    const urlType = searchParams.get('type');
    const urlStart = searchParams.get('start');
    const urlDuration = searchParams.get('duration');

    if (draft) {
      setCityQuery(draft.cityQuery || '');
      setMarketTypeId(draft.marketTypeId || MARKET_TYPES.RAIN);
      setDurationDays(draft.durationDays || 7);
      setSeedAmount(draft.seedAmount || '10');
      setSeedSide(draft.seedSide === 'below' ? 'below' : 'above');
      // Clamp a stale draft's start up to tomorrow — an older draft may hold
      // today (or the past), which would create an instant-start market.
      setStartDate(
        draft.startDate && draft.startDate >= tomorrowString
          ? draft.startDate
          : tomorrowString
      );
      setStatusText(copy.readyToResume);
    }

    // Apply URL overrides last so they win against the draft.
    if (urlType) {
      const parsedType = Number(urlType);
      const allowed: ReadonlyArray<number> = [
        MARKET_TYPES.RAIN,
        MARKET_TYPES.TEMP_HIGH,
        MARKET_TYPES.TEMP_LOW,
        MARKET_TYPES.SNOW,
      ];
      if (Number.isFinite(parsedType) && allowed.includes(parsedType)) {
        // .includes against a number[] narrowed to user-creatable IDs above
        setMarketTypeId(parsedType as 1 | 2 | 3 | 4);
      }
    }
    if (urlStart && /^\d{4}-\d{2}-\d{2}$/.test(urlStart)) {
      // Quick-launch links must also respect the tomorrow floor so they can't
      // reintroduce an instant-start market; anything earlier snaps to tomorrow.
      setStartDate(urlStart >= tomorrowString ? urlStart : tomorrowString);
    }
    if (urlDuration) {
      const parsedDur = Number(urlDuration);
      if (Number.isFinite(parsedDur) && parsedDur >= 1 && parsedDur <= 90) {
        setDurationDays(Math.floor(parsedDur));
      }
    }

    if (nextCity) {
      setSelectedCity(nextCity);
    }

    setHydratedDraft(true);

    // Sentence-builder onboarding: if the user lands on /create without
    // a selected city, open the city picker by default so the first
    // tap-target is obvious. If a city is already in the draft / URL,
    // start in review mode (null) and let them re-edit on demand.
    if (!nextCity) {
      setActivePill('city');
    }
    // run once on mount — params and draft are read fresh on each navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedDraft) return;

    writeDraft({
      cityQuery,
      selectedCity,
      marketTypeId,
      durationDays,
      seedAmount,
      seedSide,
      startDate,
    });
  }, [
    hydratedDraft,
    cityQuery,
    selectedCity,
    marketTypeId,
    durationDays,
    seedAmount,
    seedSide,
    startDate,
  ]);

  // Quick-launch links may carry only name + coords. The city label is
  // written on-chain immutably at create time, so backfill region/country
  // before publish: look the name up on Open-Meteo geocoding and take the
  // candidate closest to the given coords (must be within 100km — a name
  // collision on another continent must not relabel the place). If nothing
  // matches, the bare name still publishes fine.
  useEffect(() => {
    const city = selectedCity;
    if (!city || city.admin1 || city.country) return;

    let active = true;

    (async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            city.name.trim()
          )}&count=5&language=en&format=json`
        );
        const data = await res.json();
        const results: GeoResult[] = Array.isArray(data?.results) ? data.results : [];

        let best: GeoResult | null = null;
        let bestKm = 100;
        for (const r of results) {
          if (!Number.isFinite(r?.latitude) || !Number.isFinite(r?.longitude)) continue;
          const km = haversineKm(city.latitude, city.longitude, r.latitude, r.longitude);
          if (km < bestKm) {
            best = r;
            bestKm = km;
          }
        }

        if (active && best && (best.admin1 || best.country)) {
          setSelectedCity({
            ...city,
            admin1: best.admin1 ?? '',
            country: best.country ?? '',
            timezone: city.timezone ?? best.timezone,
          });
        }
      } catch {
        // Best-effort — the signal can still be opened with the bare name.
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedCity]);

  const { data: launchPoolData } = useReadContract({
    chainId: CHAIN.id,
    address: CONTRACTS.MARKET_LAUNCHER_CONFIG,
    abi: marketLauncherConfigAbi,
    functionName: 'getDefaultPool',
  });

  const launchPool =
    launchPoolData && Array.isArray(launchPoolData)
      ? (launchPoolData[1] as `0x${string}`)
      : CONTRACTS.CLIMATE_POOL;

  // Read all 8 registered types from MarketTypeRegistry (V5 ids 1-4 plus
  // V6 ids 5-8).
  const MARKET_TYPE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  // Types intentionally not offered to users in /create, even though they
  // remain registered on-chain and continue to fire as signals via the
  // signal_type_registry. typeId 8 (heavy_rain_event) was validated
  // against a 12-city dataset and the percentile-based threshold doesn't
  // compress to a single uint256 in a way that's meaningful across
  // climate zones (P95 ranges from 1mm in arid to 120mm in monsoon).
  // The signal layer already does the per-place computation — exposing it
  // as a market type would force the user to pick a number that doesn't
  // generalize. Heavy-rain context still surfaces via /signals.
  const HIDDEN_MARKET_TYPES = useMemo(() => new Set<number>([8]), []);

  const marketTypeReads = useReadContracts({
    contracts: MARKET_TYPE_IDS.map((id) => ({
      address: CONTRACTS.MARKET_TYPE_REGISTRY,
      abi: marketTypeRegistryAbi,
      functionName: 'getType' as const,
      args: [BigInt(id)],
    })),
    query: { refetchInterval: 30000 },
  });

  const marketTypes = useMemo<MarketTypeOption[]>(() => {
    return MARKET_TYPE_IDS
      .map((id, index) => {
        if (HIDDEN_MARKET_TYPES.has(id)) return null;
        const item = marketTypeReads.data?.[index];
        if (item?.status !== 'success' || !item.result) return null;
        const [name, metric, unit, active] = item.result as [string, string, string, boolean];
        return { id, name, metric, unit, active };
      })
      .filter(Boolean) as MarketTypeOption[];
  }, [marketTypeReads.data, HIDDEN_MARKET_TYPES]);

  const selectedMarketType = marketTypes.find((t) => t.id === marketTypeId) ?? null;

  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address,
    chainId: CHAIN.id,
    query: {
      enabled: !!address,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });

  const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({
    chainId: CHAIN.id,
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address ? [address, launchPool] : undefined,
    query: {
      enabled: !!address && !!launchPool,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });

  const { data: browserUsdmBalance = 0n, refetch: refetchUsdmBalance } = useReadContract({
    chainId: CHAIN.id,
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });

  const nextMarketIdRead = useReadContract({
    chainId: CHAIN.id,
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
    query: { refetchInterval: 15000 },
  });

  const marketIds = useMemo(() => {
    const nextId = nextMarketIdRead.data ? Number(nextMarketIdRead.data) : 1;
    return Array.from({ length: Math.max(0, nextId - 1) }, (_, i) => BigInt(i + 1));
  }, [nextMarketIdRead.data]);

  const existingMarketsRead = useReadContracts({
    contracts: marketIds.map((id) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketV5' as const,
      args: [id],
    })),
    query: {
      enabled: marketIds.length > 0,
      refetchInterval: 15000,
    },
  });

  const existingStatusesRead = useReadContracts({
    contracts: marketIds.map((id) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketStatus' as const,
      args: [id],
    })),
    query: {
      enabled: marketIds.length > 0,
      refetchInterval: 15000,
    },
  });

  useEffect(() => {
    setOptimisticAllowance(0n);
  }, [address, launchPool]);

  const {
    writeContract,
    data: txHash,
    isPending: isWriting,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const {
    claimFaucet,
    requestStarterGas,
    usdmBalance: faucetUsdmBalance,
    isPending: isFaucetPending,
    isGasDripping,
    isConfirming: isFaucetConfirming,
    error: faucetError,
    testCashTxHash,
    reset: resetFaucet,
  } = useFaucet();

  const { isLoading: isConfirming, isSuccess: txSuccess, data: txReceipt } = useWaitForTransactionReceipt({
    chainId: CHAIN.id,
    hash: txHash,
    pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    query: { enabled: !!txHash },
  });
  const isCreateConfirming = lastWritePurpose === 'create' && isConfirming;

  useEffect(() => {
    console.group('[Kalma] write lifecycle');
    console.log('chainId', chainId);
    console.log('txHash', txHash);
    console.log('isWriting', isWriting);
    console.log('isConfirming', isConfirming);
    console.log('txSuccess', txSuccess);
    console.log('writeError', writeError);
    console.groupEnd();
  }, [chainId, txHash, isWriting, isConfirming, txSuccess, writeError]);

  // After a market creation lands, register the city in public.places so
  // the signal engine starts producing signals for it on its next pass.
  // Fire-and-forget — failure here doesn't matter to the user; the
  // market itself succeeded on-chain. The endpoint is idempotent: it
  // dedupes by ~5km proximity, so re-triggers on the same city are
  // harmless no-ops.
  useEffect(() => {
    if (!txSuccess || lastWritePurpose !== 'create' || !selectedCity) return;
    // Don't send country_code from the client — Open-Meteo's search
    // response doesn't always include it in our local GeoResult type.
    // The server re-geocodes and fills in canonical values anyway.
    const body = {
      name: selectedCity.name,
      region: selectedCity.admin1 ?? null,
      country: selectedCity.country ?? null,
      lat: selectedCity.latitude,
      lon: selectedCity.longitude,
    };
    fetch('/api/places/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => {
      // Silent — this is best-effort signal coverage growth, not a
      // critical path. Logging only.
      console.warn('[Kalma] places upsert failed:', err?.message ?? err);
    });
    // Only fire once per successful tx hash.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txSuccess, lastWritePurpose]);

  useEffect(() => {
    if (!txSuccess || lastWritePurpose === 'create' || !address) return;
    void readContract(wagmiConfig, {
      chainId: CHAIN.id,
      address: CONTRACTS.USDC,
      abi: usdcAbi,
      functionName: 'allowance',
      args: [address, launchPool],
    })
      .then((nextAllowance) => {
        if (typeof nextAllowance === 'bigint') {
          setOptimisticAllowance(nextAllowance);
        }
      })
      .finally(() => {
        void refetchAllowance();
      });
  }, [txSuccess, lastWritePurpose, address, launchPool, refetchAllowance]);

  const seedAmountWei = useMemo(() => {
    try {
      return parseUnits(seedAmount || '0', USDM_DECIMALS);
    } catch {
      return 0n;
    }
  }, [seedAmount]);

  const usdmBalance = faucetUsdmBalance > browserUsdmBalance ? faucetUsdmBalance : browserUsdmBalance;
  const effectiveAllowance = optimisticAllowance > allowance ? optimisticAllowance : allowance;
  const parsedUsdmBalance = Number(formatUnits(usdmBalance, USDM_DECIMALS));

  const needsApproval = effectiveAllowance < seedAmountWei;
  const hasEnoughCash = usdmBalance >= seedAmountWei;
  const hasEnoughGas = (nativeBalance?.value ?? 0n) >= MIN_GAS_BUFFER;

  const hasValidDuration =
    Number.isFinite(durationDays) && durationDays >= 2 && durationDays <= 30;

  // Gate the preview + submit on the type actually being one of the loaded
  // registry types (1-8 today, more if the registry grows). The old version
  // hardcoded [1-4] which silently blocked the V6 types from passing the
  // preview gate — the user saw "Choose a weather type" with no historical
  // data even after picking Cold Spell / Dry Stretch / Frost / Heavy Rain.
  const hasSelectedType = marketTypes.some((t) => t.id === marketTypeId);

  const previewReady =
    !!selectedCity &&
    hasSelectedType &&
    hasValidDuration;

  const previewBlockReason = !selectedCity
    ? copy.noPlace
    : !hasSelectedType
      ? copy.noType
      : !hasValidDuration
        ? copy.invalidDuration
        : '';

  const duplicateBlocked = useMemo(() => {
    if (!selectedCity || !hasSelectedType || !hasValidDuration) return false;

    const newKey = marketGridKey(selectedCity.latitude, selectedCity.longitude, marketTypeId);
    const newStart =
      startDate > todayString
        ? Math.floor(new Date(`${startDate}T${ANSWER_ANCHOR_HOUR}`).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
    const newEnd = newStart + durationDays * 86400;

    for (let i = 0; i < marketIds.length; i++) {
      const marketResult = existingMarketsRead.data?.[i];
      const statusResult = existingStatusesRead.data?.[i];

      if (marketResult?.status !== 'success' || statusResult?.status !== 'success') continue;

      const [, latRaw, lonRaw, typeIdRaw, , startRaw, endRaw] = marketResult.result as [
        string,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];

      const [, , resolved, , , cancelled] = statusResult.result as [
        bigint,
        bigint,
        boolean,
        boolean,
        string,
        boolean,
        bigint,
      ];

      if (resolved || cancelled) continue;

      const existingLat = Number(latRaw) / 1_000_000;
      const existingLon = Number(lonRaw) / 1_000_000;
      const existingTypeId = Number(typeIdRaw);
      const existingKey = marketGridKey(existingLat, existingLon, existingTypeId);

      if (existingKey !== newKey) continue;

      const existingStart = Number(startRaw);
      const existingEnd = Number(endRaw);
      const overlaps = newStart < existingEnd && newEnd > existingStart;

      if (overlaps) return true;
    }

    return false;
  }, [
    selectedCity,
    hasSelectedType,
    hasValidDuration,
    marketTypeId,
    startDate,
    todayString,
    durationDays,
    marketIds,
    existingMarketsRead.data,
    existingStatusesRead.data,
  ]);

  const lowSignalWarning =
    !!preview &&
    (marketTypeId === MARKET_TYPES.RAIN || marketTypeId === MARKET_TYPES.SNOW) &&
    preview.average === 0;

  const hasValidPreview = !!preview && !previewLoading && !previewError && !duplicateBlocked;

  async function searchCity() {
    if (!cityQuery.trim()) {
      setStatusText(copy.noPlace);
      return;
    }

    try {
      setStatusText('');
      setCitySearchLoading(true);
      setSelectedCity(null);
      setPreview(null);
      setPreviewError('');

      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          cityQuery.trim()
        )}&count=5&language=en&format=json`;

      const res = await fetch(url);
      const data = await res.json();
      const results: GeoResult[] = Array.isArray(data?.results) ? data.results : [];
      setCityResults(results);
    } catch {
      setStatusText(copy.noPlace);
    } finally {
      setCitySearchLoading(false);
    }
  }

  useEffect(() => {
    if (!previewReady || !selectedCity || !selectedMarketType || duplicateBlocked) {
      setPreview(null);
      setPreviewError(duplicateBlocked ? copy.duplicateMarket : '');
      return;
    }

    let active = true;

    async function loadPreview() {
      const city = selectedCity;
      const marketType = selectedMarketType;

      if (!city || !marketType) {
        setPreview(null);
        setPreviewError('');
        setPreviewLoading(false);
        return;
      }

      try {
        setPreviewLoading(true);
        setPreviewError('');

        const startBase = new Date(
          startDate > todayString ? `${startDate}T${ANSWER_ANCHOR_HOUR}` : new Date()
        );
        const month = startBase.getMonth();
        const day = startBase.getDate();

        const field = getDailyField(marketTypeId);
        const currentYear = new Date().getUTCFullYear();
        const years: number[] = [];

        for (let y = currentYear - 10; y <= currentYear - 1; y++) {
          years.push(y);
        }

        const windowResults = await Promise.all(
          years.map(async (year) => {
            const start = new Date(Date.UTC(year, month, day));
            const end = new Date(start.getTime() + (durationDays - 1) * 86400000);

            const fmt = (d: Date) =>
              `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
                d.getUTCDate()
              ).padStart(2, '0')}`;

            const url =
              `https://archive-api.open-meteo.com/v1/archive?latitude=${city.latitude}` +
              `&longitude=${city.longitude}` +
              `&start_date=${fmt(start)}` +
              `&end_date=${fmt(end)}` +
              `&daily=${field}` +
              `&timezone=UTC`;

            const res = await fetch(url);
            const data = await res.json();

            const values = data?.daily?.[field];
            if (!Array.isArray(values) || values.length === 0) return null;

            const nums = values.filter((v: unknown) => typeof v === 'number') as number[];
            if (!nums.length) return null;

            if (marketTypeId === MARKET_TYPES.RAIN || marketTypeId === MARKET_TYPES.SNOW) {
              return nums.reduce((a, b) => a + b, 0);
            }

            return nums.reduce((a, b) => a + b, 0) / nums.length;
          })
        );

        const valid = windowResults.filter(
          (v): v is number => typeof v === 'number' && Number.isFinite(v)
        );

        if (!valid.length) {
          throw new Error('No seasonal historical data');
        }

        const average = valid.reduce((a, b) => a + b, 0) / valid.length;

        if (!active) return;

        // The registry's `unit` field was registered for the *threshold*
        // axis the on-chain market measures (e.g. "days" for cold spell
        // because the V6 binary outcome reports a run of days). But the
        // preview shows a historical *average* of a different axis
        // (avg min temp, avg daily rainfall). Override the unit string
        // to match the preview value, otherwise users see "15.4days"
        // when the number is actually °C.
        const previewUnit =
          marketTypeId === MARKET_TYPES.COLD_SPELL ? '°C'
            : marketTypeId === MARKET_TYPES.DRY_STRETCH ? 'mm'
            : marketTypeId === MARKET_TYPES.FROST_RISK ? '°C'
            : marketTypeId === MARKET_TYPES.HEAVY_RAIN ? 'mm'
            : marketType.unit;

        setPreview({
          average: Number(average.toFixed(1)),
          unit: previewUnit,
          label: marketType.name,
        });
      } catch {
        if (!active) return;
        setPreview(null);
        setPreviewError(copy.previewUnavailable);
      } finally {
        if (active) setPreviewLoading(false);
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [
    previewReady,
    selectedCity,
    selectedMarketType,
    marketTypeId,
    durationDays,
    startDate,
    todayString,
    duplicateBlocked,
    copy.duplicateMarket,
    copy.previewUnavailable,
  ]);

  async function handleStarterGas() {
    try {
      setStatusText(copy.readyToResume);
      await requestStarterGas();
      await refetchNativeBalance();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : copy.notEnoughGas);
    }
  }

  async function handleFaucet() {
    console.group('[Kalma] faucet attempt');
    console.log('address', address);
    console.log('isConnected', isConnected);
    console.log('chainId', chainId);
    console.log('launchPool', launchPool);
    console.log('marketTypeId', marketTypeId);
    console.log('selectedCity', selectedCity);
    console.log('seedAmount', seedAmount);
    console.log('seedAmountWei', seedAmountWei.toString());
    console.groupEnd();

    try {
      setStatusText(copy.funding);
      await claimFaucet();
      await Promise.all([refetchUsdmBalance(), refetchNativeBalance()]);
      setStatusText(copy.readyToResume);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : copy.notEnoughCash);
    }
  }

  async function waitForAllowanceToSet(requiredAmount: bigint) {
    for (let i = 0; i < APPROVAL_SETTLE_ATTEMPTS; i += 1) {
      const directAllowance = address
        ? await readContract(wagmiConfig, {
            chainId: CHAIN.id,
            address: CONTRACTS.USDC,
            abi: usdcAbi,
            functionName: 'allowance',
            args: [address, launchPool],
          }).catch(() => 0n) as bigint
        : 0n;

      const result = await refetchAllowance();
      const hookAllowance = typeof result.data === 'bigint' ? result.data : 0n;
      const nextAllowance = directAllowance > hookAllowance ? directAllowance : hookAllowance;
      if (nextAllowance >= requiredAmount) {
        setOptimisticAllowance(nextAllowance);
        return true;
      }
      await sleep(APPROVAL_SETTLE_DELAY_MS);
    }
    return false;
  }

  async function handleApprove() {
    console.group('[Kalma] approve attempt');
    console.log('address', address);
    console.log('isConnected', isConnected);
    console.log('chainId', chainId);
    console.log('launchPool', launchPool);
    console.log('seedAmountWei', seedAmountWei.toString());
    console.groupEnd();

    setStatusText(copy.allowing);
    setLastWritePurpose('approval');

    try {
      const approvalTx = await writeContract({
        address: CONTRACTS.USDC,
        abi: usdcAbi,
        functionName: 'approve',
        args: [launchPool, APPROVAL_CAP],
        waitForReceipt: false,
      });

      const allowanceReady = await waitForAllowanceToSet(seedAmountWei);
      if (allowanceReady) {
        setStatusText(copy.approvalReady);
        return;
      }

      setStatusText(`${copy.readyToResume} Tx: ${approvalTx}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : copy.allowing);
    } finally {
      setLastWritePurpose(null);
    }
  }

  function handleCreate() {
    if (!selectedCity) {
      setStatusText(copy.noPlace);
      return;
    }
    if (!selectedMarketType) {
      setStatusText(copy.noType);
      return;
    }
    if (!hasValidDuration) {
      setStatusText(copy.invalidDuration);
      return;
    }
    if (duplicateBlocked) {
      setStatusText(copy.duplicateMarket);
      return;
    }
    if (seedAmountWei < MIN_SEED) {
      setStatusText(copy.seedLow);
      return;
    }
    if (!hasEnoughCash) {
      setStatusText(copy.notEnoughCash);
      return;
    }
    if (!hasEnoughGas) {
      setStatusText(copy.notEnoughGas);
      return;
    }
    if (!hasValidPreview) {
      setStatusText(copy.previewUnavailable);
      return;
    }
    if (needsApproval) {
      setStatusText(copy.allowing);
      return;
    }

    const startTimestamp =
      startDate > todayString
        ? BigInt(Math.floor(new Date(`${startDate}T${ANSWER_ANCHOR_HOUR}`).getTime() / 1000))
        : 0n;

    const rawAvg = preview?.average ?? 0;
    // V5 types (rain/snow/temp): historicalAvg is the raw observed metric.
    // V6 types: historicalAvg is encoded per migration 20260513 (offset
    // for temperatures, percentile×100 for heavy rain, fixed 102 for frost).
    const isV5SimpleType =
      marketTypeId === MARKET_TYPES.RAIN ||
      marketTypeId === MARKET_TYPES.TEMP_HIGH ||
      marketTypeId === MARKET_TYPES.TEMP_LOW ||
      marketTypeId === MARKET_TYPES.SNOW;
    const isAccumulation =
      marketTypeId === MARKET_TYPES.RAIN || marketTypeId === MARKET_TYPES.SNOW;
    const historicalAvg = isV5SimpleType
      ? isAccumulation
        ? BigInt(Math.max(1, Math.round(rawAvg)))
        : BigInt(Math.round(rawAvg))
      : encodeHistoricalAvg(marketTypeId, rawAvg, 'percentile', durationDays);

    // Temperature can be negative — only block if contract would reject it
    if (historicalAvg < 0n && isAccumulation) {
      setStatusText(copy.previewUnavailable);
      return;
    }

    console.group('[Kalma] create market attempt');
    console.log('address', address);
    console.log('isConnected', isConnected);
    console.log('chainId', chainId);
    console.log('launchPool', launchPool);
    console.log('selectedCity', selectedCity);
    console.log('marketTypeId', marketTypeId);
    console.log('historicalAvg', historicalAvg.toString());
    console.log('startTimestamp', startTimestamp.toString());
    console.log('durationDays', durationDays);
    console.log('seedAmountWei', seedAmountWei.toString());
    console.log('seedSide', seedSide);
    console.groupEnd();

    // Freeze the question with the SAME threshold that goes on-chain, so the
    // success screen and the shared poster read identically. V5 simple types
    // round; V6 types keep the preview average (the poster decodes its own).
    const displayThreshold = isV5SimpleType ? Number(historicalAvg) : preview?.average ?? '…';
    setCreatedQuestion(
      getQuestionText(marketTypeId, displayThreshold, selectedMarketType?.unit ?? '', durationDays, copy, system)
    );

    setStatusText(copy.creating);
    setLastWritePurpose('create');

    void writeContract({
      address: launchPool,
      abi: climatePoolAbi,
      functionName: 'createMarketWithSeed',
      args: [
        buildCityLabel(selectedCity),
        BigInt(Math.round(selectedCity.latitude * 1_000_000)),
        BigInt(Math.round(selectedCity.longitude * 1_000_000)),
        BigInt(marketTypeId),
        historicalAvg,
        startTimestamp,
        BigInt(durationDays),
        seedAmountWei,
        seedSide === 'above',
      ],
    }).catch((error) => {
      setStatusText(error instanceof Error ? error.message : copy.creating);
    });
  }

  const createGate = useActionGate({
    action: 'create',
    isConnected,
    onReadyAction: async () => {
      return;
    },
    onBeforeConnect: () => {
      setStatusText(copy.draftSaved);
    },
  });

  async function handlePrimaryAction() {
    if (!isConnected) {
      await createGate.run();
      return;
    }

    if (!selectedCity) {
      setStatusText(copy.noPlace);
      return;
    }
    if (!selectedMarketType) {
      setStatusText(copy.noType);
      return;
    }
    if (!hasValidDuration) {
      setStatusText(copy.invalidDuration);
      return;
    }
    if (duplicateBlocked) {
      setStatusText(copy.duplicateMarket);
      return;
    }
    if (seedAmountWei < MIN_SEED) {
      setStatusText(copy.seedLow);
      return;
    }

    if (!hasEnoughGas) {
      await handleStarterGas();
      return;
    }

    if (!hasEnoughCash) {
      await handleFaucet();
      return;
    }

    if (!hasValidPreview) {
      setStatusText(copy.previewUnavailable);
      return;
    }

    if (needsApproval) {
      await handleApprove();
      return;
    }

    handleCreate();
  }

  useEffect(() => {
    if (!txSuccess || lastWritePurpose !== 'create' || !txReceipt) return;
    clearDraft();
    void Promise.all([refetchAllowance(), refetchUsdmBalance()]);

    let newId: bigint | null = null;
    try {
      const created = parseEventLogs({
        abi: climatePoolAbi,
        logs: txReceipt.logs,
        eventName: 'MarketCreated',
      });
      const args = created[0]?.args as { marketId?: bigint } | undefined;
      newId = args?.marketId ?? null;
    } catch {
      // Receipt without a parseable MarketCreated log — fall through.
    }

    if (newId === null) {
      router.push('/markets');
      return;
    }

    setCreatedMarketId(newId);

    // The browse surfaces render from the markets_snapshot table (leaderboard
    // cron, 15-min cadence) — without this, the creator's own signal stays
    // invisible for up to ~20 min. Push the new market into the snapshot now,
    // then drop the client cache so /markets shows it on the next visit.
    fetch(`/api/markets/${newId}/refresh-snapshot`, { method: 'POST' })
      .catch(() => undefined)
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: MARKETS_SNAPSHOT_QUERY_KEY });
      });
  }, [txSuccess, lastWritePurpose, txReceipt, refetchAllowance, refetchUsdmBalance, router, queryClient]);

  const questionPreview = getQuestionText(
    marketTypeId,
    preview?.average ?? '…',
    selectedMarketType?.unit ?? '',
    durationDays,
    copy,
    system
  );

  const primaryLabel = !isConnected
    ? copy.connectToCreate
    : !selectedCity
      ? copy.publish
      : !hasEnoughGas
        ? copy.getEth
        : !hasEnoughCash
          ? copy.depositCash
          : needsApproval
            ? copy.allowFunds
            : copy.publish;

  const faucetBusy = isGasDripping || isFaucetPending || isFaucetConfirming;
  const canAttemptPrimary = !isWriting && !isCreateConfirming && !faucetBusy;
  const activeEditableStep =
    activePill === 'city' ||
    activePill === 'start' ||
    activePill === 'duration' ||
    activePill === 'seed-amount';
  const hideMobileChrome = activeEditableStep || mobileKeyboardOpen;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isEditableElement = () => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable === true
      );
    };

    if (typeof window.visualViewport === 'undefined') {
      const handleFocus = () => setMobileKeyboardOpen(isEditableElement());
      const handleBlur = () => window.setTimeout(() => setMobileKeyboardOpen(isEditableElement()), 80);

      window.addEventListener('focusin', handleFocus);
      window.addEventListener('focusout', handleBlur);

      return () => {
        window.removeEventListener('focusin', handleFocus);
        window.removeEventListener('focusout', handleBlur);
      };
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    // Baseline = the tallest viewport we've seen (keyboard closed). We only
    // ever raise it, so iOS Safari collapsing/expanding its URL bar can't
    // poison the baseline the way a fixed mount-time snapshot did — that stale
    // snapshot was the main source of missed keyboard detections.
    let maxHeight = viewport.height;
    let raf = 0;

    const recompute = () => {
      // Read the focused element on the next frame so focus transitions
      // (focusout → focusin when moving between fields) don't flash the bottom
      // chrome back in. Match real editable surfaces, including contentEditable.
      // Proportional shrink is far more reliable across device sizes than a
      // fixed pixel delta: a soft keyboard typically eats 25–45% of height.
      const shrunk = maxHeight - viewport.height > maxHeight * 0.2;
      setMobileKeyboardOpen(isEditableElement() && shrunk);
    };

    const handleViewportChange = () => {
      if (viewport.height > maxHeight) maxHeight = viewport.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    handleViewportChange();
    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);
    window.addEventListener('focusin', handleViewportChange);
    window.addEventListener('focusout', handleViewportChange);

    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('focusin', handleViewportChange);
      window.removeEventListener('focusout', handleViewportChange);
    };
  }, []);

  // Success + share screen — replaces the form once the create tx confirms.
  // The creator's next job is spreading the question, so sharing is the hero
  // action; navigation to the signal or the browse list comes after.
  if (createdMarketId !== null) {
    const createdIdString = createdMarketId.toString();
    return (
      <div
        className="k-create-page"
        style={{ paddingBottom: 'calc(var(--k-mobile-bottom-clearance, 136px) + 72px)' }}
      >
        <AppHeader section={copy.successTitle} />

        <div style={{ padding: '4px 16px 24px', maxWidth: 520, margin: '0 auto' }}>
          {/* Celebratory header */}
          <div
            style={{
              display: 'grid',
              justifyItems: 'center',
              gap: 12,
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `radial-gradient(circle at 50% 38%, ${C.accent}33 0%, ${C.accent}14 60%, transparent 72%)`,
                boxShadow: `0 0 0 1px ${C.accent}30, inset 0 0 22px ${C.accent}22`,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%), ${C.accent}`,
                  boxShadow: `0 6px 16px ${C.accent}55`,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            </div>

            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: C.accent,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
              {copy.successEyebrow}
            </div>

            <h1
              style={{
                margin: 0,
                fontFamily: fonts.display,
                fontSize: 27,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.14,
              }}
            >
              {copy.successTitle}
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 380,
                fontFamily: fonts.sans,
                fontSize: 14.5,
                color: C.textSoft,
                lineHeight: 1.55,
              }}
            >
              {copy.successSubtitle}
            </p>
          </div>

          {/* The real shareable poster — exactly what unfurls in the group. */}
          <figure style={{ margin: 0 }}>
            <div
              style={{
                borderRadius: R.lg,
                overflow: 'hidden',
                border: `1px solid ${C.dividerStrong}`,
                background: C.surfaceDeep,
                aspectRatio: '1200 / 630',
                boxShadow: `0 18px 40px ${C.shadowA}88, 0 2px 0 ${C.surfaceHigh}40`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/markets/${createdIdString}/opengraph-image?flavor=creator`}
                alt={createdQuestion || copy.successTitle}
                width={1200}
                height={630}
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
              />
            </div>
            <figcaption
              style={{
                marginTop: 8,
                fontFamily: fonts.mono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: C.textMuted,
                textAlign: 'center',
              }}
            >
              {copy.successPosterCaption}
            </figcaption>
          </figure>

          {/* Question in plain text (real threshold) + place */}
          <div style={{ textAlign: 'center', margin: '16px 0 18px' }}>
            <p
              style={{
                margin: 0,
                fontFamily: fonts.sans,
                fontSize: 17,
                fontWeight: 600,
                color: C.text,
                lineHeight: 1.45,
              }}
            >
              {createdQuestion || questionPreview}
            </p>
            {selectedCity ? (
              <div
                style={{
                  marginTop: 8,
                  fontFamily: fonts.mono,
                  fontSize: 11.5,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: C.textMuted,
                }}
              >
                {buildCityLabel(selectedCity)}
              </div>
            ) : null}
          </div>

          {/* Hero action: share. Then quieter navigation. */}
          <div style={{ display: 'grid', gap: 12 }}>
            <ShareQuestionButton
              marketId={createdIdString}
              question={createdQuestion || questionPreview}
              variant="creator"
              hero
            />

            <p
              style={{
                margin: '0 auto',
                maxWidth: 360,
                fontFamily: fonts.sans,
                fontSize: 12.5,
                color: C.textMuted,
                lineHeight: 1.5,
                textAlign: 'center',
              }}
            >
              {copy.successShareHint}
            </p>

            <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => router.push(`/markets/${createdIdString}`)}
                style={secondaryButton(C, fonts, R)}
              >
                {copy.successView}
              </button>
              <button
                type="button"
                onClick={() => router.push('/markets')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.textMuted,
                  padding: '8px 12px',
                }}
              >
                {copy.successBrowse}
              </button>
            </div>
          </div>
        </div>

        <BottomNav />
      </div>
    );
  }

  return (
    <div
      className="k-create-page"
      style={{
        paddingBottom: hideMobileChrome
          ? 36
          : 'calc(var(--k-mobile-bottom-clearance, 136px) + 72px)',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .k-create-page {
              max-width: 100%;
              overflow-x: clip;
            }
            .k-create-page * {
              min-width: 0;
            }
            .k-create-shell {
              max-width: 100%;
              box-sizing: border-box;
            }
            .k-create-city-row {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 10px;
            }
            @media (max-width: 430px) {
              .k-create-city-row {
                grid-template-columns: minmax(0, 1fr);
              }
              .k-create-city-row > button {
                min-height: 52px;
                padding: 0 16px !important;
              }
            }
          `,
        }}
      />
      <AppHeader section={copy.title} />

      <div className="k-create-shell" style={{ padding: '0 16px 24px' }}>
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
            {copy.intro}
          </p>

          {/* CO-6: captain framing — opening a city's question is an identity,
              and a weekly rhythm makes it a habit. */}
          <p
            style={{
              margin: '12px 0 0',
              padding: '10px 12px',
              borderRadius: R.md,
              background: `${C.accent}10`,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.text,
              lineHeight: 1.5,
            }}
          >
            {copy.captainNote ?? 'Open your city’s question for the week and you’re its captain — you earn a creator share as people come to answer.'}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FaucetBanner />
        </div>

        <div
          style={{
            ...neu.panelRaised,
            padding: 18,
            borderRadius: R.xl,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: C.textMuted,
                    marginBottom: 6,
                  }}
                >
                  {copy.create ?? 'Create'}
                </div>
                <div
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 24,
                    lineHeight: 1.12,
                    color: C.text,
                    fontWeight: 700,
                  }}
                >
                  {selectedCity
                    ? buildCityLabel(selectedCity)
                    : copy.sbChooseCity ?? 'Choose a city'}
                </div>
              </div>
              <div
                style={{
                  ...neu.subtle,
                  borderRadius: R.pill,
                  padding: '8px 12px',
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {[selectedCity, hasSelectedType, !!startDate, hasValidDuration, seedAmountWei >= MIN_SEED, !!seedSide].filter(Boolean).length}/6
              </div>
            </div>

            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
                lineHeight: 1.5,
              }}
            >
              {activePill
                ? copy.sbEditPrompt ?? 'Change this step, then continue below.'
                : copy.sbAllSet ?? 'Review the signal, then add it when everything is ready.'}
            </div>

            <JourneyStep
              step="01"
              label={copy.place}
              value={selectedCity ? buildCityLabel(selectedCity) : ''}
              placeholder={copy.cityPlaceholder}
              complete={!!selectedCity}
              active={activePill === 'city'}
              onClick={() => setActivePill((c) => (c === 'city' ? null : 'city'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="k-create-city-row">
                  <Input
                    id="create-city-search"
                    name="city"
                    value={cityQuery}
                    onChange={(value: string) => {
                      setCityQuery(value);
                      setStatusText('');
                    }}
                    placeholder={copy.cityPlaceholder}
                    C={C}
                    fonts={fonts}
                    R={R}
                  />
                  <button
                    type="button"
                    onClick={searchCity}
                    disabled={citySearchLoading}
                    style={miniButton(C, fonts, R)}
                  >
                    {citySearchLoading ? '...' : copy.find}
                  </button>
                </div>

                {cityResults.length ? (
                  <div
                    style={{
                      ...neu.controlPressed,
                      borderRadius: R.lg,
                      padding: 8,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    {cityResults.map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => {
                          setSelectedCity(city);
                          setCityResults([]);
                          setStatusText('');
                          setPreview(null);
                          setPreviewError('');
                          if (
                            typeof city.latitude === 'number' &&
                            typeof city.longitude === 'number'
                          ) {
                            logPlaceCandidate({
                              name: city.name,
                              region: city.admin1 ?? null,
                              country: city.country ?? null,
                              lat: city.latitude,
                              lon: city.longitude,
                            });
                          }
                          setActivePill('type');
                        }}
                        style={cityOption(C, fonts, R)}
                      >
                        {buildCityLabel(city)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedCity ? (
                  <div
                    style={{
                      ...neu.controlPressed,
                      borderRadius: R.lg,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.text,
                      }}
                    >
                      {buildCityLabel(selectedCity)}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: fonts.sans,
                        fontSize: 13,
                        color: C.textSoft,
                      }}
                    >
                      {selectedCity.latitude.toFixed(4)}, {selectedCity.longitude.toFixed(4)}
                    </div>
                  </div>
                ) : null}
              </div>
            </JourneyStep>

            <JourneyStep
              step="02"
              label={copy.marketType}
              value={getMarketTypeLabel(marketTypeId, copy)}
              placeholder={copy.sbChooseType ?? 'Pick a signal'}
              complete={hasSelectedType}
              active={activePill === 'type'}
              onClick={() => setActivePill((c) => (c === 'type' ? null : 'type'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              {marketTypes.length === 0 ? (
                <div
                  style={{
                    ...neu.controlPressed,
                    borderRadius: R.lg,
                    padding: '12px 14px',
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    color: C.textSoft,
                  }}
                >
                  {copy.loadingTypes}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
                    gap: 10,
                  }}
                >
                  {marketTypes
                    .filter((t) => t.active)
                    .map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setMarketTypeId(type.id);
                          setPreview(null);
                          setPreviewError('');
                          setStatusText('');
                          setActivePill('start');
                        }}
                        style={{
                          ...(marketTypeId === type.id ? neu.controlRaised : neu.subtle),
                          border: 'none',
                          borderRadius: R.lg,
                          padding: '14px 12px',
                          background: marketTypeId === type.id ? `${C.accent}14` : C.surface,
                          color: C.text,
                          fontFamily: fonts.sans,
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                          minHeight: 52,
                        }}
                      >
                        {getMarketTypeLabel(type.id, copy)}
                      </button>
                    ))}
                </div>
              )}
            </JourneyStep>

            <JourneyStep
              step="03"
              label={copy.starts}
              value={formatDatePill(startDate, language)}
              placeholder={copy.sbChooseDate ?? 'Choose a start'}
              complete={!!startDate}
              active={activePill === 'start'}
              onClick={() => setActivePill((c) => (c === 'start' ? null : 'start'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              <Input
                id="create-start-date"
                name="start-date"
                value={startDate}
                onChange={(value: string) => {
                  setStartDate(value);
                  setPreview(null);
                  setPreviewError('');
                  setStatusText('');
                  setActivePill('duration');
                }}
                type="date"
                min={tomorrowString}
                C={C}
                fonts={fonts}
                R={R}
              />
            </JourneyStep>

            <JourneyStep
              step="04"
              label={copy.duration}
              value={`${durationDays} ${durationDays === 1 ? copy.sbDayShort ?? 'day' : copy.sbDaysShort ?? 'days'}`}
              placeholder={copy.sbChooseDuration ?? 'Choose duration'}
              complete={hasValidDuration}
              active={activePill === 'duration'}
              onClick={() => setActivePill((c) => (c === 'duration' ? null : 'duration'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <Input
                  id="create-duration-days"
                  name="duration-days"
                  value={String(durationDays)}
                  onChange={(value: string) => {
                    const n = Number(value);
                    if (!Number.isFinite(n)) {
                      setDurationDays(2);
                    } else {
                      setDurationDays(Math.max(2, Math.min(30, Math.round(n))));
                    }
                    setPreview(null);
                    setPreviewError('');
                    setStatusText('');
                  }}
                  type="number"
                  min={2}
                  max={30}
                  C={C}
                  fonts={fonts}
                  R={R}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 6,
                  }}
                >
                  {[3, 7, 14, 30].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setDurationDays(preset);
                        setPreview(null);
                        setPreviewError('');
                        setStatusText('');
                        setActivePill('seed-amount');
                      }}
                      style={{
                        ...(durationDays === preset ? neu.controlRaised : neu.subtle),
                        border: 'none',
                        borderRadius: R.md,
                        padding: '10px 4px',
                        background: durationDays === preset ? `${C.accent}14` : C.surface,
                        color: C.text,
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        minHeight: 48,
                      }}
                    >
                      {preset}d
                    </button>
                  ))}
                </div>
              </div>
            </JourneyStep>

            <JourneyStep
              step="05"
              label={copy.seedAmount}
              value={`${seedAmount || '0'} USDC`}
              placeholder={copy.sbChooseAmount ?? 'Choose an amount'}
              complete={seedAmountWei >= MIN_SEED}
              active={activePill === 'seed-amount'}
              onClick={() => setActivePill((c) => (c === 'seed-amount' ? null : 'seed-amount'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                <Input
                  id="create-seed-amount"
                  name="seed-amount"
                  value={seedAmount}
                  onChange={(value: string) => {
                    setSeedAmount(value);
                    setStatusText('');
                  }}
                  placeholder="10"
                  inputMode="decimal"
                  C={C}
                  fonts={fonts}
                  R={R}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 6,
                  }}
                >
                  {['10', '25', '50', '100'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSeedAmount(preset);
                        setStatusText('');
                        setActivePill('seed-side');
                      }}
                      style={{
                        ...(seedAmount === preset ? neu.controlRaised : neu.subtle),
                        border: 'none',
                        borderRadius: R.md,
                        padding: '10px 4px',
                        background: seedAmount === preset ? `${C.accent}14` : C.surface,
                        color: C.text,
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        minHeight: 48,
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </JourneyStep>

            <JourneyStep
              step="06"
              label={copy.startSide}
              value={seedSide === 'above' ? `▲ ${copy.yes}` : `▼ ${copy.no}`}
              placeholder={copy.sbChooseSide ?? 'Choose Yes or No'}
              complete={!!seedSide}
              active={activePill === 'seed-side'}
              onClick={() => setActivePill((c) => (c === 'seed-side' ? null : 'seed-side'))}
              activeRef={activeStepRef}
              C={C}
              fonts={fonts}
              R={R}
              neu={neu}
            >
              <Segmented
                value={seedSide}
                onChange={(v: string) => {
                  setSeedSide(v as 'above' | 'below');
                  setActivePill(null);
                }}
                options={[
                  { value: 'above', label: `▲ ${copy.yes}` },
                  { value: 'below', label: `▼ ${copy.no}` },
                ]}
                C={C}
                fonts={fonts}
                neu={neu}
                R={R}
              />
            </JourneyStep>
          </div>
        </div>

        <div
          style={{
            ...neu.panelRaised,
            padding: 18,
            borderRadius: R.xl,
            marginBottom: 16,
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
              marginBottom: 12,
            }}
          >
            {copy.preview}
          </div>

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
            {questionPreview}
          </div>

          {!previewReady ? (
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
                lineHeight: 1.5,
              }}
            >
              {previewBlockReason || copy.previewWaiting}
            </div>
          ) : previewLoading ? (
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
              }}
            >
              {copy.previewLoading}
            </div>
          ) : preview ? (
            <>
              <div
                style={{
                  ...neu.controlPressed,
                  borderRadius: R.lg,
                  padding: '12px 14px',
                }}
              >
                <Row
                  label={copy.currentAvg}
                  value={formatThreshold(preview.average, preview.unit, system)}
                  fonts={fonts}
                  C={C}
                />
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    color: C.textSoft,
                  }}
                >
                  {copy.thresholdFromPreview}
                </div>
              </div>

              {lowSignalWarning ? (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    color: C.below,
                    lineHeight: 1.45,
                  }}
                >
                  {copy.zeroSignalWarning}
                </div>
              ) : null}
            </>
          ) : previewError ? (
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.below,
              }}
            >
              {previewError}
            </div>
          ) : null}
        </div>

        <div
          style={{
            ...neu.controlPressed,
            padding: 16,
            borderRadius: R.lg,
            marginBottom: 16,
          }}
        >
          <Row
            label={copy.defaultPool}
            value={launchPool ? `${launchPool.slice(0, 6)}...${launchPool.slice(-4)}` : copy.loadingPool}
            fonts={fonts}
            C={C}
          />
          <Row
            label={copy.balance}
            value={formatLocal(parsedUsdmBalance)}
            fonts={fonts}
            C={C}
          />
          <Row
            label={copy.allowed}
            value={formatLocal(Number(formatUnits(effectiveAllowance, USDM_DECIMALS)))}
            fonts={fonts}
            C={C}
          />
          <Row
            label={copy.gas}
            value={`${nativeBalance ? formatUnits(nativeBalance.value, 18) : '0'} ETH`}
            fonts={fonts}
            C={C}
          />
        </div>

        <div
          style={{
            ...neu.panelRaised,
            padding: 18,
            borderRadius: R.xl,
            marginBottom: 16,
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
              marginBottom: 12,
            }}
          >
            {copy.requirements}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RequirementPill ok={isConnected} ready={copy.walletReady} missing={copy.walletMissing} C={C} fonts={fonts} />
            <RequirementPill ok={hasEnoughCash} ready={copy.cashReady} missing={copy.cashMissing} C={C} fonts={fonts} />
            <RequirementPill
              ok={!needsApproval || seedAmountWei === 0n}
              ready={copy.approvalReady}
              missing={copy.approvalMissing}
              C={C}
              fonts={fonts}
            />
          </div>

          <div
            style={{
              marginTop: 10,
              fontFamily: fonts.sans,
              fontSize: 13,
              color: C.textSoft,
              lineHeight: 1.45,
            }}
          >
            {copy.draftSaved}
          </div>
        </div>

        {statusText && statusText !== copy.previewUnavailable ? (
          <div
            style={{
              marginBottom: 14,
              color: C.textSoft,
              fontFamily: fonts.sans,
              fontSize: 15,
            }}
          >
            {statusText}
          </div>
        ) : null}

        {writeError ? (
          <div style={{ marginBottom: 14 }}>
            <WalletErrorPanel error={writeError} onAfterReset={resetWrite} />
          </div>
        ) : null}

        {faucetError && !writeError ? (
          <div style={{ marginBottom: 14 }}>
            <WalletErrorPanel error={faucetError} onAfterReset={resetFaucet} />
          </div>
        ) : null}

        {testCashTxHash ? (
          <div
            style={{
              marginBottom: 14,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
            }}
          >
            <a
              href={`${CHAIN.blockExplorer}/tx/${testCashTxHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {`Test cash tx ${testCashTxHash.slice(0, 8)}...${testCashTxHash.slice(-6)}`}
            </a>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 10 }}>
          {/* Desktop inline button — on mobile the sticky bar below
              the page tree (mounted right before <BottomNav />) is
              what the user taps. Wrapping in the desktop-only class
              avoids two simultaneous CTAs on mobile. */}
          <div className="k-action-inline-desktop-only">
            <button
              type="button"
              onClick={() => void handlePrimaryAction()}
              disabled={!canAttemptPrimary}
              style={primaryButton(C, fonts, R, !canAttemptPrimary)}
            >
              {primaryLabel}
            </button>
          </div>

          {isConnected && !hasEnoughCash ? (
            <button
              type="button"
              onClick={() => void handleFaucet()}
              disabled={isWriting || isCreateConfirming || faucetBusy}
              style={secondaryButton(C, fonts, R)}
            >
              {copy.depositCash}
            </button>
          ) : null}

          {isConnected && hasEnoughCash && needsApproval ? (
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={isWriting || isCreateConfirming || seedAmountWei === 0n}
              style={secondaryButton(C, fonts, R)}
            >
              {copy.allowFunds}
            </button>
          ) : null}
        </div>
      </div>

      {/* Mobile sticky CTA (UX-1) — mirrors the inline primary button's
          label, click, and disabled state. Hidden on desktop via the
          .k-sticky-action-bar rule in app/layout.tsx. */}
      <StickyActionBar
        label={primaryLabel}
        onClick={() => void handlePrimaryAction()}
        disabled={!canAttemptPrimary}
        hidden={hideMobileChrome}
      />

      {hideMobileChrome ? null : <BottomNav />}
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
  children: ReactNode;
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

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  inputMode,
  id,
  name,
  C,
  fonts,
  R,
}: any) {
  return (
    <input
      id={id}
      name={name}
      value={value}
      type={type}
      min={min}
      max={max}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        border: `1px solid ${C.divider}`,
        background: C.surfaceHigh,
        color: C.text,
        borderRadius: R.lg,
        padding: '16px 15px',
        fontFamily: fonts.sans,
        fontSize: 16,
        outline: 'none',
        // iOS gives native date inputs an intrinsic width + right-aligned value
        // that overflows the card. Reset the native appearance and left-align so
        // the field stays inside its container.
        WebkitAppearance: 'none',
        appearance: 'none',
        textAlign: 'left',
      }}
    />
  );
}

function Segmented({ value, onChange, options, C, fonts, neu, R }: any) {
  return (
    <div
      style={{
        ...neu.controlPressed,
        borderRadius: R.lg,
        padding: 6,
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((option: any) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              border: 'none',
              borderRadius: R.md,
              padding: '15px 10px',
              background: active ? C.surfaceHigh : 'transparent',
              color: active ? C.text : C.textMutedStrong,
              boxShadow: active
                ? `4px 4px 10px ${C.shadowA}66, -4px -4px 10px ${C.shadowB}AA`
                : 'none',
              fontFamily: fonts.sans,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function JourneyStep({
  step,
  label,
  value,
  placeholder,
  complete,
  active,
  onClick,
  activeRef,
  children,
  C,
  fonts,
  R,
  neu,
}: {
  step: string;
  label: string;
  value: string;
  placeholder: string;
  complete: boolean;
  active: boolean;
  onClick: () => void;
  activeRef: { current: HTMLElement | null };
  children: ReactNode;
  C: any;
  fonts: any;
  R: any;
  neu: any;
}) {
  return (
    <section
      ref={(node) => {
        if (active) activeRef.current = node;
      }}
      style={{
        ...(active ? neu.controlRaised : neu.subtle),
        borderRadius: R.lg,
        overflow: 'hidden',
        background: active ? C.surfaceHigh : C.surface,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 12,
          border: 'none',
          background: 'transparent',
          padding: '14px 12px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            borderRadius: R.pill,
            background: complete ? `${C.accent}1F` : C.surfaceLow,
            color: complete ? C.accent : C.textMuted,
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.08em',
          }}
        >
          {complete ? '✓' : step}
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              marginBottom: 4,
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: active ? C.accent : C.textMuted,
            }}
          >
            {label}
          </span>
          <span
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: fonts.sans,
              fontSize: 16,
              fontWeight: 800,
              color: value ? C.text : C.textMuted,
            }}
          >
            {value || placeholder}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            color: active ? C.accent : C.textMuted,
            fontFamily: fonts.sans,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {active ? '−' : '+'}
        </span>
      </button>
      {active ? (
        <div
          style={{
            padding: '0 12px 14px 58px',
            display: 'grid',
            gap: 10,
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, fonts, C }: any) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 12,
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

function RequirementPill({
  ok,
  ready,
  missing,
  C,
  fonts,
}: {
  ok: boolean;
  ready: string;
  missing: string;
  C: any;
  fonts: any;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '11px 12px',
        background: ok ? `${C.above}12` : `${C.below}0D`,
        color: ok ? C.above : C.below,
        fontFamily: fonts.sans,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {ok ? ready : missing}
    </div>
  );
}

function primaryButton(C: any, fonts: any, R: any, disabled = false): CSSProperties {
  return {
    width: '100%',
    padding: '17px 18px',
    borderRadius: R.lg,
    border: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    boxShadow: `0 8px 24px ${C.dark}30, inset 0 1px 0 ${C.darkSoft}`,
  };
}

function secondaryButton(C: any, fonts: any, R: any): CSSProperties {
  return {
    width: '100%',
    padding: '16px 18px',
    borderRadius: R.lg,
    border: 'none',
    background: C.surface,
    color: C.text,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `4px 4px 10px ${C.shadowA}76, -4px -4px 10px ${C.shadowB}96`,
  };
}

function miniButton(C: any, fonts: any, R: any): CSSProperties {
  return {
    border: 'none',
    borderRadius: R.lg,
    minHeight: 48,
    padding: '0 18px',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `0 8px 18px ${C.dark}24, inset 0 1px 0 ${C.darkSoft}`,
  };
}

function cityOption(C: any, fonts: any, R: any): CSSProperties {
  return {
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    color: C.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 48,
    padding: '12px 10px',
    borderRadius: R.sm,
    cursor: 'pointer',
  };
}
