import { encodeWav } from "./audio-wav";
describe("WAV para Voice Transcribe", () => {
  it("convierte PCM48k a WAV mono24k16bits, preservando amplitud y orden", () => {
    const wav = encodeWav(
      [new Float32Array([0, 0, 1, 1]), new Float32Array([-1, -1])],
      48000,
    );
    const view = new DataView(wav);
    expect(wav.byteLength).toBe(50);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });
  it("rechaza grabación sin audio", () => {
    expect(() => encodeWav([], 48000)).toThrow();
  });
});
