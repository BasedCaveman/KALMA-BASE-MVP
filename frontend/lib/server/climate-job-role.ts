/** MVP defaults to reader. Preview never executes background jobs.
 * User-driven MVP flows (observations, profile, wallet) are unaffected.
 */
export function climateJobBlockReason(
  env: Record<string, string | undefined>,
): 'preview_jobs_disabled' | 'climate_jobs_disabled' | null {
  if (env.VERCEL_ENV === 'preview') return 'preview_jobs_disabled';
  if (env.KALMA_DEPLOYMENT_ROLE !== 'climate-executor') return 'climate_jobs_disabled';
  return null;
}
