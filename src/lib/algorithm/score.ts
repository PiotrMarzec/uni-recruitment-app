export function computeScore(
  averageResult: string | number | null,
  additionalActivities: number | null,
  recommendationLetters: number | null
): number {
  const avg = averageResult ? parseFloat(String(averageResult)) : 0;
  const activities = additionalActivities ?? 0;
  const letters = recommendationLetters ?? 0;
  return 3 * avg + activities + letters;
}
