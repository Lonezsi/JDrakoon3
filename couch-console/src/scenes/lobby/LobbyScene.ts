import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CRT_VERT, CRT_FRAG } from "./shaders";
import { BOUNDS, CUBE_SIZE } from "../../shared/constants";
import type { Player } from "../../shared/types";

const GRAVITY = 28;
const HALF = CUBE_SIZE * 0.5;
const MAX_SPEED = 12;
const PHYS_DT = 1 / 60;

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
}

function createLabelTexture(name: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillText(name, canvas.width * 0.5, canvas.height * 0.5);
  return new THREE.CanvasTexture(canvas);
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
  private animFrameId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private container: HTMLElement | null = null;

  private crtEnabled = true;

  public setCrtEnabled(enabled: boolean) {
    this.crtEnabled = enabled;
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

    // Floor
    const floorBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(BOUNDS.x * 2, 0.05, BOUNDS.x * 2)
        .setFriction(3.0)
        .setRestitution(0.1),
      floorBody,
    );

    // Walls
    const half = BOUNDS.x;
    const wallH = 4;
    const wallT = 0.5;
    const walls: [number, number, number, number, number][] = [
      [half, wallH, 0, wallT, half],
      [-half, wallH, 0, wallT, half],
      [0, wallH, half, half, wallT],
      [0, wallH, -half, half, wallT],
    ];
    for (const [px, py, pz, hx, hz] of walls) {
      const wb = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, wallH, hz).setRestitution(0.4),
        wb,
      );
    }

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
      uniforms: { tDiffuse: { value: this.rt.texture }, time: { value: 0 } },
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
    });
    this.postScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat),
    );

    this.scene.add(new THREE.AmbientLight(0xec4899, 0.45));
    this.keyLight = new THREE.DirectionalLight(0xffffff, 40);
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
    const fill = new THREE.PointLight(0xffffff, 3, 16);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);

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

    this.animate(0);
    window.addEventListener("resize", this.onResize);
  }

  /** Set the desired horizontal velocity for any player (world units/sec) */
  public setPlayerInput(playerId: string, vx: number, vz: number) {
    this.playerInputs.set(playerId, { x: vx, z: vz });
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
        this.inputStopped.set(id, false);
      } else {
        const stopped = this.inputStopped.get(id) ?? false;
        if (!stopped) {
          // first frame with no move input — snap to zero horizontally
          targetX = 0;
          targetZ = 0;
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

    // Impact particles
    this.players.forEach((state) => {
      const vel = state.body.linvel();
      const dvx = vel.x - state.prevVel.x;
      const dvy = vel.y - state.prevVel.y;
      const dvz = vel.z - state.prevVel.z;
      const impact = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
      if (impact > 5.5) {
        const tr = state.body.translation();
        this.spawnParticles(new THREE.Vector3(tr.x, tr.y, tr.z), impact);
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
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      p.vel.y -= GRAVITY * 0.25 * dt;
      p.vel.multiplyScalar(Math.pow(0.9, dt * 60));
      p.mesh.position.addScaledVector(p.vel, dt);
      const t2 = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t2 * t2;
      p.mesh.scale.setScalar(t2 * 0.6);
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

  private spawnParticles(pos: THREE.Vector3, impact: number) {
    if (this.particles.length > 150) return;
    const count = Math.min(40, 6 + Math.floor(impact * 3));
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 5), mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const speed = 4 + Math.random() * impact * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({
        mesh,
        life,
        maxLife: life,
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.abs(Math.cos(phi)) * speed,
          Math.sin(phi) * Math.sin(theta) * speed,
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
        // Create Rapier body
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(p.pos.x, HALF, p.pos.z)
            .setLinearDamping(0.0) // instant stop
            .setAngularDamping(3.0)
            .setCcdEnabled(true),
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
          emissiveIntensity: 5,
          metalness: 0.2,
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);

        const texture = createLabelTexture(p.name, p.color);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, depthTest: false }),
        );
        sprite.scale.set(2.5, 0.625, 1);
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
