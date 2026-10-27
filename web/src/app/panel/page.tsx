import { getJob } from "@/lib/jobs";
import { checkBoard } from "@/lib/rules";
import PanelReader, { type SampleDevice } from "./PanelReader";

export default function PanelPage() {
  const board = getJob("demo")!.board;
  const sample: SampleDevice[] = board.circuits.flatMap((c, i) =>
    c.device ? [{ position: i + 1, label: c.name, type: c.device.value.type, ratingA: c.device.value.ratingA, curve: c.device.value.curve }] : [],
  );
  const { findings } = checkBoard(board);
  return <PanelReader sample={sample} findings={findings} />;
}
