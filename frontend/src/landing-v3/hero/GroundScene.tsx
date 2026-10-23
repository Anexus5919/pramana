import { advance, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ReactNode, useEffect, useMemo } from "react";
import * as THREE from "three";
import { palette } from "../../landing/palette";
import { CAM_H, type Engine, FOV, G0, HANDS, projection } from "./engine";
import { CUFF_BOX, CUT, drawCuff, drawUpper, type Hue, PALM_EYE, PIVOT, RING, UPPER_BOX } from "./hands";
import { eyeFragment, groundFragment, groundVertex, quadFragment, quadVertex, skyFragment, skyVertex } from "./shaders";

const col = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
};
const mixHex = (a: string, b: string, t: number) => col(a).lerp(col(b), t);

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const HAZE = mixHex(palette.lilac, "#ffffff", 0.3);
const TEX_RES = 2; // texture px per hand unit

function instancedBox(): THREE.InstancedBufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0, 0.5);
  const g = new THREE.InstancedBufferGeometry();
  g.index = box.index;
  g.setAttribute("position", box.getAttribute("position"));
  g.setAttribute("normal", box.getAttribute("normal"));
  return g;
}

// Level camera with a lens shift: the horizon sits low and the hands stay upright
function CameraRig({ engine }: { engine: Engine }) {
  useFrame(({ camera }) => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, CAM_H, 0);
    cam.rotation.set(0, 0, 0);
    if (cam.fov !== FOV) cam.fov = FOV;
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[9] = engine.layout.shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  });
  return null;
}

