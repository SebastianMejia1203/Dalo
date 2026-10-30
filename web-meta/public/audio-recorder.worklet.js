class DaloAudioRecorder extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      const copy = channel.slice();
      this.port.postMessage(copy, [copy.buffer]);
    }
    for (const output of outputs) for (const data of output) data.fill(0);
    return true;
  }
}
registerProcessor("dalo-audio-recorder", DaloAudioRecorder);
