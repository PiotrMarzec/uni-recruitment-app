type TranslatorFn = (key: string, vars?: Record<string, string | number>) => string;

function getSupplementaryNum(order: number): number {
  return Math.floor((order - 3) / 3) + 1;
}

/**
 * Returns a translated stage name. When no translator is provided, returns
 * the English fallback (used when storing names in the database).
 */
export function getStageName(
  stage: { type: string; order: number },
  t?: TranslatorFn
): string {
  if (t) {
    return getTranslatedStageName(stage, t);
  }
  // Fallback: hardcoded English (used for DB storage only)
  if (stage.type === "initial") return "Initial recruitment stage";
  if (stage.type === "admin") {
    if (stage.order <= 1) return "Admin stage";
    const num = getSupplementaryNum(stage.order);
    return `Supplementary admin stage #${num}`;
  }
  if (stage.type === "verification") {
    if (stage.order <= 2) return "Verification stage";
    const num = getSupplementaryNum(stage.order);
    return `Supplementary verification stage #${num}`;
  }
  if (stage.type === "supplementary") {
    const num = getSupplementaryNum(stage.order);
    return `Supplementary recruitment stage #${num}`;
  }
  return stage.type;
}

function getTranslatedStageName(
  stage: { type: string; order: number },
  t: TranslatorFn
): string {
  if (stage.type === "initial") return t("stageName.initial");
  if (stage.type === "admin") {
    if (stage.order <= 1) return t("stageName.admin");
    const num = getSupplementaryNum(stage.order);
    return t("stageName.supplementaryAdmin", { num });
  }
  if (stage.type === "verification") {
    if (stage.order <= 2) return t("stageName.verification");
    const num = getSupplementaryNum(stage.order);
    return t("stageName.supplementaryVerification", { num });
  }
  if (stage.type === "supplementary") {
    const num = getSupplementaryNum(stage.order);
    return t("stageName.supplementaryRecruitment", { num });
  }
  return stage.type;
}
