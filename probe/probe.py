#!/usr/bin/env python3
"""Day-1 go/no-go probe: can Meta's models read, track and measure a real installation?

Subcommands
  snapshots  count a static concept in frames sampled every N seconds (SAM 3.1 image mode); a cross-check only,
             keep each crop under ~150 objects (the detector has 200 queries)
  track      track a concept through a clip (SAM 3.1 video mode) and emit zone-entry events ("cement bag"),
             or with --births count objects that settle and stay still in the zone (new "concrete block")
  referee    ask Muse Spark a yes/no question about short clips cut around given timestamps
  score      compare an events CSV against a hand-counted truth CSV
  read       Muse Spark reads a folder of photos/clips: cable prints, breaker boards, magnet tests (scored against a truth CSV)
  voice      Muse Voice Transcribe on recorded electrician commands (scored against the script)

Env
  MODEL_API_KEY       Meta Model API key (SAM 3.1, and Spark when SPARK_PROVIDER=meta)
  OPENROUTER_API_KEY  used when SPARK_PROVIDER=openrouter (default if MODEL_API_KEY is unset)
"""
import argparse
import base64
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

META = "https://api.meta.ai/v1"
OPENROUTER = "https://openrouter.ai/api/v1"
BOX = re.compile(r"(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>")
FRAME = re.compile(r"<(\d+)f>")


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def crop_filter(roi):
    # roi as fractions "x,y,w,h" of the frame, so it survives any resolution
    if not roi:
        return []
    x, y, w, h = (float(v) for v in roi.split(","))
    return [f"crop=iw*{w}:ih*{h}:iw*{x}:ih*{y}"]


