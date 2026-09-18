//frontend/app/profile/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useReadContracts } from 'wagmi';
import MasonryColumns from '@/components/shared/MasonryColumns';
import { useAccount } from '@/hooks/useWallet';
import { useDisconnect } from '@/hooks/useWriteContract';
import { formatUnits } from 'viem';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import { CreatorEarningsPanel } from '@/components/shared/CreatorEarningsPanel';
import { useFaucet } from '@/hooks/useFaucet';
import { useLocationContext } from '@/hooks/useLocationContext';
import LocationPicker from '@/components/location/LocationPicker';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext, CURRENCY_OPTIONS } from '@/lib/currency-context';
import { useUnits } from '@/lib/units-context';
import { USDM_DECIMALS, CHAIN, CONTRACTS, climateOracleAbi } from '@/lib/contracts';
import { readWalletErrorMessage } from '@/lib/wallet-errors';
import { useColors } from '@/hooks/useColors';
import IdentityEditor from '@/components/profile/IdentityEditor';
import ProfileVerifiedAccounts from '@/components/profile/ProfileVerifiedAccounts';
import type { VerifiedAccountItem } from '@/components/profile/ProfileVerifiedAccounts';
import ProfilePublicIdentity from '@/components/profile/ProfilePublicIdentity';
import type { PublicIdentityItem, PublicIdentityProvider } from '@/components/profile/ProfilePublicIdentity';
import FollowingList from '@/components/profile/FollowingList';
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';

type CustomizeSection = 'currency' | 'location' | 'units' | null;

