import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const GoldDust: React.FC = () => {
  const count = 800;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { viewport } = useThree();
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Random positions and speeds
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      // REDUCED SPEED: Previous was 0.01 + rand/200, now significantly slower
      const speed = 0.002 + Math.random() / 500;
      const xFactor = -20 + Math.random() * 40;
      const yFactor = -20 + Math.random() * 40;
      const zFactor = -20 + Math.random() * 40;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame((state, delta) => {
    if (!mesh.current) return;

    // Get mouse/touch position in 3D space roughly (normalized -1 to 1 mapped to viewport)
    const targetX = (state.pointer.x * viewport.width) / 2;
    const targetY = (state.pointer.y * viewport.height) / 2;

    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      
      // Update time
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);

      // Interactive Attraction:
      let px = (particle.mx / 10) * a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10;
      let py = (particle.my / 10) * b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10;
      let pz = (particle.my / 10) * b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10;

      const dist = Math.sqrt(Math.pow(px - targetX, 2) + Math.pow(py - targetY, 2));
      
      // Subtle attraction logic
      if (dist < 8) {
         px += (targetX - px) * 0.02;
         py += (targetY - py) * 0.02;
         pz += (5 - pz) * 0.02; 
      }

      dummy.position.set(px, py, pz);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.scale.set(s, s, s);
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <dodecahedronGeometry args={[0.05, 0]} />
      <meshStandardMaterial 
        color="#FFD700" 
        emissive="#FFA500"
        emissiveIntensity={0.5}
        roughness={0} 
        metalness={1} 
      />
    </instancedMesh>
  );
};

export default GoldDust;