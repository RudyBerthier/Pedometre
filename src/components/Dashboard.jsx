import React, { useState, useEffect, useRef } from 'react';
import { calculateNorm, findPeaks, smoothSignal } from '../utils/signalProcessing';
import { Activity, Play, Square, Settings, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const THRESHOLD = 13.0; // Seuil utilisé dans le script python
const MIN_DISTANCE = 3; // ~300ms if 10Hz, depend on sample rate

export default function Dashboard() {
  const [isTracking, setIsTracking] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  
  const rawDataRef = useRef([]);
  const lastProcessTimeRef = useRef(0);

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
    window.addEventListener('devicemotion', handleMotion);
  };

  const stopTracking = () => {
    setIsTracking(false);
    window.removeEventListener('devicemotion', handleMotion);
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
    
    // Garder seulement les 5 dernières secondes (environ 50-100 échantillons selon la fréquence)
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
    const peaks = findPeaks(smoothedNorms, THRESHOLD, MIN_DISTANCE);
    
    // Dans une vraie application temps réel, il faudrait une logique plus complexe
    // pour ne pas recompter les mêmes pas. 
    // Ici, on va simplifier pour la démo: on compte juste les pics dans la fenêtre actuelle.
    // Une meilleure approche est de garder le dernier pic analysé en mémoire.
    // Pour la robustesse immédiate du prototype, affichons la dynamique:
    
    // Construire les données pour le graphique (les 50 derniers points)
    const displayData = data.slice(-50).map((d, index) => {
      const smoothedVal = smoothedNorms[smoothedNorms.length - 50 + index] || d.norm;
      return {
        time: index,
        norm: smoothedVal,
      };
    });

    setChartData(displayData);
    
    // Mise à jour simpliste des pas (dans un cas réel, on incrémente au moment du pic)
    // Ici on fait une démo visuelle
  };

  // Simulation pour tester sur PC
  const toggleSimulation = () => {
    if (isTracking) {
      stopTracking();
      return;
    }
    
    setIsTracking(true);
    setChartData([]);
    let simulatedSteps = 0;
    let t = 0;
    
    window.simulationInterval = setInterval(() => {
      t += 0.1;
      // Générer une onde avec des pics de temps en temps
      const baseGravity = 9.81;
      const stepImpact = Math.sin(t * 4) > 0.8 ? Math.random() * 5 + 4 : 0; // Impact ~14 quand > 13
      const noise = (Math.random() - 0.5) * 2;
      const norm = baseGravity + stepImpact + noise;
      
      setChartData(prev => {
        const newData = [...prev, { time: t.toFixed(1), norm }];
        if (newData.length > 50) newData.shift();
        return newData;
      });
      
      if (norm >= THRESHOLD && Math.sin((t-0.1) * 4) <= 0.8) {
        simulatedSteps++;
        setStepCount(simulatedSteps);
      }
    }, 100);
  };
  
  useEffect(() => {
    return () => {
      if (window.simulationInterval) clearInterval(window.simulationInterval);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []);

  return (
    <div className="min-h-screen bg-surface p-4 md:p-8 flex flex-col items-center">
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
          <button className="p-2 rounded-full bg-surface-hover text-text-muted hover:text-white transition-colors">
            <Settings size={24} />
          </button>
        </header>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Main Stats Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-hover rounded-3xl p-8 shadow-xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-400"></div>
          
          <div className="flex flex-col items-center justify-center py-6">
            <span className="text-text-muted font-medium mb-2 tracking-wide uppercase text-sm">Pas Détectés</span>
            
            <div className="flex items-baseline gap-2">
              <AnimatePresence mode="popLayout">
                <motion.span 
                  key={stepCount}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-text-muted"
                >
                  {stepCount}
                </motion.span>
              </AnimatePresence>
              <span className="text-primary-light font-semibold">pas</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4 mt-6">
            {!isTracking ? (
              <button 
                onClick={requestPermission}
                className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white px-8 py-3 rounded-full font-semibold transition-all shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:scale-105"
              >
                <Play size={20} fill="currentColor" />
                Démarrer (Capteurs)
              </button>
            ) : (
              <button 
                onClick={stopTracking}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white px-8 py-3 rounded-full font-semibold transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:scale-105"
              >
                <Square size={20} fill="currentColor" />
                Arrêter
              </button>
            )}
            
            {/* Bouton de simulation pour test sur PC */}
            <button 
              onClick={toggleSimulation}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all border ${isTracking && !window.simulationInterval ? 'opacity-50 cursor-not-allowed' : ''} ${window.simulationInterval ? 'bg-orange-500 border-orange-500 text-white' : 'border-surface bg-transparent hover:bg-surface text-text-muted'}`}
              disabled={isTracking && !window.simulationInterval}
            >
              <RefreshCw size={20} className={window.simulationInterval ? 'animate-spin' : ''} />
              {window.simulationInterval ? 'Stop Sim' : 'Simuler'}
            </button>
          </div>
        </motion.div>

        {/* Real-time Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-hover rounded-3xl p-6 shadow-xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-text">Accélération Globale (m.s⁻²)</h2>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
              <span className="text-sm text-text-muted">En direct</span>
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNorm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e303a" vertical={false} />
                <XAxis dataKey="time" hide={true} />
                <YAxis domain={['auto', 'auto']} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#a78bfa' }}
                  formatter={(value) => [`${parseFloat(value).toFixed(2)} m/s²`, 'Accélération']}
                />
                <ReferenceLine y={THRESHOLD} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Seuil Pas', fill: '#f59e0b', fontSize: 12 }} />
                <Area 
                  type="monotone" 
                  dataKey="norm" 
                  stroke="var(--color-primary)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorNorm)" 
                  isAnimationActive={false} // Désactivé pour la fluidité temps réel
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
