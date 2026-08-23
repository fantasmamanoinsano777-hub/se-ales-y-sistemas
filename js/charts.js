// charts.js — Configuración y actualización de las gráficas (Plotly.js)

const plotlyLayoutBase = {
  paper_bgcolor: '#10161f',
  plot_bgcolor: '#10161f',
  font: { family: 'JetBrains Mono, monospace', color: '#d7e6e0', size: 11 },
  margin: { l: 55, r: 20, t: 10, b: 45 },
  legend: { orientation: 'h', y: 1.15, font: { size: 10 } },
  xaxis: { gridcolor: '#1c2733', zerolinecolor: '#1c2733' },
  yaxis: { gridcolor: '#1c2733', zerolinecolor: '#1c2733' }
};

function initCharts() {
  Plotly.newPlot('plot-time', [
    { x: [], y: [], name: 'Original', line: { color: '#33d1ff', width: 1.5 } },
    { x: [], y: [], name: 'Modulada', line: { color: '#39ffb0', width: 1 } },
    { x: [], y: [], name: 'Recuperada', line: { color: '#ffb454', width: 1, dash: 'dot' } },
  ], {
    ...plotlyLayoutBase,
    xaxis: { ...plotlyLayoutBase.xaxis, title: 'Tiempo (ms)' },
    yaxis: { ...plotlyLayoutBase.yaxis, title: 'Amplitud (V)', range: [-1.6, 1.6] }
  }, { responsive: true, displayModeBar: false });

  Plotly.newPlot('plot-freq', [
    { x: [], y: [], name: '|S(f)|', fill: 'tozeroy', line: { color: '#39ffb0', width: 1.5 }, fillcolor: 'rgba(57,255,176,0.15)' }
  ], {
    ...plotlyLayoutBase,
    xaxis: { ...plotlyLayoutBase.xaxis, title: 'Frecuencia (Hz)' },
    yaxis: { ...plotlyLayoutBase.yaxis, title: 'Magnitud (dB)', range: [-80, 10] }
  }, { responsive: true, displayModeBar: false });
}

function updateCharts(data) {
  const tMs = Array.from(data.t, v => v * 1000);

  // Sin f_m (modo micrófono) usamos una ventana fija razonable para mostrar la voz
  const fmForWindow = data.fm || 250;
  const cyclesToShow = 4;
  const windowSamples = Math.min(data.t.length, Math.round((cyclesToShow / fmForWindow) * data.fs));

  Plotly.react('plot-time', [
    { x: Array.from(tMs.slice(0, windowSamples)), y: Array.from(data.m.slice(0, windowSamples)), name: 'Original', line: { color: '#33d1ff', width: 1.5 } },
    { x: Array.from(tMs.slice(0, windowSamples)), y: Array.from(data.s.slice(0, windowSamples)), name: 'Modulada', line: { color: '#39ffb0', width: 1 } },
    { x: Array.from(tMs.slice(0, windowSamples)), y: Array.from(data.recovered.slice(0, windowSamples)), name: 'Recuperada', line: { color: '#ffb454', width: 1, dash: 'dot' } },
  ], {
    ...plotlyLayoutBase,
    xaxis: { ...plotlyLayoutBase.xaxis, title: 'Tiempo (ms)' },
    yaxis: { ...plotlyLayoutBase.yaxis, title: 'Amplitud (V)', range: [-1.6, 1.6] }
  });

  const span = Math.max(fmForWindow * 6, 400);
  const fMin = data.fc - span, fMax = data.fc + span;

  Plotly.react('plot-freq', [
    { x: Array.from(data.freq), y: Array.from(data.magDb), name: '|S(f)|', fill: 'tozeroy', line: { color: '#39ffb0', width: 1.5 }, fillcolor: 'rgba(57,255,176,0.15)' }
  ], {
    ...plotlyLayoutBase,
    xaxis: { ...plotlyLayoutBase.xaxis, title: 'Frecuencia (Hz)', range: [fMin, fMax] },
    yaxis: { ...plotlyLayoutBase.yaxis, title: 'Magnitud (dB)', range: [-80, 10] }
  });
}