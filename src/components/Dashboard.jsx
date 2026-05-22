import React, { useState, useEffect, useRef } from 'react';
import { calculateNorm, findPeaks, smoothSignal } from '../utils/signalProcessing';
import { Activity, Play, Square, Settings, RefreshCw, Download, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const MIN_DISTANCE = 3; // ~300ms if 10Hz, depend on sample rate

export default function Dashboard() {
  const [isTracking, setIsTracking] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState(13.0);
  
  const rawDataRef = useRef([]);
  const sessionDataRef = useRef([]); // Stocke toute la session pour l'export
  const lastProcessTimeRef = useRef(0);
  const lastPeakTimeRef = useRef(0); // Pour ne pas recompter les mêmes pas

  // Demande d'autorisation pour iOS 13+
  const requestPermission = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceMotionEvent.requestPermission();
        if (permissionState === 'granted') {
          setPermissionGranted(true);
          startTracking();
        } else {
          setError('Permission refusée pour accéder aux capteurs.');
        }
      } catch (err) {
        console.error(err);
        setError('Erreur lors de la demande de permission.');
      }
    } else {
      // Android / anciens iOS ne nécessitent pas de demande explicite
      setPermissionGranted(true);
      startTracking();
    }
  };

  const startTracking = () => {
    setIsTracking(true);
    setStepCount(0);
    setChartData([]);
    rawDataRef.current = [];
    sessionDataRef.current = [];
    lastPeakTimeRef.current = 0;
    window.addEventListener('devicemotion', handleMotion);
  };

  const stopTracking = () => {
    setIsTracking(false);
    window.removeEventListener('devicemotion', handleMotion);
    // On s'assure que la simulation s'arrête bien aussi
    if (window.simulationInterval) {
      clearInterval(window.simulationInterval);
      window.simulationInterval = null;
    }
  };

  const handleMotion = (event) => {
    const { accelerationIncludingGravity } = event;
    if (!accelerationIncludingGravity) return;

    // Récupérer x,y,z (0 si null)
    const x = accelerationIncludingGravity.x || 0;
    const y = accelerationIncludingGravity.y || 0;
    const z = accelerationIncludingGravity.z || 0;

    const norm = calculateNorm(x, y, z);
    const now = Date.now();
    
    rawDataRef.current.push({ time: now, norm });
    sessionDataRef.current.push({ time: now, x, y, z, norm }); // Historique complet
    
    // Garder seulement les 5 dernières secondes (environ 50-100 échantillons)
    if (rawDataRef.current.length > 200) {
      rawDataRef.current.shift();
    }

    // Traitement toutes les 200ms pour éviter de surcharger le thread UI
    if (now - lastProcessTimeRef.current > 200) {
      lastProcessTimeRef.current = now;
      processData();
    }
  };

  const processData = () => {
    const data = rawDataRef.current;
    if (data.length < 10) return;

    const norms = data.map(d => d.norm);
    const smoothedNorms = smoothSignal(norms, 3);
    
    // Détection de pas sur les données lissées
    const peaks = findPeaks(smoothedNorms, threshold, MIN_DISTANCE);
    
    // Comptabiliser les nouveaux pas
    let newSteps = 0;
    peaks.forEach(peak => {
      const peakTime = data[peak.index].time;
      if (peakTime > lastPeakTimeRef.current) {
        newSteps++;
        lastPeakTimeRef.current = peakTime;
      }
    });

    if (newSteps > 0) {
      setStepCount(prev => prev + newSteps);
    }
    
    // Construire les données pour le graphique (les 50 derniers points)
    const displayData = data.slice(-50).map((d, index) => {
      const smoothedVal = smoothedNorms[smoothedNorms.length - 50 + index] || d.norm;
      return {
        time: index,
        norm: smoothedVal,
      };
    });

    setChartData(displayData);
  };

  // Simulation pour tester sur PC
  const toggleSimulation = () => {
    if (isTracking) {
      stopTracking();
      return;
    }
    
    setIsTracking(true);
    setChartData([]);
    sessionDataRef.current = [];
    let simulatedSteps = 0;
    let t = 0;
    
    window.simulationInterval = setInterval(() => {
      t += 0.1;
      const baseGravity = 9.81;
      const stepImpact = Math.sin(t * 4) > 0.8 ? Math.random() * 5 + 4 : 0;
      const noise = (Math.random() - 0.5) * 2;
      const norm = baseGravity + stepImpact + noise;
      
      const now = Date.now();
      sessionDataRef.current.push({ time: now, norm });
      
      setChartData(prev => {
        const newData = [...prev, { time: t.toFixed(1), norm }];
        if (newData.length > 50) newData.shift();
        return newData;
      });
      
      if (norm >= threshold && Math.sin((t-0.1) * 4) <= 0.8) {
        simulatedSteps++;
        setStepCount(simulatedSteps);
      }
    }, 100);
  };
  
  // Fonction d'exportation CSV
  const exportData = () => {
    if (sessionDataRef.current.length === 0) {
      alert("Aucune donnée à exporter. Enregistrez d'abord une session.");
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,Norme (m/s²)\n";
    
    sessionDataRef.current.forEach(row => {
      csvContent += `${row.time},${row.norm.toFixed(4)}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pedotrack_session_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    return () => {
      if (window.simulationInterval) clearInterval(window.simulationInterval);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      
      {/* Modal Paramètres */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl border border-surface-hover"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Paramètres</h2>
                <button onClick={() => setShowSettings(false)} className="text-text-muted hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Seuil de détection des pas (m/s²)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    value={threshold} 
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 13.0)}
                    className="w-full bg-surface-hover border border-surface-hover rounded-lg px-4 py-3 text-white outline-none focus:border-primary transition-colors font-mono"
                  />
                  <p className="text-xs text-text-muted mt-2">Défaut: 13.0. Baissez cette valeur si l'application rate des pas, augmentez-la si elle compte des "faux" pas.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-3xl space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text flex items-center gap-2">
              <Activity className="text-primary" size={32} />
              PedoTrack
            </h1>
            <p className="text-text-muted mt-1">Analyse des dynamiques de course</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={exportData}
              title="Exporter les données (CSV)"
              className="p-2.5 rounded-full bg-surface hover:bg-surface-hover text-text-muted hover:text-primary transition-colors border border-surface-hover shadow-sm"
            >
              <Download size={22} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-full bg-surface hover:bg-surface-hover text-text-muted hover:text-white transition-colors border border-surface-hover shadow-sm"
            >
              <Settings size={22} />
            </button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={16}/></button>
          </div>
        )}

        {/* Main Stats Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-surface-hover relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-purple-500 to-pink-500"></div>
          
          <div className="flex flex-col items-center justify-center py-6">
            <span className="text-text-muted font-medium mb-2 tracking-[0.2em] uppercase text-xs">Pas Détectés</span>
            
            <div className="flex items-baseline gap-2">
              <AnimatePresence mode="popLayout">
                <motion.span 
                  key={stepCount}
                  initial={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                  className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-text-muted drop-shadow-sm"
                >
                  {stepCount}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4 mt-6">
            {!isTracking ? (
              <button 
                onClick={requestPermission}
                className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white px-8 py-3.5 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(167,139,250,0.6)] hover:-translate-y-1"
              >
                <Play size={20} fill="currentColor" />
                Démarrer
              </button>
            ) : (
              <button 
                onClick={stopTracking}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white px-8 py-3.5 rounded-full font-bold transition-all shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:shadow-[0_0_30px_rgba(248,113,113,0.6)] hover:-translate-y-1"
              >
                <Square size={20} fill="currentColor" />
                Arrêter
              </button>
            )}
            
            {/* Bouton de simulation pour test sur PC */}
            <button 
              onClick={toggleSimulation}
              title="Simuler un capteur (Pratique sur PC)"
              className={`flex items-center justify-center w-14 h-14 rounded-full font-semibold transition-all border ${isTracking && !window.simulationInterval ? 'opacity-30 cursor-not-allowed' : ''} ${window.simulationInterval ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'border-surface-hover bg-surface hover:bg-surface-hover text-text-muted'}`}
              disabled={isTracking && !window.simulationInterval}
            >
              <RefreshCw size={22} className={window.simulationInterval ? 'animate-spin' : ''} />
            </button>
          </div>
        </motion.div>

        {/* Real-time Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface rounded-3xl p-6 shadow-xl border border-surface-hover"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white">Accélération Globale</h2>
            <div className="flex items-center gap-2 bg-surface-hover px-3 py-1.5 rounded-full border border-border/50">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></div>
              <span className="text-xs font-medium text-text-muted">En direct</span>
            </div>
          </div>
          
          {/* Chart Container avec un style "Glass" et Glow */}
          <div className="h-72 w-full bg-[#0b1121] rounded-2xl border border-primary/20 p-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Glow background effect */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-primary/10 blur-[50px] rounded-full pointer-events-none"></div>
            
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNorm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide={true} />
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', color: '#fff', backdropFilter: 'blur(8px)' }}
                  itemStyle={{ color: '#c4b5fd', fontWeight: 'bold' }}
                  formatter={(value) => [`${parseFloat(value).toFixed(2)} m/s²`, 'Accélération']}
                  labelStyle={{ display: 'none' }}
                />
                <ReferenceLine y={threshold} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Seuil Pas', fill: '#fbbf24', fontSize: 12, fontWeight: 600 }} />
                <Area 
                  type="monotone" 
                  dataKey="norm" 
                  stroke="#c4b5fd" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorNorm)" 
                  filter="url(#glow)"
                  isAnimationActive={false} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
