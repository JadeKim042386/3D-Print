"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { Component, Suspense, useEffect, useState } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") || canvas.getContext("webgl")
    );
  } catch {
    return false;
  }
}

function SkeletonLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 animate-pulse">
      <div className="w-32 h-32 rounded-full bg-gray-200" />
      <div className="w-48 h-4 rounded bg-gray-200" />
      <div className="w-32 h-3 rounded bg-gray-200" />
    </div>
  );
}

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ViewerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ModelViewer error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

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

function GlbModel({ url }: { url: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      setScene(gltf.scene);
    });
  }, [url]);

  if (!scene) return null;

  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
}

function detectFormat(url: string): "glb" | "stl" {
  const lower = url.toLowerCase();
  if (lower.includes(".glb") || lower.includes(".gltf")) return "glb";
  return "stl";
}

export default function ModelViewer({ stlUrl }: { stlUrl: string }) {
  const { t } = useTranslation();
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    setWebglSupported(detectWebGL());
  }, []);

  if (!webglSupported) {
    return (
      <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center">
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="text-gray-600 font-medium">{t("viewer.webglUnavailable")}</p>
        <a
          href={stlUrl}
          download
          className="mt-2 inline-flex items-center bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
        >
          {t("viewer.download")}
        </a>
      </div>
    );
  }

  return (
    <ViewerErrorBoundary
      fallback={
        <div className="w-full aspect-square max-h-[600px] rounded-xl border border-red-200 bg-red-50 overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center">
          <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-red-600 font-medium">{t("viewer.renderError")}</p>
          <a
            href={stlUrl}
            download
            className="mt-2 inline-flex items-center bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
          >
            {t("viewer.download")}
          </a>
        </div>
      }
    >
      <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <Suspense fallback={<SkeletonLoader />}>
          <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <directionalLight position={[-10, -10, -5]} intensity={0.3} />
            {detectFormat(stlUrl) === "glb"
              ? <GlbModel url={stlUrl} />
              : <StlModel url={stlUrl} />
            }
            <OrbitControls enableDamping dampingFactor={0.1} />
          </Canvas>
        </Suspense>
      </div>
    </ViewerErrorBoundary>
  );
}
