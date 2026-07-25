// 국적(ISO 국가코드) → 언어코드 매핑 및 표시 라벨
// 채팅 자동번역 대상 언어 결정에 사용.

const COUNTRY_LANG: Record<string, string> = {
  KR: 'ko',
  JP: 'ja',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  US: 'en', GB: 'en', CA: 'en', AU: 'en', NZ: 'en', IE: 'en', IN: 'en', PH: 'en',
  VN: 'vi',
  TH: 'th',
  RU: 'ru', KZ: 'ru', UZ: 'ru', KG: 'ru', BY: 'ru',
  MN: 'mn',
  SA: 'ar', AE: 'ar', QA: 'ar', KW: 'ar', EG: 'ar', OM: 'ar', BH: 'ar',
  ID: 'id',
  MY: 'ms',
  FR: 'fr',
  DE: 'de', AT: 'de', CH: 'de',
  ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es',
  IT: 'it',
  PT: 'pt', BR: 'pt',
  TR: 'tr',
  NL: 'nl',
  PL: 'pl',
};

// 언어코드 → 표시 라벨(한국어 + 원어)
const LANG_LABEL: Record<string, string> = {
  ko: '한국어',
  en: '영어 (English)',
  ja: '일본어 (日本語)',
  zh: '중국어 (中文)',
  vi: '베트남어 (Tiếng Việt)',
  th: '태국어 (ภาษาไทย)',
  ru: '러시아어 (Русский)',
  ar: '아랍어 (العربية)',
  mn: '몽골어 (Монгол)',
  id: '인도네시아어 (Indonesia)',
  ms: '말레이어 (Melayu)',
  fr: '프랑스어 (Français)',
  de: '독일어 (Deutsch)',
  es: '스페인어 (Español)',
  it: '이탈리아어 (Italiano)',
  pt: '포르투갈어 (Português)',
  tr: '튀르키예어 (Türkçe)',
  nl: '네덜란드어 (Nederlands)',
  pl: '폴란드어 (Polski)',
};

// '기타' 선택 시 노출할 공통 언어 목록(ko 제외)
export const COMMON_LANGS = ['en', 'zh', 'ja', 'vi', 'th', 'ru', 'ar', 'mn', 'id', 'ms', 'fr', 'de', 'es', 'it', 'pt', 'tr', 'nl', 'pl'];

export function countryToLang(country?: string | null): string | null {
  if (!country) return null;
  return COUNTRY_LANG[String(country).trim().toUpperCase()] || null;
}

export function langLabel(code: string): string {
  return LANG_LABEL[code] || code;
}
