import ja from "./ja.js";
import en from "./en.js";
import zh from "./zh.js";

const translations = {
  ja,
  en,
  zh,
};

export const defaultLocale = "ja";

export const supportedLocales = ["ja", "en", "zh"];

export function getTranslations(locale = defaultLocale) {
  const normalizedLocale = locale.toLowerCase().split("-")[0];

  return translations[normalizedLocale] ?? translations[defaultLocale];
}