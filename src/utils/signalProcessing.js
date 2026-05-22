/**
 * Calcule la norme (magnitude globale) d'un vecteur 3D
 */
export const calculateNorm = (x, y, z) => {
  return Math.sqrt(x * x + y * y + z * z);
};

/**
 * Lisse un signal avec une moyenne mobile simple
 */
export const smoothSignal = (signal, windowSize = 5) => {
  if (signal.length < windowSize) return signal;
  
  const smoothed = [];
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    
    // Fenêtre centrée
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(signal.length - 1, i + Math.floor(windowSize / 2));
    
    for (let j = start; j <= end; j++) {
      sum += signal[j];
      count++;
    }
    
    smoothed.push(sum / count);
  }
  return smoothed;
};

/**
 * Détection de pics (équivalent simplifié de scipy.signal.find_peaks)
 * @param {number[]} data - Tableau de données (accélération globale)
 * @param {number} threshold - Seuil minimum (ex: 13.0)
 * @param {number} minDistance - Distance minimum entre deux pics (en indices)
 */
export const findPeaks = (data, threshold, minDistance) => {
  const peaks = [];
  
  for (let i = 1; i < data.length - 1; i++) {
    const current = data[i];
    
    // Doit être supérieur au seuil
    if (current < threshold) continue;
    
    // Doit être un maximum local
    if (current > data[i - 1] && current > data[i + 1]) {
      
      // Vérifier la distance avec le dernier pic détecté
      if (peaks.length === 0 || (i - peaks[peaks.length - 1].index) >= minDistance) {
        peaks.push({ index: i, value: current });
      } else if (peaks.length > 0 && (i - peaks[peaks.length - 1].index) < minDistance) {
        // Si trop proche, on garde le plus grand des deux pics
        if (current > peaks[peaks.length - 1].value) {
          peaks[peaks.length - 1] = { index: i, value: current };
        }
      }
    }
  }
  
  return peaks;
};
