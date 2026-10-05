// New literal EN/PT strings submitted for focal Copy review with this patch.
export function readStateCopy(language: string) {
  return language === 'pt' ? {
    loading: 'Carregando dados…',
    unavailable: 'Não foi possível carregar os dados. Tente novamente.',
    retry: 'Tentar novamente',
    claimUnavailable: 'Créditos de teste indisponíveis para esta conta.',
  } : {
    loading: 'Loading data…',
    unavailable: 'Could not load the data. Please try again.',
    retry: 'Try again',
    claimUnavailable: 'Test credits are unavailable for this account.',
  };
}
