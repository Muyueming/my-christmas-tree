
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils } from '@mediapipe/tasks-vision';
import { TreeMode } from '../types';
import { Camera } from 'lucide-react';

interface GestureControlProps {
  onModeChange: (mode: TreeMode) => void;
  onRotationMove: (deltaX: number) => void;
  onZoomMove: (deltaScale: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

// Geometric helper to calculate distance between two landmarks
const getDist = (p1: any, p2: any) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

// Heuristic check: Is the hand physically open? 
// Updated to be more permissive for Side Views and Zooming angles
const isHandExtended = (landmarks: any[]) => {
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
  const pips = [6, 10, 14, 18];
  
  let extendedCount = 0;
  
  for (let i = 0; i < 4; i++) {
    const dTip = getDist(wrist, landmarks[tips[i]]);
    const dPip = getDist(wrist, landmarks[pips[i]]);
    
    // RELAXED THRESHOLD:
    // Previously 1.5. Now 1.1.
    // This means if the tip is just slightly further from wrist than the middle joint, it's open.
    // This helps significantly with side views and foreshortening when pointing at camera.
    if (dTip > dPip * 1.1) {
      extendedCount++;
    }
  }
  
  // RELAXED COUNT:
  // Only require 2 fingers (e.g. Index & Middle) to be extended.
  // Helps when Ring/Pinky are hidden in side view.
  return extendedCount >= 2;
};

// Heuristic check: Is it a fist?
const isHandClosed = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];

    let curledCount = 0;
    for(let i=0; i<4; i++) {
        const dTip = getDist(wrist, landmarks[tips[i]]);
        const dPip = getDist(wrist, landmarks[pips[i]]);
        
        // Tip must be closer to wrist than PIP (Standard geometric definition of curled)
        if (dTip < dPip) curledCount++; 
    }
    // Fist requires more fingers to be curled to avoid false positives during transition
    return curledCount >= 3;
}

