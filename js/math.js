// math.js — Motor matemático: señales AM, armónicos, FFT y detector de envolvente

const Fs = 10000;   // Frecuencia de muestreo de trabajo del simulador (Hz)
const N  = 2048;    // Muestras usadas para graficar (potencia de 2, exigida por la FFT)
const Ac = 1;       // Amplitud de la portadora (V)

// --- FFT recursiva radix-2 (Cooley-Tukey) ---
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  const evenRe = new Float64Array(n / 2), evenIm = new Float64Array(n / 2);
  const oddRe  = new Float64Array(n / 2), oddIm  = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    evenRe[i] = re[2 * i];     evenIm[i] = im[2 * i];
    oddRe[i]  = re[2 * i + 1]; oddIm[i]  = im[2 * i + 1];
  }
  fft(evenRe, evenIm);
  fft(oddRe, oddIm);

  for (let k = 0; k < n / 2; k++) {
    const angle = (-2 * Math.PI * k) / n;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const tRe = cos * oddRe[k] - sin * oddIm[k];
    const tIm = sin * oddRe[k] + cos * oddIm[k];
    re[k]         = evenRe[k] + tRe;
    im[k]         = evenIm[k] + tIm;
    re[k + n / 2] = evenRe[k] - tRe;
    im[k + n / 2] = evenIm[k] - tIm;
  }
}

function gaussianNoise() {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Genera un mensaje de prueba con armónicos:
 *   m(t) = Σ (1/k) · cos(2π · k·f_m · t),  k = 1 .. numHarmonics
 * Cada armónico se suma con amplitud decreciente (1/k), igual que en un sonido
 * real. IMPORTANTE: si k·f_m alcanza o supera Fs/2 (límite de Nyquist), ese
 * armónico y todos los siguientes se DESCARTAN — de lo contrario "se disfrazan"
 * de una frecuencia distinta (aliasing) y arruinan la gráfica y el audio.
 * Devuelve además cuántos armónicos realmente se usaron (usedHarmonics), para
 * poder avisarle al usuario en la interfaz si se recortó algo.
 */
function harmonicMessage(fm, numHarmonics, length = N, fs = Fs) {
  const nyquist = fs / 2;
  let usedHarmonics = numHarmonics;
  for (let k = 1; k <= numHarmonics; k++) {
    if (k * fm >= nyquist) { usedHarmonics = k - 1; break; }
  }
  usedHarmonics = Math.max(1, usedHarmonics); // siempre queda al menos la fundamental

  const m = new Float64Array(length);
  let maxAbs = 1e-9;
  for (let i = 0; i < length; i++) {
    const t = i / fs;
    let value = 0;
    for (let k = 1; k <= usedHarmonics; k++) {
      value += (1 / k) * Math.cos(2 * Math.PI * k * fm * t);
    }
    m[i] = value;
    if (Math.abs(value) > maxAbs) maxAbs = Math.abs(value);
  }
  for (let i = 0; i < length; i++) m[i] /= maxAbs; // normalizar a [-1, 1]

  m.usedHarmonics = usedHarmonics; // metadato adjunto al arreglo, útil para la UI
  return m;
}

/**
 * Aplica la ecuación de modulación AM a CUALQUIER mensaje m[] (tono sintético
 * o audio real grabado por el micrófono):
 *   s(t) = Ac · [1 + μ·m(t)] · cos(2π f_c t) + ruido AWGN calibrado al SNR pedido
 */
function modulate(m, fs, fc, mu, snrDb) {
  const n = m.length;
  const sClean = new Float64Array(n);
  let sigPower = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    sClean[i] = Ac * (1 + mu * m[i]) * Math.cos(2 * Math.PI * fc * t);
    sigPower += sClean[i] * sClean[i];
  }
  sigPower /= n;

  const snrLinear = Math.pow(10, snrDb / 10);
  const noiseStd = Math.sqrt(sigPower / snrLinear);

  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = sClean[i] + noiseStd * gaussianNoise();
  return s;
}

// Filtro de media móvil — actúa como un filtro pasa-bajos sencillo
function movingAverage(x, windowSize) {
  const n = x.length;
  const y = new Float64Array(n);
  const w = Math.max(1, windowSize);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += x[i];
    if (i >= w) acc -= x[i - w];
    y[i] = acc / Math.min(i + 1, w);
  }
  return y;
}

/**
 * Detector de envolvente: reconstruye (demodula) el mensaje a partir de s(t),
 * imitando el receptor AM más simple que existe (diodo rectificador + filtro
 * pasa-bajos).
 */
function envelopeDetect(s, fs, fc) {
  const n = s.length;
  const rectified = new Float64Array(n);
  for (let i = 0; i < n; i++) rectified[i] = Math.abs(s[i]);

  const windowSize = Math.max(3, Math.round((3 * fs) / fc));
  const smoothed = movingAverage(rectified, windowSize);

  let mean = 0;
  for (let i = 0; i < n; i++) mean += smoothed[i];
  mean /= n;

  const recovered = new Float64Array(n);
  let maxAbs = 1e-9;
  for (let i = 0; i < n; i++) {
    recovered[i] = smoothed[i] - mean;
    if (Math.abs(recovered[i]) > maxAbs) maxAbs = Math.abs(recovered[i]);
  }
  for (let i = 0; i < n; i++) recovered[i] /= maxAbs;
  return recovered;
}

// Calcula el espectro de potencia en dB de cualquier señal (ventana de Hann + FFT + fftshift)
function computeSpectrum(signal, fs) {
  const n = signal.length;
  let size = 1;
  while (size < n) size *= 2;

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = signal[i] * w;
  }
  fft(re, im);

  const eps = 1e-9;
  const magDbRaw = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / size;
    magDbRaw[i] = 20 * Math.log10(mag + eps);
  }

  const freq = new Float64Array(size);
  const magDb = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const shiftedIndex = (i + size / 2) % size;
    freq[i] = ((i - size / 2) * fs) / size;
    magDb[i] = magDbRaw[shiftedIndex];
  }
  return { freq, magDb };
}

/**
 * Orquestador: arma el paquete completo de datos que necesitan las gráficas,
 * a partir de un arreglo de mensaje m[] (tono sintético o fragmento de audio real).
 */
function buildSignalPackage(m, fs, fc, mu, snrDb) {
  const n = m.length;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i / fs;

  const s = modulate(m, fs, fc, mu, snrDb);
  const recovered = envelopeDetect(s, fs, fc);
  const { freq, magDb } = computeSpectrum(s, fs);

  return { t, m, s, recovered, freq, magDb, fs, fc, mu, snrDb };
}
