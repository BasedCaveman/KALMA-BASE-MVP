'use client';

const COUNTRY_FLAGS: Record<string, string> = {
  brazil: 'BR',
  brasil: 'BR',
  'united states': 'US',
  usa: 'US',
  mexico: 'MX',
  méxico: 'MX',
  canada: 'CA',
  'united kingdom': 'GB',
  england: 'GB',
  france: 'FR',
  germany: 'DE',
  china: 'CN',
};

const REGION_CODES: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapá: 'AP',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceará: 'CE',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espírito santo': 'ES',
  'espirito santo': 'ES',
  goiás: 'GO',
  goias: 'GO',
  maranhão: 'MA',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  pará: 'PA',
  para: 'PA',
  paraíba: 'PB',
  paraiba: 'PB',
  paraná: 'PR',
  parana: 'PR',
  pernambuco: 'PE',
  piauí: 'PI',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondônia: 'RO',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'são paulo': 'SP',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'ciudad de méxico': 'CDMX',
  'ciudad de mexico': 'CDMX',
};

function key(value: string) {
  return value.trim().toLowerCase();
}

export function formatPlaceLabel(rawName: string) {
  const parts = rawName.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts[0] || rawName;
  const region = parts[1] || '';
  const country = parts[2] || '';
  const regionCode = region ? REGION_CODES[key(region)] || region : '';
  const countryCode = country ? COUNTRY_FLAGS[key(country)] || '' : '';

  return {
    city,
    region,
    country,
    regionCode,
    countryCode,
    shortName: regionCode ? `${city}, ${regionCode}` : city,
    pillName: city,
  };
}

// English country name → ISO-3166 alpha-2 code, used to localize the country
// portion of a place label via Intl.DisplayNames. Covers the countries Kalma
// seeds across continents plus common ones; unknown names fall back to source.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  brazil: 'BR', brasil: 'BR',
  'united states': 'US', 'united states of america': 'US', usa: 'US',
  'united kingdom': 'GB', england: 'GB', 'great britain': 'GB',
  canada: 'CA', mexico: 'MX', méxico: 'MX',
  argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', perú: 'PE',
  uruguay: 'UY', paraguay: 'PY', bolivia: 'BO', ecuador: 'EC', venezuela: 'VE',
  france: 'FR', germany: 'DE', spain: 'ES', italy: 'IT', portugal: 'PT',
  netherlands: 'NL', belgium: 'BE', austria: 'AT', ireland: 'IE', switzerland: 'CH',
  poland: 'PL', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  greece: 'GR', 'czech republic': 'CZ', czechia: 'CZ', romania: 'RO', hungary: 'HU',
  russia: 'RU', 'russian federation': 'RU', ukraine: 'UA', turkey: 'TR', türkiye: 'TR',
  china: 'CN', japan: 'JP', 'south korea': 'KR', 'korea': 'KR', india: 'IN',
  indonesia: 'ID', thailand: 'TH', vietnam: 'VN', philippines: 'PH', malaysia: 'MY',
  singapore: 'SG', 'hong kong': 'HK', taiwan: 'TW', pakistan: 'PK', bangladesh: 'BD',
  australia: 'AU', 'new zealand': 'NZ',
  'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', ghana: 'GH', egypt: 'EG',
  morocco: 'MA', ethiopia: 'ET', tanzania: 'TZ', uganda: 'UG', 'ivory coast': 'CI',
  'saudi arabia': 'SA', 'united arab emirates': 'AE', israel: 'IL', qatar: 'QA',
};

/**
 * Localize the country portion of a place label (e.g. "Brazil" → "Brasil" in
 * pt). Cities and regions are proper nouns and are intentionally left as-is.
 * Falls back to the source string for unknown countries or unsupported locales.
 */
export function localizeCountry(country: string, language: string): string {
  if (!country) return country;
  const code = COUNTRY_NAME_TO_CODE[key(country)];
  if (!code) return country;
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? country;
  } catch {
    return country;
  }
}
