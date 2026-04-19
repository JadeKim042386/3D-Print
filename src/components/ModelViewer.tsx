"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

function StlModel({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const loader = new STLLoader();
    loader.load(url, (geo) => {
      geo.computeVertexNormals();
      setGeometry(geo);
    });
  }, [url]);

  if (!geometry) return null;

  return (
    <Center>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#8b8b8b" metalness={0.3} roughness={0.6} />
      </mesh>
    </Center>
  );
}

export default function ModelViewer({ stlUrl }: { stlUrl: string }) {
  const { t } = useTranslation();

  return (
    <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-gray-500">
            {t("viewer.loading")}
          </div>
        }
      >
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />
          <StlModel url={stlUrl} />
          <OrbitControls enableDamping dampingFactor={0.1} />
        </Canvas>
      </Suspense>
    </div>
  );
}