const GestureControl: React.FC<GestureControlProps> = ({ 
    onModeChange, 
    onRotationMove, 
    onZoomMove,
    onInteractionStart, 
    onInteractionEnd 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number>(0);
  
  const lastWristX = useRef<number | null>(null);
  const lastHandSize = useRef<number | null>(null);
  
  const smoothedRotDelta = useRef<number>(0);
  const smoothedZoomDelta = useRef<number>(0);
  
  const wasTracking = useRef<boolean>(false);

  useEffect(() => {
    let recognizer: GestureRecognizer | null = null;
    let isActive = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        if (!isActive) return;

        recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        if (!isActive) {
            recognizer.close();
            return;
        }
        
        gestureRecognizerRef.current = recognizer;
        setIsLoaded(true);
        if (isActive) startWebcam();
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
        if (isActive) setError("Failed to load gesture AI");
      }
    };

    setupMediaPipe();

    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
         videoRef.current.srcObject = null;
      }

      if (gestureRecognizerRef.current) {
          gestureRecognizerRef.current.close();
          gestureRecognizerRef.current = null;
      }
    };
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setError("Camera access denied");
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const recognizer = gestureRecognizerRef.current;

    if (!video || !canvas || !recognizer) return;

    if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nowInMs = Date.now();
    let results;
    try {
        results = recognizer.recognizeForVideo(video, nowInMs);
    } catch (e) {
        console.warn("Gesture inference error", e);
        requestRef.current = requestAnimationFrame(predictWebcam);
        return;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const drawingUtils = new DrawingUtils(ctx);
      const landmarks = results.landmarks[0];
      const wrist = landmarks[0];
      const middleMCP = landmarks[9];

      // Calculate Hand Size (Distance from Wrist to Middle Finger Base)
      // This part of the hand is rigid (bone), so it's a stable metric for distance.
      const handSize = getDist(wrist, middleMCP);
      
      if (!wasTracking.current) {
          onInteractionStart();
          wasTracking.current = true;
          smoothedRotDelta.current = 0; 
          smoothedZoomDelta.current = 0;
          lastWristX.current = wrist.x;
          lastHandSize.current = handSize;
      }

      // Draw Hand
      drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: "#FFD700",
        lineWidth: 3
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#059669",
        lineWidth: 2,
        radius: 3
      });

      // --- GESTURE LOGIC ---
      let detectedAction = "";
      
      const closed = isHandClosed(landmarks);
      const open = isHandExtended(landmarks);

      // PRIORITY: FIST (GATHER) vs OPEN (EXPLODE)
      // Logic runs every frame to allow continuous state enforcement
      if (closed && !open) {
         onModeChange(TreeMode.FORMED);
         detectedAction = "FIST (GATHER)";
      } else if (open) {
         onModeChange(TreeMode.CHAOS);
         detectedAction = "OPEN (EXPLODE)";
      }

      if (detectedAction) {
         ctx.fillStyle = "#FFD700";
         ctx.font = "bold 20px serif";
         ctx.shadowColor = "black";
         ctx.shadowBlur = 4;
         ctx.fillText(detectedAction, 10, 30);
      }

      // --- CONTINUOUS CONTROL (ROTATE & ZOOM) ---
      // These run *independently* of the Open/Fist state check above,
      // allowing simultaneous State Change + Move + Zoom.
      
      // 1. Rotation (X-Axis)
      if (lastWristX.current !== null) {
          const rawDeltaX = wrist.x - lastWristX.current;
          // Deadzone 0.005 to filter jitter
          const effectiveDelta = Math.abs(rawDeltaX) > 0.005 ? rawDeltaX : 0;
          
          // Smooth decay if stopped, Smooth attack if moving
          const alpha = effectiveDelta === 0 ? 0.9 : 0.1;
          smoothedRotDelta.current = (smoothedRotDelta.current * alpha) + (effectiveDelta * (1 - alpha));

          if (Math.abs(smoothedRotDelta.current) > 0.0001) {
             onRotationMove(smoothedRotDelta.current);
          }
      }

      // 2. Zoom (Hand Scale / Proximity)
      if (lastHandSize.current !== null) {
          const deltaSize = handSize - lastHandSize.current;
          // Deadzone 0.01 (1% change) to filter breathing/shaking
          const effectiveDelta = Math.abs(deltaSize) > 0.01 ? deltaSize : 0;
          
          // Heavy smoothing for Zoom to prevent nausea
          // Alpha 0.95 means we keep 95% of previous velocity -> very floaty/smooth
          const alpha = effectiveDelta === 0 ? 0.95 : 0.05; 
          smoothedZoomDelta.current = (smoothedZoomDelta.current * 0.9) + (effectiveDelta * 0.1);
          
          if (Math.abs(smoothedZoomDelta.current) > 0.0001) {
              onZoomMove(smoothedZoomDelta.current);
          }
      }

      lastWristX.current = wrist.x;
      lastHandSize.current = handSize;

    } else {
        // Hand lost
        if (wasTracking.current) {
            onInteractionEnd();
            wasTracking.current = false;
        }
        lastWristX.current = null;
        lastHandSize.current = null;
        smoothedRotDelta.current = 0;
        smoothedZoomDelta.current = 0;
    }

    ctx.restore();
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end pointer-events-none">
       <div className="relative w-32 h-24 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.3)] bg-black/50 backdrop-blur-md">
           {!isLoaded && !error && (
               <div className="absolute inset-0 flex items-center justify-center text-[#FFD700] text-xs">
                   LOADING AI...
               </div>
           )}
           {error && (
               <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs text-center p-2">
                   {error}
               </div>
           )}
           
           <video 
             ref={videoRef} 
             autoPlay 
             playsInline 
             muted
             className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
           />
           <canvas 
             ref={canvasRef} 
             className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
           />
           
           <div className="absolute bottom-1 right-1 bg-black/60 px-2 py-0.5 rounded text-[8px] text-[#FFD700] font-serif tracking-widest flex items-center gap-1">
              <Camera size={8} /> AI VISION
           </div>
       </div>
    </div>
  );
};

export default GestureControl;
