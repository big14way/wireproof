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
| Hands-free questions from the electrician | Muse Voice Transcribe |
| Read cable prints, breakers, RCDs and nameplates; judge the magnet test | Muse Spark |
| Trace cable and conduit runs inside chased walls | SAM 3.1 |
| Pre-screen long footage cheaply | Muse Glimmer (open weights) |
| Show "your board, corrected" and "your wall after plaster" | Muse Image |

Code, not the model, makes every safety decision: cable size against breaker, voltage drop, RCD and earth checks. A licensed electrician signs off. WireProof never guides work on live circuits.

## Status
Day 1: `probe/` holds the go/no-go tests that check Meta's models can read real cable prints, breaker boards and magnet tests, hear electrician commands, and trace conduit in a wall. See [`probe/README.md`](probe/README.md).

## Licence
MIT