function Sky({ engine }: { engine: Engine }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uHorizon: { value: -0.2 },
          uAspect: { value: new THREE.Vector2(1, 1) },
          uGlowAt: { value: new THREE.Vector2(-0.4, 0.3) },
          uPeach: { value: col(palette.peach) },
          uApricot: { value: col(palette.apricot) },
          uRose: { value: col(palette.rose) },
          uLilac: { value: col(palette.lilac) },
          uHaze: { value: HAZE },
          uGlow: { value: col("#fff6ef") },
        },
      }),
    [],
  );
  useFrame(() => {
    const L = engine.layout;
    mat.uniforms.uHorizon.value = -L.shift;
    (mat.uniforms.uAspect.value as THREE.Vector2).set(L.w / L.h, 1);
    const gx = L.wide ? ((L.copy.x + L.copy.w * 0.42) / L.w) * 2 - 1 : 0;
    const gy = L.wide ? -0.02 : 0.4;
    (mat.uniforms.uGlowAt.value as THREE.Vector2).set(gx, gy);
  });
  return (
    <mesh renderOrder={-10} frustumCulled={false} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function Ground({ engine }: { engine: Engine }) {
  const size = useThree((s) => s.size);
  const wide = size.width >= 900;
  const cell = wide ? 0.3 : 0.22;
  const aspect = size.width / Math.max(1, size.height);

  const geo = useMemo(() => {
    const p5 = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
    const cells: number[] = [];
    const seeds: number[] = [];
    let r = 0;
    for (let d = 2.4; d < 34; d += cell, r++) {
      const half = (d * aspect) / p5 + cell * 2;
      const n = Math.ceil(half / cell);
      for (let c = -n; c <= n; c++) {
        cells.push(c * cell, -d);
        seeds.push(hash(r * 917 + c * 131));
      }
    }
    const g = instancedBox();
    g.setAttribute("aCell", new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    g.instanceCount = seeds.length;
    return g;
  }, [cell, aspect]);
  useEffect(() => () => geo.dispose(), [geo]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: groundVertex,
        fragmentShader: groundFragment,
        uniforms: {
          uCell: { value: 0.3 },
          uCursor: { value: new THREE.Vector3(0, -6, 0) },
          uHole: { value: [0, 1, 2].map(() => new THREE.Vector4(0, -6, 0.4, 0.3)) },
          uHoleK: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 0)) },
          uTop: { value: col(palette.voxel.top) },
          uSide: { value: col(palette.voxel.side) },
          uSideDeep: { value: col(palette.voxel.sideDeep) },
          uRim: { value: col(palette.voxel.rim) },
          uFog: { value: HAZE },
          uFogRange: { value: new THREE.Vector2(7, 30) },
        },
      }),
    [],
  );
  mat.uniforms.uCell.value = cell;

  useFrame(() => {
    const F = engine.frame;
    (mat.uniforms.uCursor.value as THREE.Vector3).set(F.cursor.x, F.cursor.z, F.cursor.on);
    const holes = mat.uniforms.uHole.value as THREE.Vector4[];
    const ks = mat.uniforms.uHoleK.value as THREE.Vector4[];
    F.holes.forEach((h, i) => {
      holes[i].set(h.x, h.z, h.rx, h.rz);
      ks[i].set(h.disturb, h.sink, h.glow, 0);
    });
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

type HandRig = {
  group: THREE.Group;
  lean: THREE.Group;
  eye: THREE.Mesh;
  eyeMat: THREE.ShaderMaterial;
  upperCtx: CanvasRenderingContext2D;
  upperTex: THREE.CanvasTexture;
  last: { pose: number; tap: number };
  dispose: () => void;
};

function canvasFor(box: { x0: number; y0: number; x1: number; y1: number }) {
  const c = document.createElement("canvas");
  c.width = Math.ceil((box.x1 - box.x0) * TEX_RES);
  c.height = Math.ceil((box.y1 - box.y0) * TEX_RES);
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function prep(ctx: CanvasRenderingContext2D, box: { x0: number; y0: number }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(TEX_RES, 0, 0, TEX_RES, -box.x0 * TEX_RES, -box.y0 * TEX_RES);
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function quadMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: quadFragment,
    transparent: true,
    depthWrite: false,
    uniforms: { uMap: { value: tex } },
  });
}

function makeHand(hue: Hue, mirror: boolean, order: number): HandRig {
  const m = mirror ? -1 : 1;
  const group = new THREE.Group();

  const cuff = canvasFor(CUFF_BOX);
  prep(cuff.ctx, CUFF_BOX);
  cuff.ctx.lineCap = "round";
  drawCuff(cuff.ctx, hue);
  const cuffTex = texture(cuff.c);
  const cuffGeo = new THREE.PlaneGeometry(CUFF_BOX.x1 - CUFF_BOX.x0, CUFF_BOX.y1 - CUFF_BOX.y0);
  const cuffMat = quadMaterial(cuffTex);
  const cuffMesh = new THREE.Mesh(cuffGeo, cuffMat);
  cuffMesh.position.set(m * ((CUFF_BOX.x0 + CUFF_BOX.x1) / 2 - PIVOT.x), CUT - (CUFF_BOX.y0 + CUFF_BOX.y1) / 2, 0);
  cuffMesh.scale.x = m;
  cuffMesh.renderOrder = order;
  cuffMesh.frustumCulled = false;
  group.add(cuffMesh);

  const lean = new THREE.Group();
  lean.position.set(0, CUT - PIVOT.y, 0);
  group.add(lean);

  const upper = canvasFor(UPPER_BOX);
  prep(upper.ctx, UPPER_BOX);
  drawUpper(upper.ctx, hue, 0, 0);
  const upperTex = texture(upper.c);
  const upperGeo = new THREE.PlaneGeometry(UPPER_BOX.x1 - UPPER_BOX.x0, UPPER_BOX.y1 - UPPER_BOX.y0);
  const upperMat = quadMaterial(upperTex);
  const upperMesh = new THREE.Mesh(upperGeo, upperMat);
  upperMesh.position.set(m * ((UPPER_BOX.x0 + UPPER_BOX.x1) / 2 - PIVOT.x), PIVOT.y - (UPPER_BOX.y0 + UPPER_BOX.y1) / 2, 0.5);
  upperMesh.scale.x = m;
  upperMesh.renderOrder = order + 1;
  upperMesh.frustumCulled = false;
  lean.add(upperMesh);

  const eyeGeo = new THREE.PlaneGeometry(100, 84);
  const eyeMat = new THREE.ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: eyeFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPupil: { value: new THREE.Vector2(0, 0) },
      uOpen: { value: 1 },
      uScale: { value: 1 },
      uInk: { value: col(palette.ink) },
    },
  });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.renderOrder = order + 2;
  eye.frustumCulled = false;
  lean.add(eye);

  return {
    group,
    lean,
    eye,
    eyeMat,
    upperCtx: upper.ctx,
    upperTex,
    last: { pose: 0, tap: 0 },
    dispose: () => {
      [cuffGeo, upperGeo, eyeGeo].forEach((g) => g.dispose());
      [cuffMat, upperMat, eyeMat].forEach((mm) => mm.dispose());
      [cuffTex, upperTex].forEach((t) => t.dispose());
    },
  };
}

