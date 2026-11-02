# WireProof: 3-minute video script

Your voice, first person. About 420 words at a normal pace, which lands at 2:55. Record each numbered block as its own take so I can cut to picture; pause a beat before and after each one. Quiet room, phone 15 cm from your mouth, Voice Memos is fine. Name the files `vo-01.m4a` … `vo-09.m4a` and AirDrop them to the Mac into `~/Developer/wireproof/probe/video/vo/`.

Speak like you're telling a friend, not reading. If a line feels unnatural in your mouth, change the words and keep the meaning.

---

**01 · Cold open (0:00–0:15)** — *Picture: the trowel spreading plaster over a wall; then the aerial of Lagos.*

> In Nigeria, we build with block and plaster. The wires go into the wall, then the plaster goes on, and from that day, nobody can see them again. Not the owner, not the next electrician. Nobody.

**02 · The problem (0:15–0:40)** — *Picture: the burnt socket; the room after a fire; the market cable shelves; a magnet snapping onto "copper" cable.*

> Lagos Fire Service counted over one thousand six hundred fires in 2025, and electrical faults are the leading cause. Some of it is fake cable. Cable sold as copper that is really coated iron; a fridge magnet will tell you. Some of it is cable that's too thin for the breaker in front of it. All of it gets plastered over before anyone checks.

**03 · The product (0:40–0:55)** — *Picture: the copilot on a phone; the electrician's hands on the wall.*

> I built WireProof. It's a hands-free copilot for the electrician, on the phone already in their pocket. They talk to it while they work. It reads what the camera sees, and it keeps proof of every reading for the homeowner.

**04 · Reading the board (0:55–1:20)** — *Picture: your real distribution board; the app reading it; the console stream.*

> This is a real board, in a real house. Muse Spark reads every breaker, left to right. Twenty-five, twenty, thirty, ten. A hundred-amp main. And it notices what isn't there: no RCD. No earth-leakage protection on a whole house. That's the kind of thing that only shows up on the day somebody gets a shock.

**05 · Reading cable (1:20–1:45)** — *Picture: the cord photos; the app reading "3G0.75mm²"; the FAIL finding.*

> Point it at a cable print and it reads the size off the sheath. But the model doesn't get the final say. Code checks that the size it reports is really in the text it copied, and that it's a size cable is actually made in. If the model isn't sure, WireProof refuses the reading and asks for a better photo. On twenty-one real photos it read twenty right, and the one it got wrong, it caught.

**06 · The wall (1:45–2:10)** — *Picture: the chased wall; SAM tracing the conduit; the plastered render with the X-ray lines; the diagonal run flagged red.*

> Before the plaster goes on, it photographs the wall. SAM 3.1 traces every conduit run, using the blocks as a ruler. This diagonal run fails: cables must run straight so anyone drilling later knows where they are. And then it keeps the map. After plastering, the owner can still see where every cable is.

**07 · The report (2:10–2:35)** — *Picture: WhatsApp opening on a phone; the report scrolling: "Do not plaster yet", the fixes, the photos.*

> When the electrician signs off, the owner gets the report on WhatsApp. Not a certificate; a screening report. The verdict, the fixes in order, and behind every fix, the photo it came from. Every rule is cited. Nothing in it is the model's opinion; the model reads, and the code decides.

**08 · Built on Meta (2:35–2:50)** — *Picture: the architecture diagram; the four model names.*

> Four Meta models do the work. Muse Voice Transcribe hears the electrician, in Nigerian English. Muse Spark reads boards and cables and plans each step. SAM 3.1 maps the walls. Muse Image shows the owner the wall after plaster. And a privacy gate on Muse Spark Open blocks any photo with a face in it before it leaves the phone.

**09 · Close (2:50–3:00)** — *Picture: the finished wall; the WireProof mark.*

> Every house gets plastered once. WireProof makes sure somebody looked first.

---

## If you want to trim
Block 02 can lose the second sentence, and block 08 can drop the privacy gate line. That saves about 12 seconds.

## Facts in the script, and where they come from
- Fires: the landing page's numbers (Lagos Fire Service, 2025). If you can't stand behind "over one thousand six hundred", say "more than a thousand".
- "Coated iron" cable: SON's public alerts on substandard cable.
- Board readings 25/20/30/10 and the 100 A main: `probe/board_truth.csv`, read right in both photos.
- 20 of 21 cable prints, the wrong one caught: `README.md`, Accuracy on real photos.
