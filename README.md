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
| Hands-free questions from the electrician; replies in English or Nigerian Pidgin | Muse Voice Transcribe, Muse Spark |
| Trace conduit runs in a chased wall | SAM 3.1 |
| Show "your wall after plaster" with an X-ray of the runs, and "your board, corrected" | Muse Image |
| Privacy gate: checks every photo for faces, people and private text before it leaves | Muse Spark Open (open weights, on Baseten), or Muse Glimmer on our own server |

## How it fits together
```mermaid
flowchart LR
  subgraph Phone["Electrician's phone (browser)"]
    V[Tap to talk] --> A
    C[Camera: board, cable print, magnet clip, wall] --> A
  end
  subgraph Server["WireProof server (Next.js)"]
    A[/api/jobs/:id/agent] --> G{Privacy gate}
    G -- "face, person or private text" --> X[Blocked: never leaves]
    G -- pass --> L[Agent loop: Muse Spark plans a step]
    L --> T[Tools: read_board, read_cable_print, magnet_test, map_wall, assign_breaker, record_observation, check_circuit, size_cable, submit_memo]
    T --> R[Rules engine: BS 7671 tables, every finding cites its regulation]
    T --> K[Code verification: size must be in the copied print, rating must match the device, numbers must come from a tool or the electrician]
    K --> Case[(Case record: evidence, checklist, memo, egress log)]
    R --> Case
  end
  subgraph Meta["Meta models"]
    S[Muse Spark 1.3: plan, read, judge]
    W[Muse Voice Transcribe]
    M[SAM 3.1: conduit runs on the block grid]
    I[Muse Image: the wall after plaster, the board corrected]
    O[Muse Spark Open on Baseten: the gate]
  end
  V --> W
  G --> O
  L --> S
  T --> S
  T --> M
  T --> I
  Case --> Rep[Owner's report: verdict, fixes, the photo behind each one]
  Rep -- share link --> WA[WhatsApp]
```
Every model call from a cloud host goes through the relay described under Deploy, because Meta's API answers only from allowed locations. Nothing a model says changes a circuit until the code checks agree with it.

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
    - job overview, circuit detail and printable owner report, with a button that sends it to the owner on WhatsApp;
    - start a job (`/jobs/new`): name the house, tick the circuits (ACs by HP, heater by kW, pump), and the copilot opens on it with every circuit sized by the rules;
    - the panel reader (`/panel`) and the landing page are open to anyone without the passcode, so a visitor can try it on their own board.
  - **Sending the report:** the WhatsApp button opens a message with the verdict, the first fixes, whether the electrician has signed it off, and a share link. The link opens that one report and the photos on it without the passcode; it can't reach the copilot, the console, other jobs, or a photo the privacy gate blocked. Changing `SITE_PASSCODE` revokes every share link.
  - **Demo data:** a sample first-fix job captured through the app. The board and cable photos are real (one home, Nov 2); the people are made up; the one wall photo is an AI-generated sample and is labelled so in the job.

## Accuracy on real photos
Measured on photos taken in one home in Delta State on Nov 2 (`probe/board`, `probe/cable`, answer keys beside them). No house-wiring offcut was to hand, so the cable set is appliance and extension cords plus a 25 mm² battery cable: small embossed text, no ink, curved sheaths. Re-run with `probe/probe.py read …` and the vite-node script in `probe/README.md`.

| Test | Photos | Result |
|---|---|---|
| Cable print: printed size | 21 (7 cables × 3 shots) | **20/21** read right by Muse Spark |
| Cable print: the app's verify-or-reshoot check | 21 | **20 verified, all 20 right; the 1 wrong read was refused** (confidence 0.45, "film closer") and sent back for a better photo |
| Cable print: brand text | 7 cables | 5/7 exact; two had letters misread ("YUXIN" → "LUXIN"). Brand never changes a verdict |
| Breaker board: ratings | 3 photos, 20 devices | **18/20**; both shots of the house board 15/15. On the solar box Spark read a surge protector's "40kA" as 40 A twice, so the reader now zeroes a surge protector's rating |
| Breaker board: RCD present? | 3 | 3/3 (none on any of them, which is the finding) |
| Voice commands | 25 lines, Nigerian English, 5 over background noise | pending: recorded with `probe/record_voice.sh` |

