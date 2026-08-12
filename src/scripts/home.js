
import * as THREE from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";



function initHomeScene() {
    const container = document.getElementById('canvas-container');

    if (!container) return;

    if (container.dataset.initialized === 'true') return;

    container.dataset.initialized = 'true';
    container.innerHTML = '';
// ======================
// Scene
// ======================

const scene = new THREE.Scene();





// ======================
// Camera
// ======================

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 0, 5);


// ======================
// Renderer
// ======================

//模型背景色
// scene.background = new THREE.Color(0x1b1b1b);
scene.background = null;
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
});


renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

container.appendChild(renderer.domElement);


// ======================
// Light
// ======================

const rgbeLoader = new RGBELoader();


const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let currentEnvMap = null;

// 先加载 1K

rgbeLoader.load('/img/studio_kontrast_04_1k.hdr', function (texture) {

    const envMap1K = pmremGenerator.fromEquirectangular(texture).texture;

    currentEnvMap = envMap1K;
    scene.environment = envMap1K;

    texture.dispose();

    console.log('1K HDR 加载成功');

    // 后台升级到 2K

    rgbeLoader.load('/img/studio_kontrast_04_2k.hdr', function (texture2) {

        const envMap2K = pmremGenerator.fromEquirectangular(texture2).texture;

        scene.environment = envMap2K;

        if (currentEnvMap) {
            currentEnvMap.dispose();
        }

        currentEnvMap = envMap2K;

        texture2.dispose();

        console.log('2K HDR 升级成功');

    });

});

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
scene.environmentIntensity = 1.5;







const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);//环境光

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);//主光

const rimLight = new THREE.DirectionalLight(0x4aa3ff, 0.8);
rimLight.position.set(-5, 2, -5);
scene.add(rimLight);//轮廓光



// ======================
// Controls
// ======================

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;

controls.enablePan = false;

controls.autoRotate = true;

controls.autoRotateSpeed = 1;

controls.minDistance = 3;

controls.maxDistance = 6;

controls.minPolarAngle = Math.PI / 2;
controls.maxPolarAngle = Math.PI / 2;

// ======================
// GLB Loader
// ======================

const loader = new GLTFLoader();

loader.load(

    '/models/szt-model.glb',
    

    function (gltf) {

        const model = gltf.scene;

        window.gltfScene = gltf.scene; //调试代码,可删

        // 自动居中，第一次计算包围盒
        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());

        // 自动缩放（建议按最长边，而不是对角线）
        const targetSize = 2.5;
        const maxAxis = Math.max(size.x, size.y, size.z);
            
        const scale = targetSize / maxAxis;
        model.scale.setScalar(scale);
            
        // 缩放后更新矩阵
        model.updateMatrixWorld(true);
            
        // 重新计算包围盒
        box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        size = box.getSize(new THREE.Vector3()); 
            
        // 最后再居中
        model.position.set(
            -center.x,
            -center.y + size.y * 0.1,
            -center.z
        );

        // 修复部分模型发黑
        model.traverse((child) => {

            if (child.isMesh) {

                child.material.side = THREE.DoubleSide;

                if (child.material.name === 'mat_glass') {
                    child.material.transparent = true;
                    child.material.opacity = 0.6;
                  
                    child.material.metalness = 0.0;
                    child.material.envMapIntensity = 2.0;
                    child.material.roughness = 0.02;
                  
                    child.material.color.set(0x4aa3ff); // 蓝色
                  }

                if (child.material.name === 'mat_frame') {
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.25;
                    child.material.color.set(0x0f0f10);

                    child.material.envMapIntensity = 1.5;
                }

            }

        });

        scene.add(model);

        console.log('模型加载成功');

    },

    undefined,

    function (error) {

        console.error('模型加载失败');

        console.error(error);

    }

);


// ======================
// Resize
// ======================

window.addEventListener('resize', () => {

    camera.aspect = window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

});


// ======================
// Animation
// ======================

function animate() {

    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);

}

animate();

}

initHomeScene();

document.addEventListener('astro:page-load', initHomeScene);
