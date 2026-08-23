// app.js — Controles, modos (tono/micrófono), grabación, reproducción y eventos

const els = {
  tabTone: document.getElementById('tab-tone'),
  tabMic: document.getElementById('tab-mic'),
  toneControls: document.getElementById('tone-controls'),
  micControls: document.getElementById('mic-controls'),

  fm: document.getElementById('fm'),
  harm: document.getElementById('harm'),
  fc: document.getElementById('fc'),
  mu: document.getElementById('mu'),
  snr: document.getElementById('snr'),

  fmVal: document.getElementById('fm-val'),
  harmVal: document.getElementById('harm-val'),
  fcVal: document.getElementById('fc-val'),
  muVal: document.getElementById('mu-val'),
  snrVal: document.getElementById('snr-val'),

  overmodAlert: document.getElementById('overmod-alert'),
  onairLed: document.getElementById('onair-led'),

  btnRecord: document.getElementById('btn-record'),
  micStatus: document.getElementById('mic-status'),
  micLevelFill: document.getElementById('mic-level-fill'),

  btnPlayOriginal: document.getElementById('btn-play-original'),
  btnPlayModulated: document.getElementById('btn-play-modulated'),
  btnPlayRecovered: document.getElementById('btn-play-recovered'),
};

const MAX_REC_SECONDS = 6;

let currentMode = 'tone';          // 'tone' | 'mic'
let isRecordingActive = false;
let recordTimeout = null;

let recordedMessage = null;        // audio grabado, remuestreado a Fs, normalizado [-1,1]
let recordedRawNative = null;      // { raw, nativeRate } — audio tal como llegó del micrófono
let fullModulated = null;          // buffer completo modulado (para reproducir)
let fullRecovered = null;          // buffer completo recuperado (para reproducir)

function enablePlayback(enabled) {
  els.btnPlayOriginal.disabled = !enabled;
  els.btnPlayModulated.disabled = !enabled;
  els.btnPlayRecovered.disabled = !enabled;
}

function render() {
  const fm = parseFloat(els.fm.value);
  const harm = parseInt(els.harm.value, 10);
  const fc = parseFloat(els.fc.value);
  const mu = parseFloat(els.mu.value);
  const snr = parseFloat(els.snr.value);

  els.fmVal.textContent = `${fm} Hz`;
  els.harmVal.textContent = harm === 1 ? 'Tono puro' : `${harm} armónicos`;
  els.fcVal.textContent = `${fc} Hz`;
  els.muVal.textContent = mu.toFixed(2);
  els.snrVal.textContent = `${snr} dB`;

  els.overmodAlert.classList.toggle('hidden', mu <= 1);
  const overmod = mu > 1;
  els.onairLed.style.background = overmod ? '#ff3b5c' : '#39ffb0';
  els.onairLed.style.boxShadow = overmod
    ? '0 0 8px #ff3b5c, 0 0 16px #ff3b5c'
    : '0 0 8px #39ffb0, 0 0 16px #39ffb0';

  let data;

  if (currentMode === 'tone') {
    const m = harmonicMessage(fm, harm, N, Fs);
    data = buildSignalPackage(m, Fs, fc, mu, snr);
    data.fm = fm;

    // Buffers de 2 segundos para poder escuchar el tono con calma
    const longM = harmonicMessage(fm, harm, Fs * 2, Fs);
    fullModulated = modulate(longM, Fs, fc, mu, snr);
    fullRecovered = envelopeDetect(fullModulated, Fs, fc);
    enablePlayback(true);

  } else {
    if (!recordedMessage) {
      enablePlayback(false);
      return; // aún no hay grabación: no hay nada que graficar
    }
    const snippet = recordedMessage.slice(0, Math.min(N, recordedMessage.length));
    data = buildSignalPackage(snippet, Fs, fc, mu, snr);

    // Recalcula el audio COMPLETO grabado con los parámetros actuales —
    // esto es lo que permite comparar "en tiempo real" al mover los sliders.
    fullModulated = modulate(recordedMessage, Fs, fc, mu, snr);
    fullRecovered = envelopeDetect(fullModulated, Fs, fc);
    enablePlayback(true);
  }

  updateCharts(data);
}

function switchMode(mode) {
  currentMode = mode;
  els.tabTone.classList.toggle('active', mode === 'tone');
  els.tabMic.classList.toggle('active', mode === 'mic');
  els.toneControls.classList.toggle('hidden', mode !== 'tone');
  els.micControls.classList.toggle('hidden', mode !== 'mic');
  render();
}

els.tabTone.addEventListener('click', () => switchMode('tone'));
els.tabMic.addEventListener('click', () => switchMode('mic'));

[els.fm, els.harm, els.fc, els.mu, els.snr].forEach((slider) => {
  slider.addEventListener('input', render);
});

// ---------- Grabación de micrófono ----------
els.btnRecord.addEventListener('click', async () => {
  if (!isRecordingActive) {
    try {
      await AudioEngine.startRecording((level) => {
        els.micLevelFill.style.width = `${Math.min(100, level * 140)}%`;
      });
      isRecordingActive = true;
      els.btnRecord.textContent = '■ Detener grabación';
      els.btnRecord.classList.add('recording');
      els.micStatus.textContent = `Grabando… (se detiene sola a los ${MAX_REC_SECONDS} s)`;
      recordTimeout = setTimeout(() => { if (isRecordingActive) stopRecordingFlow(); }, MAX_REC_SECONDS * 1000);
    } catch (err) {
      els.micStatus.textContent = 'No se pudo acceder al micrófono. Revisa los permisos del navegador (se necesita HTTPS o localhost).';
    }
  } else {
    stopRecordingFlow();
  }
});

function stopRecordingFlow() {
  clearTimeout(recordTimeout);
  isRecordingActive = false;
  els.btnRecord.textContent = '● Grabar mi voz';
  els.btnRecord.classList.remove('recording');

  const { raw, nativeRate } = AudioEngine.stopRecording();
  recordedRawNative = { raw, nativeRate };

  let resampled = AudioEngine.resample(raw, nativeRate, Fs);
  let maxAbs = 1e-9;
  for (let i = 0; i < resampled.length; i++) maxAbs = Math.max(maxAbs, Math.abs(resampled[i]));
  for (let i = 0; i < resampled.length; i++) resampled[i] /= maxAbs;
  recordedMessage = resampled;

  els.micStatus.textContent = `Grabación lista (${(raw.length / nativeRate).toFixed(1)} s). Ya puedes escuchar y comparar.`;
  els.micLevelFill.style.width = '0%';
  render();
}

// ---------- Reproducción ----------
els.btnPlayOriginal.addEventListener('click', () => {
  if (currentMode === 'tone') {
    const longM = harmonicMessage(parseFloat(els.fm.value), parseInt(els.harm.value, 10), Fs * 2, Fs);
    AudioEngine.playBuffer(longM, Fs);
  } else if (recordedRawNative) {
    AudioEngine.playBuffer(recordedRawNative.raw, recordedRawNative.nativeRate);
  }
});
els.btnPlayModulated.addEventListener('click', () => { if (fullModulated) AudioEngine.playBuffer(fullModulated, Fs); });
els.btnPlayRecovered.addEventListener('click', () => { if (fullRecovered) AudioEngine.playBuffer(fullRecovered, Fs); });

// ---------- Inicialización ----------
initCharts();
switchMode('tone');