type VerifiedAccountProvider = 'google_oauth' | 'apple_oauth' | 'passkey' | 'wallet';
type SocialIdentityProvider = PublicIdentityProvider;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function profileCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      intro:
        'Review your positions, collect returns, and keep the account details needed to act on Kalma.',
      disconnected: 'Disconnected',
      status: 'Status',
      address: 'Address',
      walletMode: 'Account mode',
      externalWallet: 'External account',
      embeddedWallet: 'Social account',
      unknownWallet: 'Connected account',
      customize: 'Preferences',
      language: 'Language',
      currency: 'Currency',
      units: 'Units',
      unitsAuto: 'Auto',
      unitsHint: 'Defaults to what your region uses — °F and mph in the United States, °C and km/h elsewhere.',
      appearance: 'Appearance',
      location: 'Location',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      noLocation: 'No location selected',
      testCash: 'Test cash',
      deposit: 'Deposit',
      enoughFunds: 'You already have enough test funds right now.',
      enoughFundsShort: 'You already have enough funds to use Kalma.',
      connectForBalance: 'Connect to see test credits and account readiness.',
      testCashHint:
        'Use test credits to pick sides, create risk signals for places, and collect returns on testnet.',
      nextClaim: 'Next claim opens in about',
      gettingCash: 'Getting test credits...',
      getEth: '',  // removed — gas sponsored
      actions: 'Activities',
      walletAccess: 'Account access',
      disconnect: 'Disconnect',
      connect: 'Connect account',
      switchWallet: 'Connect another account',
      connectExternal: 'Connect external account',
      externalNeeded:
        'Social login works for access and browsing. Base Sepolia transactions currently require an external account.',
      openMarkets: 'Live signals',
      createMarket: 'Add your city',
      positions: 'Positions',
      yourPositions: 'Your positions',
      positionsIntro: 'Track active protection pools, weather windows waiting for results, and returns ready to collect.',
      positionsEmpty: 'No positions yet. Browse live risk signals when you are ready to answer Yes or No.',
      totalPositions: 'Total',
      activePositions: 'Active',
      waitingPositions: 'Waiting',
      readyPositions: 'Ready',
      reviewPositions: 'Under review',
      donePositions: 'Done',
      positionValue: 'Position value',
      challengeReview: 'Resolution review',
      challengeReviewIntro:
        'When a result is contested, claims stay paused here until the final review is confirmed.',
      challengeOpenCount: 'Under challenge',
      yourBonds: 'Your bonds',
      claimsPaused: 'Claims paused',
      reviewByYou: 'You challenged this result. Your bond is waiting for the final review.',
      reviewByAnother: 'This result was challenged and returns stay paused until the review finishes.',
      openReview: 'Open review',
      viewPositions: 'View positions',
      collectReturns: 'Collect returns',
      browseSignals: 'Browse live risk signals',
      profileNotes: 'Profile notes',
      profileNotesBody:
        'Kalma should automatically respect browser language, system appearance, and your most relevant local context, while still letting you override them here.',
      approximateHint:
        'Your location helps Kalma rank nearby weather context and local signal first.',
      appearanceHint:
        'System mode follows your device. You can override it here anytime.',
      languageHint:
        'Language should default from the browser, but your profile preference becomes the local override.',
      currencyHint:
        'Currency should default from your region, but you can change how values are displayed.',
      connectHint:
        'Disconnect to switch accounts, or connect an external account for Base Sepolia actions.',
      verifiedAccounts: 'Account access',
      verifiedAccountsIntro:
        'Use Google or Apple as the primary way to open your Kalma account. Add a passkey to strengthen recovery and device security, then link an external account when you need Base Sepolia transactions.',
      connectX: 'Add Google',
      connectFacebook: 'Add Apple',
      connectInstagram: 'Add passkey',
      disconnectSocial: 'Disconnect',
      lastAccountNotice: "Add another sign-in method first — you can't remove your only way in.",
      disconnectFailed: "Couldn't disconnect that account. Try again.",
      verifiedOn: 'Connected via',
      pendingVerification: 'Connecting...',
      noVerifiedAccounts:
        'No extra sign-in methods linked yet. Add Google, Apple, passkey, or an external account for safer recovery.',
      publicIdentity: 'Community accounts',
      publicIdentityIntro:
        'Link the public accounts people already recognize around your work. This trust layer helps your signals carry more relevance, credibility, and coordination power around your name.',
      addSocialX: 'Link X',
      addSocialInstagram: 'Link Instagram',
      instagramSoon: 'Instagram coming soon',
      addSocialFarcaster: 'Link Farcaster',
      noPublicIdentity:
        'No public social accounts linked yet. Start with X, then add Instagram or Farcaster if they matter to your community.',
      following: 'Following',
    },
    pt: {
      intro:
        'Revise suas posições, colete retornos e mantenha os detalhes da conta necessários para agir na Kalma.',
      disconnected: 'Desconectado',
      status: 'Status',
      address: 'Endereço',
      walletMode: 'Modo da conta',
      externalWallet: 'Conta externa',
      embeddedWallet: 'Conta social',
      unknownWallet: 'Conta conectada',
      customize: 'Preferências',
      language: 'Idioma',
      currency: 'Moeda',
      units: 'Unidades',
      unitsAuto: 'Automático',
      unitsHint: 'Segue o padrão da sua região — °F e mph nos EUA, °C e km/h no resto do mundo.',
      appearance: 'Aparência',
      location: 'Localização',
      light: 'Claro',
      dark: 'Escuro',
      system: 'Sistema',
      noLocation: 'Nenhuma localização selecionada',
      testCash: 'Dinheiro de teste',
      deposit: 'Depositar',
      enoughFunds: 'Você já tem fundos de teste suficientes agora.',
      enoughFundsShort: 'Você já tem fundos suficientes para usar a Kalma.',
      connectForBalance: 'Conecte para ver seu dinheiro de teste e a prontidão da conta.',
      testCashHint:
        'Use dinheiro de teste para responder Sim ou Não, criar sinais de risco para lugares e coletar retornos na testnet.',
      nextClaim: 'O próximo claim abre em cerca de',
      gettingCash: 'Depositando dinheiro de teste...',
      getEth: 'Pegar ETH de teste na Base Sepolia',
      actions: 'Atividades',
      walletAccess: 'Acesso da conta',
      disconnect: 'Desconectar',
      connect: 'Conectar conta',
      switchWallet: 'Conectar outra conta',
      connectExternal: 'Conectar conta externa',
      externalNeeded:
        'O login social funciona para acesso e navegação. As transações na Base Sepolia atualmente exigem uma conta externa.',
      openMarkets: 'Sinais ativos',
      createMarket: 'Adicionar sua cidade',
      positions: 'Posições',
      yourPositions: 'Suas posições',
      positionsIntro: 'Acompanhe pools de proteção ativos, janelas climáticas aguardando resultado e retornos prontos para coletar.',
      positionsEmpty: 'Nenhuma posição ainda. Explore sinais de cidade ativos quando quiser responder Sim ou Não.',
      totalPositions: 'Total',
      activePositions: 'Ativas',
      waitingPositions: 'Aguardando',
      readyPositions: 'Prontas',
      reviewPositions: 'Em revisão',
      donePositions: 'Finalizadas',
      positionValue: 'Valor posicionado',
      challengeReview: 'Revisão de resolução',
      challengeReviewIntro:
        'Quando um resultado é contestado, os retornos ficam pausados aqui até a revisão final ser confirmada.',
      challengeOpenCount: 'Em contestação',
      yourBonds: 'Seus bonds',
      claimsPaused: 'Retornos pausados',
      reviewByYou: 'Você contestou este resultado. Seu bond aguarda a revisão final.',
      reviewByAnother: 'Este resultado foi contestado e os retornos ficam pausados até a revisão terminar.',
      openReview: 'Abrir revisão',
      viewPositions: 'Ver posições',
      collectReturns: 'Coletar retornos',
      browseSignals: 'Explorar sinais de cidade ativos',
      profileNotes: 'Notas do perfil',
      profileNotesBody:
        'A Kalma deve respeitar automaticamente o idioma do navegador, a aparência do sistema e o contexto local mais relevante, mas ainda permitir ajustes aqui.',
      approximateHint:
        'Sua localização ajuda a Kalma a priorizar contexto climático próximo e sinal local.',
      appearanceHint:
        'O modo sistema segue o seu aparelho. Você pode sobrescrever isso aqui a qualquer momento.',
      languageHint:
        'O idioma deve vir do navegador por padrão, mas sua preferência no perfil vira a escolha local.',
      currencyHint:
        'A moeda deve vir da sua região por padrão, mas você pode mudar como os valores são exibidos.',
      connectHint:
        'Desconecte para trocar de conta ou conecte uma conta externa para ações na Base Sepolia.',
      verifiedAccounts: 'Acesso da conta',
      verifiedAccountsIntro:
        'Use Google ou Apple como forma principal de abrir sua conta Kalma. Adicione uma passkey para fortalecer a recuperação e a segurança entre aparelhos, e conecte uma conta externa quando precisar transacionar na Base Sepolia.',
      connectX: 'Adicionar Google',
      connectFacebook: 'Adicionar Apple',
      connectInstagram: 'Adicionar passkey',
      disconnectSocial: 'Desconectar',
      lastAccountNotice: 'Adicione outro método de acesso antes — você não pode remover sua única forma de entrar.',
      disconnectFailed: 'Não foi possível desconectar essa conta. Tente de novo.',
      verifiedOn: 'Conectado via',
      pendingVerification: 'Conectando...',
      noVerifiedAccounts:
        'Nenhum método extra de acesso ainda. Adicione Google, Apple, passkey ou uma conta externa para recuperação mais segura.',
      publicIdentity: 'Contas da comunidade',
      publicIdentityIntro:
        'Conecte as contas públicas que as pessoas já reconhecem no seu trabalho. Essa camada de confiança ajuda seus sinais a ganharem mais relevância, credibilidade e poder de coordenação em torno do seu nome.',
      addSocialX: 'Conectar X',
      addSocialInstagram: 'Conectar Instagram',
      instagramSoon: 'Instagram em breve',
      addSocialFarcaster: 'Conectar Farcaster',
      noPublicIdentity:
        'Nenhuma conta social pública conectada ainda. Comece com X e depois adicione Instagram ou Farcaster se fizer sentido para sua comunidade.',
      following: 'Seguindo',
    },
    es: {
      intro:
        'Revisa tus posiciones, cobra retornos y mantén los detalles de cuenta necesarios para actuar en Kalma.',
      disconnected: 'Desconectado',
      status: 'Estado',
      address: 'Dirección',
      walletMode: 'Modo de la wallet',
      externalWallet: 'Wallet externa',
      embeddedWallet: 'Wallet social embebida',
      unknownWallet: 'Wallet conectada',
      customize: 'Preferencias',
      language: 'Idioma',
      currency: 'Moneda',
      units: 'Unidades',
      unitsAuto: 'Automático',
      unitsHint: 'Sigue el estándar de tu región — °F y mph en EE. UU., °C y km/h en el resto.',
      appearance: 'Apariencia',
      location: 'Ubicación',
      light: 'Claro',
      dark: 'Oscuro',
      system: 'Sistema',
      noLocation: 'Sin ubicación seleccionada',
      testCash: 'Fondos de prueba',
      deposit: 'Depositar',
      enoughFunds: 'Ya tienes suficientes fondos de prueba ahora.',
      enoughFundsShort: 'Ya tienes fondos suficientes para usar Kalma.',
      connectForBalance: 'Conecta para ver tus fondos de prueba y la preparación de la cuenta.',
      testCashHint:
        'Usa fondos de prueba para responder Sí o No, crear señales de riesgo para lugares y cobrar retornos en la testnet.',
      nextClaim: 'El próximo claim se abre en aproximadamente',
      gettingCash: 'Obteniendo fondos de prueba...',
      getEth: '',
      actions: 'Actividades',
      walletAccess: 'Acceso de la wallet',
      disconnect: 'Desconectar',
      connect: 'Conectar wallet',
      switchWallet: 'Usar otra wallet',
      connectExternal: 'Conectar wallet externa',
      externalNeeded:
        'El login social funciona para acceder y navegar. Las transacciones en Base Sepolia actualmente requieren una wallet externa.',
      openMarkets: 'Señales activas',
      createMarket: 'Añade tu ciudad',
      positions: 'Posiciones',
      yourPositions: 'Tus posiciones',
      positionsIntro: 'Sigue pools de protección activos, ventanas meteorológicas esperando resultado y retornos listos para cobrar.',
      positionsEmpty: 'Aún no hay posiciones. Explora señales de ciudad activas cuando quieras responder Sí o No.',
      totalPositions: 'Total',
      activePositions: 'Activas',
      waitingPositions: 'En espera',
      readyPositions: 'Listas',
      reviewPositions: 'En revisión',
      donePositions: 'Finalizadas',
      positionValue: 'Valor posicionado',
      challengeReview: 'Revisión de resolución',
      challengeReviewIntro:
        'Cuando un resultado es impugnado, los retornos quedan pausados aquí hasta que se confirme la revisión final.',
      challengeOpenCount: 'Impugnadas',
      yourBonds: 'Tus bonos',
      claimsPaused: 'Retornos en pausa',
      reviewByYou: 'Impugnaste este resultado. Tu bono espera la revisión final.',
      reviewByAnother: 'Este resultado fue impugnado y los retornos quedan en pausa hasta que termine la revisión.',
      openReview: 'Abrir revisión',
      viewPositions: 'Ver posiciones',
      collectReturns: 'Cobrar retornos',
      browseSignals: 'Explorar señales de ciudad activas',
      profileNotes: 'Notas del perfil',
      profileNotesBody:
        'Kalma debería respetar automáticamente el idioma del navegador, la apariencia del sistema y tu contexto local más relevante, sin dejar de permitirte cambiarlos aquí.',
      approximateHint:
        'Tu ubicación ayuda a Kalma a priorizar el contexto climático cercano y las señales locales.',
      appearanceHint:
        'El modo sistema sigue tu dispositivo. Puedes sobrescribirlo aquí cuando quieras.',
      languageHint:
        'El idioma debería venir del navegador por defecto, pero tu preferencia en el perfil es la prioridad local.',
      currencyHint:
        'La moneda debería venir de tu región por defecto, pero puedes cambiar cómo se muestran los valores.',
      connectHint:
        'Desconecta para cambiar de cuenta, o conecta una wallet externa para acciones en Base Sepolia.',
      verifiedAccounts: 'Acceso de la cuenta',
      verifiedAccountsIntro:
        'Usa Google o Apple como forma principal de abrir tu cuenta de Kalma. Agrega un passkey para reforzar la recuperación y la seguridad entre dispositivos, y conecta una wallet externa cuando necesites transacciones en Base Sepolia.',
      connectX: 'Agregar Google',
      connectFacebook: 'Agregar Apple',
      connectInstagram: 'Agregar passkey',
      disconnectSocial: 'Desconectar',
      lastAccountNotice: 'Agrega otro método de acceso primero — no puedes quitar tu única forma de entrar.',
      disconnectFailed: 'No se pudo desconectar esa cuenta. Intenta de nuevo.',
      verifiedOn: 'Conectado vía',
      pendingVerification: 'Conectando...',
      noVerifiedAccounts:
        'Aún no hay métodos extra de acceso vinculados. Agrega Google, Apple, passkey o una wallet externa para una recuperación más segura.',
      publicIdentity: 'Cuentas de la comunidad',
      publicIdentityIntro:
        'Vincula las cuentas públicas que la gente ya reconoce alrededor de tu trabajo. Esta capa de confianza ayuda a que tus señales ganen más relevancia, credibilidad y capacidad de coordinación alrededor de tu nombre.',
      addSocialX: 'Vincular X',
      addSocialInstagram: 'Vincular Instagram',
      instagramSoon: 'Instagram próximamente',
      addSocialFarcaster: 'Vincular Farcaster',
      noPublicIdentity:
        'Aún no hay cuentas sociales públicas vinculadas. Empieza con X y luego agrega Instagram o Farcaster si importan para tu comunidad.',
      following: 'Siguiendo',
    },
    fr: {
      intro:
        "Passe en revue tes positions, récupère les retours et garde les détails de compte nécessaires pour agir sur Kalma.",
      disconnected: 'Déconnecté',
      status: 'Statut',
      address: 'Adresse',
      walletMode: 'Mode du wallet',
      externalWallet: 'Wallet externe',
      embeddedWallet: 'Wallet social embarqué',
      unknownWallet: 'Wallet connecté',
      customize: 'Préférences',
      language: 'Langue',
      currency: 'Devise',
      units: 'Unités',
      unitsAuto: 'Auto',
      unitsHint: "Suit l'usage de votre région — °F et mph aux États-Unis, °C et km/h ailleurs.",
      appearance: 'Apparence',
      location: 'Localisation',
      light: 'Clair',
      dark: 'Sombre',
      system: 'Système',
      noLocation: 'Aucune localisation sélectionnée',
      testCash: 'Fonds de test',
      deposit: 'Déposer',
      enoughFunds: 'Tu as déjà assez de fonds de test pour le moment.',
      enoughFundsShort: 'Tu as déjà assez de fonds pour utiliser Kalma.',
      connectForBalance: 'Connectez-vous pour voir vos fonds de test et la préparation du compte.',
      testCashHint:
        "Utilise des fonds de test pour répondre Oui ou Non, créer des signaux de risque pour des lieux et collecter des retours sur testnet.",
      nextClaim: 'Le prochain claim ouvre dans environ',
      gettingCash: 'Récupération des fonds de test...',
      getEth: '',
      actions: 'Activités',
      walletAccess: 'Accès au wallet',
      disconnect: 'Déconnecter',
      connect: 'Connecter le wallet',
      switchWallet: 'Utiliser un autre wallet',
      connectExternal: 'Connecter un wallet externe',
      externalNeeded:
        "Le login social fonctionne pour l'accès et la navigation. Les transactions sur Base Sepolia nécessitent actuellement un wallet externe.",
      openMarkets: 'Signaux actifs',
      createMarket: 'Ajouter ta ville',
      positions: 'Positions',
      yourPositions: 'Vos positions',
      positionsIntro: 'Suivez les pools de protection actifs, les fenêtres météo en attente de résultat et les retours prêts à récupérer.',
      positionsEmpty: "Aucune position pour le moment. Explorez les signaux de ville actifs quand vous voulez répondre Oui ou Non.",
      totalPositions: 'Total',
      activePositions: 'Actives',
      waitingPositions: 'En attente',
      readyPositions: 'Prêtes',
      reviewPositions: 'En revue',
      donePositions: 'Terminées',
      positionValue: 'Valeur positionnée',
      challengeReview: 'Revue de résolution',
      challengeReviewIntro:
        'Quand un résultat est contesté, les retours restent en pause ici jusqu’à la confirmation de la revue finale.',
      challengeOpenCount: 'Contestées',
      yourBonds: 'Vos cautions',
      claimsPaused: 'Retours en pause',
      reviewByYou: 'Vous avez contesté ce résultat. Votre caution attend la revue finale.',
      reviewByAnother: 'Ce résultat a été contesté et les retours restent en pause jusqu’à la fin de la revue.',
      openReview: 'Ouvrir la revue',
      viewPositions: 'Voir les positions',
      collectReturns: 'Récupérer les retours',
      browseSignals: 'Explorer les signaux de ville actifs',
      profileNotes: 'Notes du profil',
      profileNotesBody:
        "Kalma devrait respecter automatiquement la langue du navigateur, l'apparence du système et ton contexte local le plus pertinent, tout en te laissant les modifier ici.",
      approximateHint:
        'Ta localisation aide Kalma à classer le contexte météo proche et les signaux locaux en premier.',
      appearanceHint:
        "Le mode système suit ton appareil. Tu peux le modifier ici à tout moment.",
      languageHint:
        'La langue devrait venir du navigateur par défaut, mais ta préférence dans le profil devient la priorité locale.',
      currencyHint:
        "La devise devrait venir de ta région par défaut, mais tu peux changer la façon dont les valeurs s'affichent.",
      connectHint:
        "Déconnecte pour changer de compte, ou connecte un wallet externe pour les actions sur Base Sepolia.",
      verifiedAccounts: 'Accès au compte',
      verifiedAccountsIntro:
        "Utilise Google ou Apple comme moyen principal d'ouvrir ton compte Kalma. Ajoute une passkey pour renforcer la récupération et la sécurité entre appareils, puis connecte un wallet externe quand tu as besoin de transactions Base Sepolia.",
      connectX: 'Ajouter Google',
      connectFacebook: 'Ajouter Apple',
      connectInstagram: 'Ajouter une passkey',
      disconnectSocial: 'Déconnecter',
      lastAccountNotice: "Ajoute d'abord une autre méthode de connexion — tu ne peux pas retirer ton seul accès.",
      disconnectFailed: 'Impossible de déconnecter ce compte. Réessaie.',
      verifiedOn: 'Connecté via',
      pendingVerification: 'Connexion...',
      noVerifiedAccounts:
        "Aucune méthode d'accès supplémentaire n'est encore liée. Ajoute Google, Apple, une passkey ou un wallet externe pour une récupération plus sûre.",
      publicIdentity: 'Comptes de la communauté',
      publicIdentityIntro:
        "Lie les comptes publics que les gens reconnaissent déjà autour de ton travail. Cette couche de confiance aide tes signaux à gagner en pertinence, en crédibilité et en pouvoir de coordination autour de ton nom.",
      addSocialX: 'Lier X',
      addSocialInstagram: 'Lier Instagram',
      instagramSoon: 'Instagram bientôt disponible',
      addSocialFarcaster: 'Lier Farcaster',
      noPublicIdentity:
        "Aucun compte social public n'est encore lié. Commence par X, puis ajoute Instagram ou Farcaster si cela compte pour ta communauté.",
      following: 'Suivis',
    },
    de: {
      intro:
        'Prüfe deine Positionen, sammle Rückflüsse ein und halte die Kontodetails bereit, die du zum Handeln auf Kalma brauchst.',
      disconnected: 'Getrennt',
      status: 'Status',
      address: 'Adresse',
      walletMode: 'Wallet-Modus',
      externalWallet: 'Externes Wallet',
      embeddedWallet: 'Eingebettetes Social-Wallet',
      unknownWallet: 'Verbundenes Wallet',
      customize: 'Einstellungen',
      language: 'Sprache',
      currency: 'Währung',
      units: 'Einheiten',
      unitsAuto: 'Auto',
      unitsHint: 'Folgt dem Standard deiner Region — °F und mph in den USA, sonst °C und km/h.',
      appearance: 'Erscheinungsbild',
      location: 'Standort',
      light: 'Hell',
      dark: 'Dunkel',
      system: 'System',
      noLocation: 'Kein Standort gewählt',
      testCash: 'Test-Guthaben',
      deposit: 'Einzahlen',
      enoughFunds: 'Du hast bereits genug Test-Guthaben.',
      enoughFundsShort: 'Du hast bereits genug Guthaben für Kalma.',
      connectForBalance: 'Verbinde dich, um Test-Guthaben und Kontobereitschaft zu sehen.',
      testCashHint:
        'Nutze Test-Guthaben, um mit Ja oder Nein zu antworten, Risiko-Signale für Orte zu erstellen und Rückgaben im Testnet einzusammeln.',
      nextClaim: 'Nächster Claim öffnet in etwa',
      gettingCash: 'Test-Guthaben wird geholt...',
      getEth: '',
      actions: 'Aktivitäten',
      walletAccess: 'Wallet-Zugang',
      disconnect: 'Trennen',
      connect: 'Wallet verbinden',
      switchWallet: 'Anderes Wallet nutzen',
      connectExternal: 'Externes Wallet verbinden',
      externalNeeded:
        'Social Login funktioniert für Zugang und Browsing. Base Sepolia-Transaktionen erfordern derzeit ein externes Wallet.',
      openMarkets: 'Live-Signale',
      createMarket: 'Stadt hinzufügen',
      positions: 'Positionen',
      yourPositions: 'Deine Positionen',
      positionsIntro: 'Verfolge aktive Schutzpools, Wetterfenster mit ausstehendem Ergebnis und Rückflüsse, die bereit zum Einsammeln sind.',
      positionsEmpty: 'Noch keine Positionen. Erkunde Live-Risiko-Signale, wenn du mit Ja oder Nein antworten möchtest.',
      totalPositions: 'Gesamt',
      activePositions: 'Aktiv',
      waitingPositions: 'Wartend',
      readyPositions: 'Bereit',
      reviewPositions: 'In Prüfung',
      donePositions: 'Erledigt',
      positionValue: 'Positionswert',
      challengeReview: 'Prüfung der Auflösung',
      challengeReviewIntro:
        'Wenn ein Ergebnis angefochten wird, bleiben Rückflüsse hier pausiert, bis die finale Prüfung bestätigt ist.',
      challengeOpenCount: 'Angefochten',
      yourBonds: 'Deine Bonds',
      claimsPaused: 'Rückflüsse pausiert',
      reviewByYou: 'Du hast dieses Ergebnis angefochten. Dein Bond wartet auf die finale Prüfung.',
      reviewByAnother: 'Dieses Ergebnis wurde angefochten und Rückflüsse bleiben pausiert, bis die Prüfung abgeschlossen ist.',
      openReview: 'Prüfung öffnen',
      viewPositions: 'Positionen ansehen',
      collectReturns: 'Rückflüsse einsammeln',
      browseSignals: 'Live-Risiko-Signale erkunden',
      profileNotes: 'Profil-Notizen',
      profileNotesBody:
        'Kalma sollte die Browser-Sprache, Systemansicht und deinen lokal relevantesten Kontext automatisch respektieren — und dich diese hier dennoch überschreiben lassen.',
      approximateHint:
        'Dein Standort hilft Kalma, nahen Wetterkontext und lokale Signale zuerst zu zeigen.',
      appearanceHint:
        'Der System-Modus folgt deinem Gerät. Du kannst hier jederzeit überschreiben.',
      languageHint:
        'Die Sprache sollte standardmäßig aus dem Browser kommen, aber deine Profil-Einstellung wird zur lokalen Vorgabe.',
      currencyHint:
        'Die Währung sollte standardmäßig aus deiner Region kommen, aber du kannst ändern, wie Werte angezeigt werden.',
      connectHint:
        'Trenne, um Konten zu wechseln, oder verbinde ein externes Wallet für Base Sepolia-Aktionen.',
      verifiedAccounts: 'Kontozugang',
      verifiedAccountsIntro:
        'Nutze Google oder Apple als primären Weg, dein Kalma-Konto zu öffnen. Füge einen Passkey hinzu, um Wiederherstellung und Gerätesicherheit zu stärken, und verbinde ein externes Wallet, wenn du Base Sepolia-Transaktionen brauchst.',
      connectX: 'Google hinzufügen',
      connectFacebook: 'Apple hinzufügen',
      connectInstagram: 'Passkey hinzufügen',
      disconnectSocial: 'Trennen',
      lastAccountNotice: 'Füge zuerst eine weitere Anmeldemethode hinzu — du kannst deinen einzigen Zugang nicht entfernen.',
      disconnectFailed: 'Trennen fehlgeschlagen. Versuch es erneut.',
      verifiedOn: 'Verbunden über',
      pendingVerification: 'Verbindet...',
      noVerifiedAccounts:
        'Noch keine zusätzlichen Anmeldemethoden verknüpft. Füge Google, Apple, einen Passkey oder ein externes Wallet für eine sicherere Wiederherstellung hinzu.',
      publicIdentity: 'Community-Konten',
      publicIdentityIntro:
        'Verknüpfe die öffentlichen Konten, die Menschen bereits rund um deine Arbeit kennen. Diese Vertrauensebene hilft deinen Signalen, mehr Relevanz, Glaubwürdigkeit und Koordinationskraft rund um deinen Namen zu geben.',
      addSocialX: 'X verknüpfen',
      addSocialInstagram: 'Instagram verknüpfen',
      instagramSoon: 'Instagram kommt bald',
      addSocialFarcaster: 'Farcaster verknüpfen',
      noPublicIdentity:
        'Noch keine öffentlichen Social-Konten verknüpft. Starte mit X und füge danach Instagram oder Farcaster hinzu, wenn es für deine Community wichtig ist.',
      following: 'Folge ich',
    },
    zh: {
      intro:
        '查看你的头寸、领取回报，并维护在 Kalma 上操作所需的账户信息。',
      disconnected: '未连接',
      status: '状态',
      address: '地址',
      walletMode: '钱包模式',
      externalWallet: '外部钱包',
      embeddedWallet: '内嵌社交钱包',
      unknownWallet: '已连接钱包',
      customize: '偏好',
      language: '语言',
      currency: '货币',
      units: '单位',
      unitsAuto: '自动',
      unitsHint: '默认使用你所在地区的单位——美国为 °F 和 mph，其他地区为 °C 和 km/h。',
      appearance: '外观',
      location: '位置',
      light: '浅色',
      dark: '深色',
      system: '跟随系统',
      noLocation: '未选择位置',
      testCash: '测试资金',
      deposit: '充值',
      enoughFunds: '你已经有足够的测试资金了。',
      enoughFundsShort: '你已经有足够资金使用 Kalma。',
      connectForBalance: '连接后查看测试资金和账户准备状态。',
      testCashHint: '使用测试资金在测试网上回答是或否、为地点创建风险信号并领取收益。',
      nextClaim: '下次可领取大约还需',
      gettingCash: '正在获取测试资金...',
      getEth: '',
      actions: '操作',
      walletAccess: '钱包访问',
      disconnect: '断开',
      connect: '连接钱包',
      switchWallet: '使用其他钱包',
      connectExternal: '连接外部钱包',
      externalNeeded:
        '社交登录可用于访问和浏览。Base Sepolia 交易目前需要外部钱包。',
      openMarkets: '实时信号',
      createMarket: '添加你的城市',
      positions: '仓位',
      yourPositions: '你的头寸',
      positionsIntro: '跟踪进行中的保护池、等待结果的天气窗口，以及可领取的回报。',
      positionsEmpty: '还没有头寸。准备回答是或否时，可以先浏览实时风险信号。',
      totalPositions: '总数',
      activePositions: '进行中',
      waitingPositions: '等待中',
      readyPositions: '可领取',
      reviewPositions: '审核中',
      donePositions: '已完成',
      positionValue: '头寸金额',
      challengeReview: '结算复核',
      challengeReviewIntro:
        '当结果被提出异议时，回报会在这里暂停，直到最终复核确认完成。',
      challengeOpenCount: '异议处理中',
      yourBonds: '你的保证金',
      claimsPaused: '回报暂停',
      reviewByYou: '你对这个结果提出了异议。你的保证金正在等待最终复核。',
      reviewByAnother: '这个结果已被提出异议，回报会暂停到复核完成为止。',
      openReview: '查看复核',
      viewPositions: '查看头寸',
      collectReturns: '领取回报',
      browseSignals: '浏览实时风险信号',
      profileNotes: '个人资料备注',
      profileNotesBody:
        'Kalma 应该自动遵循浏览器语言、系统外观和最相关的本地上下文，同时仍允许你在此处覆盖这些设置。',
      approximateHint: '你的位置帮助 Kalma 优先显示附近的天气上下文和本地信号。',
      appearanceHint: '系统模式跟随你的设备。你可以随时在此处覆盖。',
      languageHint:
        '语言默认应来自浏览器，但你在个人资料中的偏好将作为本地优先选项。',
      currencyHint:
        '货币默认应根据你的地区，但你可以更改数值的显示方式。',
      connectHint:
        '断开以切换账户，或连接外部钱包用于 Base Sepolia 交易。',
      verifiedAccounts: '账户访问',
      verifiedAccountsIntro: '把 Google 或 Apple 作为打开 Kalma 账户的主要方式。再添加通行密钥来加强恢复能力和设备安全，并在需要进行 Base Sepolia 交易时连接外部钱包。',
      connectX: '添加 Google',
      connectFacebook: '添加 Apple',
      connectInstagram: '添加通行密钥',
      disconnectSocial: '断开',
      lastAccountNotice: '请先添加另一种登录方式——不能移除唯一的登录方式。',
      disconnectFailed: '断开失败，请重试。',
      verifiedOn: '连接方式',
      pendingVerification: '正在连接...',
      noVerifiedAccounts:
        '还没有额外的登录方式。添加 Google、Apple、通行密钥或外部钱包，可获得更安全的账户恢复。',
      publicIdentity: '社区账号',
      publicIdentityIntro:
        '关联人们已经通过你的工作认识的公开账号。这层信任关系会让你的信号围绕你的名字获得更强的相关性、公信力和协作能力。',
      addSocialX: '关联 X',
      addSocialInstagram: '关联 Instagram',
      instagramSoon: 'Instagram 即将上线',
      addSocialFarcaster: '关联 Farcaster',
      noPublicIdentity:
        '还没有关联任何公开社交账号。先从 X 开始，如果你的社区需要，再添加 Instagram 或 Farcaster。',
      following: '正在关注',
    },
  };

  return table[language] ?? table.en;
}

