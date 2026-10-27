import { designCurrent, voltDrop } from "./design";
import {
  ambientFactor, CAPACITY_4D1A, CITATIONS, DEFAULT_AMBIENT_C, groupingFactor, MCB_RATINGS, VOLT_DROP_LIMIT,
} from "./tables";
import type { Board, Circuit, CircuitResult, Evidence, Finding, Status } from "./types";

/** Brands SON has publicly warned about. Each entry carries its source so a flag can cite it. */
export const SON_ALERT_BRANDS: { brand: string; source: string }[] = [
  { brand: "SUNRISE", source: "SON public alert: very high conductor resistance, poor elongation (Guardian NG)" },
];

const SEVERITY: Record<Status, number> = { pass: 0, info: 1, warn: 2, fail: 3 };
export const worst = (statuses: Status[]): Status =>
  statuses.reduce<Status>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), "pass");

const ev = (...items: (Evidence | undefined)[]) => items.filter(Boolean) as Evidence[];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Run every rule against one circuit. Code decides; the model only supplies the readings. */
export function checkCircuit(c: Circuit): CircuitResult {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "circuitId">) => findings.push({ ...f, circuitId: c.id });

  const method = c.method ?? "B";
  const ca = ambientFactor(c.ambientC ?? DEFAULT_AMBIENT_C);
  const cg = groupingFactor(c.groupedWith ?? 1);
  const size = c.cable.printedSize?.value ?? c.designSize;
  const it = CAPACITY_4D1A[method][size];
  const iz = it * ca * cg;
  const ib = c.loadW != null ? designCurrent({ kind: c.kind, loadW: c.loadW, powerFactor: c.powerFactor, lengthM: c.lengthM }) : undefined;
  const ring = c.kind === "sockets-ring";

  // 1. Is it real copper? A magnet sticks to iron or steel, never to copper.
  const magnet = c.cable.magnetAttaches;
  if (magnet?.value === true) {
    add({
      ruleId: "CABLE-MAGNET", status: "fail", title: "Conductor is not copper",
      detail: "A magnet sticks to the conductor, so it is iron or steel coated in copper. It has far higher resistance and heats up under load.",
      fix: "Pull this cable out and replace it with genuine copper cable before plastering.",
      citation: CITATIONS.sonCable, evidence: ev(magnet.evidence),
    });
  } else if (magnet?.value === false) {
    add({ ruleId: "CABLE-MAGNET", status: "pass", title: "Conductor passes the magnet test", detail: "The magnet does not attract the conductor.", citation: CITATIONS.sonCable, evidence: ev(magnet.evidence) });
  } else {
    add({ ruleId: "CABLE-MAGNET", status: "warn", title: "Magnet test not recorded", detail: "Record a short clip of a magnet against the bare conductor.", citation: CITATIONS.sonCable });
  }

  // 2. Does the print match what was paid for, and is the brand one SON has warned about?
  const printed = c.cable.printedSize;
  if (!printed || printed.value == null) {
    add({ ruleId: "CABLE-PRINT", status: "warn", title: "Cable size not readable", detail: "No legible size print was captured on this run.", fix: "Film the sheath print up close in good light.", citation: CITATIONS.capacity, evidence: ev(printed?.evidence) });
  } else if (printed.value < c.designSize) {
    add({
      ruleId: "CABLE-PRINT", status: "fail", title: `Undersized cable: ${printed.value} mm² instead of ${c.designSize} mm²`,
      detail: `The circuit was designed for ${c.designSize} mm² but the sheath reads ${printed.value} mm².`,
      fix: `Replace with ${c.designSize} mm² cable.`, citation: CITATIONS.capacity, evidence: ev(printed.evidence),
    });
  } else {
    add({ ruleId: "CABLE-PRINT", status: "pass", title: `Cable reads ${printed.value} mm²`, detail: "The sheath print matches the design size.", citation: CITATIONS.capacity, evidence: ev(printed.evidence) });
  }
  const brand = c.cable.brand?.value?.trim();
  const alert = brand && SON_ALERT_BRANDS.find((b) => brand.toUpperCase().includes(b.brand));
  if (alert) {
    add({ ruleId: "CABLE-BRAND", status: "fail", title: `${brand}: brand under SON alert`, detail: alert.source, fix: "Replace with a SON-certified brand.", citation: CITATIONS.sonCable, evidence: ev(c.cable.brand?.evidence) });
  }
  if (!c.cable.sonMark?.value) {
    add({ ruleId: "CABLE-SON", status: "warn", title: "No SON / NIS marking captured", detail: "Certified cable carries a SON registration or NIS marking on the sheath.", citation: CITATIONS.sonCable, evidence: ev(c.cable.sonMark?.evidence) });
  }

  // 3. Breaker against cable: Ib ≤ In ≤ Iz (ring finals need Iz ≥ 0.67 In).
  const device = c.device?.value;
  if (device) {
    const needed = ring ? 0.67 * device.ratingA : device.ratingA;
    if (iz < needed) {
      add({
        ruleId: "PROT-OVERLOAD", status: "fail",
        title: `${device.ratingA} A breaker on ${size} mm² cable`,
        detail: `This cable carries ${r1(iz)} A here (${it} A × ambient ${ca} × grouping ${cg}), below the ${r1(needed)} A the breaker allows. The cable can overheat before the breaker trips.`,
        fix: `Fit a ${largestSafeBreaker(iz, ring)} A breaker, or upsize the cable.`,
        citation: ring ? CITATIONS.ringFinal : CITATIONS.coordination, evidence: ev(c.device?.evidence),
      });
    } else {
      add({ ruleId: "PROT-OVERLOAD", status: "pass", title: `${device.ratingA} A breaker protects ${size} mm² cable`, detail: `Cable capacity ${r1(iz)} A ≥ ${r1(needed)} A.`, citation: CITATIONS.coordination, evidence: ev(c.device?.evidence) });
    }
    if (ib != null && ib > device.ratingA) {
      add({ ruleId: "PROT-NUISANCE", status: "warn", title: "Load exceeds the breaker", detail: `Design current ${r1(ib)} A is above the ${device.ratingA} A rating; it will trip in use.`, fix: "Re-check the load or resize the circuit.", citation: CITATIONS.coordination });
    }
    if ((c.kind === "air-conditioner" || c.kind === "pump") && device.curve === "B") {
      add({ ruleId: "PROT-CURVE", status: "warn", title: "B-curve breaker on a motor load", detail: "Compressor and pump start-up surges can trip a B-curve breaker.", fix: "Use a type C breaker.", citation: CITATIONS.coordination });
    }
  } else {
    add({ ruleId: "PROT-OVERLOAD", status: "warn", title: "Breaker not identified", detail: "Photograph the breaker for this circuit so its rating can be read.", citation: CITATIONS.coordination });
  }

  // 4. Voltage drop at the far end.
  let vd: { volts: number; pct: number } | undefined;
  if (ib != null) {
    vd = voltDrop(size, ib, c.lengthM, ring);
    const limit = c.kind === "lighting" ? VOLT_DROP_LIMIT.lighting : VOLT_DROP_LIMIT.other;
    add({
      ruleId: "VOLT-DROP", status: vd.pct > limit ? "fail" : "pass",
      title: `Voltage drop ${r1(vd.pct * 100)}% over ${c.lengthM} m`,
      detail: `${r1(vd.volts)} V at the far end; the limit is ${limit * 100}%.`,
      fix: vd.pct > limit ? "Use the next cable size up or shorten the run." : undefined,
      citation: CITATIONS.voltDrop,
    });
  }

  // 5. Earth: every circuit needs a protective conductor.
  const cpc = c.cable.cpcPresent;
  if (cpc?.value === false) {
    add({ ruleId: "EARTH-CPC", status: "fail", title: "No earth conductor in the run", detail: "Metal fittings on this circuit would stay live after a fault.", fix: "Pull a green-and-yellow earth conductor with the circuit.", citation: CITATIONS.cpcPresent, evidence: ev(cpc.evidence) });
  } else if (cpc?.value === true) {
    const cpcSize = c.cable.cpcSize?.value;
    add(cpcSize != null && cpcSize < size
      ? { ruleId: "EARTH-CPC", status: "warn", title: `Earth ${cpcSize} mm² smaller than line ${size} mm²`, detail: "Allowed only if the adiabatic check passes.", fix: "Confirm with the adiabatic equation or match the line size.", citation: CITATIONS.cpcSize, evidence: ev(cpc.evidence) }
      : { ruleId: "EARTH-CPC", status: "pass", title: "Earth conductor present", detail: "Green-and-yellow protective conductor seen in the run.", citation: CITATIONS.cpcPresent, evidence: ev(cpc.evidence) });
  } else {
    add({ ruleId: "EARTH-CPC", status: "warn", title: "Earth conductor not confirmed", detail: "Film the conduit end showing the green-and-yellow conductor.", citation: CITATIONS.cpcPresent });
  }

  // 6. 30 mA RCD: sockets, domestic lighting, shallow concealed cables and bathrooms all need one.
  //    Conduit chased into a block wall and plastered is shallow unless the job says otherwise.
  const reasons: string[] = [];
  if (c.kind === "sockets-ring" || c.kind === "sockets-radial") reasons.push(CITATIONS.rcdSockets);
  if (c.kind === "lighting" && c.domestic !== false) reasons.push(CITATIONS.rcdLighting);
  if (c.concealedShallow !== false) reasons.push(CITATIONS.rcdConcealed);
  if (c.servesBathroom) reasons.push(CITATIONS.rcdBathroom);
  if (reasons.length) {
    const rcd = c.rcd30mA;
    add(rcd?.value === true
      ? { ruleId: "RCD-30MA", status: "pass", title: "30 mA RCD protection", detail: "This circuit is covered by a 30 mA RCD or RCBO.", citation: reasons[0], evidence: ev(rcd.evidence) }
      : {
          ruleId: "RCD-30MA", status: rcd?.value === false ? "fail" : "warn",
          title: rcd?.value === false ? "No 30 mA RCD protection" : "RCD protection not confirmed",
          detail: `Required because: ${reasons.join("; ")}.`,
          fix: "Protect this circuit with a 30 mA RCD or RCBO.", citation: reasons.join("; "), evidence: ev(rcd?.evidence),
        });
  }

  return {
    circuit: c,
    findings,
    verdict: worst(findings.map((f) => f.status)),
    numbers: { designCurrentA: ib, capacityA: it, correctedCapacityA: iz, voltDropV: vd?.volts, voltDropPct: vd?.pct, factors: { ambient: ca, grouping: cg } },
  };
}

