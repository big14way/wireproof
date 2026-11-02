#!/bin/sh
# Record the electrician voice commands for the voice test, one at a time, from this Mac's microphone.
#   cd ~/Developer/wireproof/probe && sh record_voice.sh
# Each line appears on screen: press Enter, say it, and recording stops by itself after 6 seconds.
# Lines 21-25 repeat 1-5 with background noise: switch on a radio, TV or fan for those.
# Redo from a given line with START, e.g. START=7 sh record_voice.sh. Another mic: MIC=":0" sh record_voice.sh
# Writes voice/01.m4a ... voice/25.m4a and the answer key voice_truth.csv, then:
#   .venv/bin/python probe.py voice voice/ --truth voice_truth.csv
set -e
cd "$(dirname "$0")"
mkdir -p voice
MIC="${MIC:-:MacBook Pro Microphone}"
START="${START:-1}"
SECONDS_PER_LINE="${SECONDS_PER_LINE:-6}"

LINES='What cable for a 1.5 horsepower AC on 15 metres?
3 kilowatt water heater, 12 metre run.
One horsepower pumping machine on 25 metres.
The kitchen ring is 42 metres.
Breaker 3 feeds the kitchen ring.
The earth is in the kitchen conduit.
There is no earth in the pump conduit.
I checked breaker 4 by eye, it is a B20.
The pump run is 30 metres.
What'"'"'s still missing on this job?
Draft the report for the homeowner.
What breaker for a 2 HP AC on 20 metres?
Is 1.5 mm² okay for the lighting?
The lighting run is 28 metres.
The earth for the heater is 1.5 mm².
Breaker 5 feeds the master bedroom AC.
Check the heater circuit.
What size cable for a 2 kilowatt pumping machine on 40 metres?
Read this cable print for the pump circuit.
The magnet did not stick on the kitchen cable.'

# The answer key: lines 1-20, then 1-5 again as 21-25 (with noise).
echo "file,text" > voice_truth.csv
n=0
printf '%s\n' "$LINES" | while IFS= read -r line; do
  n=$((n + 1)); printf '%02d.m4a,"%s"\n' "$n" "$line" >> voice_truth.csv
done
printf '%s\n' "$LINES" | head -5 | while IFS= read -r line; do
  n=$(( $(wc -l < voice_truth.csv) )); printf '%02d.m4a,"%s"\n' "$n" "$line" >> voice_truth.csv
done

total=$(( $(wc -l < voice_truth.csv) - 1 ))
tail -n +2 voice_truth.csv | while IFS= read -r row; do
  file=${row%%,*}; text=${row#*,}; text=${text#\"}; text=${text%\"}
  i=$(expr "${file%.m4a}" + 0)
  [ "$i" -lt "$START" ] && continue
  echo
  [ "$i" -eq 21 ] && echo ">>> Lines 21-25: switch on a radio, TV or fan now, then read them over the noise."
  echo "[$i/$total]  $text"
  printf "Press Enter, then say it (%s s)... " "$SECONDS_PER_LINE"
  read -r _ < /dev/tty
  ffmpeg -hide_banner -loglevel error -y -f avfoundation -i "$MIC" -t "$SECONDS_PER_LINE" -ac 1 -c:a aac "voice/$file" < /dev/null
  echo "saved voice/$file"
done
echo
echo "Done. Test them with: .venv/bin/python probe.py voice voice/ --truth voice_truth.csv"
