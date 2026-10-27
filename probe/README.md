# Day-1 go/no-go probe (WireProof)

One question: can Meta's models read and measure a real wiring job well enough to put a verdict in front of a homeowner?

## Key
Put your key in `probe/.env`. It is git-ignored, so never paste it in chat:
```
MODEL_API_KEY=LLM|...
# optional fallback for Spark: OPENROUTER_API_KEY=...  and  SPARK_PROVIDER=openrouter
```

## What to buy and shoot (Wed Oct 28)
Market list:
- **Cable:** a 1 m offcut each of genuine 1.5, 2.5 and 4 mm² cable (well-known brands), plus one cheap "copper" cable that looks suspicious.
- **Magnet:** any fridge magnet.
- **Board:** a small distribution board with 3–4 MCBs (10/20/32 A) and one RCD, if affordable. Otherwise photograph boards in buildings you can access.

Then shoot and save into these folders:
1. **`cable/`:** 10 photos or 3-second clips of cable prints, close and sharp. Vary them: angle, glare, some in a dim corner.
2. **`board/`:** 5 photos of distribution boards, front on and slightly angled.
3. **`magnet/`:** 10 short clips. The magnet touches the stripped conductor, then lifts. Include genuine and suspect cables, and both outcomes.
4. **`voice/`:** 20 voice notes of commands an electrician would say, in your normal accent. For example:
   - "what cable for a one point five horse power AC on fifteen metres"
   - "read this breaker"
   - "is the earth connected"
5. **`wall/`:** a 30-second clip panning along a chased block wall with conduit in it, plus a tape measurement of where the conduit runs. This is for the SAM tracing test.

Truth files, written by you (the answer key):
- **`cable_truth.csv`:** columns `file,size_mm2,brand`
- **`board_truth.csv`:** columns `file,ratings,rcd_present`, where ratings are left to right with spaces (`10 20 20 32`) and rcd_present is `true` or `false`
- **`magnet_truth.csv`:** columns `file,magnet_attaches`
- **`voice_truth.csv`:** columns `file,text`

## Run
```sh
cd ~/Developer/wireproof/probe
.venv/bin/python probe.py read cable  cable/  --truth cable_truth.csv  --out out/cable
.venv/bin/python probe.py read breakers board/ --truth board_truth.csv --out out/board
.venv/bin/python probe.py read magnet magnet/ --truth magnet_truth.csv --out out/magnet
.venv/bin/python probe.py voice voice/ --truth voice_truth.csv
.venv/bin/python probe.py track wall/pan.mp4 --concept "conduit" --fps 4 --out out/conduit
```

## Pass bars (from PLAN.md)
| Test | Pass |
|---|---|
| Cable prints | ≥ 9/10 correct size and brand |
| Breakers | ≥ 95% of devices read right |
| Magnet | 10/10 |
| Voice | ≥ 18/20 commands heard |
| Conduit trace | Run position within 10 cm of the tape measurement |

Fallbacks:
- If cable reading fails, rely on the electrician-confirmed checklist plus the magnet test.
- If conduit tracing fails, the electrician points along the run while filming and Spark grounds the points.

The block-yard commands (`track --births`, `snapshots`) from the earlier idea still work, but WireProof doesn't use them.
