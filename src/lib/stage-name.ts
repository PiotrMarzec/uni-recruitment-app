export function getStageName(stage: { type: string; order: number }): string {
  if (stage.type === "initial") return "Initial recruitment stage";
  if (stage.type === "admin") {
    if (stage.order <= 1) return "Admin stage";
    const num = Math.floor((stage.order - 1) / 2);
    return `Supplementary admin stage #${num}`;
  }
  if (stage.type === "supplementary") {
    const num = Math.floor((stage.order - 2) / 2) + 1;
    return `Supplementary recruitment stage #${num}`;
  }
  return stage.type;
}
