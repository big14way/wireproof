import { CITATIONS, type Finding } from "./rules";

export interface PanelDevice {
  position: number;
  kind: string;
  ratingA: number;
  curve?: string;
  sensitivityMA: number;
  label: string;
}

/** Board-level rules that need only a photo of the panel: isolation, RCD, surge protection, labels. */
export function panelFindings(p: { devices: PanelDevice[]; mainSwitch: boolean; rcd: boolean; spd: boolean; labelled: boolean }): Finding[] {
  const out: Finding[] = [];
  out.push(p.mainSwitch
    ? { ruleId: "BOARD-MAIN", status: "pass", title: "Main switch present", detail: "The whole installation can be isolated.", citation: CITATIONS.isolation }
    : { ruleId: "BOARD-MAIN", status: "fail", title: "No main switch seen", detail: "The board needs a main switch to isolate the installation.", citation: CITATIONS.isolation });
  out.push(p.rcd
    ? { ruleId: "BOARD-RCD", status: "pass", title: "RCD protection present", detail: "An RCD or RCBO is fitted. Check it covers every socket and lighting circuit.", citation: CITATIONS.rcdSockets }
    : { ruleId: "BOARD-RCD", status: "fail", title: "No RCD on the board", detail: "Home socket and lighting circuits, and cables buried shallow in walls, need 30 mA RCD protection.", fix: "Fit a 30 mA RCD or RCBOs.", citation: `${CITATIONS.rcdSockets}; ${CITATIONS.rcdLighting}` });
  if (!p.spd) out.push({ ruleId: "BOARD-SPD", status: "info", title: "No surge protection seen", detail: "A surge protective device protects inverters, ACs and fridges from supply surges.", citation: CITATIONS.spd });
  if (!p.labelled) out.push({ ruleId: "BOARD-LABELS", status: "warn", title: "Breakers not labelled", detail: "Label every breaker with the circuit it controls.", citation: CITATIONS.isolation });
  return out;
}
