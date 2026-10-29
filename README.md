# WireProof

**Proof your wiring is safe before the plaster goes on.**

WireProof is a hands-free copilot for the electrician wiring a house. The homeowner gets proof, before the walls are plastered, that every circuit has the right cable, real copper and the right protection. Afterwards they get an "X-ray" map of where every cable runs inside their walls.

Built from scratch for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Oct 26 – Nov 4, 2026). Every line in this repo was written during the event, and nothing is pre-existing.

## Why
- Lagos recorded 1,685 fires and 133 deaths in 2025. Studies name electrical faults as the leading cause.
- Nigeria's standards body (SON) has seized "copper" cable that is really copper-coated iron, and links it to building fires.
- Once a wall is plastered, nobody can see the wiring. The person paying for the house usually never sees it at all.

## How it uses Meta's models
| Job | Model |
|---|---|
| The agent: plans each step and calls the tools | Muse Spark (tool calling) |
| Read cable prints, breakers, RCDs and nameplates; judge the magnet test | Muse Spark (vision, video) |
| Hands-free questions from the electrician | Muse Voice Transcribe |
| Trace conduit runs in a chased wall | SAM 3.1 |
| Show "your wall after plaster" with an X-ray of the runs, and "your board, corrected" | Muse Image |
| Privacy gate: checks every photo for faces, people and private text before it leaves | Muse Spark Open (open weights, on Baseten), or Muse Glimmer on our own server |

## The agent
Each request from the electrician (spoken, typed, or a photo or clip) starts a run: Muse Spark plans, calls a tool, reads the result and decides the next step, until it can answer in one or two spoken sentences. Every step is saved to the job's case record and shown live in the agent console.

Tools: `read_cable_print`, `read_board`, `correct_board_device`, `magnet_test`, `map_wall`, `assign_breaker`, `record_observation`, `check_circuit`, `size_cable`, `tick_checklist`, `submit_memo`.

The model proposes; code decides:
- A reading changes a circuit only when deterministic checks verify it. For example, the size must appear in the copied print, and a breaker's rating must match its printed text. An unverified reading is kept as evidence, and the electrician is told what to reshoot.
- When a board reading is ambiguous, the electrician checks it by eye and says so. Code accepts the correction only if they actually said that position and rating.
- Facts the electrician states (the earth is in, the run is 25 m, breaker 3 feeds the kitchen) must appear in their own words.
- A checklist item can be ticked only by citing verified evidence that proves it.
- Every number in a reply or the memo must come from a tool, the case or the electrician. If it doesn't, it is flagged to the reader.
- The safety interlock is enforced in code: no hands-on step, such as the magnet test, until the breaker is confirmed off.
- The homeowner's memo stays **unverified** until the electrician confirms it in the app. The agent can't sign it off.
- Every photo passes the privacy gate before it may go to Meta's hosted API. A face, a person, or private text such as a name, phone number or address blocks it, and so does a gate that doesn't answer. Each check is written to the egress log. Muse Spark Open usually answers in 5–8 s; if a call stalls, a second request starts after 12 s and the first answer wins.

Turns are stateless: `store: false`, with encrypted reasoning replayed each turn. Meta keeps no copy of the conversation, and a turn takes about 2 s.

## Status
- `web/` is the app (Next.js 16). Run it with `cd web && npm install && npm run dev`, then open http://localhost:3000. It needs `MODEL_API_KEY` in `web/.env.local`. `BASETEN_API_KEY` switches the privacy gate on with Muse Spark Open; `GLIMMER_BASE_URL` and `GLIMMER_API_KEY` use Muse Glimmer on our own server instead. To use it on a phone (camera and mic need HTTPS), run `npm run build && npm run start` and `cloudflared tunnel --url http://localhost:3000`; with `SITE_PASSCODE` set, every device except this machine must enter the passcode once.
  - **Agent** (`web/src/lib/agent`): loop, tools, case record and verification. `/api/jobs/[id]/agent` streams each tool call as it happens.
  - **Rules engine** (`web/src/lib/rules`): BS 7671 checks for cable capacity with ambient and grouping factors, breaker coordination, voltage drop, earth, 30 mA RCD, and fake cable (magnet test, printed size, SON alert brands). Run the tests with `npm test`.
  - **Screens:**
    - copilot: tap to talk, read a cable print or the board, magnet test, breaker interlock;
    - agent console: every run step by step, the case record, the checklist, and the memo with the electrician's sign-off;
    - wall map: conduit runs and the no-drill zones on a chased wall, plus the X-ray over the plastered render;
    - panel reader: photograph a breaker panel and see what's wrong;
    - job overview, circuit detail and printable owner report.
  - **Demo data:** a sample first-fix job. The people and the faulty cable brand are made up, and the sample photos are AI-generated test images.
- `infra/glimmer_modal.py` serves Muse Glimmer with llama.cpp on a Modal GPU, as the alternative privacy gate.
- `probe/` holds the go/no-go tests that check Meta's models can read cable prints, breaker boards and magnet tests, hear electrician commands, and trace conduit in a wall. See [`probe/README.md`](probe/README.md).

## Licence
MIT
