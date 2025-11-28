
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { TreeMode } from '../types';

interface DecorationsProps {
  mode: TreeMode;
}

const Decorations: React.FC<DecorationsProps> = ({ mode }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Chaos position for star
  const chaosPos = useMemo(() => new THREE.Vector3((Math.random()-0.5)*10, 10 + Math.random()*5, (Math.random()-0.5)*10), []);
  // Target position adjusted for new tree height (Height 14, Offset 7 => Top is 7, Star at 7.8)
  const targetPos = useMemo(() => new THREE.Vector3(0, 7.8, 0), []);

  useFrame((state, delta) => {
      if (groupRef.current) {
          const target = mode === TreeMode.FORMED ? targetPos : chaosPos;
          const speed = mode === TreeMode.FORMED ? 2 : 0.5; // Fast reform, slow drift
          groupRef.current.position.lerp(target, delta * speed);
          
          // Rotate if chaos
          if (mode === TreeMode.CHAOS) {
              groupRef.current.rotation.z += delta;
              groupRef.current.rotation.x += delta * 0.5;
          } else {
              // Return to upright roughly
              groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, Math.PI/4, delta);
              groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, delta);
          }
      }
  });

  return (
    <group ref={groupRef}>
      {/* The Grand Star */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2} enabled={mode === TreeMode.FORMED}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial 
            color="#FFD700" 
            emissive="#FFD700" 
            emissiveIntensity={2} 
            toneMapped={false} 
            roughness={0.1}
            metalness={1}
          />
        </mesh>
        <pointLight intensity={3} color="#FFD700" distance={5} />
        <Sparkles count={30} scale={2} size={6} speed={0.4} opacity={1} color="#FFF" />
      </Float>
    </group>
  );
};

export default Decorations;
