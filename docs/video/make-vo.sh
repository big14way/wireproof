#!/bin/sh
# Synthesise the narration the builder expects (run where Edge TTS is reachable): sh make-vo.sh
# Edge drops some requests when they come back-to-back, so each line is tried up to 5 times with a pause.
cd "$(dirname "$0")" && mkdir -p build
say_line() { # id file rate text
  n=0
  while [ $n -lt 5 ]; do
    [ -s "build/$2" ] && [ "$(stat -f%z "build/$2")" -gt 2000 ] && { echo "$1 ok"; return 0; }
    rm -f "build/$2"
    edge-tts --voice en-US-AndrewMultilingualNeural --rate="$3" --text "$4" --write-media "build/$2" >/dev/null 2>&1
    sleep 2; n=$((n + 1))
  done
  echo "$1 FAILED after 5 tries"; return 1
}
say_line s0 s0_93698d68a7.mp3 "+8%" "In Nigeria, we build with block and plaster. The wires go into the wall, then the plaster goes on, and from that day, nobody can see them again. Not the owner, not the next electrician. Nobody."
say_line s1 s1_a26d9df029.mp3 "+8%" "Lagos Fire Service counted over one thousand six hundred fires in 2025, and electrical faults are the leading cause."
say_line s2 s2_7bd40e4d11.mp3 "+8%" "Some of it is fake cable. Cable sold as copper that is really coated iron; a fridge magnet will tell you. Some of it is cable that's too thin for the breaker in front of it. All of it gets plastered over before anyone checks."
say_line s3 s3_81fd71f66f.mp3 "+8%" "This is WireProof. A hands-free copilot for the electrician, on the phone already in their pocket. They talk to it while they work. It reads what the camera sees, and it keeps proof of every reading for the homeowner."
say_line d1 d1_cf9cde6fe5.mp3 "+8%" "This is a real board, in a real house. Muse Spark reads every breaker, left to right. Twenty-five, twenty, thirty, ten. A hundred-amp main. When the print on one breaker is ambiguous, it doesn't guess: it asks the electrician to check it by eye. And it notices what isn't there: no RCD. No earth-leakage protection on a whole house."
say_line d2 d2_482b3a5db1.mp3 "+8%" "Point it at a cable print and it reads the size off the sheath. But the model doesn't get the final say. Code checks that the size it reports is really in the text it copied, and that it's a size cable is actually made in. If the model isn't sure, WireProof refuses the reading and asks for a better photo. On twenty-one real photos it read twenty right, and the one it got wrong, it caught."
say_line s4 s4_b7d55ea09f.mp3 "+8%" "Before the plaster goes on, it photographs the wall."
say_line d3 d3_cfa290d462.mp3 "+8%" "SAM 3.1 traces every conduit run, using the blocks as a ruler. This diagonal run fails: cables must run straight so anyone drilling later knows where they are. And then it keeps the map. After plastering, the owner can still see where every cable is."
say_line d4 d4_c689e3a31d.mp3 "+8%" "Every step is on the record: what was said, what was read, what the code decided, and what is still open. The electrician signs off in the app."
say_line d5 d5_28086e1651.mp3 "+8%" "When the electrician signs off, the owner gets the report on WhatsApp. Not a certificate; a screening report. The verdict, the fixes in order, and behind every fix, the photo it came from. Every rule is cited. Nothing in it is the model's opinion; the model reads, and the code decides."
say_line s5 s5_94a0728f32.mp3 "+8%" "Four Meta models do the work. Muse Voice Transcribe hears the electrician, in Nigerian English. Muse Spark reads boards and cables and plans each step. SAM 3.1 maps the walls. Muse Image shows the owner the wall after plaster. And a privacy gate on Muse Spark Open blocks any photo with a face in it before it leaves the phone."
say_line s6 s6_02f613bd55.mp3 "+8%" "Every house gets plastered once. WireProof makes sure somebody looked first."
echo done
