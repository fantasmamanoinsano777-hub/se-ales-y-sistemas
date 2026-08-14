// math.js — Motor matemático: generación de señales AM y FFT

const Fs = 10000;   // Frecuencia de muestreo (Hz)
const N  = 2048;    // Número de muestras (potencia de 2, requerido por la FFT)
const Ac = 1;       // Amplitud de la portadora (V)

/**
 * FFT recursiva radix-2 (Cooley-Tukey).
 * Recibe arreglos separados de parte real e imaginaria y los transforma in-place
 * mediante una implementación recursiva simple (N debe ser potencia de 2).
 */
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  // Separar en muestras pares e impares
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
    // Multiplicación compleja: (cos + j sin) * (oddRe + j oddIm)
    const tRe = cos * oddRe[k] - sin * oddIm[k];
    const tIm = sin * oddRe[k] + cos * oddIm[k];

    re[k]         = evenRe[k] + tRe;
    im[k]         = evenIm[k] + tIm;
    re[k + n / 2] = evenRe[k] - tRe;
    im[k + n / 2] = evenIm[k] - tIm;
  }
}

// Genera ruido blanco gaussiano (AWGN) mediante transformación Box-Muller
function gaussianNoise() {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Genera las señales del sistema AM (DSB-FC, doble banda lateral con portadora completa):
 *   m(t)  = cos(2π f_m t)                                  → mensaje / voz
 *   s(t)  = Ac · [1 + μ·m(t)] · cos(2π f_c t) + ruido       → señal AM transmitida
 * y calcula su espectro de potencia vía FFT.
 */
function generateSignals(fm, fc, mu, snrDb) {
  const t = new Float64Array(N);
  const m = new Float64Array(N);
  const sClean = new Float64Array(N);
  const s = new Float64Array(N);

  let sigPower = 0;
  for (let i = 0; i < N; i++) {
    t[i] = i / Fs;
    m[i] = Math.cos(2 * Math.PI * fm * t[i]);
    // Envolvente AM: Ac·[1 + μ·cos(2π fm t)]·cos(2π fc t)
    sClean[i] = Ac * (1 + mu * m[i]) * Math.cos(2 * Math.PI * fc * t[i]);
    sigPower += sClean[i] * sClean[i];
  }
  sigPower /= N;

  // Escalar el ruido gaussiano para lograr el SNR (en dB) solicitado
  const snrLinear = Math.pow(10, snrDb / 10);
  const noisePower = sigPower / snrLinear;
  const noiseStd = Math.sqrt(noisePower);

  for (let i = 0; i < N; i++) {
    s[i] = sClean[i] + noiseStd * gaussianNoise();
  }

  // --- FFT del espectro con ventana de Hann (reduce fugas espectrales) ---
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); // ventana Hann
    re[i] = s[i] * w;
  }
  fft(re, im);

  // Magnitud → dB:  20·log10(|S(f)| + ε)
  const eps = 1e-9;
  const magDbRaw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
    magDbRaw[i] = 20 * Math.log10(mag + eps);
  }

  // fftshift: reordenar para que el eje de frecuencias vaya de -Fs/2 a +Fs/2
  const freq = new Float64Array(N);
  const magDb = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const shiftedIndex = (i + N / 2) % N;
    freq[i] = ((i - N / 2) * Fs) / N;
    magDb[i] = magDbRaw[shiftedIndex];
  }

  return { t, m, sClean, s, freq, magDb, fm, fc, mu, snrDb };
}