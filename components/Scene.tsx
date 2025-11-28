
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import LuxuryTree from './LuxuryTree';
import GoldDust from './GoldDust';
import { TreeState, PhotoData } from '../types';

interface SceneProps {
  treeState: TreeState;
  physicsRef: React.MutableRefObject<{ isInteracting: boolean, delta: number, velocity: number, zoomDelta: number }>;
  onPhotoClick: (photo: PhotoData) => void;
}

// Helper component to handle physics updates inside Canvas context
const PhysicsHandler: React.FC<{ physicsRef: SceneProps['physicsRef'] }> = ({ physicsRef }) => {
    useFrame((state) => {
        const cam = state.camera;
        const zoomD = physicsRef.current.zoomDelta;
        
        // Apply Zoom Physics (Dolly)
        // If zoomD < 0 (Hand Up), we want to zoom IN (move closer to target)
        // If zoomD > 0 (Hand Down), we want to zoom OUT (move away from target)
        if (Math.abs(zoomD) > 0.0001) {
            const direction = new THREE.Vector3();
            cam.getWorldDirection(direction); // Normalized vector pointing AT the target
            
            // Move camera along the view vector
            // Scale by -zoomD because:
            // if zoomD is negative (Up), -zoomD is positive. Adding positive direction moves closer.
            cam.position.addScaledVector(direction, -zoomD);
            
            // Consume the delta
            physicsRef.current.zoomDelta = 0;
        }
    });
    return null;
}

const Scene: React.FC<SceneProps> = ({ treeState, physicsRef, onPhotoClick }) => {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 4, 18], fov: 42 }} 
      gl={{ antialias: false, toneMappingExposure: 1.2 }} 
    >
      <PhysicsHandler physicsRef={physicsRef} />

      <Environment preset="city" blur={0.8} background={false} />
      
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />

      <ambientLight intensity={0.5} color="#cceeff" />
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.25} 
        penumbra={1} 
        intensity={200} 
        castShadow 
        shadow-bias={-0.0001}
        color="#fff0d0" 
      />
      <pointLight position={[-5, 2, 5]} intensity={50} color="#FFD700" distance={15} />
      <pointLight position={[5, -2, -5]} intensity={30} color="#ff4400" distance={15} />

      {/* Main Object */}
      <LuxuryTree 
        treeState={treeState}
        physicsState={physicsRef}
        onPhotoClick={onPhotoClick}
      />

      {/* Effects */}
      {treeState.showGoldDust && <GoldDust />}

      <ContactShadows 
        resolution={1024} 
        scale={30} 
        blur={2} 
        opacity={0.5} 
        far={10} 
        color="#000000" 
      />

      {/* Post Processing */}
      <EffectComposer disableNormalPass>
        <Bloom 
            luminanceThreshold={0.85} 
            mipmapBlur 
            intensity={1.5} 
            radius={0.4}
        />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
        <Noise opacity={0.015} />
      </EffectComposer>

      <OrbitControls 
        minPolarAngle={Math.PI / 3.5} 
        maxPolarAngle={Math.PI / 1.9} 
        enablePan={false}
        enableZoom={true}
        minDistance={8}
        maxDistance={30}
        rotateSpeed={0.5}
        dampingFactor={0.05}
      />
    </Canvas>
  );
};

export default Scene;