def prep_clip(src, dst, fps, roi, max_dim=960, start=None, length=None):
    vf = crop_filter(roi) + [f"fps={fps}", f"scale='min({max_dim},iw)':-2"]
    seek = (["-ss", str(start)] if start is not None else []) + (["-t", str(length)] if length else [])
    ffmpeg(*seek, "-i", str(src), "-vf", ",".join(vf), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", str(dst))


def meta_headers():
    key = os.environ.get("MODEL_API_KEY")
    if not key:
        sys.exit("MODEL_API_KEY is not set")
    return {"Authorization": f"Bearer {key}"}


def sam_stream(content, raw_log):
    """Run one SAM 3.1 request and return {frame: {obj_id: (x1, y1, x2, y2, conf)}}."""
    body = {"model": "sam-3.1", "stream": True,
            "metadata": {"mask_encoding": "one_bit", "include_confidence": "true"},
            "input": [{"type": "message", "role": "user", "content": content}]}
    r = requests.post(f"{META}/responses", json=body, stream=True, timeout=900,
                      headers={**meta_headers(), "Accept": "text/event-stream"})
    if r.status_code != 200:
        sys.exit(f"SAM {r.status_code}: {r.text[:500]}")
    frames, usage = {}, None
    with open(raw_log, "w") as log:
        for raw in r.iter_lines(decode_unicode=False):
            if not raw or not raw.startswith(b"data: "):
                continue
            data = raw[6:].decode("utf-8", "replace")
            if data == "[DONE]":
                break
            event = json.loads(data)
            kind = event.get("type")
            # the cookbook's raw-SSE path sees content_part.done instead of output_text.done; deltas are the same
            if kind == "response.output_text.delta" and event.get("delta"):
                line = event["delta"]
                log.write(line.strip() + "\n")
                m = FRAME.match(line)
                if not m:
                    continue
                objs = {}
                for b in BOX.finditer(line):
                    oid, x1, y1, x2, y2, w, h, c = b.groups()
                    objs[int(oid)] = (int(x1) / int(w), int(y1) / int(h), int(x2) / int(w), int(y2) / int(h),
                                      float(c) if c else None)
                frames[int(m.group(1))] = objs
            elif kind == "response.completed":
                usage = event.get("response", {}).get("usage")
    return frames, usage


def upload(path):
    with open(path, "rb") as f:
        r = requests.post(f"{META}/files", headers=meta_headers(), timeout=600,
                          data={"purpose": "user_data"}, files={"file": (Path(path).name, f, "video/mp4")})
    r.raise_for_status()
    return r.json()["id"]


def cmd_snapshots(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    total = duration(a.video)
    rows, t = [], 0.0
    with tempfile.TemporaryDirectory() as tmp:
        while t < total:
            jpg = Path(tmp) / f"{t:08.1f}.jpg"
            vf = crop_filter(a.roi) + ["scale='min(1280,iw)':-2"]
            ffmpeg("-ss", str(t), "-i", str(a.video), "-frames:v", "1", "-vf", ",".join(vf), "-q:v", "3", str(jpg))
            b64 = base64.b64encode(jpg.read_bytes()).decode()
            frames, _ = sam_stream([{"type": "input_text", "text": a.concept},
                                    {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}"}],
                                   out / f"raw_{t:08.1f}.txt")
            objs = frames.get(0, {})
            n = sum(1 for o in objs.values() if o[4] is None or o[4] >= a.min_conf)
            rows.append((round(t, 1), n))
            print(f"t={t:7.1f}s  {a.concept!r}: {n}", flush=True)
            t += a.every
    with open(out / "snapshots.csv", "w", newline="") as f:
        csv.writer(f).writerows([("t", "count"), *rows])
    # production = rises in the median-smoothed count; drops (sales, re-stacking) are reported separately
    counts = [n for _, n in rows]
    smooth = [sorted(counts[max(0, i - 1):i + 2])[len(counts[max(0, i - 1):i + 2]) // 2] for i in range(len(counts))]
    made = sum(max(0, b - a_) for a_, b in zip(smooth, smooth[1:]))
    removed = sum(max(0, a_ - b) for a_, b in zip(smooth, smooth[1:]))
    print(f"\nsnapshots: {len(rows)}  first={smooth[0]}  last={smooth[-1]}  added={made}  removed={removed}")


def cmd_track(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    clip = out / "clip.mp4"
    prep_clip(a.video, clip, a.fps, a.roi, start=a.start, length=a.length)
    fid = upload(clip)
    frames, usage = sam_stream([{"type": "input_text", "text": a.concept},
                                {"type": "input_video", "file_id": fid}], out / "raw_track.txt")
    print(f"frames with detections: {len(frames)}  usage: {usage}")
    zx1, zy1, zx2, zy2 = (float(v) for v in a.zone.split(",")) if a.zone else (0, 0, 1, 1)
    tracks = {}
    for fi in sorted(frames):
        for oid, (x1, y1, x2, y2, c) in frames[fi].items():
            if c is not None and c < a.min_conf:
                continue
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            tr = tracks.setdefault(oid, {"first": fi, "last": fi, "in_zone": None, "n": 0})
            tr["last"], tr["n"] = fi, tr["n"] + 1
            if tr["in_zone"] is None and zx1 <= cx <= zx2 and zy1 <= cy <= zy2:
                tr["in_zone"] = fi
    offset = a.start or 0.0
    if a.births:
        events = births(frames, (zx1, zy1, zx2, zy2), a)
    else:
        events = sorted(round(offset + tr["in_zone"] / a.fps, 1) for tr in tracks.values()
                        if tr["in_zone"] is not None and tr["n"] >= a.min_frames)
    json.dump({str(k): v for k, v in tracks.items()}, open(out / "tracks.json", "w"), indent=1)
    with open(out / "events.csv", "w", newline="") as f:
        csv.writer(f).writerows([("t",), *[(e,) for e in events]])
    print(f"tracks: {len(tracks)}  zone-entry events (>= {a.min_frames} frames): {len(events)}")
    print("event times (s):", events)


def births(frames, zone, a):
    """Count blocks as they are born: a track that first settles inside the zone and stays still.

    A block counts once it holds its position for --still-seconds. A settled track that sits where an
    already-counted block was still visible is treated as the same block re-identified, not a new one;
    a block that appears where an earlier one was carried away (pallet machines) counts again.
    """
    zx1, zy1, zx2, zy2 = zone
    need = max(2, round(a.still_seconds * a.fps))
    paths = {}
    for fi in sorted(frames):
        for oid, (x1, y1, x2, y2, c) in frames[fi].items():
            if c is None or c >= a.min_conf:
                paths.setdefault(oid, []).append((fi, (x1 + x2) / 2, (y1 + y2) / 2))
    settled = []  # (birth_frame, last_frame, x, y)
    for path in paths.values():
        for i in range(len(path) - need + 1):
            window = path[i:i + need]
            fx, x0, y0 = window[0]
            if not (zx1 <= x0 <= zx2 and zy1 <= y0 <= zy2):
                continue
            if all(abs(x - x0) <= a.still_tol and abs(y - y0) <= a.still_tol for _, x, y in window):
                settled.append((fx, path[-1][0], x0, y0))
                break
    counted = []
    for birth, last, x, y in sorted(settled):
        same = any(abs(x - cx) <= a.dedupe and abs(y - cy) <= a.dedupe and clast >= birth - need
                   for _, clast, cx, cy in counted)
        if not same:
            counted.append((birth, last, x, y))
    offset = a.start or 0.0
    return [round(offset + b / a.fps, 1) for b, _, _, _ in counted]


IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def spark(question, media_path, schema):
    """Ask Muse Spark one question about one image or MP4 clip and return its JSON answer."""
    b64 = base64.b64encode(Path(media_path).read_bytes()).decode()
    mime = IMAGE_TYPES.get(Path(media_path).suffix.lower())
    provider = os.environ.get("SPARK_PROVIDER") or ("meta" if os.environ.get("MODEL_API_KEY") else "openrouter")
    if provider == "meta":
        media = ({"type": "input_image", "image_url": f"data:{mime};base64,{b64}"} if mime else
                 {"type": "input_video", "video_url": f"data:video/mp4;base64,{b64}"})
        body = {"model": os.environ.get("SPARK_MODEL", "muse-spark-1.3"), "reasoning": {"effort": "low"},
                "max_output_tokens": 4000,
                "text": {"format": {"type": "json_schema", "name": "verdict", "schema": schema, "strict": True}},
                "input": [{"type": "message", "role": "user", "content": [
                    {"type": "input_text", "text": question}, media]}]}
        r = requests.post(f"{META}/responses", json=body, headers=meta_headers(), timeout=300)
        r.raise_for_status()
        text = "".join(c.get("text", "") for o in r.json().get("output", []) if o.get("type") == "message"
                       for c in o.get("content", []))
    else:
        key = os.environ.get("OPENROUTER_API_KEY") or sys.exit("OPENROUTER_API_KEY is not set")
        media = ({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}} if mime else
                 {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64}"}})
        body = {"model": os.environ.get("SPARK_MODEL", "meta/muse-spark-1.3"), "max_tokens": 4000,
                "response_format": {"type": "json_schema", "json_schema": {"name": "verdict", "strict": True, "schema": schema}},
                "messages": [{"role": "user", "content": [{"type": "text", "text": question}, media]}]}
        r = requests.post(f"{OPENROUTER}/chat/completions", json=body, timeout=300,
                          headers={"Authorization": f"Bearer {key}"})
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"]
    return json.loads(text)


def cmd_referee(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    schema = {"type": "object", "additionalProperties": False, "required": ["yes", "confidence", "evidence"],
              "properties": {"yes": {"type": "boolean"}, "confidence": {"type": "number"},
                             "evidence": {"type": "string"}}}
    for t in (float(v) for v in a.at.split(",")):
        clip = out / f"ref_{t:07.1f}.mp4"
        prep_clip(a.video, clip, a.fps, a.roi, max_dim=768, start=max(0.0, t - a.window), length=2 * a.window)
        v = spark(a.question, clip, schema)
        print(f"t={t:7.1f}s  yes={v['yes']}  conf={v['confidence']:.2f}  {v['evidence'][:140]}", flush=True)


def obj(props, required=None):
    return {"type": "object", "additionalProperties": False, "required": required or list(props), "properties": props}


S, B, N = {"type": "string"}, {"type": "boolean"}, {"type": "number"}
READ_TASKS = {
    "cable": ("Read the print on this electrical cable. Report the conductor size in mm² exactly as printed "
              "(for example 2.5), the number of cores, the brand, any SON registration number, and the standard "
              "printed (for example NIS or BS). Use an empty string for anything you cannot read; do not guess.",
              obj({"size_mm2": S, "cores": S, "brand": S, "son_number": S, "standard": S, "legible": B, "notes": S}),
              ["size_mm2", "brand"]),
    "breakers": ("List every device on this distribution board from left to right: its type (MCB, RCD, RCBO, "
                 "isolator), its rating in amps as printed, and its trip curve letter if printed. Say whether an RCD "
                 "and an earth bar are visible. Do not guess unreadable ratings; use 0.",
                 obj({"devices": {"type": "array", "items": obj({"type": S, "rating_a": N, "curve": S})},
                      "rcd_present": B, "earth_bar_visible": B}),
                 ["ratings", "rcd_present"]),
    "magnet": ("A magnet is held against the bare conductor of a cable in this clip. Does the magnet stick to or "
               "visibly pull on the conductor? Copper does not attract a magnet; iron or steel does.",
               obj({"magnet_attaches": B, "confidence": N, "evidence": S}),
               ["magnet_attaches"]),
}


def flatten(task, v):
    if task == "breakers":
        v = {**v, "ratings": " ".join(str(int(d["rating_a"])) for d in v.get("devices", []))}
        v.pop("devices", None)
    return {k: (str(x).lower() if isinstance(x, bool) else str(x)) for k, x in v.items()}


def cmd_read(a):
    question, schema, scored = READ_TASKS[a.task]
    files = sorted(p for p in Path(a.folder).iterdir() if p.suffix.lower() in {*IMAGE_TYPES, ".mp4", ".mov"})
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rows = []
    for f in files:
        media = f
        if f.suffix.lower() == ".mov" or (f.suffix.lower() == ".mp4" and f.stat().st_size > 40_000_000):
            media = out / (f.stem + "_prep.mp4")
            prep_clip(f, media, 8, None, max_dim=960)
        v = flatten(a.task, spark(question, media, schema))
        rows.append({"file": f.name, **v})
        print(f.name, json.dumps(v)[:200], flush=True)
    cols = ["file"] + [k for k in rows[0] if k != "file"] if rows else ["file"]
    with open(out / f"{a.task}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); w.writerows(rows)
    if a.truth:
        norm = lambda s: re.sub(r"[\s²]|mm", "", str(s).lower())
        truth = {r["file"]: r for r in csv.DictReader(open(a.truth))}
        right = sum(1 for r in rows if r["file"] in truth and all(norm(r.get(k, "")) == norm(truth[r["file"]].get(k, ""))
                                                                  for k in scored if k in truth[r["file"]]))
        n = sum(1 for r in rows if r["file"] in truth)
        print(f"\n{a.task}: {right}/{n} files fully correct on {', '.join(scored)}")


NUMBER_WORDS = {w: str(i) for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())}
NUMBER_WORDS.update({"thirty": "30", "forty": "40", "fifty": "50", "hundred": "100"})
SPELLING = {"metres": "meters", "metre": "meter", "horse power": "horsepower", "air conditioner": "ac",
            "a c": "ac", "amperes": "amps", "ampere": "amp", "millimetre": "mm", "millimeter": "mm",
            "square mm": "mm", "mm2": "mm", "mm²": "mm"}


def normalise_speech(text):
    """Lower-case, unify spellings and turn spoken numbers ("one point five") into digits ("1.5")."""
    s = re.sub(r"[^a-z0-9.² ]+", " ", text.lower())
    for k, v in SPELLING.items():
        s = re.sub(rf"\b{k}\b", v, s)
    s = " ".join(NUMBER_WORDS.get(w, w) for w in s.split())
    s = re.sub(r"\b(\d+) point (\d+)\b", r"\1.\2", s)
    return re.sub(r"(?<=\d)\.(?!\d)|\.$", "", s)


def cmd_voice(a):
    """Transcribe each recorded command with Muse Voice Transcribe (file endpoint) and compare with the script."""
    script = {r["file"]: r["text"] for r in csv.DictReader(open(a.truth))} if a.truth else {}
    words = lambda s: normalise_speech(s).split()
    hits = n = 0
    with tempfile.TemporaryDirectory() as tmp:
        for f in sorted(p for p in Path(a.folder).iterdir() if p.suffix.lower() in {".wav", ".m4a", ".mp3", ".ogg", ".opus", ".aiff", ".caf", ".webm", ".mp4"}):
            wav = Path(tmp) / (f.stem + ".wav")
            ffmpeg("-i", str(f), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", str(wav))
            req = {"mode": "PUSH_TO_TALK", "model": "muse-voice-transcribe-1.0", "audioEncoding": "WAV",
                   "keywords": a.keywords.split(",") if a.keywords else [], "languageBias": ["English"]}
            with open(wav, "rb") as fh:
                r = requests.post(f"{META}/asr/transcribe", headers=meta_headers(), timeout=120,
                                  files={"request": (None, json.dumps(req), "application/json"),
                                         "audio": (wav.name, fh, "audio/wav")})
            if r.status_code != 200:
                print(f.name, "ERROR", r.status_code, r.text[:200]); continue
            said = r.json().get("transcript", "")
            ok = None
            if f.name in script:
                want = set(words(script[f.name]))
                ok = len(want & set(words(said))) / max(1, len(want)) >= 0.8
                n += 1; hits += ok
            print(f"{f.name}: {said!r}" + ("" if ok is None else ("  OK" if ok else "  MISS")))
    if n:
        print(f"\nvoice: {hits}/{n} commands with at least 80% of the scripted words heard")


def cmd_score(a):
    load = lambda p: sorted(float(r[0]) for r in list(csv.reader(open(p)))[1:] if r)
    found, truth = load(a.events), load(a.truth)
    unmatched, tp = list(truth), 0
    for e in found:
        hit = next((t for t in unmatched if abs(t - e) <= a.tol), None)
        if hit is not None:
            unmatched.remove(hit); tp += 1
    fp, fn = len(found) - tp, len(unmatched)
    print(f"truth={len(truth)}  found={len(found)}  matched={tp}  false={fp}  missed={fn}")
    verdict = "PASS" if fn <= max(1, round(0.1 * len(truth))) and fp <= 1 else "FAIL"
    print(f"{verdict} (bar: miss <= 10% of truth, at most 1 false event)")


def load_env(path=Path(__file__).resolve().parent / ".env"):
    """Pick up MODEL_API_KEY / OPENROUTER_API_KEY / SPARK_* from probe/.env without overriding the shell."""
    if path.is_file():
        for line in path.read_text().splitlines():
            line = line.strip().removeprefix("export ")
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def main():
    load_env()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshots"); s.add_argument("video"); s.add_argument("--concept", required=True)
    s.add_argument("--every", type=float, default=20); s.add_argument("--roi"); s.add_argument("--min-conf", type=float, default=0.5)
    s.add_argument("--out", default="out/snapshots")
    t = sub.add_parser("track"); t.add_argument("video"); t.add_argument("--concept", required=True)
    t.add_argument("--fps", type=float, default=4); t.add_argument("--roi"); t.add_argument("--zone", help="x1,y1,x2,y2 fractions of the (cropped) frame")
    t.add_argument("--start", type=float); t.add_argument("--length", type=float)
    t.add_argument("--min-frames", type=int, default=3); t.add_argument("--min-conf", type=float, default=0.5)
    t.add_argument("--births", action="store_true", help="count objects that settle and stay still in the zone (new blocks)")
    t.add_argument("--still-seconds", type=float, default=10); t.add_argument("--still-tol", type=float, default=0.02)
    t.add_argument("--dedupe", type=float, default=0.03, help="same-position radius, fraction of frame")
    t.add_argument("--out", default="out/track")
    r = sub.add_parser("referee"); r.add_argument("video"); r.add_argument("--at", required=True, help="comma-separated seconds")
    r.add_argument("--question", required=True); r.add_argument("--window", type=float, default=4); r.add_argument("--fps", type=float, default=4)
    r.add_argument("--roi"); r.add_argument("--out", default="out/referee")
    c = sub.add_parser("score"); c.add_argument("events"); c.add_argument("truth"); c.add_argument("--tol", type=float, default=3)
    rd = sub.add_parser("read"); rd.add_argument("task", choices=sorted(READ_TASKS)); rd.add_argument("folder")
    rd.add_argument("--truth", help="CSV with a file column plus the scored fields"); rd.add_argument("--out", default="out/read")
    vc = sub.add_parser("voice"); vc.add_argument("folder"); vc.add_argument("--truth", help="CSV: file,text")
    vc.add_argument("--keywords", default="MCB,RCD,RCBO,mm,amp,conduit,earth,neutral,breaker,distribution board")
    a = p.parse_args()
    {"snapshots": cmd_snapshots, "track": cmd_track, "referee": cmd_referee, "score": cmd_score,
     "read": cmd_read, "voice": cmd_voice}[a.cmd](a)


if __name__ == "__main__":
    main()
