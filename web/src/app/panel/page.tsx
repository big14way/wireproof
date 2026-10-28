import { getJob } from "@/lib/jobs";
import { panelFindings, type PanelDevice } from "@/lib/panel";
import PanelReader from "./PanelReader";

export default function PanelPage() {
  const board = getJob("demo")!.board;
  const devices: PanelDevice[] = board.circuits.flatMap((c, i) =>
    c.device ? [{ position: i + 1, kind: c.device.value.type, ratingA: c.device.value.ratingA, curve: c.device.value.curve, sensitivityMA: 0, label: c.name }] : [],
  );
  const reading = { devices, mainSwitch: board.mainSwitch?.value ?? false, rcd: board.rcdPresent?.value ?? false, spd: board.spdPresent?.value ?? false, labelled: board.labelled?.value ?? false };
  return <PanelReader sample={{ devices, findings: panelFindings(reading), verified: true, problems: [] }} />;
}
