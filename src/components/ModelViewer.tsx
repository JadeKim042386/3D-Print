"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { Component, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { requestModelExport, type ExportFormat, type ExportStatus } from "../lib/api";

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

const EXPORT_FORMATS: { value: ExportFormat; label: string; desc: string }[] = [
  { value: "stl", label: "STL", desc: "FDM" },
  { value: "obj", label: "OBJ", desc: "CAD" },
  { value: "glb", label: "GLTF/GLB", desc: "Web/Game" },
  { value: "3mf", label: "3MF", desc: "Slicer" },
];

interface FormatExportButtonProps {
  modelId: string;
  stlUrl: string;
  token?: string | null;
}

function FormatExportButton({ modelId, stlUrl, token }: FormatExportButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportStatus, setExportStatus] = useState<Record<ExportFormat, ExportStatus | null>>({
    stl: null, obj: null, glb: null, gltf: null, "3mf": null,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const sourceFormat = detectFormat(stlUrl);

  const handleExport = useCallback(async (format: ExportFormat) => {
    // Direct download for source format
    if (format === sourceFormat || (format === "gltf" && sourceFormat === "glb")) {
      const a = document.createElement("a");
      a.href = stlUrl;
      a.download = `model.${format === "gltf" ? "glb" : format}`;
      a.click();
      setOpen(false);
      return;
    }

    if (!token) {
      // Fallback direct download if no auth
      const a = document.createElement("a");
      a.href = stlUrl;
      a.download = `model.${sourceFormat}`;
      a.click();
      setOpen(false);
      return;
    }

    setExporting(format);
    try {
      const result = await requestModelExport(modelId, format, token);
      setExportStatus((prev) => ({ ...prev, [format]: result.status }));

      if (result.status === "ready" && result.fileUrl) {
        // Download immediately
        const a = document.createElement("a");
        a.href = result.fileUrl;
        a.download = `model.${format === "gltf" ? "glb" : format}`;
        a.click();
        setOpen(false);
      } else if (result.status === "pending" || result.status === "converting") {
        // Poll for completion
        const exportId = result.exportId;
        if (exportId) {
          const poll = setInterval(async () => {
            try {
              const check = await requestModelExport(modelId, format, token);
              setExportStatus((prev) => ({ ...prev, [format]: check.status }));
              if (check.status === "ready" && check.fileUrl) {
                clearInterval(poll);
                setExporting(null);
                const a = document.createElement("a");
                a.href = check.fileUrl;
                a.download = `model.${format === "gltf" ? "glb" : format}`;
                a.click();
              } else if (check.status === "failed") {
                clearInterval(poll);
                setExporting(null);
              }
            } catch {
              clearInterval(poll);
              setExporting(null);
            }
          }, 2000);
          // Auto-clear after 60s
          setTimeout(() => { clearInterval(poll); setExporting(null); }, 60000);
        }
      }
    } catch (err) {
      console.error("Export failed:", err);
      setExportStatus((prev) => ({ ...prev, [format]: "failed" }));
    } finally {
      if (exportStatus[format] !== "pending" && exportStatus[format] !== "converting") {
        setExporting(null);
      }
    }
  }, [modelId, stlUrl, token, sourceFormat, exportStatus]);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {t("viewer.downloadFormat")}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
          {EXPORT_FORMATS.map((fmt) => {
            const isSource = fmt.value === sourceFormat;
            const status = exportStatus[fmt.value];
            const isExporting = exporting === fmt.value;

            return (
              <button
                key={fmt.value}
                onClick={() => handleExport(fmt.value)}
                disabled={isExporting}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-2 text-sm disabled:opacity-50"
              >
                <div>
                  <span className="font-medium">{fmt.label}</span>
                  <span className="text-gray-400 ml-2 text-xs">{fmt.desc}</span>
                </div>
                {isSource && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    {t("viewer.sourceFormat")}
                  </span>
                )}
                {isExporting && (
                  <span className="text-xs text-blue-600">
                    {t("viewer.converting")}
                  </span>
                )}
                {!isSource && status === "ready" && !isExporting && (
                  <span className="text-xs text-green-600">
                    {t("viewer.cached")}
                  </span>
                )}
                {status === "failed" && !isExporting && (
                  <span className="text-xs text-red-600">
                    {t("viewer.exportFailed")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ModelViewerProps {
  stlUrl: string;
  modelId?: string;
  token?: string | null;
}

export default function ModelViewer({ stlUrl, modelId, token }: ModelViewerProps) {
  const { t } = useTranslation();
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    setWebglSupported(detectWebGL());
  }, []);

  const downloadButton = modelId ? (
    <FormatExportButton modelId={modelId} stlUrl={stlUrl} token={token} />
  ) : (
    <a
      href={stlUrl}
      download
      className="mt-2 inline-flex items-center bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
    >
      {t("viewer.download")}
    </a>
  );

  if (!webglSupported) {
    return (
      <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center gap-3 px-6 text-center">
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="text-gray-600 font-medium">{t("viewer.webglUnavailable")}</p>
        {downloadButton}
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
          {downloadButton}
        </div>
      }
    >
      <div className="w-full aspect-square max-h-[600px] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden relative">
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
        <div className="absolute bottom-4 right-4">
          {downloadButton}
        </div>
      </div>
    </ViewerErrorBoundary>
  );
}