function largestSafeBreaker(iz: number, ring: boolean): number {
  const ok = MCB_RATINGS.filter((r) => (ring ? 0.67 * r : r) <= iz);
  return ok.length ? ok[ok.length - 1] : 6;
}

export function checkBoard(b: Board): { findings: Finding[]; circuits: CircuitResult[]; verdict: Status } {
  const findings: Finding[] = [];
  const circuits = b.circuits.map(checkCircuit);
  if (b.mainSwitch?.value === false) {
    findings.push({ ruleId: "BOARD-MAIN", status: "fail", title: "No main switch", detail: "The board needs a main switch to isolate the whole installation.", citation: CITATIONS.isolation, evidence: ev(b.mainSwitch.evidence) });
  }
  const needsRcd = circuits.some((r) => r.findings.some((f) => f.ruleId === "RCD-30MA" && f.status !== "pass"));
  if (b.rcdPresent?.value === false && needsRcd) {
    findings.push({ ruleId: "BOARD-RCD", status: "fail", title: "No RCD on the board", detail: "Circuits on this board need 30 mA RCD protection and the board has none.", fix: "Fit a 30 mA RCD (or RCBOs) for the circuits flagged below.", citation: CITATIONS.rcdSockets, evidence: ev(b.rcdPresent.evidence) });
  }
  if (b.spdPresent?.value !== true) {
    findings.push({ ruleId: "BOARD-SPD", status: "info", title: "No surge protection", detail: "Supply surges are common; a surge protective device protects inverters, ACs and fridges.", citation: CITATIONS.spd });
  }
  if (b.labelled?.value === false) {
    findings.push({ ruleId: "BOARD-LABELS", status: "warn", title: "Breakers not labelled", detail: "Label every breaker with the circuit it controls.", citation: CITATIONS.isolation });
  }
  const verdict = worst([...findings, ...circuits.flatMap((r) => r.findings)].map((f) => f.status));
  return { findings, circuits, verdict };
}
