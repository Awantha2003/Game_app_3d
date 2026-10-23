// Post-processing: multisampled HDR render, a gentle bloom on bright skies
// and explosions (high quality only), ACES tone mapping, then a colour grade
// with vignette and film grain. Low quality renders straight to the screen.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    sat: { value: 1 }, contrast: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0.3 }, grain: { value: 0.03 }, time: { value: 0 }, flash: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vignette, grain, time, flash; uniform vec3 tint; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.13) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c *= tint;
      c += flash * vec3(0.55, 0.6, 0.7);
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c += (rnd(vUv * 731.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.flash = 0;
  }

  setup(quality) {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.dispose();
    }
    this.composer = null;
    this.enabled = quality !== 'low';
    if (!this.enabled) return;
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
    const c = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (quality === 'high') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.6, 0.92);
      c.addPass(this.bloom);
    } else this.bloom = null;
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.composer = c;
    if (this.gradeCfg) this.setGrade(this.gradeCfg);
    this.resize();
  }

  // colour grade from the mission's atmosphere
  setGrade(g) {
    this.gradeCfg = g;
    if (!this.grade) return;
    const u = this.grade.uniforms;
    u.sat.value = g.sat;
    u.contrast.value = g.contrast;
    u.tint.value.set(...g.tint);
    u.vignette.value = g.vignette;
    u.grain.value = g.grain;
  }

  resize() {
    if (!this.composer) return;
    const r = this.renderer;
    this.composer.setPixelRatio(r.getPixelRatio());
    const s = r.getSize(new THREE.Vector2());
    this.composer.setSize(s.x, s.y);
  }

  render(dt) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.grade.uniforms.flash.value = this.flash;
    this.composer.render(dt);
  }
}
