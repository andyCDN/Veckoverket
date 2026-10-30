/* Complete, independent WAV files are encoded by the page. Keeping PCM here
 * avoids treating partial WebM fragments as independently decodable files. */
class VeckoverketPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.enabled = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === "resume") this.enabled = true;
      if (data.type === "pause") {
        this.enabled = false;
        this.flush();
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ type: "samples", samples: samples.buffer }, [
      samples.buffer,
    ]);
    this.used = 0;
  }
  process(inputs) {
    if (!this.enabled || !inputs[0]?.length) return true;
    const channels = inputs[0];
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      this.buffer[this.used++] = sample / channels.length;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor("veckoverket-pcm", VeckoverketPcm);
