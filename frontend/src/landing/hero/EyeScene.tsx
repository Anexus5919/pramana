import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ReactNode, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { palette } from "../palette";
import { type EyeLayout, type EyeState, now } from "./eyeState";
import StaticEye from "./StaticEye";
import {
  irisFragment,
  irisVertex,
  lensFragment,
  lensVertex,
  lidFragment,
  lidVertex,
  scleraFragment,
  scleraVertex,
} from "./shaders";

const FOV = 36;
const DIST = 5 / Math.tan(((FOV / 2) * Math.PI) / 180);
const Z_IRIS = -1.5;
const R_BALL = 9;
const LENS_Z = 0.62;

const col = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
};

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function instancedBox(): THREE.InstancedBufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0, 0.5);
  const g = new THREE.InstancedBufferGeometry();
  g.index = box.index;
  g.setAttribute("position", box.getAttribute("position"));
  g.setAttribute("normal", box.getAttribute("normal"));
  return g;
}

function shapeUniform(l: EyeLayout, s: number, out: THREE.Vector4) {
  return out.set(l.apertureA * s, l.apertureTop * s, l.apertureBottom * s, l.shapeP);
}

type Shared = {
  pulses: THREE.Vector4[];
  reads: THREE.Vector4[];
  open: { value: number };
  shape: THREE.Vector4;
  time: { value: number };
};

function useShared(): Shared {
  return useMemo(
    () => ({
      pulses: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -10, 0)),
      reads: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -10, 0, 0)),
      open: { value: 1 },
      shape: new THREE.Vector4(8, 3.6, 3.3, 0.78),
      time: { value: 0 },
    }),
    [],
  );
}

