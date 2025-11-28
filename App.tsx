
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Scene from './components/Scene';
import { TreeState, TreeMode, PhotoData } from './types';
import { Zap, X, Image as ImageIcon } from 'lucide-react';
import { useDrag } from '@use-gesture/react';
import GestureControl from './components/GestureControl';

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>({
    mode: TreeMode.FORMED,
    rotationSpeed: 0.5,
    lightIntensity: 2.5,
    showGoldDust: true,
  });

  const [activePhoto, setActivePhoto] = useState<PhotoData | null>(null);
  const [imgError, setImgError] = useState(false);

  // Reset image error state when active photo changes
  useEffect(() => {
    setImgError(false);
  }, [activePhoto]);

  // Unified Physics State Ref
  const physicsRef = useRef({
      isInteracting: false,
      delta: 0,
      velocity: 0,
      zoomDelta: 0, // Added for Zoom physics
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse/Touch Drag Interaction
  useDrag(({ delta: [dx], down, movement: [mx] }) => {
    physicsRef.current.isInteracting = down;
    if (down) {
        // Sensitivity for mouse
        const mouseSensitivity = 0.005; 
        physicsRef.current.delta = dx * mouseSensitivity;
        physicsRef.current.velocity = dx * mouseSensitivity; 
    } else {
        physicsRef.current.delta = 0;
    }
  }, {
    target: containerRef,
  });

  const toggleMode = useCallback(() => {
      setTreeState(prev => ({
          ...prev,
          mode: prev.mode === TreeMode.FORMED ? TreeMode.CHAOS : TreeMode.FORMED
      }));
  }, []);

  // Handlers for AI Gesture Control
  const handleGestureModeChange = useCallback((mode: TreeMode) => {
      setTreeState(prev => {
          if (prev.mode === mode) return prev;
          return { ...prev, mode };
      });
  }, []);

  const handleGestureInteractionStart = useCallback(() => {
      physicsRef.current.isInteracting = true;
      physicsRef.current.velocity = 0; 
  }, []);

  const handleGestureInteractionEnd = useCallback(() => {
      physicsRef.current.isInteracting = false;
      physicsRef.current.delta = 0;
      physicsRef.current.zoomDelta = 0;
  }, []);

  const handleGestureRotationMove = useCallback((rawDelta: number) => {
      const sensitivity = 8.0; 
      const finalDelta = -rawDelta * sensitivity;
      physicsRef.current.delta = finalDelta;
      physicsRef.current.velocity = finalDelta;
  }, []);

  const handleGestureZoomMove = useCallback((scaleDelta: number) => {
      // scaleDelta > 0: Hand getting BIGGER (Moving Closer to screen) -> We want Zoom IN.
      // scaleDelta < 0: Hand getting SMALLER (Moving Away from screen) -> We want Zoom OUT.
      
      // In Scene.tsx, the logic is: cam.position.addScaledVector(direction, -zoomD);
      // To move Closer (Zoom In), addScaledVector should add a positive vector.
      // So -zoomD must be positive. Therefore zoomD must be negative.
      
      // So: If scaleDelta is POSITIVE, zoomD should be NEGATIVE.
      // scaleDelta is usually very small (e.g. 0.005), so we need high sensitivity.
      
      const sensitivity = 80.0;
      physicsRef.current.zoomDelta = -scaleDelta * sensitivity;
  }, []);

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-screen bg-black overflow-hidden touch-none"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0f2e1e] via-[#05140a] to-[#000000] -z-10" />

      {/* 3D Scene */}
      <div className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing">
        <Scene 
            treeState={treeState} 
            physicsRef={physicsRef} 
            onPhotoClick={setActivePhoto}
        />
      </div>

      {/* AI Gesture Control Overlay (Bottom Right) */}
      <GestureControl 
         onModeChange={handleGestureModeChange}
         onRotationMove={handleGestureRotationMove}
         onZoomMove={handleGestureZoomMove}
         onInteractionStart={handleGestureInteractionStart}
         onInteractionEnd={handleGestureInteractionEnd}
      />

      {/* Control Panel - Positioned Bottom Left, Stacked above Camera */}
      <div className="absolute bottom-4 left-4 z-20">
         <div className="backdrop-blur-xl bg-black/50 border border-[#FFD700]/30 px-6 py-4 rounded-2xl flex flex-col gap-4 items-start shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            
            {/* Chaos Toggle */}
            <button 
                onClick={toggleMode}
                className={`flex items-center gap-3 w-full transition-all hover:bg-white/5 p-2 rounded-lg ${treeState.mode === TreeMode.CHAOS ? 'text-red-500' : 'text-[#FFD700]'}`}
            >
                <Zap size={20} className={treeState.mode === TreeMode.CHAOS ? "animate-pulse" : ""} fill={treeState.mode === TreeMode.CHAOS ? "currentColor" : "none"} />
                <span className="text-[10px] tracking-widest font-serif font-bold">{treeState.mode === TreeMode.CHAOS ? 'EXPLODE' : 'FORM'}</span>
            </button>

            <div className="w-full h-px bg-white/20" />

            {/* Slider */}
             <div className="flex flex-col items-start gap-2 w-full">
                 <span className="text-[10px] text-[#e0e0e0] tracking-widest font-serif">SPEED</span>
                 <input 
                    type="range" min="0" max="2" step="0.1" 
                    value={treeState.rotationSpeed}
                    onChange={(e) => setTreeState({...treeState, rotationSpeed: parseFloat(e.target.value)})}
                    className="w-32 accent-[#FFD700] h-1"
                 />
             </div>
         </div>
      </div>

      {/* Photo Modal Overlay */}
      {activePhoto && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => setActivePhoto(null)}>
              <div 
                className="relative bg-white p-4 max-w-sm w-full shadow-2xl rotate-1 transform transition-transform"
                onClick={(e) => e.stopPropagation()} 
              >
                  <div className="aspect-[4/5] w-full bg-gray-200 mb-4 overflow-hidden relative flex items-center justify-center">
                      {activePhoto.url && !imgError ? (
                          <img 
                            src={activePhoto.url} 
                            alt="Memory" 
                            className="w-full h-full object-cover"
                            onError={() => setImgError(true)}
                          />
                      ) : (
                          <>
                            <div className="absolute inset-0" style={{ backgroundColor: activePhoto.color }} />
                            <div className="absolute inset-0 flex items-center justify-center opacity-20">
                                <ImageIcon size={64} />
                            </div>
                          </>
                      )}
                  </div>
                  
                  <button 
                    onClick={() => setActivePhoto(null)}
                    className="absolute -top-4 -right-4 bg-black text-[#FFD700] rounded-full p-2 border border-[#FFD700] hover:scale-110 transition-transform"
                  >
                      <X size={20} />
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
