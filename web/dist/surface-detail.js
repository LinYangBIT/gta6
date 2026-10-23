import * as THREE from 'three';

/** World-space surface detail works on the baked, UV-free Blender meshes. */
export function refineMaterials(root, vehicle = false) {
  const replacements = new Map();
  const seen = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    const refine = original => {
      if (replacements.has(original)) return replacements.get(original);
      let material = original;
      const name = material.name.toLowerCase();
      if (name.includes('satin metallic paint')) {
        material = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(material, original);
        material.defines = { STANDARD: '', PHYSICAL: '' };
        material.name = original.name;
        material.clearcoat = 1;
        material.clearcoatRoughness = .20;
        material.roughness = .30;
        material.metalness = .62;
        replacements.set(original, material);
      }
      if (seen.has(material)) return material;
      seen.add(material);
      if (name.includes('smoked glass')) {
        material.roughness = .12; material.metalness = .25;
        if(vehicle){material.transparent=true;material.opacity=.68;material.depthWrite=false;}
      }
      if (name.includes('machined alloy')) { material.roughness = .21; material.metalness = .94; }
      if (name.includes('rubber')) material.roughness = .97;
      let kind = 0;
      if (name.includes('asphalt')) kind = 1;
      else if (name.includes('promenade') || name.includes('terrazzo')) kind = 2;
      else if (name.includes('sand')) kind = 3;
      else if (/architecture.*(coral|porcelain|seafoam|lavender)|concrete/.test(name)) kind = 4;
      if (kind) {
        material.onBeforeCompile = shader => {
          shader.vertexShader = 'varying vec3 vSurfaceWorld;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
            '#include <worldpos_vertex>\nvSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          shader.fragmentShader = `varying vec3 vSurfaceWorld;
float coastHash(vec3 p) { p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float grain = coastHash(floor(vSurfaceWorld * ${kind === 1 ? '95.0' : '62.0'}));
float fade = 1.0 - smoothstep(12.0, 65.0, length(vViewPosition));
diffuseColor.rgb *= 1.0 + (grain - .5) * ${kind === 1 ? '.23' : '.12'} * fade;
${kind === 2 ? `vec2 paving = abs(fract(vSurfaceWorld.xz / 1.25) - .5);
float grout = smoothstep(.485,.499,max(paving.x,paving.y));
diffuseColor.rgb *= 1.0 - grout * .20 * (1.0 - smoothstep(25.0,85.0,length(vViewPosition)));` : ''}
${kind === 3 ? 'diffuseColor.rgb *= .97 + .03*sin(vSurfaceWorld.x*5.0 + sin(vSurfaceWorld.z*.9));' : ''}
`);
        };
        material.customProgramCacheKey = () => `coast-surface-${kind}-v2`;
        material.needsUpdate = true;
      }
      material.envMapIntensity = vehicle ? 1.35 : .65;
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(refine) : refine(object.material);
  });
}
