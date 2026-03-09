import en from "../../../messages/en.json";
import pl from "../../../messages/pl.json";
import de from "../../../messages/de.json";
import fr from "../../../messages/fr.json";
import es from "../../../messages/es.json";
import it from "../../../messages/it.json";

type Messages = typeof en;
type EmailMessages = Messages["email"];

const messages: Record<string, Messages> = { en, pl, de, fr, es, it };

/** Returns a translator scoped to the email namespace for the given locale. */
export function getEmailT(locale: string) {
  const msgs: Messages = messages[locale] ?? messages["en"];
  const email: EmailMessages = msgs.email;

  return function t(
    keyPath: string,
    vars?: Record<string, string>
  ): string {
    const parts = keyPath.split(".");
    let val: unknown = email;
    for (const part of parts) {
      val = (val as Record<string, unknown>)[part];
    }
    let str = typeof val === "string" ? val : keyPath;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  };
}

/** Returns the locale-specific date locale string for date formatting. */
export function getDateLocale(locale: string): string {
  const map: Record<string, string> = {
    en: "en-GB",
    pl: "pl-PL",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    it: "it-IT",
  };
  return map[locale] ?? "en-GB";
}