function Hands({ engine }: { engine: Engine }) {
  const rigs = useMemo(() => HANDS.map((h, i) => makeHand(h.hue, h.mirror, 1 + i * 3)), []);
  useEffect(() => () => rigs.forEach((r) => r.dispose()), [rigs]);

  useFrame(() => {
    const L = engine.layout;
    const P = projection(L);
    rigs.forEach((rig, i) => {
      const f = engine.frame.hands[i];
      const mirror = HANDS[i].mirror;
      const g = P.ground(f.wristX, L.groundY);
      if (!g) return;
      const k = L.s / P.pxPerWorld(g.d);
      rig.group.visible = f.visible > 0.001;
      rig.group.position.set(g.x, G0 + f.yOff * k, g.z);
      rig.group.scale.setScalar(k);
      rig.lean.rotation.z = (-f.tilt * Math.PI) / 180;
      if (Math.abs(f.pose - rig.last.pose) > 0.002 || Math.abs(f.tapDeg - rig.last.tap) > 0.05) {
        rig.last = { pose: f.pose, tap: f.tapDeg };
        prep(rig.upperCtx, UPPER_BOX);
        drawUpper(rig.upperCtx, HANDS[i].hue, f.pose, f.tapDeg);
        rig.upperTex.needsUpdate = true;
      }
      const ex = RING.x + (PALM_EYE.x - RING.x) * f.pose;
      const ey = RING.y + (PALM_EYE.y - RING.y) * f.pose;
      rig.eye.position.set((mirror ? -1 : 1) * (ex - PIVOT.x), PIVOT.y - ey, 1);
      (rig.eyeMat.uniforms.uPupil.value as THREE.Vector2).set(f.eye.px, f.eye.py);
      rig.eyeMat.uniforms.uOpen.value = f.eye.open;
      rig.eyeMat.uniforms.uScale.value = f.eye.scale;
    });
  });

  return (
    <>
      {rigs.map((r, i) => (
        <primitive key={i} object={r.group} />
      ))}
    </>
  );
}

class GlBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail?.();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type GroundSceneProps = {
  engine: Engine;
  onReady?: (render: (t: number) => void) => void;
  onFail?: () => void;
};

export default function GroundScene({ engine, onReady, onFail }: GroundSceneProps) {
  return (
    <GlBoundary onFail={onFail}>
      <Canvas
        className="pointer-events-none! absolute! inset-0"
        style={{ pointerEvents: "none" }}
        frameloop="never"
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" }}
        camera={{ fov: FOV, position: [0, CAM_H, 0], near: 0.1, far: 120 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => onFail?.(), { once: true });
          onReady?.((t) => advance(t));
        }}
        aria-hidden
      >
        <CameraRig engine={engine} />
        <Sky engine={engine} />
        <Ground engine={engine} />
        <Hands engine={engine} />
      </Canvas>
    </GlBoundary>
  );
}
