import { MARKET_RATINGS } from "../rules";

/**
 * Code's checks on one device the board reader returned. The rating must be one breakers are sold in, and must match
 * the amps copied off the device itself; anything else goes back to the electrician to check by eye.
 */
export function deviceProblems(position: number, kind: string, ratingA: number, printedText: string): string[] {
  const problems: string[] = [];
  const breaker = kind.includes("MCB") || kind.includes("RCBO");
  if (breaker && ratingA > 0 && !(MARKET_RATINGS as readonly number[]).includes(ratingA)) problems.push(`Device ${position}: ${ratingA} A is not a rating breakers are sold in.`);
  if (breaker && ratingA === 0) problems.push(`Device ${position}: rating unreadable.`);
  // Cross-check the rating against the text copied off the device: a breaker marked "B20" and "30A" is ambiguous.
  const amps = new Set([...printedText.toUpperCase().matchAll(/\b(?:[BCD](\d{1,3})|(\d{1,3})\s?A)\b/g)].map((m) => Number(m[1] ?? m[2])));
  if (amps.size > 1) problems.push(`Device ${position}: printed text shows ${[...amps].map((a) => `${a} A`).join(" and ")}; check the breaker by eye.`);
  else if (ratingA > 0 && amps.size === 1 && !amps.has(ratingA)) problems.push(`Device ${position}: rating ${ratingA} A is not in its printed text.`);
  return problems;
}
