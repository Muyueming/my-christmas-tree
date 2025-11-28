
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Decorations from './Decorations';
import PhotoSpiral from './PhotoSpiral';
import { TreeState, TreeMode, PhotoData } from '../types';

interface LuxuryTreeProps {
  treeState: TreeState;
  physicsState: React.MutableRefObject<{ isInteracting: boolean, delta: number, velocity: number }>;
  onPhotoClick: (photo: PhotoData) => void;
}

// --- CUSTOM SHADER FOR SPARKLING EMERALD FOLIAGE ---
const SparkleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#052e16') },
  },
  vertexShader: `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    varying vec3 vPos;
    uniform float uTime;
    void main() {
      vColor = color;
      vPos = position;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      
      // Size attenuation with a breathing effect
      float breath = 1.0 + sin(uTime * 2.0 + position.y) * 0.1;
      gl_PointSize = size * breath * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      // Create a diamond/star shape pattern
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      
      // Diamond shape cut
      if (abs(coord.x) + abs(coord.y) > 0.5) discard;
      
      // Inner glow
      float strength = 1.0 - (dist * 2.0);
      strength = pow(strength, 3.0);
      
      gl_FragColor = vec4(vColor + vec3(strength * 0.5), 0.9);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const LuxuryTree: React.FC<LuxuryTreeProps> = ({ treeState, physicsState, onPhotoClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const foliageRef = useRef<THREE.Points>(null);
  const boxMeshRef = useRef<THREE.InstancedMesh>(null);
  const ballMeshRef = useRef<THREE.InstancedMesh>(null);

  // --- CONFIG ---
  const TREE_HEIGHT = 14;
  const Y_OFFSET = TREE_HEIGHT / 2; // 7
  const BASE_RADIUS = 5.0;

  // Wide radius for spiral
  const SPIRAL_RADIUS = BASE_RADIUS + 1.8; 

  const FOLIAGE_COUNT = 5500; 
  const BOX_COUNT = 180; 
  const BALL_COUNT = 450; 
  const CHAOS_RADIUS = 20;

  // --- DATA GENERATION ---
  const { foliageData, ornaments } = useMemo(() => {
    // 1. Foliage
    const fPos = new Float32Array(FOLIAGE_COUNT * 3);
    const fTarget = new Float32Array(FOLIAGE_COUNT * 3);
    const fChaos = new Float32Array(FOLIAGE_COUNT * 3);
    const fSpeeds = new Float32Array(FOLIAGE_COUNT);
    const fColors = new Float32Array(FOLIAGE_COUNT * 3);
    const fSizes = new Float32Array(FOLIAGE_COUNT);

    const colorPalette = [
        new THREE.Color("#022c22"), // Darkest Emerald
        new THREE.Color("#166534"), // Jewel Green
        new THREE.Color("#059669"), // Bright Emerald
        new THREE.Color("#065f46"), // Tealish Green
    ];

    for (let i = 0; i < FOLIAGE_COUNT; i++) {
        // Chaos
        const cx = (Math.random() - 0.5) * CHAOS_RADIUS * 2;
        const cy = (Math.random() - 0.5) * CHAOS_RADIUS * 2 + 5;
        const cz = (Math.random() - 0.5) * CHAOS_RADIUS * 2;
        
        fChaos[i * 3] = cx;
        fChaos[i * 3 + 1] = cy;
        fChaos[i * 3 + 2] = cz;

        // Target (Dense Cone)
        const h = Math.random(); 
        const rMax = BASE_RADIUS * (1 - h) + 0.2; 
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * rMax; 
        
        const tx = Math.cos(angle) * r;
        const ty = h * TREE_HEIGHT - Y_OFFSET;
        const tz = Math.sin(angle) * r;

        fTarget[i * 3] = tx;
        fTarget[i * 3 + 1] = ty;
        fTarget[i * 3 + 2] = tz;

        // Init
        fPos[i * 3] = cx;
        fPos[i * 3 + 1] = cy;
        fPos[i * 3 + 2] = cz;

        fSpeeds[i] = 0.5 + Math.random() * 2.0;
        
        const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        fColors[i * 3] = col.r;
        fColors[i * 3 + 1] = col.g;
        fColors[i * 3 + 2] = col.b;

        fSizes[i] = 0.5 + Math.random() * 1.5;
    }

    // 2. Ornaments
    const items = [];
    // Boxes (The Blocks)
    let b = 0;
    while(items.length < BOX_COUNT && b < BOX_COUNT * 2) { 
        b++;
        const h = Math.random();
        
        if (h > 0.6 && Math.random() > 0.3) continue; 
        if (h > 0.8 && Math.random() > 0.1) continue; 

        const rBase = (BASE_RADIUS + 0.2) * (1 - h) + 0.5;
        const angle = Math.random() * Math.PI * 2;
        
        // Fix: Bias inward to prevent clipping with outer spiral
        const r = Math.max(0.5, rBase - Math.random() * 1.2); 
        
        const tx = Math.cos(angle) * r;
        const ty = h * TREE_HEIGHT - Y_OFFSET;
        const tz = Math.sin(angle) * r;

        items.push({
            type: 'box',
            chaosPos: new THREE.Vector3((Math.random()-0.5)*30, (Math.random()-0.5)*30+5, (Math.random()-0.5)*30),
            targetPos: new THREE.Vector3(tx, ty, tz),
            currentPos: new THREE.Vector3(),
            rotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, 0),
            speed: 0.5 + Math.random() * 0.5, 
            color: Math.random() > 0.6 ? '#FFD700' : (Math.random() > 0.5 ? '#8B0000' : '#B8860B'), 
            scale: 0.4 + Math.random() * 0.4 
        });
    }

    // Balls (Fillers)
    for(let i=0; i<BALL_COUNT; i++) {
        const h = Math.random();
        const rBase = (BASE_RADIUS - 0.2) * (1 - h) + 0.5;
        const angle = Math.random() * Math.PI * 2;
        const r = (rBase - 0.5) * Math.random(); 

        items.push({
            type: 'ball',
            chaosPos: new THREE.Vector3((Math.random()-0.5)*30, (Math.random()-0.5)*30+5, (Math.random()-0.5)*30),
            targetPos: new THREE.Vector3(Math.cos(angle)*r, h*TREE_HEIGHT - Y_OFFSET, Math.sin(angle)*r),
            currentPos: new THREE.Vector3(),
            rotation: new THREE.Euler(0,0,0),
            speed: 2.0 + Math.random() * 2.0, 
            color: Math.random() > 0.5 ? '#C0C0C0' : '#FF0000',
            scale: 0.2 + Math.random() * 0.2
        });
    }
    
    // Init ornament positions
    items.forEach(i => i.currentPos.copy(i.chaosPos));

    return { 
        foliageData: { positions: fPos, targetPositions: fTarget, chaosPositions: fChaos, speeds: fSpeeds, colors: fColors, sizes: fSizes },
        ornaments: items
    };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // --- LOOP ---
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    SparkleMaterial.uniforms.uTime.value = time;

    // 1. Rotation Logic (Direct Control + Inertia)
    if (groupRef.current) {
        // Auto speed (background rotation)
        const autoSpeed = treeState.rotationSpeed * 0.2;
        
        if (physicsState.current.isInteracting) {
            // DIRECT CONTROL: Hand/Mouse movement mapped directly to rotation
            groupRef.current.rotation.y += physicsState.current.delta;
            // Clear delta so we don't double-apply
            physicsState.current.delta = 0;
        } else {
            // INERTIA: Apply decaying velocity
            groupRef.current.rotation.y += physicsState.current.velocity;
            
            // Add base auto-rotation
            groupRef.current.rotation.y += autoSpeed * delta;

            // Friction/Decay
            physicsState.current.velocity *= 0.95;
            if (Math.abs(physicsState.current.velocity) < 0.0001) {
                physicsState.current.velocity = 0;
            }
        }
    }

    const isFormed = treeState.mode === TreeMode.FORMED;

    // 2. Foliage Physics
    if (foliageRef.current) {
        const positions = foliageRef.current.geometry.attributes.position.array as Float32Array;
        const targets = isFormed ? foliageData.targetPositions : foliageData.chaosPositions;
        
        for(let i=0; i<FOLIAGE_COUNT; i++) {
            const ix = i * 3;
            const speed = foliageData.speeds[i] * delta * 4.0;
            
            positions[ix] = THREE.MathUtils.lerp(positions[ix], targets[ix], speed);
            positions[ix+1] = THREE.MathUtils.lerp(positions[ix+1], targets[ix+1], speed);
            positions[ix+2] = THREE.MathUtils.lerp(positions[ix+2], targets[ix+2], speed);
        }
        foliageRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // 3. Ornaments Physics
    let boxIdx = 0;
    let ballIdx = 0;
    ornaments.forEach((item) => {
        const target = isFormed ? item.targetPos : item.chaosPos;
        const dist = item.currentPos.distanceTo(target);
        const speed = item.speed * delta * (1.0 + dist * 0.5);

        item.currentPos.lerp(target, speed);
        
        item.rotation.x += delta * 0.2;
        item.rotation.y += delta * 0.5;

        dummy.position.copy(item.currentPos);
        dummy.rotation.copy(item.rotation);
        dummy.scale.setScalar(item.scale);
        dummy.updateMatrix();

        if (item.type === 'box' && boxMeshRef.current) {
            boxMeshRef.current.setColorAt(boxIdx, new THREE.Color(item.color));
            boxMeshRef.current.setMatrixAt(boxIdx, dummy.matrix);
            boxIdx++;
        } else if (item.type === 'ball' && ballMeshRef.current) {
            ballMeshRef.current.setColorAt(ballIdx, new THREE.Color(item.color));
            ballMeshRef.current.setMatrixAt(ballIdx, dummy.matrix);
            ballIdx++;
        }
    });

    if (boxMeshRef.current) {
        boxMeshRef.current.instanceMatrix.needsUpdate = true;
        if (boxMeshRef.current.instanceColor) boxMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (ballMeshRef.current) {
        ballMeshRef.current.instanceMatrix.needsUpdate = true;
        if (ballMeshRef.current.instanceColor) ballMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      {/* 1. Shader Foliage */}
      <points ref={foliageRef}>
        <bufferGeometry>
            <bufferAttribute 
                attach="attributes-position" 
                count={FOLIAGE_COUNT} 
                array={foliageData.positions} 
                itemSize={3} 
            />
            <bufferAttribute 
                attach="attributes-color" 
                count={FOLIAGE_COUNT} 
                array={foliageData.colors} 
                itemSize={3} 
            />
            <bufferAttribute 
                attach="attributes-size" 
                count={FOLIAGE_COUNT} 
                array={foliageData.sizes} 
                itemSize={1} 
            />
        </bufferGeometry>
        <primitive object={SparkleMaterial} attach="material" />
      </points>

      {/* 2. Blocky Boxes */}
      <instancedMesh ref={boxMeshRef} args={[undefined, undefined, BOX_COUNT]} castShadow receiveShadow>
         <boxGeometry args={[1, 1, 1]} />
         <meshStandardMaterial 
            roughness={0.15} 
            metalness={0.9} 
            envMapIntensity={2}
         />
      </instancedMesh>

      {/* 3. Shiny Balls */}
      <instancedMesh ref={ballMeshRef} args={[undefined, undefined, BALL_COUNT]} castShadow>
         <sphereGeometry args={[1, 32, 32]} />
         <meshStandardMaterial 
            roughness={0.05} 
            metalness={1.0} 
            envMapIntensity={3}
         />
      </instancedMesh>

      {/* 4. The Photo Spiral (Now controlled by mode) */}
      <PhotoSpiral 
        radius={SPIRAL_RADIUS} 
        height={TREE_HEIGHT + 1} 
        turns={4} 
        photoCount={14} 
        onPhotoClick={onPhotoClick}
        mode={treeState.mode} 
      />

      {/* 5. Star */}
      <Decorations mode={treeState.mode} />

      {/* 6. Base / Trunk */}
      <mesh position={[0, -Y_OFFSET, 0]} receiveShadow>
         <cylinderGeometry args={[1.0, 1.5, 3, 16]} />
         <meshStandardMaterial color="#3E2723" roughness={0.9} />
      </mesh>
    </group>
  );
};

export default LuxuryTree;
