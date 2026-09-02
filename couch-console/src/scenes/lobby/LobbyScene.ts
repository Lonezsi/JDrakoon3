import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CRT_VERT, CRT_FRAG } from "./shaders";
import { BOUNDS, CUBE_SIZE } from "../../shared/constants";
import type { Player } from "../../shared/types";

const GRAVITY = 28;
const HALF = CUBE_SIZE * 0.5;
const MAX_SPEED = 12;
const PHYS_DT = 1 / 60;
// Square play area. Cubes can roll off the edge and fall into the void.
const PLATFORM_HALF = 13;
// Cubes drop in from this height so they "fall into view" on spawn.
const SPAWN_HEIGHT = 14;
// Below this Y a cube is considered fallen off and gets respawned.
const FALL_Y = -14;
// Vertical launch speed applied on jump (X button).
const JUMP_SPEED = 12;
// Slam attack: only usable in the air. Slams straight down; on impact it flings
// every nearby cube outward in a ring + kicks up a big burst + shakes the camera.
// Every effect (radius / knockback / shake / particles) scales with `power`,
// derived from how far the cube fell during the slam — a stomp from way up hits
// far harder than a hop-and-slam.
const SLAM_DOWN_SPEED = 38; // downward velocity when the slam fires
const SLAM_RADIUS = 7.5; // base (power=1) impact radius; cubes within get launched
const SLAM_KNOCKBACK = 22; // base (power=1) outward launch speed at the centre
const SLAM_SHAKE = 1.1; // base (power=1) camera-shake magnitude added on impact
// Power model: fall distance / SLAM_REF_HEIGHT, clamped. A normal jump-then-slam
// drops ~2.5 units (power ≈ 0.5); a dive off a tall stack approaches the cap.
const SLAM_REF_HEIGHT = 5; // fall distance that yields full (power = 1) impact
const SLAM_MIN_POWER = 0.4; // floor so even a low slam still does something
const SLAM_MAX_POWER = 2.4; // cap so a huge drop can't nuke the whole platform
// Rebound: a jump within this window after a slam launches the cube back up to
// (almost) the height it slammed from — a slam-cancel into a big pop.
const SLAM_BOUNCE_WINDOW = 0.4; // seconds after impact the rebound is available
const SLAM_BOUNCE_FRAC = 0.9; // rebound returns to ~this fraction of slam height
const SLAM_BOUNCE_MAX_H = 18; // cap the rebound height (matches MAX_POWER drops)

interface PlayerState {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  label: THREE.Sprite;
  /** Original player data (id, color, name) – never physics state */
  playerData: Player;
  prevVel: THREE.Vector3;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  /** Peak scale (the mesh shrinks toward 0 as it dies). */
  size: number;
}