function Sclera({ shared }: { shared: Shared }) {
  const size = useThree((s) => s.size);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: scleraVertex,
        fragmentShader: scleraFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uShape: { value: shared.shape },
          uOpen: shared.open,
          uHalf: { value: new THREE.Vector2(8, 5) },
          uCamY: { value: 0 },
          uPeach: { value: col(palette.peach) },
          uApricot: { value: col(palette.apricot) },
          uRose: { value: col(palette.rose) },
          uLilac: { value: col(palette.lilac) },
          uGlow: { value: col("#fff6ef") },
          uShade: { value: col("#9c7fd6") },
        },
      }),
    [shared],
  );
  useEffect(() => {
    (mat.uniforms.uHalf.value as THREE.Vector2).set((5 * size.width) / size.height, 5);
  }, [mat, size]);
  return (
    <mesh renderOrder={-10} frustumCulled={false} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function Lids({ shared, state }: { shared: Shared; state: EyeState }) {
  const size = useThree((s) => s.size);
  const compact = size.width < 720;
  const cell = compact ? 0.62 : size.width > 1900 ? 0.36 : 0.4;
  const halfW = (5 * size.width) / size.height;
  const odd = (n: number) => (n % 2 === 0 ? n + 1 : n);
  const cols = odd(Math.ceil((halfW * 2 + 2.6) / cell));
  const rows = odd(Math.ceil((10 + 2.6) / cell));

  const geo = useMemo(() => {
    const g = instancedBox();
    const n = cols * rows;
    const cells = new Float32Array(n * 2);
    const seeds = new Float32Array(n);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells[i * 2] = (c - (cols - 1) / 2) * cell;
        cells[i * 2 + 1] = (r - (rows - 1) / 2) * cell;
        seeds[i] = hash(r * 917 + c * 131);
        i++;
      }
    }
    g.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    g.instanceCount = n;
    return g;
  }, [cols, rows, cell]);
  useEffect(() => () => geo.dispose(), [geo]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: lidVertex,
        fragmentShader: lidFragment,
        uniforms: {
          uShape: { value: shared.shape },
          uOpen: shared.open,
          uTime: shared.time,
          uPulse: { value: shared.pulses },
          uCell: { value: 0.4 },
          uMaxH: { value: 2.3 },
          uRamp: { value: 4.2 },
          uCursor: { value: new THREE.Vector3(0, 0, 0) },
          uTop: { value: col(palette.voxel.top) },
          uSide: { value: col(palette.voxel.side) },
          uSideDeep: { value: col(palette.voxel.sideDeep) },
          uRim: { value: col(palette.voxel.rim) },
        },
      }),
    [shared],
  );
  mat.uniforms.uCell.value = cell;
  mat.uniforms.uMaxH.value = compact ? 1.7 : 2.3;
  mat.uniforms.uRamp.value = compact ? 3.2 : 4.2;

  const attention = useRef(0);
  useFrame((_, delta) => {
    const p = state.pointer;
    const target = p.inside ? 1 : 0;
    attention.current += (target - attention.current) * Math.min(1, delta * 4);
    const cur = mat.uniforms.uCursor.value as THREE.Vector3;
    const hw = (5 * size.width) / size.height;
    const tx = p.x * hw;
    const ty = p.y * 5;
    cur.x += (tx - cur.x) * Math.min(1, delta * 10);
    cur.y += (ty - cur.y) * Math.min(1, delta * 10);
    cur.z = attention.current;
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

function Eyeball({ shared, state, layout }: { shared: Shared; state: EyeState; layout: EyeLayout }) {
  const size = useThree((s) => s.size);
  const s = 10 / size.height;
  const irisDepthScale = (DIST - Z_IRIS) / DIST;
  const rp = layout.pupilR * s * irisDepthScale;
  const ri = layout.irisR * s * irisDepthScale;
  const lensR = layout.pupilR * s * ((DIST - Z_IRIS - LENS_Z) / DIST);
  const rings = layout.compact ? 3 : 4;
  const spokes = layout.compact ? 84 : 132;
  const key = `${rp.toFixed(2)}-${ri.toFixed(2)}-${rings}-${spokes}`;

  const geo = useMemo(() => {
    const g = instancedBox();
    const n = rings * spokes;
    const polar = new Float32Array(n * 4);
    const rnd = new Float32Array(n * 2);
    const dr = (ri - rp) / rings;
    const dth = (Math.PI * 2) / spokes;
    let i = 0;
    for (let k = 0; k < rings; k++) {
      for (let j = 0; j < spokes; j++) {
        const stagger = 0;
        polar[i * 4] = rp + dr * (k + 0.5);
        polar[i * 4 + 1] = (j + stagger) * dth;
        polar[i * 4 + 2] = dr;
        polar[i * 4 + 3] = dth;
        const spoke = 0.5 * hash(j * 13.7) + 0.5 * hash(Math.floor(j / 3) * 71.3);
        rnd[i * 2] = spoke;
        rnd[i * 2 + 1] = hash(k * 400 + j * 7.1);
        i++;
      }
    }
    g.setAttribute("aPolar", new THREE.InstancedBufferAttribute(polar, 4));
    g.setAttribute("aRnd", new THREE.InstancedBufferAttribute(rnd, 2));
    g.instanceCount = n;
    return g;
  }, [key]);
  useEffect(() => () => geo.dispose(), [geo]);

  const irisMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: irisVertex,
        fragmentShader: irisFragment,
        uniforms: {
          uTime: shared.time,
          uPulse: { value: shared.pulses },
          uRead: { value: shared.reads },
          uPupilR: { value: 3 },
          uIrisR: { value: 4.5 },
          uInner: { value: col(palette.voxel.irisInner) },
          uMid: { value: col(palette.voxel.irisMid) },
          uOuter: { value: col(palette.voxel.irisOuter) },
          uLimbal: { value: col(palette.voxel.limbal) },
          uFadeTo: { value: col("#fbe9ec") },
          uFade: { value: 0 },
          uToneOk: { value: col(palette.status.verified.dot) },
          uToneWarn: { value: col(palette.status.manual.dot) },
          uToneBad: { value: col(palette.status.mismatch.dot) },
        },
      }),
    [shared],
  );
  irisMat.uniforms.uPupilR.value = rp;
  irisMat.uniforms.uIrisR.value = ri;
  irisMat.uniforms.uFade.value = layout.compact ? 0.55 : 0;

  const lensMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: lensVertex,
        fragmentShader: lensFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uLens: { value: col(palette.voxel.lens) },
          uEdge: { value: col("#f6e9ff") },
          uRuff: { value: col(palette.brand[700]) },
          uScale: { value: 1.06 },
        },
      }),
    [],
  );

  const ball = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ball.current;
    if (!g) return;
    const p = state.pointer;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const yaw = p.inside ? clamp(p.x) * 0.034 : 0;
    const pitch = p.inside ? clamp(p.y) * 0.03 : 0;
    const k = Math.min(1, delta * 3.5);
    g.rotation.y += (yaw - g.rotation.y) * k;
    g.rotation.x += (-pitch - g.rotation.x) * k;
  });

  return (
    <group ref={ball} position={[0, 0, Z_IRIS - R_BALL]}>
      <group position={[0, 0, R_BALL]}>
        <mesh position={[0, 0, -0.01]}>
          <ringGeometry args={[rp * 0.98, ri * 1.01, 96]} />
          <meshBasicMaterial color={layout.compact ? "#e9d7ee" : "#4a1d99"} toneMapped={false} />
        </mesh>
        <mesh geometry={geo} material={irisMat} frustumCulled={false} />
        <mesh position={[0, 0, 0.02]}>
          <ringGeometry args={[ri * 0.995, ri * 1.03, 128]} />
          <meshBasicMaterial color={layout.compact ? "#e7d2ea" : palette.voxel.limbal} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, LENS_Z]} material={lensMat} renderOrder={5}>
          <planeGeometry args={[lensR * 2 * 1.06, lensR * 2 * 1.06]} />
        </mesh>
      </group>
    </group>
  );
}