### Tried by an electrician
The phone footage in the video (starting a job, then talking to the copilot) was recorded by a working electrician on their own phone, not by us. They set up a three-bedroom bungalow on the live site, asked the copilot about the kitchen circuit, and were told the answer out loud. Their verdict: it makes sense and electricians will like it, but the copilot's words need to be clearer, more like Nigerian Pidgin, for those who don't follow English well.

So the copilot now has a **Talk Pidgin** switch. The agent still writes its answer in English, and code still checks every number in it. Then Muse Spark renders that answer in Nigerian Pidgin, and code checks the Pidgin states exactly the same numbers as the English; if a size or a rating changed in translation, the English is spoken instead (`web/src/lib/agent/pidgin.ts`). For example, asked about the kitchen ring: "Kitchen ring need 2.5 mm² for 32 A type B breaker. Off and lock the breaker, tick box for app then send lighting earth check." That is the only outside use so far; we are collecting more.

What "verified" means: code, not the model, checks that the size is one cable is made in, that it appears in the text copied off the sheath, and that the confidence is above 0.6. A reading that fails is kept as evidence but never changes a circuit; the electrician is asked for another photo.

## Deploy
The app is one Node server with a data folder, so it runs as a container with a volume (`web/Dockerfile`).

1. Save the job you want visitors to see as the seed: capture it locally, then `cd web && npm run seed:save`. A deploy with no saved case opens on `web/seed/`. By default only media a reading used is copied, so nothing the privacy gate blocked is published.
2. Build and run: `docker build -t wireproof web/`, then `docker run -p 3000:3000 --env-file web/.env.local -v wireproof-data:/data wireproof`. On a host, set the same variables (`MODEL_API_KEY`, `BASETEN_API_KEY`, `SITE_PASSCODE`) and mount a volume at `/data`. On Railway, also set `RAILWAY_RUN_UID=0` so the app can write to the volume.
3. **Open `/api/health` on the host before anything else.** A healthy host returns `"ok": true` and lists `muse-spark-1.3`, `sam-3.1`, `muse-voice-transcribe-1.0` and `muse-image-1.0`. The check spends no credits.

The image sets `WIREPROOF_HOSTED=1`: requests addressed to `localhost` no longer skip the passcode, and "start again" in the console restores the seeded job instead of an empty one.

### Model calls from a cloud host: the relay
Meta's Model API decides availability by where a call comes from. The key used here lists all nine models from a laptop in Nigeria and an empty list from Railway (US, Amsterdam and Singapore); other builders saw the same from Render US and Frankfurt, and "not available in your region" blocks are reported from Vietnam, Indonesia, Korea, Argentina and Canada ([opencode #47949](https://github.com/anomalyco/opencode/issues/47949), [HN](https://news.ycombinator.com/item?id=48847428)).

So the hosted site keeps everything except the model calls, and sends those through a relay on a machine where the key works (`relay/meta-relay.mjs`):
- The relay forwards `/v1/*` to `api.meta.ai` with the real key. The key never leaves that machine; the host holds only a random shared token (`META_RELAY_TOKEN`, the same value on both sides).
- A Cloudflare quick tunnel gives the relay an HTTPS address, and the relay posts it to `/api/relay` every minute, so the host follows the address if it changes. A relay silent for 3 minutes counts as offline, and the UI says so instead of failing.
- `META_VIA_RELAY=1` on the host turns this on. `META_DAILY_CALL_CAP` (400 on the demo) stops a public site from running up the bill after the hackathon credits end; Meta's own spend alerts don't stop billing.
- `/api/health` reports `meta.via` (`direct` or `relay`) and the relay's last check-in.

Run it on the machine with the working key:
```
node relay/meta-relay.mjs https://wireproof-production.up.railway.app
```
- `infra/glimmer_modal.py` serves Muse Glimmer with llama.cpp on a Modal GPU, as the alternative privacy gate.
- `probe/` holds the go/no-go tests that check Meta's models can read cable prints, breaker boards and magnet tests, hear electrician commands, and trace conduit in a wall. See [`probe/README.md`](probe/README.md).

## Licence
MIT
