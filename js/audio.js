// audio.js — Captura de micrófono, remuestreo y reproducción de audio
// (original / modulada / recuperada) usando la Web Audio API del navegador.
//
// IMPORTANTE: getUserMedia (acceso al micrófono) sólo funciona en un
// contexto seguro: https:// o http://localhost. Si abres el archivo
// directamente (file://) el navegador bloqueará el micrófono — usa la
// extensión "Live Server" de VS Code.

const AudioEngine = (() => {
  let audioCtx = null;
  let micStream = null;
  let processorNode = null;
  let sourceNode = null;
  let recordedChunks = [];
  let isRecording = false;

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Convierte el audio grabado (a la frecuencia nativa del micrófono, normalmente
  // 44100 o 48000 Hz) a la frecuencia de trabajo del proyecto (Fs = 10000 Hz),
  // usando interpolación lineal simple — suficiente para fines didácticos.
  function resample(samples, fromRate, toRate) {
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.round(samples.length / ratio));
    const result = new Float64Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const frac = srcPos - i0;
      result[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
    }
    return result;
  }

  // Inicia la grabación del micrófono. onLevel(peak) se llama continuamente
  // para alimentar el medidor de nivel visual.
  async function startRecording(onLevel) {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    sourceNode = ctx.createMediaStreamSource(micStream);
    processorNode = ctx.createScriptProcessor(4096, 1, 1);
    recordedChunks = [];
    isRecording = true;

    processorNode.onaudioprocess = (e) => {
      if (!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      recordedChunks.push(new Float32Array(input)); // copia — el buffer original se reutiliza
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]));
        onLevel(peak);
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(ctx.destination); // requerido por algunos navegadores para procesar
  }

  // Detiene la grabación y devuelve el audio crudo tal como llegó del micrófono.
  function stopRecording() {
    isRecording = false;
    if (processorNode) processorNode.disconnect();
    if (sourceNode) sourceNode.disconnect();
    if (micStream) micStream.getTracks().forEach((track) => track.stop());

    const totalLength = recordedChunks.reduce((acc, c) => acc + c.length, 0);
    const raw = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recordedChunks) { raw.set(chunk, offset); offset += chunk.length; }

    const nativeRate = audioCtx.sampleRate;
    return { raw, nativeRate };
  }

  // Reproduce cualquier arreglo de muestras a la frecuencia indicada,
  // normalizando el volumen para evitar saturación (clipping).
  function playBuffer(samples, sampleRate) {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);

    let maxAbs = 1e-9;
    for (let i = 0; i < samples.length; i++) maxAbs = Math.max(maxAbs, Math.abs(samples[i]));
    for (let i = 0; i < samples.length; i++) channel[i] = (samples[i] / maxAbs) * 0.9;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    return src;
  }

  return { startRecording, stopRecording, resample, playBuffer };
})();