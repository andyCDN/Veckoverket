import { appPath } from "./app-path";
export function pcmWav(samples: Float32Array, rate: number): Blob {
  if (
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 192000 ||
    !samples.length
  )
    throw new Error("Ogiltigt ljudformat.");
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer);
  const word = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(
      -1,
      Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0),
    );
    view.setInt16(
      44 + i * 2,
      value < 0 ? Math.round(value * 32768) : Math.round(value * 32767),
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export class PcmCapture {
  private context: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private buffers: Float32Array[] = [];
  private size = 0;
  private work = Promise.resolve();
  private flushAck?: () => void;
  private pausing?: Promise<void>;
  active = false;
  totalSamples = 0;
  constructor(
    private onChunk: (blob: Blob, durationMs: number) => Promise<void>,
    private onError: (error: Error) => void,
  ) {
    if (
      !window.AudioContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioWorkletNode
    )
      throw new Error(
        "Webbläsaren stöder inte denna inspelning. Använd en aktuell version av Safari eller Chrome.",
      );
    this.context = new AudioContext({ sampleRate: 16000 });
    this.context.onstatechange = () => {
      if (this.active && this.context.state !== "running")
        this.onError(
          new Error(
            "Webbläsaren avbröt ljudinspelningen. Kontrollera mikrofonen och tryck Fortsätt när den är tillgänglig.",
          ),
        );
    };
    void this.context.resume().catch(() => undefined);
  }
  async start() {
    try {
      await this.context.audioWorklet.addModule(
        appPath("/pcm-capture.worklet.js"),
      );
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      this.node = new AudioWorkletNode(this.context, "veckoverket-pcm", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.node.port.onmessage = (event) => {
        if (event.data.type === "flushed") {
          this.flushAck?.();
          this.flushAck = undefined;
          return;
        }
        if (event.data.type !== "samples") return;
        const block = new Float32Array(event.data.samples);
        this.totalSamples += block.length;
        const limit = Math.min(this.context.sampleRate * 20, 1_000_000);
        let offset = 0;
        while (offset < block.length) {
          const length = Math.min(limit - this.size, block.length - offset);
          this.buffers.push(block.slice(offset, offset + length));
          this.size += length;
          offset += length;
          if (this.size >= limit) this.emit();
        }
      };
      this.node.onprocessorerror = () =>
        this.onError(
          new Error("Ljudbearbetningen avbröts. Inspelningen pausas."),
        );
      this.stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (this.active)
            this.onError(
              new Error("Mikrofonen stängdes av. Inspelningen pausas."),
            );
        };
      });
      const silence = this.context.createGain();
      silence.gain.value = 0;
      this.context.createMediaStreamSource(this.stream).connect(this.node);
      this.node.connect(silence);
      silence.connect(this.context.destination);
      this.node.port.postMessage({ type: "resume" });
      await this.context.resume();
      this.active = true;
    } catch (error) {
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.context.close().catch(() => undefined);
      throw error;
    }
  }
  private emit() {
    if (!this.size) return;
    const samples = new Float32Array(this.size);
    let index = 0;
    for (const buffer of this.buffers) {
      samples.set(buffer, index);
      index += buffer.length;
    }
    this.buffers = [];
    this.size = 0;
    const padded =
      samples.length < this.context.sampleRate
        ? new Float32Array(this.context.sampleRate)
        : samples;
    if (padded !== samples) padded.set(samples);
    const blob = pcmWav(padded, this.context.sampleRate),
      duration = Math.round((samples.length / this.context.sampleRate) * 1000);
    this.work = this.work
      .then(() => this.onChunk(blob, duration))
      .catch((error) =>
        this.onError(
          error instanceof Error
            ? error
            : new Error("Ljudsegmentet kunde inte sparas."),
        ),
      );
  }
  get seconds() {
    return Math.floor(this.totalSamples / this.context.sampleRate);
  }
  pause(): Promise<void> {
    if (this.pausing) return this.pausing;
    const pending = this.performPause();
    this.pausing = pending;
    void pending
      .finally(() => {
        if (this.pausing === pending) this.pausing = undefined;
      })
      .catch(() => undefined);
    return pending;
  }
  private async performPause() {
    if (!this.active) {
      await this.work;
      return;
    }
    this.active = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error("Mikrofonen svarade inte. Inspelningen har stoppats."),
            ),
          3000,
        );
        this.flushAck = () => {
          clearTimeout(timer);
          resolve();
        };
        this.node!.port.postMessage({ type: "pause" });
      });
      this.stream?.getTracks().forEach((t) => {
        t.enabled = false;
      });
      await this.context.suspend();
      this.emit();
      await this.work;
    } catch (error) {
      this.emit();
      await this.work;
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.context.close().catch(() => undefined);
      throw error;
    }
  }
  async resume() {
    if (this.pausing) await this.pausing;
    if (this.active) return;
    if (
      this.context.state === "closed" ||
      !this.stream?.getTracks().some((t) => t.readyState === "live")
    )
      throw new Error("Starta en ny inspelning. Mikrofonen är stängd.");
    await this.context.resume();
    this.stream.getTracks().forEach((t) => {
      t.enabled = true;
    });
    this.node!.port.postMessage({ type: "resume" });
    this.active = true;
  }
  async stop() {
    try {
      await this.pause();
    } finally {
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.context.close().catch(() => undefined);
    }
  }
}