function Driver({ shared, state, layout, reduced }: { shared: Shared; state: EyeState; layout: EyeLayout; reduced: boolean }) {
  const size = useThree((s) => s.size);
  const blink = useRef({ start: -1, next: now() + 5 });
  useFrame(() => {
    const t = now();
    shared.time.value = t;
    const s = 10 / size.height;
    shapeUniform(layout, s, shared.shape);
    const hw = (5 * size.width) / size.height;
    state.pulses.slice(-4).forEach((p, i) => shared.pulses[i].set(p.x * hw, p.y * 5, p.t0, 1));
    state.reads.slice(-4).forEach((r, i) => shared.reads[i].set(r.angle, r.t0, r.tone, 1));
    let b = 0;
    const bl = blink.current;
    if (!reduced) {
      if (bl.start < 0 && t > bl.next) {
        if (t - state.pointer.lastMove > 2.5 && state.scrollClose < 0.05) bl.start = t;
        else bl.next = t + 1.5;
      }
      if (bl.start >= 0) {
        const e = t - bl.start;
        if (e < 0.34) b = Math.pow(e / 0.34, 2);
        else if (e < 0.48) b = 1;
        else if (e < 1.05) b = 1 - (1 - Math.pow(1 - (e - 0.48) / 0.57, 3));
        else {
          bl.start = -1;
          bl.next = t + 12 + Math.random() * 8;
        }
      }
    }
    shared.open.value = (1 - b) * (1 - state.scrollClose);
  });
  return null;
}

class GlBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail?: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail?.();
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type EyeSceneProps = {
  state: EyeState;
  layout: EyeLayout;
  frameloop: "always" | "never" | "demand";
  reduced: boolean;
  onReady?: () => void;
  onFail?: () => void;
};

export default function EyeScene({ state, layout, frameloop, reduced, onReady, onFail }: EyeSceneProps) {
  const shared = useShared();
  return (
    <GlBoundary fallback={<StaticEye layout={layout} />} onFail={onFail}>
      <Canvas
        className="pointer-events-none! absolute! inset-0"
        style={{ pointerEvents: "none" }}
        frameloop={frameloop}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" }}
        camera={{ fov: FOV, position: [0, 0, DIST], near: 0.5, far: 80 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => onFail?.(), { once: true });
          onReady?.();
        }}
        aria-hidden
      >
        <Driver shared={shared} state={state} layout={layout} reduced={reduced} />
        <Sclera shared={shared} />
        <Eyeball shared={shared} state={state} layout={layout} />
        <Lids shared={shared} state={state} />
      </Canvas>
    </GlBoundary>
  );
}