function createLabelTexture(name: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;

  ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Rounded pill background sized to the text, with a colored border,
  // so the tag stays readable over any scene content.
  const textW = ctx.measureText(name).width;
  const padX = 36;
  const pillW = textW + padX * 2;
  const pillH = 88;
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.stroke();

  // Name in white with a soft colored glow — pops far more than colored text.
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, cx, cy + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class LobbyScene {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private rt!: THREE.WebGLRenderTarget;
  private postScene!: THREE.Scene;
  private postMat!: THREE.ShaderMaterial;
  private keyLight!: THREE.DirectionalLight;
  private world!: RAPIER.World;
  private players = new Map<string, PlayerState>();
  private particles: Particle[] = [];
  // Players mid-slam (airborne, falling fast) — when one lands we fire the
  // shockwave once and remove it from the set.
  private slamming = new Set<string>();
  // Y at the moment each slam fired, so the landing knows how far it fell
  // (→ impact power).
  private slamStartY = new Map<string, number>();
  // Armed rebound per player after a slam lands: { height to return to, sim
  // time it was armed }. Consumed by the next jump inside SLAM_BOUNCE_WINDOW.
  private slamBounce = new Map<string, { height: number; at: number }>();
  // Camera-shake magnitude (decays each frame); applied as a jitter on top of
  // the fixed camera position.
  private shake = 0;
  private readonly camBase = new THREE.Vector3(0, 13, 17);
  // Shared across all dust particles so we don't allocate geometry per spark.
  private particleGeo = new THREE.SphereGeometry(0.09, 6, 6);
  private animFrameId: number | null = null;
  private lastTime = 0;
  private raycaster = new THREE.Raycaster();
  private accumulator = 0;
  private container: HTMLElement | null = null;

  private crtEnabled = true;
  private crtIntensity = 1; // 0..1; the shader scales every effect by this

  public setCrtEnabled(enabled: boolean) {
    this.crtEnabled = enabled;
  }

  /** Set CRT effect strength. Accepts 0–100 (the settings scale) or 0–1. */
  public setCrtIntensity(value: number) {
    const v = value > 1 ? value / 100 : value;
    this.crtIntensity = Math.max(0, Math.min(1, v));
    if (this.postMat) this.postMat.uniforms.intensity.value = this.crtIntensity;
  }

  // While paused (an app is running) we skip physics + rendering entirely so
  // the GPU/CPU are free for the launched app.
  private paused = false;

  public setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) this.lastTime = performance.now() * 0.001; // avoid dt spike
  }

  // Desired horizontal velocities (set by input)
  private playerInputs = new Map<string, { x: number; z: number }>();
  // Track whether we've already applied the instant stop for a player
  // so we don't keep overriding horizontal velocity and can let
  // gravity / contacts later change it (allowing the cube to roll).
  private inputStopped = new Map<string, boolean>();

  // Callback to push Rapier state back to React
  public onUpdate?: (players: Player[]) => void;

  async init(container: HTMLElement) {
    this.container = container;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });

    // Floor platform — sized to the visible grid. No walls: cubes can roll
    // off the edge and fall into the void (they respawn from above).
    const floorBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(PLATFORM_HALF, 0.25, PLATFORM_HALF)
        .setFriction(3.0)
        .setRestitution(0.1),
      floorBody,
    );

    // Three.js setup
    const W = innerWidth,
      H = innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04040a);
    this.scene.fog = new THREE.Fog(0x04040a, 12, 38);
    this.camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 200);
    this.camera.position.set(0, 13, 17);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.rt = new THREE.WebGLRenderTarget(W, H);
    this.postScene = new THREE.Scene();
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        time: { value: 0 },
        intensity: { value: this.crtIntensity },
      },
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
    });
    this.postScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat),
    );

    // Complementary orange/cyan lighting rig: warm key from one side, cool
    // rim from the opposite, with a dim neutral ambient to lift the shadows.
    this.scene.add(new THREE.AmbientLight(0x9090b0, 0.2));
    this.keyLight = new THREE.DirectionalLight(0xff9a4d, 38);
    this.keyLight.position.set(14, 6, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(4096, 4096);
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 60;
    this.keyLight.shadow.camera.left = -30;
    this.keyLight.shadow.camera.right = 30;
    this.keyLight.shadow.camera.top = 30;
    this.keyLight.shadow.camera.bottom = -30;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x3ad6ff, 22);
    rimLight.position.set(-14, 8, -8);
    this.scene.add(rimLight);

    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(BOUNDS.x * 4, BOUNDS.x * 4),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    );
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
    const grid = new THREE.GridHelper(BOUNDS.x * 4, 22, 0x9999ee, 0x7777ee);
    grid.position.y = -0.01;
    this.scene.add(grid);

    // Visible collision platform: matte, near-black slab matching the
    // physics collider. Top sits a hair below the grid so the grid lines and
    // shadow plane stay visible while the slab reads as the solid floor.
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_HALF * 2, 0.5, PLATFORM_HALF * 2),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.7,
        roughness: 1,
      }),
    );
    slab.position.y = -0.28;
    slab.receiveShadow = true;
    this.scene.add(slab);

    // The grid extends past the physical platform, so trace the actual
    // walkable boundary with a glowing square — past this line you fall.
    const h = PLATFORM_HALF;
    const ringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-h, 0, -h),
      new THREE.Vector3(h, 0, -h),
      new THREE.Vector3(h, 0, h),
      new THREE.Vector3(-h, 0, h),
    ]);
    const ring = new THREE.LineLoop(
      ringGeo,
      new THREE.LineBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.9,
      }),
    );
    ring.position.y = 0.02;
    this.scene.add(ring);

    this.animate(0);
    window.addEventListener("resize", this.onResize);
  }

  /** Set the desired horizontal velocity for any player (world units/sec) */
  public setPlayerInput(playerId: string, vx: number, vz: number) {
    this.playerInputs.set(playerId, { x: vx, z: vz });
  }

  /** Recolor / relabel an existing cube at runtime (e.g. a device picks an
   *  account). playerData is the cosmetic source-of-truth that gets pushed back
   *  to React each frame, so we update it here too — otherwise the next frame
   *  would overwrite the visual change. No-op if the cube doesn't exist yet. */
  public setPlayerCosmetic(playerId: string, color: string, name?: string) {
    const state = this.players.get(playerId);
    if (!state) return;
    if (color) {
      const mat = state.mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(color);
      mat.emissive.set(color);
      state.playerData.color = color;
    }
    if (name !== undefined) state.playerData.name = name;
    // Rebuild the floating name label (text + tint).
    const labelMat = state.label.material as THREE.SpriteMaterial;
    labelMat.map?.dispose();
    labelMat.map = createLabelTexture(state.playerData.name, state.playerData.color);
    labelMat.needsUpdate = true;
  }

  /** A drop-in point above the platform, slightly scattered so cubes don't stack. */
  private spawnPoint() {
    return {
      x: (Math.random() - 0.5) * 4,
      y: SPAWN_HEIGHT,
      z: (Math.random() - 0.5) * 4,
    };
  }

  /** Teleport a cube back above the platform and clear all motion. */
  private respawn(state: PlayerState) {
    const sp = this.spawnPoint();
    state.body.setTranslation({ x: sp.x, y: sp.y, z: sp.z }, true);
    state.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    state.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.body.setGravityScale(1, true); // consistent drop-in speed
    // A cube that slammed straight off the edge never "landed" — cancel the
    // pending shockwave + rebound so neither fires on a later unrelated event.
    const id = state.playerData.id;
    this.slamming.delete(id);
    this.slamStartY.delete(id);
    this.slamBounce.delete(id);
  }

  /** Grounded = a downward raycast (ignoring the cube itself) hits something
   *  within a short distance below it — works on the platform, on top of other
   *  cubes, and regardless of resting orientation. */
  private isGrounded(state: PlayerState): boolean {
    const tr = state.body.translation();
    const ray = new RAPIER.Ray(tr, { x: 0, y: -1, z: 0 });
    // Diagonal half-extent ≈ HALF*1.73 covers a cube resting on its corner.
    const maxDist = HALF * 1.8 + 0.3;
    return !!this.world.castRay(
      ray,
      maxDist,
      true,
      undefined,
      undefined,
      undefined,
      state.body,
    );
  }

  /** Make a cube hop — only when grounded. A jump shortly after a slam lands
   *  rebounds the cube back up to ~the height it slammed from (slam-cancel pop);
   *  otherwise it's a normal fixed-height hop. */
  public jump(playerId: string) {
    const state = this.players.get(playerId);
    if (!state) return;
    if (!this.isGrounded(state)) return;
    const vel = state.body.linvel();

    const b = this.slamBounce.get(playerId);
    if (b && this.lastTime - b.at <= SLAM_BOUNCE_WINDOW) {
      this.slamBounce.delete(playerId);
      // v = sqrt(2·g·h) reaches height h under gravity scale 1, which we force
      // so the rebound is predictable regardless of the resting gravity scale.
      const vy = Math.sqrt(2 * GRAVITY * b.height * SLAM_BOUNCE_FRAC);
      state.body.setGravityScale(1, true);
      state.body.setLinvel(
        { x: vel.x, y: Math.max(JUMP_SPEED, vy), z: vel.z },
        true,
      );
      return;
    }

    state.body.setLinvel({ x: vel.x, y: JUMP_SPEED, z: vel.z }, true);
  }

  /** Slam attack — only usable in the air. Drives the cube straight down at
   *  high speed; the landing is detected in physicsStep, which fires the
   *  shockwave (ring knockback + particle burst + screenshake). */
  public slam(playerId: string) {
    const state = this.players.get(playerId);
    if (!state) return;
    if (this.slamming.has(playerId)) return; // already slamming
    if (this.isGrounded(state)) return; // must be airborne
    const vel = state.body.linvel();
    // Kill most horizontal drift so the slam reads as a straight stomp.
    state.body.setLinvel({ x: vel.x * 0.25, y: -SLAM_DOWN_SPEED, z: vel.z * 0.25 }, true);
    state.body.setGravityScale(1.6, true); // bite a little harder on the way down
    this.slamming.add(playerId);
    this.slamStartY.set(playerId, state.body.translation().y);
  }

  /** Fire the slam shockwave from a cube that just landed: launch every other
   *  cube within the (power-scaled) radius radially outward (stronger near the
   *  centre), kick up a bright ring of particles, and shake the camera. Every
   *  magnitude scales with `power` (∝ how far the cube fell). */
  private triggerSlamImpact(slammer: PlayerState, power: number) {
    const c = slammer.body.translation();
    const radius = SLAM_RADIUS * power;
    const knockback = SLAM_KNOCKBACK * power;
    const spin = 9 * power;
    this.players.forEach((other) => {
      if (other === slammer) return;
      const o = other.body.translation();
      const dx = o.x - c.x;
      const dz = o.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius) return;
      const falloff = 1 - dist / radius; // 1 at the centre → 0 at the rim
      const len = dist || 1;
      const nx = dx / len;
      const nz = dz / len;
      const kb = knockback * (0.45 + 0.55 * falloff);
      other.body.setLinvel({ x: nx * kb, y: kb * 0.6, z: nz * kb }, true);
      other.body.setAngvel(
        {
          x: (Math.random() - 0.5) * spin,
          y: (Math.random() - 0.5) * spin,
          z: (Math.random() - 0.5) * spin,
        },
        true,
      );
      // Normal gravity + mark "already stopped" so physicsStep's snap-stop
      // preserves the launch velocity instead of zeroing it next frame.
      other.body.setGravityScale(1, true);
      this.inputStopped.set(other.playerData.id, true);
    });

    this.spawnSlamBurst(
      new THREE.Vector3(c.x, c.y, c.z),
      slammer.playerData.color,
      power,
    );
    this.shake = Math.max(this.shake, SLAM_SHAKE * power);
  }

  /** Right-stick rotation: spin the cube around WORLD axes (so the direction is
   *  consistent regardless of how the cube is currently tumbled) — horizontal =
   *  yaw (world Y), vertical = pitch (world X). Gentler force than before.
   *  Released stick (0,0) stops the spin; angular damping then settles it. */
  public applySpin(playerId: string, sx: number, sy: number) {
    const state = this.players.get(playerId);
    if (!state) return;
    const SPIN = 3.5; // was 7 — slower, less twitchy
    // setAngvel is world-space in Rapier → global-direction rotation.
    state.body.setAngvel({ x: sy * SPIN, y: -sx * SPIN, z: 0 }, true);
  }

  /** Which player's cube is under this viewport point, if any. Used to make the
   *  lobby cubes clickable (→ open that device's account). Raycasts against the
   *  cube meshes; the CRT curvature warps the displayed image slightly, so this
   *  is approximate near the edges but exact enough for the big central cubes. */
  public pickPlayerId(clientX: number, clientY: number): string | null {
    if (!this.renderer || !this.camera) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    const byMesh = new Map<THREE.Object3D, string>();
    this.players.forEach((st, id) => {
      meshes.push(st.mesh);
      byMesh.set(st.mesh, id);
    });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? (byMesh.get(hit.object) ?? null) : null;
  }

  private physicsStep() {
    this.players.forEach((state) => {
      const vel = state.body.linvel();
      const input = this.playerInputs.get(state.playerData.id);
      const id = state.playerData.id;

      // Determine target horizontal velocity.
      // Behavior:
      // - If there is a non-zero input, immediately set that velocity.
      // - If input is exactly zero, perform a one-shot instant stop
      //   (so the cube appears to stop), but only on the first frame
      //   of the stop. Subsequent frames will not overwrite horizontal
      //   velocity so gravity/contacts can produce movement (roll).
      let targetX = vel.x;
      let targetZ = vel.z;

      if (input && (input.x !== 0 || input.z !== 0)) {
        targetX = input.x;
        targetZ = input.z;
        if (this.inputStopped.get(id) !== false) {
          // resumed moving — restore normal gravity and steady rotation
          state.body.setGravityScale(1, true);
          state.body.setAngularDamping(3.0);
          this.inputStopped.set(id, false);
        }
      } else {
        const stopped = this.inputStopped.get(id) ?? false;
        if (!stopped) {
          // first frame with no move input — snap to zero horizontally,
          // then crank gravity and free up rotation so a cube caught
          // mid-tumble flips flat onto a face quickly instead of hanging
          // on an edge.
          targetX = 0;
          targetZ = 0;
          state.body.setGravityScale(2.6, true);
          state.body.setAngularDamping(0.6);
          this.inputStopped.set(id, true);
        } else {
          // already stopped — do not overwrite horizontal velocity;
          // allow Rapier gravity / contacts to change it naturally
          targetX = vel.x;
          targetZ = vel.z;
        }
      }

      // Speed clamp
      const hSpeed = Math.hypot(targetX, targetZ);
      if (hSpeed > MAX_SPEED) {
        const s = MAX_SPEED / hSpeed;
        targetX *= s;
        targetZ *= s;
      }

      // Apply the velocity if it differs from current horizontal
      // velocity, preserving vertical velocity (Rapier handles gravity).
      if (targetX !== vel.x || targetZ !== vel.z) {
        state.body.setLinvel({ x: targetX, y: vel.y, z: targetZ }, true);
      }

      state.prevVel.set(vel.x, vel.y, vel.z);
    });

    this.world.step();

    // Fall-off respawn + landing dust
    this.players.forEach((state) => {
      const tr = state.body.translation();

      // Rolled off the platform → drop back in from above.
      if (tr.y < FALL_Y) {
        this.respawn(state);
        return;
      }

      // A slamming cube that has reached the ground fires its shockwave once,
      // with power scaled by how far it fell, and arms a brief rebound window.
      const sid = state.playerData.id;
      if (this.slamming.has(sid) && this.isGrounded(state)) {
        this.slamming.delete(sid);
        const startY = this.slamStartY.get(sid) ?? tr.y;
        this.slamStartY.delete(sid);
        const fallDist = Math.max(0, startY - tr.y);
        const power = Math.min(
          SLAM_MAX_POWER,
          Math.max(SLAM_MIN_POWER, fallDist / SLAM_REF_HEIGHT),
        );
        this.triggerSlamImpact(state, power);
        this.slamBounce.set(sid, {
          height: Math.min(SLAM_BOUNCE_MAX_H, fallDist),
          at: this.lastTime,
        });
      }

      const vel = state.body.linvel();
      const dvx = vel.x - state.prevVel.x;
      const dvy = vel.y - state.prevVel.y;
      const dvz = vel.z - state.prevVel.z;
      const impact = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
      // Only kick up dust on a real landing (a downward fall being arrested),
      // so the particles read as being thrown out from the base of the cube.
      if (impact > 5.5 && state.prevVel.y < -3) {
        this.spawnParticles(
          new THREE.Vector3(tr.x, tr.y, tr.z),
          impact,
          state.playerData.color,
        );
      }
    });

    // Push current physics state back to React
    if (this.onUpdate) {
      const updated: Player[] = [];
      this.players.forEach((state) => {
        const tr = state.body.translation();
        const vel = state.body.linvel();
        updated.push({
          ...state.playerData, // cosmetic data (id, name, color)
          pos: { x: tr.x, z: tr.z }, // real Rapier position
          vel: { x: vel.x, z: vel.z },
        });
      });
      this.onUpdate(updated);
    }
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate);
    if (this.paused) {
      this.lastTime = time * 0.001;
      return;
    }
    const t = time * 0.001;
    const dt = Math.min(t - this.lastTime, 0.05);
    this.lastTime = t;
    this.accumulator += dt;
    while (this.accumulator >= PHYS_DT) {
      this.physicsStep();
      this.accumulator -= PHYS_DT;
    }

    // Particles
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        // geometry is shared (this.particleGeo) — only the material is per-particle
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      p.vel.y -= GRAVITY * 0.25 * dt;
      p.vel.multiplyScalar(Math.pow(0.9, dt * 60));
      p.mesh.position.addScaledVector(p.vel, dt);
      const t2 = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t2 * t2;
      p.mesh.scale.setScalar(t2 * p.size);
      return true;
    });

    // Sync meshes from Rapier
    this.players.forEach((state) => {
      const tr = state.body.translation();
      const rot = state.body.rotation();
      state.mesh.position.set(tr.x, tr.y, tr.z);
      state.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      state.label.position.set(tr.x, tr.y + HALF + 0.6, tr.z);
    });

    // Camera shake — jitter the fixed camera by a magnitude that decays fast,
    // then re-aim at the platform centre. At rest (shake ≈ 0) this just pins the
    // camera back to its base position.
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * 2 * s,
        this.camBase.y + (Math.random() - 0.5) * 2 * s,
        this.camBase.z + (Math.random() - 0.5) * 2 * s,
      );
      this.camera.lookAt(0, 0, 0);
      this.shake *= Math.pow(0.0015, dt); // ~0 within ~0.4s
    } else if (this.shake !== 0) {
      this.shake = 0;
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(0, 0, 0);
    }

    // CRT if catch second line of defense
    if (!this.crtEnabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // CRT post‑process
    if (this.crtEnabled) {
      this.postMat.uniforms.time.value = t;
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(
        this.postScene,
        new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      );
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private spawnParticles(center: THREE.Vector3, impact: number, color: string) {
    if (this.particles.length > 200) return;
    const count = Math.min(22, 5 + Math.floor(impact * 1.5));
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);

      // Emit from a ring around the base of the cube, so the dust looks like
      // it's being kicked out sideways from the edges that hit the floor —
      // not exploding out of the cube's centre.
      const theta = Math.random() * Math.PI * 2;
      const r = HALF * (0.5 + Math.random() * 0.6);
      mesh.position.set(
        center.x + Math.cos(theta) * r,
        center.y - HALF + 0.04,
        center.z + Math.sin(theta) * r,
      );
      this.scene.add(mesh);

      const outSpeed = 1.2 + Math.random() * (1.5 + impact * 0.35);
      const upSpeed = 1.0 + Math.random() * 2.2;
      const life = 0.35 + Math.random() * 0.45;
      this.particles.push({
        mesh,
        life,
        maxLife: life,
        size: 0.6,
        vel: new THREE.Vector3(
          Math.cos(theta) * outSpeed,
          upSpeed,
          Math.sin(theta) * outSpeed,
        ),
      });
    }
  }

  /** The slam shockwave's signature burst: a dense, fast-expanding ring of
   *  bright sparks kicked out along the ground from the impact point. Bypasses
   *  the dust cap so the slam always lands with a punch. */
  private spawnSlamBurst(center: THREE.Vector3, color: string, power: number) {
    const col = new THREE.Color(color);
    // More sparks, flying faster and further, the harder the slam lands.
    const count = Math.max(24, Math.min(160, Math.round(64 * power)));
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);

      // Evenly spaced around a tight ring (with a little jitter) so it reads as
      // one expanding shock-front rather than random spray.
      const theta = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const r = HALF * (0.3 + Math.random() * 0.5);
      mesh.position.set(
        center.x + Math.cos(theta) * r,
        center.y - HALF + 0.05,
        center.z + Math.sin(theta) * r,
      );
      this.scene.add(mesh);

      // Ring speed grows with power so a big slam throws sparks much further.
      const outSpeed = (7 + Math.random() * 7) * (0.7 + 0.45 * power);
      const upSpeed = (0.6 + Math.random() * 3.0) * (0.8 + 0.3 * power);
      const life = 0.5 + Math.random() * 0.5;
      this.particles.push({
        mesh,
        life,
        maxLife: life,
        size: 1.3 * (0.85 + 0.25 * power), // chunkier the harder it lands
        vel: new THREE.Vector3(
          Math.cos(theta) * outSpeed,
          upSpeed,
          Math.sin(theta) * outSpeed,
        ),
      });
    }
  }

  /** Add / remove bodies when the player list changes */
  syncEntities(players: Player[]) {
    const incoming = new Set(players.map((p) => p.id));

    // Remove players that left
    this.players.forEach((state, id) => {
      if (!incoming.has(id)) {
        this.scene.remove(state.mesh);
        this.scene.remove(state.label);
        this.world.removeRigidBody(state.body);
        state.mesh.geometry.dispose();
        (state.mesh.material as THREE.Material).dispose();
        this.players.delete(id);
        this.playerInputs.delete(id);
        this.inputStopped.delete(id);
      }
    });

    // Add new players or update cosmetic data
    players.forEach((p) => {
      if (!this.players.has(p.id)) {
        // Create Rapier body — drop in from high up so it falls into view.
        const sp = this.spawnPoint();
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(sp.x, sp.y, sp.z)
            .setLinearDamping(0.0) // instant stop
            .setAngularDamping(3.0)
            .setCcdEnabled(true)
            // Never sleep: the snap-stop zeroes velocity, and Rapier would
            // put the body to sleep — freezing it mid-air / mid-tilt with
            // gravity seemingly "off" until the next input woke it.
            .setCanSleep(false),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(HALF, HALF, HALF)
            .setFriction(0.8)
            .setRestitution(0.1)
            .setDensity(1.0),
          body,
        );

        const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
        const mat = new THREE.MeshStandardMaterial({
          color: p.color,
          emissive: p.color,
          emissiveIntensity: 0.55,
          metalness: 0.3,
          roughness: 0.45,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);

        const texture = createLabelTexture(p.name, p.color);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, depthTest: false }),
        );
        sprite.scale.set(3.2, 0.8, 1);
        this.scene.add(sprite);

        this.players.set(p.id, {
          mesh,
          body,
          label: sprite,
          playerData: { ...p }, // store original cosmetic data
          prevVel: new THREE.Vector3(),
        });
        this.inputStopped.set(p.id, false);
      }
    });
  }

  private onResize = () => {
    const w = innerWidth,
      h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.rt.setSize(w, h);
  };

  dispose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.rt.dispose();
    if (this.container) this.container.innerHTML = "";
  }
}
