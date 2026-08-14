// app.js — Controles, eventos y orquestación de la simulación

const els = {
  fm: document.getElementById('fm'),
  fc: document.getElementById('fc'),
  mu: document.getElementById('mu'),
  snr: document.getElementById('snr'),
  fmVal: document.getElementById('fm-val'),
  fcVal: document.getElementById('fc-val'),
  muVal: document.getElementById('mu-val'),
  snrVal: document.getElementById('snr-val'),
  overmodAlert: document.getElementById('overmod-alert'),
  onairLed: document.getElementById('onair-led'),
};

function render() {
  const fm = parseFloat(els.fm.value);
  const fc = parseFloat(els.fc.value);
  const mu = parseFloat(els.mu.value);
  const snr = parseFloat(els.snr.value);

  // Actualiza los textos de lectura junto a cada slider
  els.fmVal.textContent = `${fm} Hz`;
  els.fcVal.textContent = `${fc} Hz`;
  els.muVal.textContent = mu.toFixed(2);
  els.snrVal.textContent = `${snr} dB`;

  // Indicador visual de sobremodulación (μ > 1 → distorsión de envolvente)
  els.overmodAlert.classList.toggle('hidden', mu <= 1);
  els.onairLed.style.background = mu > 1 ? '#ff3b5c' : '#39ffb0';
  els.onairLed.style.boxShadow = mu > 1
    ? '0 0 8px #ff3b5c, 0 0 16px #ff3b5c'
    : '0 0 8px #39ffb0, 0 0 16px #39ffb0';

  const data = generateSignals(fm, fc, mu, snr);
  updateCharts(data);
}

// Recalcula y redibuja en tiempo real cada vez que se mueve un slider
[els.fm, els.fc, els.mu, els.snr].forEach(slider => {
  slider.addEventListener('input', render);
});

// Inicialización
initCharts();
render();