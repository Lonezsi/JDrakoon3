import * as THREE from "three";
import { CRT_VERT, CRT_FRAG } from "./shaders";
import { BOUNDS, CUBE_SIZE } from "../../shared/constants";
import type { Player } from "../../shared/types";

function createLabelTexture(name: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  // Text style
  ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Background (semi-transparent)
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text
  ctx.fillStyle = color;
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

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
  private meshes = new Map<string, THREE.Mesh>();
  private labels = new Map<string, THREE.Sprite>();
  private animFrameId: number | null = null;
  private container: HTMLElement | null = null;

  init(container: HTMLElement) {
    this.container = container;
    const W = window.innerWidth,
      H = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04040a);
    this.scene.fog = new THREE.Fog(0x04040a, 12, 38);

    this.camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 200);
    this.camera.position.set(0, 13, 17);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // CRT
    this.rt = new THREE.WebGLRenderTarget(W, H);
    this.postScene = new THREE.Scene();
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, time: { value: 0 } },
      vertexShader: CRT_VERT,
      fragmentShader: CRT_FRAG,
    });
    this.postScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat),
    );

    // Lighting0xec4899
    this.scene.add(new THREE.AmbientLight(0xec4899, 0.45));
    this.keyLight = new THREE.DirectionalLight(0xffffff, 40);

    this.keyLight.position.set(14, 3, 6);

    this.keyLight.castShadow = true;

    this.keyLight.shadow.mapSize.width = 4096;
    this.keyLight.shadow.mapSize.height = 4096;

    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 60;

    this.keyLight.shadow.camera.left = -30;
    this.keyLight.shadow.camera.right = 30;
    this.keyLight.shadow.camera.top = 30;
    this.keyLight.shadow.camera.bottom = -30;

    this.keyLight.shadow.bias = -0.0001;

    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight);
    const fillLight = new THREE.PointLight(0xffffff, 3, 16);
    fillLight.position.set(-6, 4, -4);
    this.scene.add(fillLight);

    // Grid
    //const grid = new THREE.GridHelper(BOUNDS.x * 2, 22, 0x1e1a4e, 0x0f0d2a)
    const grid = new THREE.GridHelper(BOUNDS.x * 4, 22, 0x9999ee, 0x7777ee);
    grid.position.y = -0.62;
    this.scene.add(grid);

    this.animate(0);

    window.addEventListener("resize", this.onResize);
  }

  private animate = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.animate);
    const t = time * 0.001;
    this.postMat.uniforms.time.value = t;
    this.keyLight.position.set(Math.sin(t * 0.4) * 6, 6, Math.cos(t * 0.4) * 6);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(
      this.postScene,
      new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    );
  };

  syncEntities(players: Player[]) {
    players.forEach((p) => {
      // --- Cube mesh ---
      if (!this.meshes.has(p.id)) {
        const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
        const mat = new THREE.MeshStandardMaterial({
          color: p.color,
          emissive: p.color,
          emissiveIntensity: 5.0,
          metalness: 0.2,
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.pos.x, 0, p.pos.z);
        this.scene.add(mesh);
        this.meshes.set(p.id, mesh);

        // Label sprite
        const texture = createLabelTexture(p.name, p.color);
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.5, 0.625, 1); // width:height ratio ~ 4:1
        sprite.position
          .copy(mesh.position)
          .add(new THREE.Vector3(0, CUBE_SIZE / 2 + 0.6, 0));
        this.scene.add(sprite);
        this.labels.set(p.id, sprite);
      } else {
        const mesh = this.meshes.get(p.id)!;
        mesh.position.lerp(new THREE.Vector3(p.pos.x, 0, p.pos.z), 0.28);
        const spd = Math.hypot(p.vel.x, p.vel.z);
        if (spd > 0.01) {
          mesh.rotation.x += p.vel.z * 0.42;
          mesh.rotation.z -= p.vel.x * 0.42;
          mesh.rotation.y += 0.012;
        }

        // Update label position (above cube)
        const label = this.labels.get(p.id);
        if (label) {
          label.position.lerp(
            mesh.position
              .clone()
              .add(new THREE.Vector3(0, CUBE_SIZE / 2 + 0.6, 0)),
            0.28,
          );
        }
      }
    });

    // Remove entities that are no longer in the player list
    this.meshes.forEach((mesh, id) => {
      if (!players.find((p) => p.id === id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.meshes.delete(id);

        const label = this.labels.get(id);
        if (label) {
          this.scene.remove(label);
          (label.material as THREE.SpriteMaterial).map?.dispose();
          label.material.dispose();
          this.labels.delete(id);
        }
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
    if (this.container) this.container.innerHTML = "";
    this.renderer.dispose();
    this.rt.dispose();

    // Remove all labels
    this.labels.forEach((sprite, id) => {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    });
    this.labels.clear();
    // (meshes are already disposed in the loop above? Actually `dispose` is not called for each mesh in that method; add a similar loop for meshes to be safe.)
    this.meshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.meshes.clear();
  }
}