export default function ProfilePage() {
  const { C, fonts, neu, R } = useColors();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { t, language } = useTranslation();
  const { formatLocal, currencyCode, setCurrency } = useCurrencyContext();
  const { system, pref: unitsPref, setPref: setUnitsPref } = useUnits();
  const copy = profileCopy(language);

  const [openSection, setOpenSection] = useState<CustomizeSection>(null);
  const [pendingProvider, setPendingProvider] = useState<VerifiedAccountProvider | null>(null);
  const [pendingSocialProvider, setPendingSocialProvider] = useState<SocialIdentityProvider | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);

  const {
    showBanner,
    onCooldown,
    cooldownSeconds,
    claimFaucet,
    isPending,
    isGasDripping,
    isConfirming,
    isSuccess,
    stage: faucetStage,
    error,
    usdmBalance,
  } = useFaucet();

  const { location, clearManualLocation, setManualLocation } = useLocationContext();
  // RS-2 guardrail: profile reads positions off the snapshot (+ the narrow
  // per-user getUserPosition overlay), never an all-market RPC fan-out.
  const { markets, isLoading: marketsLoading } = useMarketsSnapshot(location);

  const shortAddress = useMemo(() => {
    if (!address) return copy.disconnected;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address, copy.disconnected]);

  const locationValue = useMemo(() => {
    if (!location) return copy.noLocation;
    return [location.city, location.region, location.country].filter(Boolean).join(', ');
  }, [location, copy.noLocation]);

  const currencyValue = useMemo(() => {
    return CURRENCY_OPTIONS.find((opt) => opt.code === currencyCode)?.label ?? currencyCode;
  }, [currencyCode]);

  const unitsValue = useMemo(() => {
    const systemLabel = system === 'imperial' ? '°F · mph' : '°C · km/h';
    return unitsPref === 'auto' ? `${copy.unitsAuto} · ${systemLabel}` : systemLabel;
  }, [system, unitsPref, copy.unitsAuto]);

  const walletModeValue = useMemo(() => {
    if (!isConnected) return copy.disconnected;
    return connector?.name ?? copy.unknownWallet;
  }, [isConnected, connector?.name, copy.disconnected, copy.unknownWallet]);

  const myMarkets = useMemo(() => markets.filter((market) => market.userHasPosition), [markets]);

  const claimabilityContracts = useMemo(() => {
    return myMarkets
      .filter((market) => market.resolved && !market.cancelled && market.userWon && !market.userClaimed)
      .map((market) => ({
        address: CONTRACTS.CLIMATE_ORACLE,
        abi: climateOracleAbi,
        functionName: 'canClaim' as const,
        args: [market.id],
      }));
  }, [myMarkets]);

  const claimabilityRead = useReadContracts({
    contracts: claimabilityContracts,
    query: {
      enabled: claimabilityContracts.length > 0,
      refetchInterval: 15000,
    },
  });

  const challengeReviewContracts = useMemo(() => {
    return myMarkets
      .filter((market) => market.resolved && !market.cancelled)
      .flatMap((market) => [
        {
          address: CONTRACTS.CLIMATE_ORACLE,
          abi: climateOracleAbi,
          functionName: 'challenger' as const,
          args: [market.id],
        },
        {
          address: CONTRACTS.CLIMATE_ORACLE,
          abi: climateOracleAbi,
          functionName: 'frozen' as const,
          args: [market.id],
        },
      ]);
  }, [myMarkets]);

  const challengeReviewRead = useReadContracts({
    contracts: challengeReviewContracts,
    query: {
      enabled: challengeReviewContracts.length > 0,
      refetchInterval: 15000,
    },
  });

  const positionSummary = useMemo(() => {
    const active = myMarkets.filter(
      (market) =>
        !market.resolved &&
        !market.cancelled &&
        market.uiState !== 'cooldown' &&
        market.uiState !== 'expired'
    ).length;
    const waiting = myMarkets.filter(
      (market) =>
        !market.resolved &&
        !market.cancelled &&
        (market.uiState === 'cooldown' || market.uiState === 'expired')
    ).length;
    const claimabilityMap = new Map<string, boolean>();
    let claimabilityIndex = 0;

    for (const market of myMarkets) {
      if (market.resolved && !market.cancelled && market.userWon && !market.userClaimed) {
        const read = claimabilityRead.data?.[claimabilityIndex];
        claimabilityMap.set(market.id.toString(), read?.status === 'success' ? Boolean(read.result?.[0]) : false);
        claimabilityIndex += 1;
      }
    }

    const ready = myMarkets.filter((market) => {
      if (market.userClaimed) return false;
      if (market.cancelled && market.userHasPosition) return true;
      if (!(market.resolved && market.userWon)) return false;
      return claimabilityMap.get(market.id.toString()) === true;
    }).length;

    const review = myMarkets.filter((market) => {
      if (market.userClaimed || market.cancelled) return false;
      if (!(market.resolved && market.userWon)) return false;
      return claimabilityMap.get(market.id.toString()) === false;
    }).length;

    const done = myMarkets.length - active - waiting - ready - review;
    const value = myMarkets.reduce((sum, market) => sum + market.userPositionValue, 0);

    return {
      total: myMarkets.length,
      active,
      waiting,
      ready,
      review,
      done: Math.max(0, done),
      value,
    };
  }, [myMarkets, claimabilityRead.data]);

  const challengedPositions = useMemo(() => {
    const resolvedMarkets = myMarkets.filter((market) => market.resolved && !market.cancelled);
    const items: Array<{
      id: string;
      href: string;
      cityName: string;
      challenger: string;
      challengedByUser: boolean;
    }> = [];

    resolvedMarkets.forEach((market, index) => {
      const challengerRead = challengeReviewRead.data?.[index * 2];
      const frozenRead = challengeReviewRead.data?.[index * 2 + 1];
      const challenger =
        challengerRead?.status === 'success' && typeof challengerRead.result === 'string'
          ? challengerRead.result
          : ZERO_ADDRESS;
      const frozen = frozenRead?.status === 'success' ? Boolean(frozenRead.result) : false;
      const hasChallenge = frozen && challenger.toLowerCase() !== ZERO_ADDRESS;
      if (!hasChallenge) return;

      items.push({
        id: market.id.toString(),
        href: `/markets/${market.id.toString()}`,
        cityName: market.displayCityName,
        challenger,
        challengedByUser: !!address && challenger.toLowerCase() === address.toLowerCase(),
      });
    });

    return items;
  }, [address, challengeReviewRead.data, myMarkets]);

  const challengedByUserCount = useMemo(
    () => challengedPositions.filter((item) => item.challengedByUser).length,
    [challengedPositions]
  );

  const positionsHref =
    positionSummary.ready > 0
      ? '/positions#pos-ready'
      : positionSummary.review > 0
        ? '/positions#pos-review'
        : positionSummary.total > 0
          ? '/positions'
          : '/markets';

  const usdmValue = Number(formatUnits(usdmBalance, USDM_DECIMALS));
  const isUSD = currencyCode === 'USD';
  const needsExternalWalletForTx = false;
  const needsTestCash = isConnected && usdmBalance <= 0n;
  const depositBusy =
    isGasDripping ||
    isPending ||
    isConfirming ||
    ['checking_gas', 'signing_gas', 'waiting_gas', 'requesting_cash', 'refreshing_cash'].includes(faucetStage);
  const depositLabel =
    faucetStage === 'checking_gas' || faucetStage === 'signing_gas' || faucetStage === 'waiting_gas'
      ? (({ en: 'Preparing test credits…', pt: 'Preparando dinheiro de teste…', es: 'Preparando fondos de prueba…', fr: 'Préparation des fonds de test…', de: 'Test-Guthaben wird vorbereitet…', zh: '正在准备测试资金…' } as Record<string, string>)[language] ?? 'Preparing test credits…')
      : faucetStage === 'requesting_cash' || faucetStage === 'refreshing_cash'
        ? copy.gettingCash
        : copy.deposit;

  const formatCooldown = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const toggleSection = (section: CustomizeSection) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const {
    login,
    connectWallet,
    authenticated,
    ready,
    user,
    linkGoogle,
    linkApple,
    linkPasskey,
    linkWallet,
    linkTwitter,
    linkInstagram,
    linkFarcaster,
    unlinkGoogle,
    unlinkApple,
    unlinkPasskey,
    unlinkWallet,
    unlinkTwitter,
    unlinkInstagram,
    unlinkFarcaster,
  } = usePrivy();

  const handleConnect = async () => {
    // Already-authenticated sessions throw on login(); the bridge reconnects
    // wagmi on its own, and connectWallet() lets them attach a wallet.
    if (ready && authenticated) connectWallet();
    else login();
  };

  // "Use another wallet" — when a session already exists, login() throws
  // "already logged in", so open the connect-wallet modal to add/switch an
  // external wallet instead.
  const handleConnectExternal = () => {
    if (ready && authenticated) connectWallet();
    else login();
  };

  const handleFaucetClick = async () => {
    if (needsExternalWalletForTx) {
      handleConnectExternal();
      return;
    }
    await claimFaucet();
  };

  const verifiedAccounts = useMemo<VerifiedAccountItem[]>(() => {
    const linkedAccounts = user?.linkedAccounts ?? [];
    const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

    return linkedAccounts.flatMap((account) => {
      if (account.type === 'google_oauth') {
        return [
          {
            provider: 'google_oauth',
            username: account.email ?? account.name ?? null,
            profileUrl: null,
            verifiedAt: toIso(account.latestVerifiedAt ?? account.firstVerifiedAt),
            badgeLabel: 'Google',
          },
        ];
      }

      if (account.type === 'apple_oauth') {
        return [
          {
            provider: 'apple_oauth',
            username: account.email ?? null,
            profileUrl: null,
            verifiedAt: toIso(account.latestVerifiedAt ?? account.firstVerifiedAt),
            badgeLabel: 'Apple',
          },
        ];
      }

      if (account.type === 'wallet' && account.chainType === 'ethereum') {
        const isEmbedded = account.walletClientType === 'privy' || account.walletClientType === 'privy-v2';
        return [
          {
            provider: 'wallet',
            username: `${account.address.slice(0, 6)}...${account.address.slice(-4)}`,
            profileUrl: null,
            verifiedAt: toIso(account.latestVerifiedAt ?? account.firstVerifiedAt),
            badgeLabel: isEmbedded
              ? (({ en: 'Social account', pt: 'Conta social', es: 'Cuenta social', fr: 'Compte social', de: 'Sozialkonto', zh: '社交账户' } as Record<string, string>)[language] ?? 'Social account')
              : (({ en: 'External account', pt: 'Conta externa', es: 'Cuenta externa', fr: 'Compte externe', de: 'Externes Konto', zh: '外部账户' } as Record<string, string>)[language] ?? 'External account'),
            disconnectable: !isEmbedded,
          },
        ];
      }

      if (account.type === 'passkey') {
        return [
          {
            provider: 'passkey',
            username: account.authenticatorName || 'Passkey',
            profileUrl: null,
            verifiedAt: toIso(account.latestVerifiedAt ?? account.firstVerifiedAt),
            badgeLabel: 'Passkey',
          },
        ];
      }

      return [];
    });
  }, [user?.linkedAccounts]);

  const publicIdentityAccounts = useMemo<PublicIdentityItem[]>(() => {
    const linkedAccounts = user?.linkedAccounts ?? [];
    const accounts: PublicIdentityItem[] = [];

    linkedAccounts.forEach((account) => {
      if (account.type === 'twitter_oauth') {
        accounts.push({
          provider: 'twitter_oauth',
          username: account.username ?? null,
          displayName: account.name ?? null,
          profileUrl: account.username ? `https://x.com/${account.username}` : null,
          badgeLabel: 'X',
        });
        return;
      }

      if (account.type === 'instagram_oauth') {
        accounts.push({
          provider: 'instagram_oauth',
          username: account.username ?? null,
          displayName: null,
          profileUrl: account.username ? `https://instagram.com/${account.username}` : null,
          badgeLabel: 'Instagram',
        });
        return;
      }

      if (account.type === 'farcaster') {
        accounts.push({
          provider: 'farcaster',
          username: account.username ?? null,
          displayName: account.displayName ?? null,
          profileUrl: account.url ?? (account.username ? `https://warpcast.com/${account.username}` : null),
          badgeLabel: 'Farcaster',
        });
      }
    });

    return accounts;
  }, [user?.linkedAccounts]);

  const handleConnectVerified = async (provider: VerifiedAccountProvider) => {
    if (!ready || !authenticated) {
      login();
      return;
    }

    setPendingProvider(provider);
    try {
      if (provider === 'google_oauth') {
        await linkGoogle();
      } else if (provider === 'apple_oauth') {
        await linkApple();
      } else if (provider === 'passkey') {
        await linkPasskey({ name: 'Kalma' });
      } else {
        await linkWallet();
      }
    } catch {
      setPendingProvider(null);
      return;
    }
    setPendingProvider(null);
  };

  useEffect(() => {
    if (!pendingProvider) return;
    if (verifiedAccounts.some((item) => item.provider === pendingProvider)) {
      setPendingProvider(null);
    }
  }, [pendingProvider, verifiedAccounts]);

  const handleDisconnectVerified = async (provider: VerifiedAccountProvider) => {
    if (!user) return;

    setVerifiedNotice(null);

    // Privy rejects unlinking a user's last remaining login method (there
    // must always be at least one way back in). Catch that case up front
    // instead of firing a call that silently rejects — without this the
    // button looked like it did nothing when it was someone's only
    // sign-in method (e.g. an external-wallet-only account).
    if (verifiedAccounts.length <= 1) {
      setVerifiedNotice(copy.lastAccountNotice);
      return;
    }

    setPendingProvider(provider);
    try {
      if (provider === 'google_oauth') {
        const account = user.linkedAccounts.find((item) => item.type === 'google_oauth');
        if (account?.type === 'google_oauth') await unlinkGoogle(account.subject);
      } else if (provider === 'apple_oauth') {
        const account = user.linkedAccounts.find((item) => item.type === 'apple_oauth');
        if (account?.type === 'apple_oauth') await unlinkApple(account.subject);
      } else if (provider === 'passkey') {
        const account = user.linkedAccounts.find((item) => item.type === 'passkey');
        if (account?.type === 'passkey') await unlinkPasskey(account.credentialId);
      } else {
        const account = user.linkedAccounts.find(
          (item) => item.type === 'wallet' && item.chainType === 'ethereum' && item.walletClientType !== 'privy' && item.walletClientType !== 'privy-v2'
        );
        if (account?.type === 'wallet') await unlinkWallet(account.address);
      }
    } catch (err) {
      console.warn('[Kalma] disconnect account failed:', err);
      setVerifiedNotice(copy.disconnectFailed);
    } finally {
      setPendingProvider(null);
    }
  };

  const handleConnectSocial = async (provider: SocialIdentityProvider) => {
    if (!ready || !authenticated) {
      login();
      return;
    }

    setPendingSocialProvider(provider);
    try {
      if (provider === 'twitter_oauth') {
        linkTwitter();
      } else if (provider === 'instagram_oauth') {
        linkInstagram();
      } else {
        linkFarcaster();
      }
    } catch {
      setPendingSocialProvider(null);
    }
  };

  useEffect(() => {
    if (!pendingSocialProvider) return;
    if (publicIdentityAccounts.some((item) => item.provider === pendingSocialProvider)) {
      setPendingSocialProvider(null);
    }
  }, [pendingSocialProvider, publicIdentityAccounts]);

  const handleDisconnectSocial = async (provider: SocialIdentityProvider) => {
    if (!user) return;

    setPendingSocialProvider(provider);
    try {
      if (provider === 'twitter_oauth') {
        const account = user.linkedAccounts.find((item) => item.type === 'twitter_oauth');
        if (account?.type === 'twitter_oauth') await unlinkTwitter(account.subject);
      } else if (provider === 'instagram_oauth') {
        const account = user.linkedAccounts.find((item) => item.type === 'instagram_oauth');
        if (account?.type === 'instagram_oauth') await unlinkInstagram(account.subject);
      } else {
        const account = user.linkedAccounts.find((item) => item.type === 'farcaster');
        if (account?.type === 'farcaster' && typeof account.fid === 'number') {
          await unlinkFarcaster(account.fid);
        }
      }
    } finally {
      setPendingSocialProvider(null);
    }
  };

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <style>{`
        /* Profile cards use MasonryColumns (independent flex columns): no
           overlap (each column flows on its own) and no row-coupling holes (a
           tall card never pushes a gap under its short neighbour). Each card
           fills its column; strip inline card margins so the column gap is the
           single source of vertical rhythm. */
        .k-masonry-item { width: 100%; }
        .k-masonry-item > * { margin: 0 !important; width: 100%; box-sizing: border-box; }
      `}</style>
      <AppHeader section={t('profile.title')} />

      <div style={{ padding: '0 16px 24px', maxWidth: 1080, margin: '0 auto' }}>
        <div
          style={{
            marginBottom: 16,
            paddingLeft: 16,
            paddingRight: 16,
            fontFamily: fonts.sans,
            fontSize: 16,
            color: C.textSoft,
            lineHeight: 1.55,
          }}
        >
          {copy.intro}
        </div>

        <MasonryColumns gap={14} breakpoints={{ 1024: 3, 760: 2 }}>

        <div className="k-profile-positions-card" style={panel(neu, R)}>
          <SectionTitle fonts={fonts} C={C}>
            {copy.yourPositions}
          </SectionTitle>

          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
              lineHeight: 1.5,
              marginBottom: 14,
            }}
          >
            {positionSummary.total > 0 ? copy.positionsIntro : copy.positionsEmpty}
          </div>

          {/* Simplified to the two things that matter: value in play + returns
              ready to collect. Active/waiting breakdown lives on /positions. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <MetricTile
              label={copy.positionValue}
              value={marketsLoading ? '—' : formatLocal(positionSummary.value)}
              sub={positionSummary.total > 0 ? `${positionSummary.total} ${copy.positions.toLowerCase()}` : undefined}
              C={C}
              fonts={fonts}
              R={R}
            />
            <MetricTile
              label={copy.readyPositions}
              value={marketsLoading ? '—' : String(positionSummary.ready)}
              accent={positionSummary.ready > 0 ? C.above : undefined}
              C={C}
              fonts={fonts}
              R={R}
            />
          </div>

          {positionSummary.review > 0 ? (
            <Link href="/positions#pos-review" style={linkReset}>
              <div
                style={{
                  marginBottom: 12,
                  border: `1px solid ${C.divider}`,
                  borderRadius: R.md,
                  padding: '11px 12px',
                  background: C.surfaceSoft,
                  color: C.textSoft,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {`${positionSummary.review} ${copy.reviewPositions.toLowerCase()}`}
              </div>
            </Link>
          ) : null}

          <Link href={positionsHref} style={linkReset}>
            <div style={primaryBtn(C, fonts, R)}>
              {positionSummary.ready > 0
                ? copy.collectReturns
                : positionSummary.review > 0
                  ? copy.reviewPositions
                : positionSummary.total > 0
                  ? copy.viewPositions
                  : copy.browseSignals}
            </div>
          </Link>
        </div>

        {challengedPositions.length > 0 ? (
          <div className="k-profile-review-card" style={panel(neu, R)}>
            <SectionTitle fonts={fonts} C={C}>
              {copy.challengeReview}
            </SectionTitle>

            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.textSoft,
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              {copy.challengeReviewIntro}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <MetricTile
                label={copy.challengeOpenCount}
                value={String(challengedPositions.length)}
                accent={C.below}
                C={C}
                fonts={fonts}
                R={R}
              />
              <MetricTile
                label={copy.yourBonds}
                value={String(challengedByUserCount)}
                sub={challengedByUserCount > 0 ? '50 USDC each' : undefined}
                C={C}
                fonts={fonts}
                R={R}
              />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {challengedPositions.slice(0, 3).map((item) => (
                <Link key={item.id} href={item.href} style={linkReset}>
                  <div
                    style={{
                      border: `1px solid ${C.divider}`,
                      borderRadius: R.lg,
                      padding: '12px 12px',
                      background: C.surface,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: C.textMutedStrong,
                        marginBottom: 7,
                      }}
                    >
                      {copy.claimsPaused}
                    </div>
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 17,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        color: C.text,
                        marginBottom: 6,
                      }}
                    >
                      {item.cityName}
                    </div>
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 13,
                        lineHeight: 1.45,
                        color: C.textSoft,
                      }}
                    >
                      {item.challengedByUser ? copy.reviewByYou : copy.reviewByAnother}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {challengedPositions.length > 3 ? (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: C.textMuted,
                }}
              >
                +{challengedPositions.length - 3}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="k-profile-account-card" style={panel(neu, R)}>
          <SectionTitle fonts={fonts} C={C}>
            {t('header.account')}
          </SectionTitle>

          <Row
            label={copy.status}
            value={isConnected ? t('header.connected') : copy.disconnected}
            fonts={fonts}
            C={C}
          />
          <AddressRow
            label={copy.address}
            address={address ?? null}
            shortAddress={shortAddress}
            explorerUrl={address ? `${CHAIN.blockExplorer}/address/${address}` : null}
            fonts={fonts}
            C={C}
            R={R}
          />
          <Row label={copy.walletMode} value={walletModeValue} fonts={fonts} C={C} />

          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {isConnected ? (
              <>
                <button type="button" onClick={() => disconnect()} style={actionBtn(C, fonts, R)}>
                  {copy.disconnect}
                </button>

                <button
                  type="button"
                  onClick={handleConnectExternal}
                  style={actionBtn(C, fonts, R)}
                >
                  {copy.switchWallet}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleConnect()}
                style={primaryBtn(C, fonts, R)}
              >
                {copy.connect}
              </button>
            )}

            {needsExternalWalletForTx ? (
              <button
                type="button"
                onClick={handleConnectExternal}
                style={primaryBtn(C, fonts, R)}
              >
                {copy.connectExternal}
              </button>
            ) : null}
          </div>
        </div>

        <div className="k-profile-balance-card" style={panel(neu, R)}>
          <SectionTitle fonts={fonts} C={C}>
            {t('profile.balance')}
          </SectionTitle>

          <Row
            label={copy.testCash}
            value={isConnected ? `${usdmValue.toFixed(1)} USDC` : '—'}
            fonts={fonts}
            C={C}
          />

          {!isUSD && usdmValue > 0 ? (
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 12,
                color: C.textMuted,
                marginTop: -6,
                marginBottom: 10,
                paddingLeft: 2,
              }}
            >
              ≈ {formatLocal(usdmValue)}
            </div>
          ) : null}

          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
              lineHeight: 1.5,
              marginTop: 10,
              marginBottom: 12,
            }}
          >
            {needsExternalWalletForTx
              ? copy.externalNeeded
              : !isConnected
                ? copy.connectForBalance
                : needsTestCash
                ? onCooldown
                  ? `${copy.nextClaim} ${formatCooldown(cooldownSeconds)}.`
                  : copy.testCashHint
                : copy.enoughFundsShort}
          </div>

          {needsExternalWalletForTx ? (
            <button
              type="button"
              onClick={() => void handleConnect()}
              style={primaryBtn(C, fonts, R)}
            >
              {copy.connectExternal}
            </button>
          ) : showBanner && !onCooldown ? (
            <button
              type="button"
              onClick={() => void handleFaucetClick()}
              disabled={depositBusy}
              style={primaryBtn(C, fonts, R, depositBusy)}
            >
              {depositLabel}
            </button>
          ) : null}

          {isSuccess ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.above,
              }}
            >
              {t('faucet.success')}
            </div>
          ) : null}

          {error ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: fonts.sans,
                fontSize: 14,
                color: C.below,
              }}
            >
              {readWalletErrorMessage(error) || 'Could not get test credits.'}
            </div>
          ) : null}

        </div>

        <div className="k-profile-customize-card" style={panel(neu, R)}>
          <SectionTitle fonts={fonts} C={C}>
            {copy.customize}
          </SectionTitle>

          {/* Saved location is the most important customize entry — it
              drives which signals surface on Today and on /signals.
              Keep it first in the list so users discover it. */}
          <CollapsedSetting
            label={copy.location}
            value={locationValue}
            open={openSection === 'location'}
            onToggle={() => toggleSection('location')}
            C={C}
            fonts={fonts}
            neu={neu}
            R={R}
          >
            <HelperText fonts={fonts} C={C}>
              {copy.approximateHint}
            </HelperText>

            <LocationPicker
              location={location}
              onSetManual={setManualLocation}
              onClearManual={clearManualLocation}
              mode="editor"
            />
          </CollapsedSetting>

          <CollapsedSetting
            label={copy.currency}
            value={currencyValue}
            open={openSection === 'currency'}
            onToggle={() => toggleSection('currency')}
            C={C}
            fonts={fonts}
            neu={neu}
            R={R}
          >
            <HelperText fonts={fonts} C={C}>
              {copy.currencyHint}
            </HelperText>

            <div style={chipWrap}>
              {CURRENCY_OPTIONS.map((opt) => {
                const isActive = opt.code === currencyCode;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setCurrency(opt.code)}
                    style={{
                      ...chipButton(isActive, C, fonts, R),
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      letterSpacing: 0.5,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CollapsedSetting>

          <CollapsedSetting
            label={copy.units}
            value={unitsValue}
            open={openSection === 'units'}
            onToggle={() => toggleSection('units')}
            C={C}
            fonts={fonts}
            neu={neu}
            R={R}
          >
            <HelperText fonts={fonts} C={C}>
              {copy.unitsHint}
            </HelperText>

            <div style={chipWrap}>
              {([
                { id: 'auto', label: copy.unitsAuto },
                { id: 'metric', label: '°C · km/h' },
                { id: 'imperial', label: '°F · mph' },
              ] as const).map((opt) => {
                const isActive = opt.id === unitsPref;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUnitsPref(opt.id)}
                    style={{
                      ...chipButton(isActive, C, fonts, R),
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      letterSpacing: 0.5,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CollapsedSetting>

        </div>

        <CreatorEarningsPanel />

        <IdentityEditor C={C} fonts={fonts} neu={neu} R={R} />

        {/* Following — the places the user has favorited. Driven by
            useFavorites localStorage; one tap unfollows. */}
        <div className="k-profile-following-card" style={panel(neu, R)}>
          <SectionTitle fonts={fonts} C={C}>
            {copy.following}
          </SectionTitle>
          <div style={{ marginTop: 12 }}>
            <FollowingList />
          </div>
        </div>

        <div className="k-profile-verified-card">
          <ProfileVerifiedAccounts
            C={C}
            fonts={fonts}
            neu={neu}
            R={R}
            copy={{
              title: copy.verifiedAccounts,
              intro: copy.verifiedAccountsIntro,
              addGoogle: copy.connectX,
              addApple: copy.connectFacebook,
              addPasskey: copy.connectInstagram,
              addWallet: copy.connectExternal,
              disconnect: copy.disconnectSocial,
              connectedAs: copy.verifiedOn,
              pending: copy.pendingVerification,
              empty: copy.noVerifiedAccounts,
            }}
            accounts={verifiedAccounts}
            pendingProvider={pendingProvider}
            onConnect={handleConnectVerified}
            onDisconnect={handleDisconnectVerified}
            notice={verifiedNotice}
          />
        </div>

        <div className="k-profile-public-identity-card">
          <ProfilePublicIdentity
            C={C}
            fonts={fonts}
            neu={neu}
            R={R}
            copy={{
              title: copy.publicIdentity,
              intro: copy.publicIdentityIntro,
              addX: copy.addSocialX,
              addInstagram: copy.addSocialInstagram,
              addFarcaster: copy.addSocialFarcaster,
              instagramSoon: copy.instagramSoon,
              connectedAs: copy.verifiedOn,
              disconnect: copy.disconnectSocial,
              pending: copy.pendingVerification,
              empty: copy.noPublicIdentity,
            }}
            accounts={publicIdentityAccounts}
            pendingProvider={pendingSocialProvider}
            onConnect={handleConnectSocial}
            onDisconnect={handleDisconnectSocial}
          />
        </div>

        </MasonryColumns>{/* end profile masonry */}
      </div>

      <BottomNav />
    </div>
  );
}

function CollapsedSetting({
  label,
  value,
  open,
  onToggle,
  children,
  C,
  fonts,
  neu,
  R,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          ...neu.controlPressed,
          width: '100%',
          border: 'none',
          borderRadius: R.lg,
          padding: '12px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: 600,
              color: C.textSoft,
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
              wordBreak: 'break-word',
            }}
          >
            {value}
          </div>
        </div>

        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 16,
            color: C.textMutedStrong,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        >
          ˅
        </div>
      </button>

      {open ? (
        <div
          style={{
            marginTop: 10,
            padding: '2px 2px 4px',
          }}
        >
          {children}
        </div>
      ) : null}
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

function MetricTile({
  label,
  value,
  sub,
  C,
  fonts,
  R,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  C: any;
  fonts: any;
  R: any;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: R.lg,
        padding: '12px 12px',
        background: C.surface,
        border: `1px solid ${C.divider}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.sans,
          // Monetary values must never wrap mid-number. A slightly smaller
          // clamp + tight tracking + tabular figures fits the full-precision
          // worst case (e.g. "R$ 999.999,99") on one line; the formatter
          // switches to compact M/B above a million so it never grows past that.
          fontSize: 'clamp(15px, 4vw, 22px)',
          fontWeight: 800,
          lineHeight: 1.0,
          letterSpacing: -0.4,
          fontVariantNumeric: 'tabular-nums',
          color: accent ?? C.text,
          minWidth: 0,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 5,
            fontFamily: fonts.sans,
            fontSize: 12,
            fontWeight: 600,
            color: C.textMuted,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, fonts, C }: { label: string; value: string; fonts: any; C: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// Address row with copy + open-on-explorer affordances — so the user can grab
// their wallet address and check positions/balances on-chain directly. Icons
// are universal (no new i18n strings); the copy confirmation is a check mark.
function AddressRow({
  label,
  address,
  shortAddress,
  explorerUrl,
  fonts,
  C,
  R,
}: {
  label: string;
  address: string | null;
  shortAddress: string;
  explorerUrl: string | null;
  fonts: any;
  C: any;
  R: any;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!address || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const iconBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: R.md,
    border: 'none',
    background: C.surfaceDeep ?? 'transparent',
    color: C.textMutedStrong,
    cursor: 'pointer',
    textDecoration: 'none',
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            textAlign: 'right',
          }}
        >
          {shortAddress}
        </span>
        {address ? (
          <button type="button" onClick={handleCopy} style={iconBtn} title="Copy address" aria-label="Copy address">
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.above} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        ) : null}
        {address && explorerUrl ? (
          <a href={explorerUrl} target="_blank" rel="noreferrer" style={iconBtn} title="View on explorer" aria-label="View on explorer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
          </a>
        ) : null}
      </span>
    </div>
  );
}

const chipWrap: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const linkReset: React.CSSProperties = {
  textDecoration: 'none',
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
};

function panel(neu: any, R: any): React.CSSProperties {
  return {
    ...neu.panelRaised,
    borderRadius: R.xl,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };
}

function primaryBtn(C: any, fonts: any, R: any, disabled = false): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
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

function actionBtn(C: any, fonts: any, R: any): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '15px 16px',
    borderRadius: R.lg,
    border: 'none',
    background: C.surface,
    color: C.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `4px 4px 10px ${C.shadowA}76, -4px -4px 10px ${C.shadowB}96`,
    marginTop: 0,
  };
}

function chipButton(isActive: boolean, C: any, fonts: any, R: any): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: R.sm,
    border: 'none',
    cursor: 'pointer',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: isActive ? 700 : 500,
    color: isActive ? C.text : C.textSoft,
    background: isActive ? C.surfaceHigh : C.surfaceDeep,
    boxShadow: isActive
      ? `3px 3px 8px ${C.shadowA}7A, -3px -3px 8px ${C.shadowB}AA`
      : 'none',
    transition: 'all 0.2s ease',
  };
}
