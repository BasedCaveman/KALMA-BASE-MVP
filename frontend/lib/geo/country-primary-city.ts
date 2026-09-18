// kalma/frontend/lib/geo/country-primary-city.ts
//
// When someone searches a COUNTRY, send them to its primary city.
//
// WHY. The Open-Meteo geocoder answers "Nepal" with the country itself (a
// centroid in the Himalaya, feature_code PCLI), plus a hamlet called Nepal in
// Pakistan and another in Indonesia. Kathmandu is not in the results at all,
// and no re-query of the same geocoder can produce it: the API has no "capital
// of" concept. So the mapping has to be data.
//
// "PRIMARY CITY", NOT "CAPITAL", on purpose. Several countries have a seat of
// government that is not the city a person means (Côte d'Ivoire, South Africa,
// Tanzania, Bolivia), and a few have capitals that are actively disputed.
// Kalma is a weather product with no business adjudicating any of that, so this
// table records the city we default to and makes no claim beyond that.
//
// Scope, decided with Pedro 2026-08-05: countries only. States and provinces
// are deliberately NOT here. The geocoder never returns an administrative
// division to intercept ("Minas Gerais" answers with a hamlet in Acre), so
// covering them would mean shipping a worldwide admin-division dataset, which
// is out of proportion to the problem.
//
// Self-contained (zero imports), so it can be used from the hook, a route, or
// a Node script alike.

/** ISO 3166-1 alpha-2 to the city we default to for that country. */
export const COUNTRY_PRIMARY_CITY: Record<string, string> = {
  AD: 'Andorra la Vella', AE: 'Dubai', AF: 'Kabul', AL: 'Tirana', AM: 'Yerevan',
  AO: 'Luanda', AR: 'Buenos Aires', AT: 'Vienna', AU: 'Sydney', AZ: 'Baku',
  BA: 'Sarajevo', BB: 'Bridgetown', BD: 'Dhaka', BE: 'Brussels', BF: 'Ouagadougou',
  BG: 'Sofia', BH: 'Manama', BI: 'Bujumbura', BJ: 'Cotonou', BN: 'Bandar Seri Begawan',
  BO: 'La Paz', BR: 'Sao Paulo', BS: 'Nassau', BT: 'Thimphu', BW: 'Gaborone',
  BY: 'Minsk', BZ: 'Belize City', CA: 'Toronto', CD: 'Kinshasa', CF: 'Bangui',
  CG: 'Brazzaville', CH: 'Zurich', CI: 'Abidjan', CL: 'Santiago', CM: 'Douala',
  CN: 'Shanghai', CO: 'Bogota', CR: 'San Jose', CU: 'Havana', CV: 'Praia',
  CY: 'Nicosia', CZ: 'Prague', DE: 'Berlin', DJ: 'Djibouti', DK: 'Copenhagen',
  DO: 'Santo Domingo', DZ: 'Algiers', EC: 'Guayaquil', EE: 'Tallinn', EG: 'Cairo',
  ER: 'Asmara', ES: 'Madrid', ET: 'Addis Ababa', FI: 'Helsinki', FJ: 'Suva',
  FR: 'Paris', GA: 'Libreville', GB: 'London', GE: 'Tbilisi', GH: 'Accra',
  GM: 'Banjul', GN: 'Conakry', GQ: 'Malabo', GR: 'Athens', GT: 'Guatemala City',
  GW: 'Bissau', GY: 'Georgetown', HN: 'Tegucigalpa', HR: 'Zagreb', HT: 'Port-au-Prince',
  HU: 'Budapest', ID: 'Jakarta', IE: 'Dublin', IN: 'Mumbai', IQ: 'Baghdad',
  IR: 'Tehran', IS: 'Reykjavik', IT: 'Rome', JM: 'Kingston', JO: 'Amman',
  JP: 'Tokyo', KE: 'Nairobi', KG: 'Bishkek', KH: 'Phnom Penh', KM: 'Moroni',
  KR: 'Seoul', KW: 'Kuwait City', KZ: 'Almaty', LA: 'Vientiane', LB: 'Beirut',
  LK: 'Colombo', LR: 'Monrovia', LS: 'Maseru', LT: 'Vilnius', LU: 'Luxembourg',
  LV: 'Riga', LY: 'Tripoli', MA: 'Casablanca', MD: 'Chisinau', ME: 'Podgorica',
  MG: 'Antananarivo', MK: 'Skopje', ML: 'Bamako', MM: 'Yangon', MN: 'Ulaanbaatar',
  MR: 'Nouakchott', MT: 'Valletta', MU: 'Port Louis', MV: 'Male', MW: 'Lilongwe',
  MX: 'Mexico City', MY: 'Kuala Lumpur', MZ: 'Maputo', NA: 'Windhoek', NE: 'Niamey',
  NG: 'Lagos', NI: 'Managua', NL: 'Amsterdam', NO: 'Oslo', NP: 'Kathmandu',
  NZ: 'Auckland', OM: 'Muscat', PA: 'Panama City', PE: 'Lima', PG: 'Port Moresby',
  PH: 'Manila', PK: 'Karachi', PL: 'Warsaw', PT: 'Lisbon', PY: 'Asuncion',
  QA: 'Doha', RO: 'Bucharest', RS: 'Belgrade', RU: 'Moscow', RW: 'Kigali',
  SA: 'Riyadh', SD: 'Khartoum', SE: 'Stockholm', SG: 'Singapore', SI: 'Ljubljana',
  SK: 'Bratislava', SL: 'Freetown', SN: 'Dakar', SO: 'Mogadishu', SR: 'Paramaribo',
  SV: 'San Salvador', SY: 'Damascus', SZ: 'Mbabane', TD: "N'Djamena", TG: 'Lome',
  TH: 'Bangkok', TJ: 'Dushanbe', TM: 'Ashgabat', TN: 'Tunis', TR: 'Istanbul',
  TT: 'Port of Spain', TW: 'Taipei', TZ: 'Dar es Salaam', UA: 'Kyiv', UG: 'Kampala',
  US: 'New York', UY: 'Montevideo', UZ: 'Tashkent', VE: 'Caracas', VN: 'Ho Chi Minh City',
  YE: 'Sanaa', ZA: 'Johannesburg', ZM: 'Lusaka', ZW: 'Harare',
};

/** The city to search for when a country was matched, or null when unknown. */
export function primaryCityFor(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return COUNTRY_PRIMARY_CITY[countryCode.toUpperCase()] ?? null;
}

/** Open-Meteo marks populated places with a PPL* class. */
export function isPopulatedPlace(featureCode: string | null | undefined): boolean {
  return typeof featureCode === 'string' && featureCode.toUpperCase().startsWith('PPL');
}

/** True for a country record (the thing we redirect away from). */
export function isCountryRecord(featureCode: string | null | undefined): boolean {
  const f = (featureCode ?? '').toUpperCase();
  return f === 'PCLI' || f === 'PCLD' || f === 'PCLS' || f === 'PCLF' || f === 'PCL';
}
