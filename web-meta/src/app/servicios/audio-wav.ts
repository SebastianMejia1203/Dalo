export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!length || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error("No se captó audio. Graba de nuevo.");
  const input = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }
  const ratio = sampleRate / 24000,
    count = Math.floor(length / ratio);
  if (!count) throw new Error("Grabación demasiado corta.");
  const buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const text = (index: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(index + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio),
      end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(
      44 + i * 2,
      Math.round(value * (value < 0 ? 32768 : 32767)),
      true,
    );
  }
  return buffer;
}
