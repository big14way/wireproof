import { PRINTED_SIZES, type PrintedSize } from "../rules";

/**
 * Code's checks on a cable print the model read. The size must be one cable is made in, and must appear in the text
 * copied off the sheath; otherwise the model is guessing and the electrician is asked for a better photo.
 */
export function cableProblems(sizeText: string, printText: string, confidence: number): { size: PrintedSize | null; problems: string[] } {
  const problems: string[] = [];
  // "1,5", "1.5mm²" and a core count left in ("3x1.5", "3G0.75") all mean the conductor size after it.
  const n = parseFloat(sizeText.replace(/,/g, ".").replace(/^\s*\d+\s*[x×*g]\s*/i, ""));
  const size = (PRINTED_SIZES as number[]).includes(n) ? (n as PrintedSize) : null;
  if (!sizeText.trim()) problems.push("No size printed or readable.");
  else if (size == null) problems.push(`“${sizeText}” is not a standard cable size.`);
  // Cords print the size straight after the core count ("3x1.5mm²"), so a plain \b would miss it; "21.5" must not pass for 1.5.
  // "1.0MM" is 1 mm²: trailing zeros after the size are allowed.
  const pattern = `${String(size).replace(".", "[.,]")}${Number.isInteger(size) ? "(?:[.,]0+)?" : "0*"}`;
  if (size != null && printText && !new RegExp(`(?<![\\d.,])${pattern}\\s*(mm|sq|²)`, "i").test(printText)) {
    problems.push("The size is not in the copied print text.");
  }
  if (confidence < 0.6) problems.push("Low confidence: film the print closer and in better light.");
  return { size, problems };
}
