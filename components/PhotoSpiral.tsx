
import React, { useMemo, useState, Suspense } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text, Image as DreiImage } from '@react-three/drei';
import { PhotoData, TreeMode } from '../types';

interface PhotoSpiralProps {
  radius: number;
  height: number;
  turns: number;
  photoCount: number;
  mode: TreeMode;
  onPhotoClick: (photo: PhotoData) => void;
}

// Error Boundary for individual images
class SingleImageErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode; src: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
      console.error(`Failed to load image: ${this.props.src}`, error);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Custom Shader for the Rail
const RailMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color('#FFD700') },
    uProgress: { value: 1.0 }, 
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uProgress;
    varying vec2 vUv;
    void main() {
      if (vUv.x > uProgress) discard;
      float light = 0.5 + 0.5 * sin(vUv.y * 30.0);
      vec3 finalColor = uColor * (0.8 + 0.4 * light);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide
});

const PhotoSpiral: React.FC<PhotoSpiralProps> = ({ radius, height, turns, photoCount, mode, onPhotoClick }) => {
  // --- CURVE GENERATION ---
  const curve = useMemo(() => {
    const points = [];
    const steps = 300;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const currentRadius = radius * (1 - t * 0.8) + 0.5; 
      const currentHeight = (t * height) - (height / 2) + 0.5;
      const angle = t * Math.PI * 2 * turns;
      points.push(new THREE.Vector3(Math.cos(angle) * currentRadius, currentHeight, Math.sin(angle) * currentRadius));
    }
    return new THREE.CatmullRomCurve3(points);
  }, [radius, height, turns]);

  // --- PHOTO DATA ---
  const photoItems = useMemo(() => {
    const items = [];
    for (let i = 0; i < photoCount; i++) {
      const t = 0.1 + (i / (photoCount - 1)) * 0.8; 
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      
      const centerAxisPoint = new THREE.Vector3(0, point.y, 0);
      const normal = new THREE.Vector3().subVectors(point, centerAxisPoint).normalize();
      
      const offsetDistance = 0.035; 
      const targetPos = point.clone().add(normal.clone().multiplyScalar(offsetDistance));
      
      const lookAtPos = targetPos.clone().add(normal);
      const dummyObj = new THREE.Object3D();
      dummyObj.position.copy(targetPos);
      dummyObj.lookAt(lookAtPos);
      
      const chaosPos = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20 + 5,
        (Math.random() - 0.5) * 20
      );

      const chaosRot = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      items.push({ 
          targetPos, 
          chaosPos,
          targetRot: dummyObj.quaternion.clone(),
          chaosRot,
          railPos: point,
          id: i,
          url: `/photos/${i + 1}.jpg`, 
          color: `hsl(${35 + Math.random() * 15}, 80%, ${40 + Math.random() * 20}%)`
      });
    }
    return items;
  }, [curve, photoCount]);

  useFrame((state, delta) => {
      const targetProgress = mode === TreeMode.FORMED ? 1.0 : 0.0;
      const speed = 2.5; 
      RailMaterial.uniforms.uProgress.value = THREE.MathUtils.lerp(
          RailMaterial.uniforms.uProgress.value,
          targetProgress,
          delta * speed
      );
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 300, 0.015, 8, false]} />
        <primitive object={RailMaterial} attach="material" />
      </mesh>

      {photoItems.map((item) => (
        <PhotoFrame 
            key={item.id} 
            item={item} 
            mode={mode}
            onClick={() => onPhotoClick({ id: item.id, color: item.color, url: item.url })} 
        />
      ))}
    </group>
  );
};

const PhotoFrame: React.FC<{ item: any, mode: TreeMode, onClick: () => void }> = ({ item, mode, onClick }) => {
  const groupRef = React.useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const currentPos = React.useRef(item.chaosPos.clone()); 
  
  // Fallback visual
  const fallbackMesh = (
      <mesh position={[0, 0.15, 0.016]}>
          <planeGeometry args={[1.275, 1.275]} />
          <meshStandardMaterial color={item.color} roughness={0.3} />
          <Text position={[0,0,0.01]} fontSize={0.1} color="white">
            LOADING
          </Text>
      </mesh>
  );

  useFrame((state, delta) => {
    if (groupRef.current) {
        const isFormed = mode === TreeMode.FORMED;
        const targetP = isFormed ? item.targetPos : item.chaosPos;
        const speed = isFormed ? 3.0 : 1.0 + Math.random();
        currentPos.current.lerp(targetP, delta * speed);
        groupRef.current.position.copy(currentPos.current);

        if (isFormed) {
            groupRef.current.quaternion.slerp(item.targetRot, delta * 3.0);
        } else {
             groupRef.current.rotation.x += delta * 0.5;
             groupRef.current.rotation.y += delta * 0.2;
        }

        const targetScale = hovered && isFormed ? 1.15 : 1.0;
        groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);
    }
  });

  return (
    <group>
        <group 
            ref={groupRef} 
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
            {/* Polaroid Body */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1.5, 1.875, 0.03]} />
                <meshStandardMaterial color="#FAFAFA" roughness={0.5} />
            </mesh>
            
            {/* Photo Area with Suspense and Error Boundary */}
            {item.url ? (
                <SingleImageErrorBoundary src={item.url} fallback={fallbackMesh}>
                    <Suspense fallback={fallbackMesh}>
                         <DreiImage 
                            url={item.url}
                            position={[0, 0.15, 0.017]} 
                            scale={[1.275, 1.275]}
                            toneMapped={false}
                            transparent={false} // Force opaque for JPGs
                        />
                    </Suspense>
                </SingleImageErrorBoundary>
            ) : fallbackMesh}

            {/* Back Plate */}
            <mesh position={[0, 0, -0.016]}>
                <planeGeometry args={[1.5, 1.875]} />
                <meshStandardMaterial color="#DDDDDD" roughness={0.8} />
            </mesh>
        </group>

        {mode === TreeMode.FORMED && (
             <group position={item.railPos} quaternion={item.targetRot}>
                <mesh>
                    <torusGeometry args={[0.04, 0.01, 8, 16, Math.PI]} /> 
                    <meshStandardMaterial color="#FFD700" metalness={1} roughness={0.1} />
                </mesh>
             </group>
        )}
    </group>
  );
};

export default PhotoSpiral;
