"use client";

/** Shrink an image so uploads stay small; models read 1280 px fine. */
export async function imageToJpegDataUrl(source: Blob | HTMLVideoElement, maxDim = 1280, quality = 0.85): Promise<string> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : null;
  const w = bitmap ? bitmap.width : (source as HTMLVideoElement).videoWidth;
  const h = bitmap ? bitmap.height : (source as HTMLVideoElement).videoHeight;
  if (!w || !h) throw new Error("No image to read yet");
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(bitmap ?? (source as HTMLVideoElement), 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** A still from the middle of a clip, for the privacy gate (Glimmer reads stills, not video). */
export async function posterFromClip(clip: Blob): Promise<string> {
  const url = URL.createObjectURL(clip);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not open the clip"));
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 2);
    await new Promise<void>((resolve) => (video.onseeked = () => resolve()));
    return await imageToJpegDataUrl(video);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Push-to-talk recorder. Muse Voice Transcribe's file endpoint wants mono 16-bit PCM WAV at 16 kHz. */
export class PushToTalk {
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    const rec = this.recorder;
    if (!rec) throw new Error("Not recording");
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    return toWav16k(new Blob(this.chunks, { type: rec.mimeType }));
  }
}

export async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}
