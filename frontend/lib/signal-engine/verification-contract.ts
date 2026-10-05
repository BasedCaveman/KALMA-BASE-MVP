/** Fail closed: scalar baselines do not describe a comparable daily reference. */
import { directionalVerdict, rainNearBand, verdictSpaceIsDegenerate } from './verification-rules.ts';
export const COMPARISON_NOTE = 'Daily observations retained. Comparison unavailable unless variable, unit, aggregation, calendar window, reference method and complete samples are compatible. This is not a forecast accuracy grade.';
export const COMPARISON_AVAILABLE_NOTE = 'Daily observations and a compatible daily reference are shown. This directional comparison is not a forecast accuracy grade.';
export type WindowEvidence = {
  variable: string; unit: string; aggregation: string; duration_days: number;
  timezone: string; start: string; end: string; sample_count: number;
  source: string; method_version: string; samples_complete: boolean;
};
export type ComparisonContract = { observation: WindowEvidence; reference: WindowEvidence & { baseline: number } };
const nonempty = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
function calendarZone(zone: string): string | null {
  try { return new Intl.DateTimeFormat('en', {timeZone:zone}).resolvedOptions().timeZone; }
  catch { return null; }
}
function dailyWindow(w: any): boolean {
  return !!w && w.duration_days === 1 && w.samples_complete === true && Number.isInteger(w.sample_count) && w.sample_count > 0 &&
    ['variable','unit','aggregation','timezone','source','method_version'].every(k => nonempty(w[k])) &&
    /^\d{4}-\d{2}-\d{2}$/.test(w.start) && w.start === w.end &&
    calendarZone(w.timezone) !== null && Number.isFinite(Date.parse(w.start)) && new Date(w.start).toISOString().slice(0,10) === w.start;
}
export function compatibleContract(c: any, metric: string, unit: string, date?: string): boolean {
  const o = c?.observation, r = c?.reference;
  const aggregation = metric === 'precipitation_sum' ? 'sum' : metric === 'temperature_2m_max' ? 'max' : null;
  return unit === (metric === 'precipitation_sum' ? 'mm' : '°C') && !!aggregation && dailyWindow(o) && dailyWindow(r) && o.sample_count === 1 &&
    o.variable === metric && r.variable === metric && o.unit === unit && r.unit === unit &&
    o.aggregation === aggregation && r.aggregation === aggregation && calendarZone(o.timezone) === calendarZone(r.timezone) &&
    (!date || o.start === date);
}
export function isComparableCheck(c: any, date?: string): boolean {
  if (!c || !Number.isFinite(c.actual) || !Number.isFinite(c.baseline) ||
      !compatibleContract(c.comparison_contract, c.metric, c.unit, date) ||
      c.comparison_contract.reference.baseline !== c.baseline) return false;
  const band = c.unit === 'mm' ? rainNearBand(c.baseline) : 1.5;
  if (c.unit === 'mm' && (c.actual < 0 || verdictSpaceIsDegenerate(c.baseline, band, 0))) return false;
  return c.verdict === directionalVerdict(c.actual, c.baseline, band);
}
export function buildCompatibleChecks(signals: any[], actuals: any, date?: string): any[] {
  const checks: any[] = [];
  for (const s of signals) {
    const sd = s.structured_data ?? {};
    for (const [metric, unit, key, baselineKey] of [
      ['precipitation_sum','mm','precipitation_sum_mm','baseline_median_mm'],
      ['temperature_2m_max','°C','temperature_max_c','baseline_median_c'],
    ]) {
      const reference = sd.comparison_reference;
      // Require the reference to identify this exact scalar, never scale a multi-day median.
      if (reference?.baseline !== sd[baselineKey]) continue;
      const c = {signal_type_id:s.signal_type_id,title:s.title,metric,unit,
        baseline:sd[baselineKey],actual:actuals[key],
        comparison_contract:{observation:actuals.comparison_observations?.[metric],reference},
        verdict:directionalVerdict(actuals[key],sd[baselineKey],unit === 'mm' ? rainNearBand(sd[baselineKey]) : 1.5)};
      if (isComparableCheck(c,date)) checks.push(c);
    }
  }
  return checks;
}
/** Reader protection does not rewrite the stored historical JSON. */
export function safeVerification<T extends {checks?: any[]; note?: string; comparison_status?: string}>(v: T | null, date?: string): T | null {
  if (!v) return null;
  const checks = (Array.isArray(v.checks) ? v.checks : []).filter(c => isComparableCheck(c,date));
  return {...v, checks, comparison_status: checks.length ? 'compatible_daily_reference' : 'unavailable_or_incompatible', note: checks.length ? COMPARISON_AVAILABLE_NOTE : COMPARISON_NOTE};
}
