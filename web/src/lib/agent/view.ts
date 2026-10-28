// Helpers the copilot and the console share in the browser.
import type { AgentEvent } from "./types";

export const TOOL_LABEL: Record<string, string> = {
  read_cable_print: "Read cable print",
  read_board: "Read board",
  correct_board_device: "Board corrected by eye",
  magnet_test: "Magnet test",
  assign_breaker: "Breaker assigned",
  record_observation: "Recorded what you said",
  check_circuit: "Rules check",
  size_cable: "Sized the cable",
  tick_checklist: "Checklist",
  submit_memo: "Memo drafted",
};

/** "Kitchen sockets (ring)" → "Kitchen sockets"; "Lighting, whole house" → "Lighting". */
export const shortName = (name: string) => name.split(/[(,]/)[0].trim();

/** Read the agent's newline-delimited JSON stream one event at a time. */
export async function* readEvents(res: Response): AsyncGenerator<AgentEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line) as AgentEvent;
    }
  }
}
