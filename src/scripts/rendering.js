import * as THREE from "three";

import {
  OrbitControls,
} from "three/examples/jsm/controls/OrbitControls.js";

import {
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  RGBELoader,
} from "three/examples/jsm/loaders/RGBELoader.js";

import {
  DecalGeometry,
} from "three/examples/jsm/geometries/DecalGeometry.js";

import {
  EffectComposer,
} from "three/examples/jsm/postprocessing/EffectComposer.js";

import {
  RenderPass,
} from "three/examples/jsm/postprocessing/RenderPass.js";

import {
  UnrealBloomPass,
} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import {
  OutputPass,
} from "three/examples/jsm/postprocessing/OutputPass.js";


let activeViewers = [];

/*
 * 保存静态作品查看器的清理函数。
 */
let stillViewerCleanup = null;


/* ==============================
   Paths
============================== */

const baseUrl =
  import.meta.env.BASE_URL;

const normalizedBaseUrl =
  baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;

const DECAL_TEXTURE_URL =
  `${normalizedBaseUrl}img/rendering/IMG_9868.png`;

const HDR_TEXTURE_URL =
  `${normalizedBaseUrl}img/waijing.hdr`;


/* ==============================
   Decal Settings
============================== */

/*
 * Blender中用于确定贴花位置和方向的空物体。
 */
const DECAL_ANCHOR_NAME =
  "Decal_Anchor_01";


/*
 * 空物体局部-Z轴指向模型表面。
 */
const DECAL_LOCAL_DIRECTION =
  new THREE.Vector3(
    0,
    0,
    -1
  );


/*
 * 空物体局部+Y轴作为贴图上方。
 */
const DECAL_LOCAL_UP =
  new THREE.Vector3(
    0,
    1,
    0
  );


/*
 * X：贴花宽度
 * Y：贴花高度
 * Z：投射深度
 */
const DECAL_SIZE =
  new THREE.Vector3(
    1.01,
    0.575,
    0.03
  );


/*
 * 以空物体局部坐标为基准，
 * 微调贴花位置。
 */
const DECAL_POSITION_OFFSET =
  new THREE.Vector3(
    0.002,
    0.003,
    0
  );


/*
 * 修正贴图在投射平面内的方向。
 */
const DECAL_ROTATION_Z =
  Math.PI;


/*
 * 射线经过这些物体时跳过，
 * 避免将贴花投射到前方遮挡物。
 */
const DECAL_IGNORED_OBJECTS =
  new Set([
    "Shape024",
  ]);


/* ==============================
   Rendering Settings
============================== */

/*
 * 3D窗口可切换的两种背景颜色。
 */
const LIGHT_VIEWER_BACKGROUND_COLOR =
  0xe3e7eb;

const DARK_VIEWER_BACKGROUND_COLOR =
  0x2e3136;


/*
 * 整个最终画面的曝光。
 */
const VIEWER_EXPOSURE =
  1;


/*
 * 两个窗口分别使用的
 * HDR环境照明和反射强度。
 */
const PRIMARY_HDR_INTENSITY =
  0.8;

const SECONDARY_HDR_INTENSITY =
  0.7;


/* ==============================
   Material Settings
============================== */

/*
 * 只修改名称写在这里的自发光材质。
 * 没有写入的材质保持GLB原始设置。
 */
const EMISSIVE_INTENSITY_BY_NAME = {
  "Material #46": 10,
  "Material #100": 10,
  "Material #42": 3,
};


/*
 * 单独控制指定材质受到HDR反射的强度。
 */
const ENV_INTENSITY_BY_NAME = {
  "Black plastic": 0.7,
  "Silver plastic": 0.7,
};


/* ==============================
   Dispose Utilities
============================== */

function disposeMaterial(
  material,
  disposedTextures = new Set()
) {
  if (!material) return;

  Object.values(material).forEach(
    (value) => {
      if (
        value?.isTexture &&
        !disposedTextures.has(value)
      ) {
        disposedTextures.add(value);
        value.dispose();
      }
    }
  );

  material.dispose();
}


function disposeObject(object) {
  const disposedTextures =
    new Set();

  const disposedMaterials =
    new Set();

  const disposedGeometries =
    new Set();

  object.traverse((child) => {
    if (!child.isMesh) return;

    if (
      child.geometry &&
      !disposedGeometries.has(
        child.geometry
      )
    ) {
      disposedGeometries.add(
        child.geometry
      );

      child.geometry.dispose();
    }

    const materials =
      Array.isArray(child.material)
        ? child.material
        : [child.material];

    materials.forEach((material) => {
      if (
        !material ||
        disposedMaterials.has(material)
      ) {
        return;
      }

      disposedMaterials.add(material);

      disposeMaterial(
        material,
        disposedTextures
      );
    });
  });
}


function disposeDecalResources(
  scene,
  resources
) {
  if (!resources) return;

  resources.meshes.forEach(
    (mesh) => {
      scene.remove(mesh);
    }
  );

  resources.geometries.forEach(
    (geometry) => {
      geometry.dispose();
    }
  );

  resources.material.dispose();
  resources.texture.dispose();
}


/* ==============================
   Decal Utilities
============================== */

/*
 * 多材质物体导出GLB后可能变成：
 *
 * Mesh083
 * Mesh083_1
 * Mesh083_2
 *
 * 这里取得这些网格共同的基础名称。
 */
function getMeshFamilyName(name) {
  return name.replace(
    /_\d+$/,
    ""
  );
}


/*
 * 收集同一个Blender物体拆出的全部网格，
 * 让贴花可以跨越多个材质区域。
 */
function collectRelatedMeshes(
  model,
  target
) {
  const familyName =
    getMeshFamilyName(
      target.name
    );

  const meshes = [];

  model.traverse((child) => {
    if (!child.isMesh) return;

    if (
      child.name === familyName ||
      child.name.startsWith(
        `${familyName}_`
      )
    ) {
      meshes.push(child);
    }
  });

  return meshes.length > 0
    ? meshes
    : [target];
}


/* ==============================
   Create Decal
============================== */

async function createModelDecal({
  scene,
  model,
  textureUrl,
}) {
  const anchor =
    model.getObjectByName(
      DECAL_ANCHOR_NAME
    );

  if (!anchor) {
    console.warn(
      `没有找到贴花定位空物体：${DECAL_ANCHOR_NAME}`
    );

    return null;
  }

  model.updateMatrixWorld(true);

  anchor.updateWorldMatrix(
    true,
    false
  );

  const anchorPosition =
    new THREE.Vector3();

  const anchorQuaternion =
    new THREE.Quaternion();

  const anchorScale =
    new THREE.Vector3();

  anchor.matrixWorld.decompose(
    anchorPosition,
    anchorQuaternion,
    anchorScale
  );


  /*
   * 将空物体局部-Z轴转换成
   * Three.js世界空间中的射线方向。
   */
  const rayDirection =
    DECAL_LOCAL_DIRECTION
      .clone()
      .applyQuaternion(
        anchorQuaternion
      )
      .normalize();

  const raycaster =
    new THREE.Raycaster(
      anchorPosition,
      rayDirection,
      0,
      Infinity
    );


  /*
   * 取得射线碰到的第一个有效网格。
   */
  const intersection =
    raycaster
      .intersectObject(
        model,
        true
      )
      .find((result) => {
        const object =
          result.object;

        return (
          object?.isMesh &&
          !DECAL_IGNORED_OBJECTS.has(
            object.name
          )
        );
      });

  if (!intersection) {
    console.warn(
      "贴花定位空物体没有射中模型。"
    );

    return null;
  }


  /*
   * 根据空物体局部坐标
   * 对贴花位置进行微调。
   */
  const position =
    intersection.point
      .clone()
      .add(
        DECAL_POSITION_OFFSET
          .clone()
          .applyQuaternion(
            anchorQuaternion
          )
      );

  const targetMeshes =
    collectRelatedMeshes(
      model,
      intersection.object
    );


  /*
   * 射线指向模型内部，
   * 投射器正面朝向相反方向。
   */
  const outwardDirection =
    rayDirection
      .clone()
      .negate();

  const decalUp =
    DECAL_LOCAL_UP
      .clone()
      .applyQuaternion(
        anchorQuaternion
      )
      .normalize();

  const projector =
    new THREE.Object3D();

  projector.position.copy(
    position
  );

  projector.up.copy(
    decalUp
  );

  projector.lookAt(
    position
      .clone()
      .add(
        outwardDirection
      )
  );

  projector.rotateZ(
    DECAL_ROTATION_Z
  );

  projector.updateMatrixWorld(
    true
  );

  const orientation =
    projector.rotation.clone();


  /*
   * 加载透明PNG贴花。
   */
  const texture =
    await new THREE.TextureLoader()
      .loadAsync(textureUrl);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.flipY = false;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const material =
    new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,

      transparent: true,
      opacity: 1,
      alphaTest: 0.01,

      depthTest: true,
      depthWrite: false,

      /*
       * 将贴花轻微推向摄像机，
       * 避免与原模型表面闪烁。
       */
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,

      side: THREE.DoubleSide,
    });

  const meshes = [];
  const geometries = [];

  targetMeshes.forEach(
    (
      target,
      index
    ) => {
      target.updateWorldMatrix(
        true,
        false
      );

      const geometry =
        new DecalGeometry(
          target,
          position,
          orientation,
          DECAL_SIZE
        );

      const vertexCount =
        geometry.attributes
          .position?.count ?? 0;

      /*
       * 不在贴花范围内的拆分网格
       * 会生成空几何体，直接跳过。
       */
      if (vertexCount === 0) {
        geometry.dispose();
        return;
      }

      const decal =
        new THREE.Mesh(
          geometry,
          material
        );

      decal.name =
        `Runtime_Decal_01_${index + 1}`;

      decal.renderOrder = 10;

      scene.add(decal);

      meshes.push(decal);
      geometries.push(geometry);
    }
  );

  if (meshes.length === 0) {
    material.dispose();
    texture.dispose();

    return null;
  }

  return {
    meshes,
    geometries,
    material,
    texture,
  };
}


/* ==============================
   Placeholder Model
============================== */

/*
 * 第二个窗口暂时使用六边形测试模型。
 */
function createHexagonGeometry() {
  const shape =
    new THREE.Shape();

  const sides = 6;
  const radius = 1.45;

  for (
    let index = 0;
    index < sides;
    index += 1
  ) {
    const angle =
      (
        index /
        sides
      ) *
      Math.PI *
      2;

    const x =
      Math.cos(angle) *
      radius;

    const y =
      Math.sin(angle) *
      radius;

    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();

  const geometry =
    new THREE.ExtrudeGeometry(
      shape,
      {
        depth: 1.8,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.12,
        bevelSegments: 4,
        steps: 1,
      }
    );

  geometry.center();

  return geometry;
}


/*
 * 第二个窗口只创建测试模型，
 * 不创建突兀的圆形地面。
 */
function createPlaceholderScene(
  objectGroup
) {
  const geometry =
    createHexagonGeometry();

  const material =
    new THREE.MeshPhysicalMaterial({
      color: 0xb89263,
      metalness: 0.9,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });

  const hexagon =
    new THREE.Mesh(
      geometry,
      material
    );

  objectGroup.add(hexagon);

  const edgeGeometry =
    new THREE.EdgesGeometry(
      geometry,
      25
    );

  const edgeMaterial =
    new THREE.LineBasicMaterial({
      color: 0xf4d7b1,
      transparent: true,
      opacity: 0.55,
    });

  const edges =
    new THREE.LineSegments(
      edgeGeometry,
      edgeMaterial
    );

  objectGroup.add(edges);

  return {
    hexagon,
    edges,
    geometry,
    material,
    edgeGeometry,
    edgeMaterial,
  };
}


/* ==============================
   Fit Camera
============================== */

/*
 * 根据模型尺寸自动居中模型，
 * 并调整相机距离和缩放范围。
 */
function fitCameraToObject(
  camera,
  controls,
  object,
  viewer
) {
  object.updateMatrixWorld(true);

  const box =
    new THREE.Box3()
      .setFromObject(object);

  if (box.isEmpty()) {
    return null;
  }

  const center =
    box.getCenter(
      new THREE.Vector3()
    );


  /*
   * 水平居中模型，
   * 并让模型底部落在Y=0。
   */
  object.position.x -= center.x;
  object.position.y -= box.min.y;
  object.position.z -= center.z;

  object.updateMatrixWorld(true);

  const adjustedBox =
    new THREE.Box3()
      .setFromObject(object);

  const size =
    adjustedBox.getSize(
      new THREE.Vector3()
    );

  const maxDimension =
    Math.max(
      size.x,
      size.y,
      size.z
    );

  const target =
    new THREE.Vector3(
      0,
      size.y * 0.45,
      0
    );

  controls.target.copy(target);

  const verticalFov =
    THREE.MathUtils.degToRad(
      camera.fov
    );

  const aspect =
    Math.max(
      viewer.clientWidth /
        Math.max(
          viewer.clientHeight,
          1
        ),
      0.1
    );

  const horizontalFov =
    2 *
    Math.atan(
      Math.tan(
        verticalFov / 2
      ) *
      aspect
    );

  const verticalDistance =
    size.y /
    (
      2 *
      Math.tan(
        verticalFov / 2
      )
    );

  const horizontalDistance =
    size.x /
    (
      2 *
      Math.tan(
        horizontalFov / 2
      )
    );

  const distance =
    Math.max(
      verticalDistance,
      horizontalDistance,
      maxDimension
    ) *
    1.25;

  const cameraDirection =
    new THREE.Vector3(
      1,
      0.62,
      1
    ).normalize();

  camera.position.copy(
    target
      .clone()
      .add(
        cameraDirection
          .multiplyScalar(distance)
      )
  );

  camera.near =
    Math.max(
      maxDimension / 1000,
      0.001
    );

  camera.far =
    Math.max(
      maxDimension * 100,
      100
    );

  camera.updateProjectionMatrix();

  controls.minDistance =
    Math.max(
      maxDimension * 0.35,
      0.01
    );

  controls.maxDistance =
    Math.max(
      maxDimension * 6,
      distance * 2
    );

  controls.update();

  return {
    size,
    maxDimension,
  };
}


/* ==============================
   Create Viewer
============================== */

function createViewer(
  viewer,
  index
) {
  const canvas =
    viewer.querySelector(
      ".viewer-canvas"
    );

  const loadingElement =
    viewer.querySelector(
      ".viewer-loading"
    );

  const loadingProgressTrack =
    viewer.querySelector(
      "[data-loading-progress]"
    );

  const loadingProgressBar =
    loadingProgressTrack
      ?.querySelector("span");

  const loadingPercentage =
    viewer.querySelector(
      "[data-loading-percentage]"
    );

  const modelUrl =
    viewer.dataset.model;

  if (!canvas) {
    return null;
  }


  /*
   * 两个窗口加载相同HDR，
   * 但分别使用不同的环境光强度。
   */
  const hdrIntensity =
    index === 0
      ? PRIMARY_HDR_INTENSITY
      : SECONDARY_HDR_INTENSITY;


  /* ============================
     Loading
  ============================ */

  const loadingStartedAt =
    performance.now();

  const minimumLoadingTime =
    650;

  let loadingTimeoutId = 0;

  let firstFrameRendered =
    false;

  let contentReady =
    false;

  let destroyed =
    false;


  /*
   * 第一个窗口的总进度：
   *
   * GLB：90%
   * HDR：10%
   *
   * 第二个窗口没有GLB，
   * 因此进度完全跟随HDR。
   */
  let modelLoadProgress =
    modelUrl
      ? 0
      : 100;

  let hdrLoadProgress = 0;
  let displayedProgress = 0;


  function setDisplayedProgress(value) {
    const normalizedValue =
      THREE.MathUtils.clamp(
        value,
        0,
        100
      );

    /*
     * 不允许进度条向后退。
     */
    displayedProgress =
      Math.max(
        displayedProgress,
        normalizedValue
      );

    const roundedValue =
      Math.round(
        displayedProgress
      );

    if (loadingProgressBar) {
      loadingProgressBar.style.width =
        `${displayedProgress}%`;
    }

    if (loadingPercentage) {
      loadingPercentage.textContent =
        `${roundedValue}%`;
    }

    loadingProgressTrack?.setAttribute(
      "aria-valuenow",
      String(roundedValue)
    );
  }


  function updateCombinedProgress() {
    const combinedProgress =
      modelUrl
        ? (
            modelLoadProgress *
              0.9 +
            hdrLoadProgress *
              0.1
          )
        : hdrLoadProgress;

    setDisplayedProgress(
      combinedProgress
    );
  }


  loadingElement?.classList.remove(
    "is-hidden"
  );

  loadingElement?.removeAttribute(
    "aria-hidden"
  );

  setDisplayedProgress(0);


  function finishLoading() {
    if (
      !loadingElement ||
      destroyed
    ) {
      return;
    }

    setDisplayedProgress(100);

    const elapsedTime =
      performance.now() -
      loadingStartedAt;

    const remainingTime =
      Math.max(
        0,
        minimumLoadingTime -
          elapsedTime
      );

    loadingTimeoutId =
      window.setTimeout(
        () => {
          if (destroyed) return;

          loadingElement.classList.add(
            "is-hidden"
          );

          loadingElement.setAttribute(
            "aria-hidden",
            "true"
          );
        },
        remainingTime
      );
  }


  /* ============================
     Scene
  ============================ */

  const scene =
    new THREE.Scene();

  /*
   * HDR不作为可见背景，
   * 每个Viewer独立保存自己的
   * 背景颜色状态。
   */
  let isDarkBackground = false;

  scene.background =
    new THREE.Color(
      LIGHT_VIEWER_BACKGROUND_COLOR
    );


  /* ============================
     Camera
  ============================ */

  const camera =
    new THREE.PerspectiveCamera(
      40,
      1,
      0.1,
      100
    );

  camera.position.set(
    index === 0
      ? 4.8
      : 5.2,

    index === 0
      ? 2.8
      : 2.2,

    index === 0
      ? 5.5
      : 5
  );


  /* ============================
     Renderer
  ============================ */

  const renderer =
    new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference:
        "high-performance",
    });

  const pixelRatio =
    Math.min(
      window.devicePixelRatio,
      2
    );

  renderer.setPixelRatio(
    pixelRatio
  );

  renderer.outputColorSpace =
    THREE.SRGBColorSpace;

  renderer.toneMapping =
    THREE.ACESFilmicToneMapping;

  renderer.toneMappingExposure =
    VIEWER_EXPOSURE;

  renderer.shadowMap.enabled =
    true;

  renderer.shadowMap.type =
    THREE.PCFShadowMap;


  /* ============================
     Bloom
  ============================ */

  /*
   * 后期处理顺序：
   *
   * RenderPass：渲染原始场景
   * UnrealBloomPass：添加光晕
   * OutputPass：最终色调和色彩空间
   */
  const composer =
    new EffectComposer(renderer);

  composer.setPixelRatio(
    pixelRatio
  );

  const renderPass =
    new RenderPass(
      scene,
      camera
    );

  composer.addPass(renderPass);


  /*
   * 参数依次为：
   *
   * 光晕强度
   * 扩散范围
   * 发光阈值
   */
  const bloomPass =
    new UnrealBloomPass(
      new THREE.Vector2(
        viewer.clientWidth,
        viewer.clientHeight
      ),

      0.08,
      0.06,
      1.5
    );

  composer.addPass(bloomPass);

  const outputPass =
    new OutputPass();

  composer.addPass(outputPass);


  /* ============================
     HDR Environment
  ============================ */

  let hdrTexture = null;


  /*
   * 两个窗口加载同一张HDR。
   * HDR只参与照明和反射，
   * 不作为可见背景。
   */
  const environmentPromise =
    new Promise((resolve) => {
      const hdrLoader =
        new RGBELoader();

      hdrLoader.load(
        HDR_TEXTURE_URL,

        (texture) => {
          hdrLoadProgress = 100;
          updateCombinedProgress();

          if (destroyed) {
            texture.dispose();
            resolve(null);

            return;
          }

          texture.mapping =
            THREE
              .EquirectangularReflectionMapping;

          scene.environment =
            texture;

          scene.environmentIntensity =
            hdrIntensity;

          hdrTexture =
            texture;

          resolve(texture);
        },

        (progressEvent) => {
          if (
            progressEvent.total > 0
          ) {
            hdrLoadProgress =
              Math.min(
                (
                  progressEvent.loaded /
                  progressEvent.total
                ) *
                  100,
                99
              );

            updateCombinedProgress();
          }
        },

        (error) => {
          console.error(
            `无法加载HDR环境：${HDR_TEXTURE_URL}`,
            error
          );

          /*
           * HDR失败不能阻止模型显示。
           */
          hdrLoadProgress = 100;
          updateCombinedProgress();

          resolve(null);
        }
      );
    });


  /* ============================
     Controls
  ============================ */

  const controls =
    new OrbitControls(
      camera,
      renderer.domElement
    );

  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  controls.enablePan = true;

  /*
   * 平移方向跟随当前屏幕，
   * 操作感觉更接近3ds Max。
   */
  controls.screenSpacePanning =
    true;

  controls.panSpeed = 0.9;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.8;


  /*
   * 鼠标操作：
   *
   * 左键拖动：旋转
   * 中键拖动：平移
   * 滚轮滚动：缩放
   * 右键：不设置3D动作
   */
  controls.mouseButtons = {
    LEFT:
      THREE.MOUSE.ROTATE,

    MIDDLE:
      THREE.MOUSE.PAN,

    RIGHT:
      null,
  };


  /*
   * 操作时使用0.06保留柔和惯性，
   * 松开后逐渐提高阻尼，
   * 让折射材质尽快停止闪烁。
   */
  const NORMAL_DAMPING =
    0.06;

  const STOP_DAMPING =
    0.5;

  const DAMPING_TRANSITION_TIME =
    360;

  let controlsReleasedAt =
    null;


  function handleControlsStart() {
    controlsReleasedAt = null;

    controls.dampingFactor =
      NORMAL_DAMPING;
  }


  function handleControlsEnd() {
    controlsReleasedAt =
      performance.now();
  }


  controls.addEventListener(
    "start",
    handleControlsStart
  );

  controls.addEventListener(
    "end",
    handleControlsEnd
  );

  controls.minDistance = 3.5;
  controls.maxDistance = 9;

  controls.target.set(
    0,
    0.1,
    0
  );

  controls.update();


  /* ============================
     Pan Limit
  ============================ */

  /*
   * 保存模型的初始中心。
   * 中键平移以这个位置作为基准。
   */
  const panOrigin =
    controls.target.clone();

  const cameraRight =
    new THREE.Vector3();

  const cameraUp =
    new THREE.Vector3();

  const panOffset =
    new THREE.Vector3();

  const clampedTarget =
    new THREE.Vector3();

  const panCorrection =
    new THREE.Vector3();


  /*
   * 模型加载并完成相机适配后，
   * 重新记录模型实际中心。
   */
  function setPanOrigin() {
    panOrigin.copy(
      controls.target
    );
  }


  /*
   * 根据相机距离、视野角度和窗口比例，
   * 动态计算当前允许的平移范围。
   *
   * 模型中心最多到达窗口边缘，
   * 不允许完全移出画面。
   */
  function clampPanToViewer() {
    const distance =
      camera.position.distanceTo(
        controls.target
      );

    const halfHeight =
      distance *
      Math.tan(
        THREE.MathUtils.degToRad(
          camera.fov * 0.5
        )
      );

    const halfWidth =
      halfHeight *
      Math.max(
        camera.aspect,
        0.1
      );


    /*
     * 取得相机画面中的
     * 水平和垂直方向。
     */
    cameraRight.setFromMatrixColumn(
      camera.matrixWorld,
      0
    ).normalize();

    cameraUp.setFromMatrixColumn(
      camera.matrixWorld,
      1
    ).normalize();

    panOffset.subVectors(
      controls.target,
      panOrigin
    );

    const horizontalOffset =
      THREE.MathUtils.clamp(
        panOffset.dot(cameraRight),
        -halfWidth,
        halfWidth
      );

    const verticalOffset =
      THREE.MathUtils.clamp(
        panOffset.dot(cameraUp),
        -halfHeight,
        halfHeight
      );

    clampedTarget
      .copy(panOrigin)
      .addScaledVector(
        cameraRight,
        horizontalOffset
      )
      .addScaledVector(
        cameraUp,
        verticalOffset
      );

    panCorrection.subVectors(
      clampedTarget,
      controls.target
    );


    /*
     * 同时修正控制中心和相机位置，
     * 保持当前观察角度和距离不变。
     */
    if (
      panCorrection.lengthSq() >
      1e-12
    ) {
      controls.target.add(
        panCorrection
      );

      camera.position.add(
        panCorrection
      );
    }
  }



  /* ============================
     Initial View
  ============================ */

  /*
   * 保存模型第一次加载完成时的
   * 相机位置、观察中心和缩放。
   */
  const initialView = {
    cameraPosition:
      new THREE.Vector3(),

    controlsTarget:
      new THREE.Vector3(),

    cameraZoom: 1,

    saved: false,
  };


  /*
   * 记录当前视角作为初始视角。
   */
  function saveInitialView() {
    initialView.cameraPosition.copy(
      camera.position
    );

    initialView.controlsTarget.copy(
      controls.target
    );

    initialView.cameraZoom =
      camera.zoom;

    initialView.saved = true;


    /*
     * 同时将当前位置记录为
     * 中键平移限制的中心。
     */
    setPanOrigin();
  }


  /*
   * 恢复模型最初加载完成时的视角。
   */
  function resetViewerView() {
    if (!initialView.saved) {
      return;
    }


    /*
     * 停止之前操作留下的惯性。
     */
    controlsReleasedAt = null;

    controls.dampingFactor =
      NORMAL_DAMPING;


    /*
     * 恢复相机位置。
     */
    camera.position.copy(
      initialView.cameraPosition
    );


    /*
     * 恢复相机缩放。
     */
    camera.zoom =
      initialView.cameraZoom;

    camera.updateProjectionMatrix();


    /*
     * 恢复相机观察中心。
     */
    controls.target.copy(
      initialView.controlsTarget
    );


    /*
     * 清除之前的中键平移结果，
     * 恢复最初的平移中心。
     */
    panOrigin.copy(
      initialView.controlsTarget
    );

    controls.update();
  }



  /* ============================
     Browser Middle-click
  ============================ */

  /*
   * 只阻止3D画布内的浏览器中键自动滚动。
   *
   * 右键、画布外操作以及浏览器其他区域
   * 不受影响。
   */
  function preventCanvasMiddleClick(
    event
  ) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  canvas.addEventListener(
    "pointerdown",
    preventCanvasMiddleClick
  );

  canvas.addEventListener(
    "mousedown",
    preventCanvasMiddleClick
  );

  canvas.addEventListener(
    "auxclick",
    preventCanvasMiddleClick
  );


  /* ============================
     Scene Objects
  ============================ */

  const objectGroup =
    new THREE.Group();

  scene.add(objectGroup);


  /*
   * HDR负责整体环境照明和反射。
   * 主光负责明确的光线方向
   * 以及地面的实时阴影。
   */
  const studioLight =
    new THREE.DirectionalLight(
      0xffffff,
      1.3
    );

  studioLight.position.set(
    4,
    7,
    5
  );

  studioLight.castShadow = true;

  studioLight.shadow.mapSize.set(
    2048,
    2048
  );

  studioLight.shadow.bias =
    -0.0002;

  studioLight.shadow.normalBias =
    0.02;

  studioLight.shadow.radius =
    13;

  scene.add(studioLight);

  const studioLightTarget =
    new THREE.Object3D();

  scene.add(studioLightTarget);

  studioLight.target =
    studioLightTarget;


  /* ============================
     Resources
  ============================ */

  let loadedModel = null;
  let decalResources = null;

  let floor = null;
  let floorGeometry = null;
  let floorMaterial = null;

  let placeholderResources =
    null;


  /* ============================
     Load Model
  ============================ */

  if (modelUrl) {
    const loader =
      new GLTFLoader();

    loader.load(
      modelUrl,

      async (gltf) => {
        if (destroyed) {
          disposeObject(
            gltf.scene
          );

          return;
        }


        /*
         * 文件下载完成后还需要处理模型、
         * 材质和贴花，所以先停在96%。
         */
        modelLoadProgress = 96;
        updateCombinedProgress();

        loadedModel =
          gltf.scene;

        objectGroup.add(
          loadedModel
        );


        /*
         * 设置模型阴影和指定材质参数。
         */
        loadedModel.traverse(
          (child) => {
            if (!child.isMesh) {
              return;
            }

            child.castShadow = true;
            child.receiveShadow = true;

            const materials =
              Array.isArray(
                child.material
              )
                ? child.material
                : [child.material];

            materials.forEach(
              (material) => {
                if (!material) return;

                if (
                  material.transparent
                ) {
                  material.depthWrite =
                    false;
                }


                /*
                 * 按名称设置指定材质的
                 * 自发光强度。
                 */
                const emissiveIntensity =
                  EMISSIVE_INTENSITY_BY_NAME[
                    material.name
                  ];

                if (
                  emissiveIntensity !==
                    undefined &&
                  "emissiveIntensity" in
                    material
                ) {
                  material.emissiveIntensity =
                    emissiveIntensity;
                }


                /*
                 * 按名称设置指定材质的
                 * HDR环境反射强度。
                 */
                const environmentIntensity =
                  ENV_INTENSITY_BY_NAME[
                    material.name
                  ];

                if (
                  environmentIntensity !==
                    undefined &&
                  "envMapIntensity" in
                    material
                ) {
                  material.envMapIntensity =
                    environmentIntensity;
                }

                material.needsUpdate =
                  true;
              }
            );
          }
        );


        /*
         * 自动居中模型并调整相机距离。
         */
        const modelMeasurements =
          fitCameraToObject(
            camera,
            controls,
            objectGroup,
            viewer
          );


        /*
         * 相机适配模型后，
         * 保存模型最初加载时的视角。
         */
        saveInitialView();


        /*
         * 目前只有第一个真实模型窗口
         * 需要摄影棚阴影地面。
         *
         * 第二个测试窗口不创建地面。
         */
        if (
          modelMeasurements &&
          index === 0
        ) {
          const {
            size,
            maxDimension,
          } =
            modelMeasurements;


          /*
           * ShadowMaterial本身透明，
           * 只显示模型投下的阴影，
           * 因此地面会与背景自然融合。
           */
          floorGeometry =
            new THREE.PlaneGeometry(
              maxDimension * 10,
              maxDimension * 10
            );

          floorMaterial =
            new THREE.ShadowMaterial({
              color: 0x000000,

              /*
               * 数值越大，
               * 地面阴影越明显。
               */
              opacity: 0.3,

              transparent: true,
              depthWrite: false,
            });

          floor =
            new THREE.Mesh(
              floorGeometry,
              floorMaterial
            );

          floor.rotation.x =
            -Math.PI / 2;

          floor.position.y =
            -Math.max(
              maxDimension * 0.001,
              0.0005
            );

          floor.receiveShadow = true;
          floor.renderOrder = 1;

          scene.add(floor);


          /*
           * 使用模型尺寸作为基准，
           * 让灯光和阴影参数适应模型大小。
           */
          studioLight.position.set(
            maxDimension * 2,
            maxDimension * 3.5,
            maxDimension * 1.5
          );

          studioLightTarget.position.set(
            0,
            size.y * 0.35,
            0
          );

          studioLightTarget
            .updateMatrixWorld();


          /*
           * 阴影相机范围越贴近模型，
           * 阴影贴图的有效清晰度越高。
           */
          const shadowRange =
            maxDimension * 1.5;

          studioLight.shadow.camera.left =
            -shadowRange;

          studioLight.shadow.camera.right =
            shadowRange;

          studioLight.shadow.camera.top =
            shadowRange;

          studioLight.shadow.camera.bottom =
            -shadowRange;

          studioLight.shadow.camera.near =
            Math.max(
              maxDimension * 0.01,
              0.01
            );

          studioLight.shadow.camera.far =
            maxDimension * 10;

          studioLight.shadow.camera
            .updateProjectionMatrix();
        }


        /*
         * 当前贴花只属于第一个真实模型。
         */
        if (index === 0) {
          try {
            decalResources =
              await createModelDecal({
                scene,
                model: loadedModel,
                textureUrl:
                  DECAL_TEXTURE_URL,
              });

            if (
              destroyed &&
              decalResources
            ) {
              disposeDecalResources(
                scene,
                decalResources
              );

              decalResources = null;

              return;
            }
          } catch (error) {
            console.error(
              "贴花图片加载或创建失败：",
              error
            );
          }
        }


        /*
         * 等待HDR和模型处理全部完成后，
         * 才将总进度设为100%。
         */
        await environmentPromise;

        modelLoadProgress = 100;
        updateCombinedProgress();

        contentReady = true;
      },


      /*
       * GLB实际网络加载进度。
       */
      (progressEvent) => {
        if (destroyed) return;

        if (
          progressEvent.total > 0
        ) {
          modelLoadProgress =
            Math.min(
              (
                progressEvent.loaded /
                progressEvent.total
              ) *
                95,
              95
            );

          updateCombinedProgress();
        }
      },


      /*
       * GLB加载失败。
       */
      (error) => {
        console.error(
          `无法加载模型：${modelUrl}`,
          error
        );

        modelLoadProgress = 100;
        updateCombinedProgress();


        /*
         * 即使GLB加载失败，
         * 加载遮罩也必须正常结束。
         */
        environmentPromise.finally(
          () => {
            if (!destroyed) {
              contentReady = true;
            }
          }
        );
      }
    );
  } else {
    /*
     * 第二个窗口：
     *
     * 保留测试模型和统一背景，
     * 加载强度为0.7的HDR，
     * 不创建地面。
     */
    placeholderResources =
      createPlaceholderScene(
        objectGroup
      );

    /* 保存第二个窗口的初始视角。 */
    saveInitialView();

    modelLoadProgress = 100;
    updateCombinedProgress();

    environmentPromise.finally(
      () => {
        if (!destroyed) {
          contentReady = true;
        }
      }
    );
  }


  /* ============================
     Resize
  ============================ */

  function resize() {
    const width =
      viewer.clientWidth;

    const height =
      viewer.clientHeight;

    if (
      width === 0 ||
      height === 0
    ) {
      return;
    }

    const nextPixelRatio =
      Math.min(
        window.devicePixelRatio,
        2
      );

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

    renderer.setPixelRatio(
      nextPixelRatio
    );

    renderer.setSize(
      width,
      height,
      false
    );


    /*
     * 后期处理也必须同步更新尺寸，
     * 否则全屏或窗口缩放后会模糊。
     */
    composer.setPixelRatio(
      nextPixelRatio
    );

    composer.setSize(
      width,
      height
    );

    bloomPass.setSize(
      width,
      height
    );
  }

  const resizeObserver =
    new ResizeObserver(resize);

  resizeObserver.observe(
    viewer
  );

  resize();


  /* ============================
     Animation
  ============================ */

  let animationFrameId = 0;

  function animate(time) {
    if (destroyed) return;

    animationFrameId =
      window.requestAnimationFrame(
        animate
      );

    const elapsedTime =
      time * 0.001;


    /*
     * 第二个测试模型保留自动旋转，
     * 真实GLB模型不自动旋转。
     */
    if (!modelUrl) {
      objectGroup.rotation.x =
        0.25 +
        Math.sin(
          elapsedTime * 0.45
        ) *
        0.08;

      objectGroup.rotation.y =
        elapsedTime * -0.3;

      objectGroup.rotation.z =
        Math.sin(
          elapsedTime * 0.3
        ) *
        0.08;

      objectGroup.position.y =
        Math.sin(
          elapsedTime * 0.8
        ) *
        0.12;
    }


    /*
     * 松开鼠标后逐渐提高阻尼，
     * 保留初始惯性并快速结束移动。
     */
    if (
      controlsReleasedAt !== null
    ) {
      const dampingElapsed =
        performance.now() -
        controlsReleasedAt;

      const dampingProgress =
        Math.min(
          dampingElapsed /
            DAMPING_TRANSITION_TIME,
          1
        );

      const smoothProgress =
        dampingProgress *
        dampingProgress *
        (
          3 -
          2 * dampingProgress
        );

      controls.dampingFactor =
        THREE.MathUtils.lerp(
          NORMAL_DAMPING,
          STOP_DAMPING,
          smoothProgress
        );
    }


    /*
     * 首先更新旋转、缩放和平移。
     */
    controls.update();


    /*
     * OrbitControls完成本帧平移后，
     * 再限制模型中心的位置。
     */
    clampPanToViewer();


    /*
     * 使用composer代替renderer.render，
     * 才能显示Bloom后期效果。
     */
    composer.render();


    /*
     * 模型和HDR完成并成功渲染第一帧后，
     * 隐藏加载遮罩。
     */
    if (
      contentReady &&
      !firstFrameRendered
    ) {
      firstFrameRendered = true;
      finishLoading();
    }
  }

  animationFrameId =
    window.requestAnimationFrame(
      animate
    );


  /* ============================
     Fullscreen
  ============================ */

  const fullscreenButton =
    viewer.querySelector(
      ".fullscreen-btn"
    );

  /* 重置视角按钮。 */
  const resetViewButton =
    viewer.querySelector(
      ".reset-view-btn"
    );

  /* 背景颜色切换按钮。 */
  const backgroundToggleButton =
    viewer.querySelector(
      ".background-toggle-btn"
    );


  async function toggleFullscreen() {
    try {
      if (
        document.fullscreenElement ===
        viewer
      ) {
        await document
          .exitFullscreen();
      } else {
        await viewer
          .requestFullscreen();
      }
    } catch (error) {
      console.error(
        "无法切换全屏状态：",
        error
      );
    }
  }

  /*
   * 在浅灰色与深灰色之间切换当前窗口的背景。
   */
  function toggleViewerBackground() {
    isDarkBackground =
      !isDarkBackground;

    const backgroundColor =
      isDarkBackground
        ? DARK_VIEWER_BACKGROUND_COLOR
        : LIGHT_VIEWER_BACKGROUND_COLOR;

    scene.background.set(
      backgroundColor
    );

    /*
     * 向辅助技术说明按钮当前状态。
     */
    backgroundToggleButton?.setAttribute(
      "aria-pressed",
      String(isDarkBackground)
    );
  }

  fullscreenButton?.addEventListener(
    "click",
    toggleFullscreen
  );

  resetViewButton?.addEventListener(
    "click",
    resetViewerView
  );

  backgroundToggleButton?.addEventListener(
    "click",
    toggleViewerBackground
  );


  /* ============================
     Cleanup
  ============================ */

  function destroy() {
    destroyed = true;

    window.cancelAnimationFrame(
      animationFrameId
    );

    window.clearTimeout(
      loadingTimeoutId
    );

    resizeObserver.disconnect();

    fullscreenButton?.removeEventListener(
      "click",
      toggleFullscreen
    );

    resetViewButton?.removeEventListener(
      "click",
      resetViewerView
    );

    backgroundToggleButton?.removeEventListener(
      "click",
      toggleViewerBackground
    );

    controls.removeEventListener(
      "start",
      handleControlsStart
    );

    controls.removeEventListener(
      "end",
      handleControlsEnd
    );

    controls.dispose();


    /*
     * 删除画布中键事件。
     */
    canvas.removeEventListener(
      "pointerdown",
      preventCanvasMiddleClick
    );

    canvas.removeEventListener(
      "mousedown",
      preventCanvasMiddleClick
    );

    canvas.removeEventListener(
      "auxclick",
      preventCanvasMiddleClick
    );


    /*
     * 清理运行时贴花。
     */
    if (decalResources) {
      disposeDecalResources(
        scene,
        decalResources
      );

      decalResources = null;
    }


    /*
     * 清理真实GLB模型。
     */
    if (loadedModel) {
      objectGroup.remove(
        loadedModel
      );

      disposeObject(
        loadedModel
      );

      loadedModel = null;
    }


    /*
     * 清理第二个窗口测试模型。
     */
    if (placeholderResources) {
      objectGroup.remove(
        placeholderResources
          .hexagon
      );

      objectGroup.remove(
        placeholderResources
          .edges
      );

      placeholderResources
        .geometry
        .dispose();

      placeholderResources
        .material
        .dispose();

      placeholderResources
        .edgeGeometry
        .dispose();

      placeholderResources
        .edgeMaterial
        .dispose();

      placeholderResources = null;
    }


    /*
     * 清理摄影棚阴影地面。
     */
    if (floor) {
      scene.remove(floor);
      floor = null;
    }

    floorGeometry?.dispose();
    floorMaterial?.dispose();


    /*
     * 清理灯光。
     */
    scene.remove(
      studioLight
    );

    scene.remove(
      studioLightTarget
    );


    /*
     * HDR纹理不属于GLB材质，
     * 所以需要单独清理。
     */
    scene.environment = null;

    hdrTexture?.dispose();
    hdrTexture = null;


    /*
     * 清理后期处理和渲染器。
     */
    bloomPass.dispose?.();
    outputPass.dispose?.();
    composer.dispose();

    renderer.dispose();

    delete viewer.dataset
      .threeInitialized;
  }

  return {
    destroy,
  };
}


/* ==============================
   Page Lifecycle
============================== */

/*
 * 初始化Rendering页面中的全部窗口。
 */
function initRenderingPage() {
  const viewers =
    document.querySelectorAll(
      ".rendering-page .viewer"
    );

  viewers.forEach(
    (
      viewer,
      index
    ) => {
      if (
        viewer.dataset
          .threeInitialized ===
        "true"
      ) {
        return;
      }

      viewer.dataset
        .threeInitialized =
        "true";

      const viewerInstance =
        createViewer(
          viewer,
          index
        );

      if (viewerInstance) {
        activeViewers.push(
          viewerInstance
        );
      }
    }
  );
}


/*
 * 离开页面时销毁全部场景。
 */
function cleanupRenderingPage() {
  activeViewers.forEach(
    (viewer) => {
      viewer.destroy();
    }
  );

  activeViewers = [];
}



/* ==============================
   Still Image Viewer
============================== */

/*
 * 初始化静态渲染作品查看器。
 *
 * 每套作品只在自己的images数组中切换，
 * 不会切换到下一套作品。
 */
function initStillImageViewer() {
  /*
   * Astro重新加载页面时，
   * 先清理上一次绑定的事件。
   */
  if (stillViewerCleanup) {
    stillViewerCleanup();
    stillViewerCleanup = null;
  }


  const viewer =
    document.querySelector(
      "[data-still-viewer]"
    );

  if (
    !(viewer instanceof HTMLElement)
  ) {
    return;
  }

  const closeButton =
    viewer.querySelector(
      ".still-viewer-close"
    );


  const openButtons =
    Array.from(
      document.querySelectorAll(
        "[data-open-still]"
      )
    );


  const closeButtons =
    Array.from(
      viewer.querySelectorAll(
        "[data-still-close]"
      )
    );


  const previousButton =
    viewer.querySelector(
      "[data-still-previous]"
    );


  const nextButton =
    viewer.querySelector(
      "[data-still-next]"
    );


  const media =
    viewer.querySelector(
      ".still-viewer-media"
    );


  const image =
    viewer.querySelector(
      "[data-still-viewer-image]"
    );


  const title =
    viewer.querySelector(
      "[data-still-viewer-title]"
    );


  const tools =
    viewer.querySelector(
      "[data-still-viewer-tools]"
    );


  const description =
    viewer.querySelector(
      "[data-still-viewer-description]"
    );

  const viewLink =
    viewer.querySelector(
      "[data-still-viewer-link]"
    );


  const counter =
    viewer.querySelector(
      ".still-viewer-counter"
    );


  const currentNumber =
    viewer.querySelector(
      "[data-still-current]"
    );


  const totalNumber =
    viewer.querySelector(
      "[data-still-total]"
    );


  if (
    !(image instanceof HTMLImageElement)
  ) {
    return;
  }


  let currentProject = null;

  let currentImages = [];

  let currentImageIndex = 0;

  let lastFocusedElement = null;


  /*
   * 记录移动端手指按下的位置。
   */
  let viewerIsOpen = false;
  let imageIsChanging = false;

  let closeTimerId = 0;
  let changeTimerId = 0;

  let pointerIsDown = false;
  let pointerStartX = 0;
  let pointerCurrentX = 0;
  let activePointerId = null;


  /*
   * 将图片计数统一显示为两位数。
   *
   * 1 → 01
   * 2 → 02
   */
  function formatNumber(value) {
    return String(value).padStart(
      2,
      "0"
    );
  }


  /*
   * 从每个作品article的data属性中
   * 读取标题、工具、介绍和图片数组。
   */
  function readProjectData(button) {
    const project =
      button.closest(
        ".still-project"
      );

    if (!project) {
      return null;
    }


    let images = [];


    /*
     * Astro通过JSON.stringify
     * 将图片数组写入data-still-images。
     */
    try {
      const parsedImages =
        JSON.parse(
          project.dataset
            .stillImages ??
            "[]"
        );


      if (Array.isArray(parsedImages)) {
        images =
          parsedImages.filter(
            (value) =>
              typeof value ===
                "string" &&
              value.length > 0
          );
      }
    } catch (error) {
      console.error(
        "无法读取静态作品图片列表：",
        error
      );
    }


    /*
     * 没有图片时不打开查看器。
     */
    if (images.length === 0) {
      return null;
    }


    return {
      title:
        project.dataset
          .stillTitle ?? "",

      tools:
        project.dataset
          .stillTools ?? "",

      description:
        project.dataset
          .stillDescription ?? "",

      viewUrl:
        project.dataset
          .stillViewUrl ?? "",

      images,
    };
  }


  /*
   * 更新当前大图、替代文字和图片计数。
   *
   * 单图作品会自动隐藏：
   *
   * 上一张按钮
   * 下一张按钮
   * 图片计数
   */
  function renderCurrentImage() {
    if (
      !currentProject ||
      currentImages.length === 0
    ) {
      return;
    }


    const imageUrl =
      currentImages[
        currentImageIndex
      ];


    image.src =
      imageUrl;


    image.alt =
      currentImages.length > 1
        ? `${currentProject.title} ${currentImageIndex + 1}`
        : currentProject.title;


    if (currentNumber) {
      currentNumber.textContent =
        formatNumber(
          currentImageIndex + 1
        );
    }


    if (totalNumber) {
      totalNumber.textContent =
        formatNumber(
          currentImages.length
        );
    }


    const hasMultipleImages =
      currentImages.length > 1;


    if (previousButton) {
      previousButton.hidden =
        !hasMultipleImages;
    }


    if (nextButton) {
      nextButton.hidden =
        !hasMultipleImages;
    }


    if (counter) {
      counter.hidden =
        !hasMultipleImages;
    }


    /*
     * 提前加载下一张图片，
     * 减少第一次切换时的等待。
     */
    if (hasMultipleImages) {
      const nextImageIndex =
        (
          currentImageIndex + 1
        ) %
        currentImages.length;


      const preloadImage =
        new Image();


      preloadImage.src =
        currentImages[
          nextImageIndex
        ];
    }
  }


  function changeImage(direction) {
    if (
      !viewerIsOpen ||
      imageIsChanging ||
      currentImages.length <= 1
    ) {
      return;
    }

    imageIsChanging = true;

    const isNext =
      direction > 0;

    image.classList.add(
      isNext
        ? "is-changing-left"
        : "is-changing-right"
    );

    changeTimerId =
      window.setTimeout(() => {
        currentImageIndex =
          (
            currentImageIndex +
            direction +
            currentImages.length
          ) % currentImages.length;

        renderCurrentImage();

        image.classList.remove(
          "is-changing-left",
          "is-changing-right"
        );

        /*
         * 新图片从相反方向进入。
         */
        image.classList.add(
          isNext
            ? "is-changing-right"
            : "is-changing-left"
        );

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            image.classList.remove(
              "is-changing-left",
              "is-changing-right"
            );

            imageIsChanging = false;
          });
        });
      }, 220);
  }

  function showPreviousImage() {
    changeImage(-1);
  }

  function showNextImage() {
    changeImage(1);
  }



  /*
   * 打开当前作品，
   * 并从第一张图片开始显示。
   */
  function openViewer(button) {
    const projectData =
      readProjectData(button);

    if (!projectData) {
      return;
    }

    /*
     * 如果上一次查看器还在关闭过程中，
     * 取消旧的计时。
     */
    window.clearTimeout(
      closeTimerId
    );

    window.clearTimeout(
      changeTimerId
    );

    viewerIsOpen = true;
    imageIsChanging = false;

    pointerIsDown = false;
    activePointerId = null;

    image.classList.remove(
      "is-changing-left",
      "is-changing-right"
    );

    image.style.removeProperty(
      "transform"
    );

    media?.classList.remove(
      "is-dragging"
    );

    currentProject =
      projectData;

    currentImages =
      projectData.images;

    currentImageIndex = 0;

    /*
     * 记录打开查看器的按钮，
     * 关闭后把焦点还给它。
     */
    lastFocusedElement =
      button;

    if (title) {
      title.textContent =
        projectData.title;
    }

    if (tools) {
      tools.textContent =
        projectData.tools;

      tools.hidden =
        projectData.tools.length === 0;
    }

    if (description) {
      description.textContent =
        projectData.description;

      description.hidden =
        projectData.description
          .length === 0;
    }


    if (
      viewLink instanceof
      HTMLAnchorElement
    ) {
      const viewUrl =
        projectData.viewUrl.trim();
    
      const hasViewUrl =
        viewUrl.length > 0;
    
      viewLink.hidden =
        !hasViewUrl;
    
      if (hasViewUrl) {
        viewLink.href = viewUrl;
      } else {
        viewLink.removeAttribute(
          "href"
        );
      }
    }



    /*
     * 先更新图片和文字，
     * 再显示查看器。
     */
    renderCurrentImage();

    viewer.hidden = false;

    viewer.setAttribute(
      "aria-hidden",
      "false"
    );

    document.documentElement
      .classList.add(
        "still-viewer-open"
      );

    /*
     * 等待hidden造成的display状态
     * 被浏览器处理后，再启动动画。
     */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!viewerIsOpen) {
          return;
        }

        viewer.classList.add(
          "is-open"
        );

        if (
          closeButton instanceof
          HTMLElement
        ) {
          closeButton.focus({
            preventScroll: true,
          });
        }
      });
    });
  }


  /*
   * 关闭查看器。
   */
  function closeViewer(
    immediate = false
  ) {
    if (
      !viewerIsOpen &&
      !immediate
    ) {
      return;
    }

    viewerIsOpen = false;
    imageIsChanging = false;

    pointerIsDown = false;
    activePointerId = null;

    window.clearTimeout(
      closeTimerId
    );

    window.clearTimeout(
      changeTimerId
    );

    image.style.removeProperty(
      "transform"
    );

    image.classList.remove(
      "is-changing-left",
      "is-changing-right"
    );

    media?.classList.remove(
      "is-dragging"
    );

    viewer.classList.remove(
      "is-open"
    );

    viewer.setAttribute(
      "aria-hidden",
      "true"
    );

    document.documentElement
      .classList.remove(
        "still-viewer-open"
      );

    const finishClosing = () => {
      viewer.hidden = true;

      image.removeAttribute(
        "src"
      );

      image.alt = "";

      if (
        viewLink instanceof
        HTMLAnchorElement
      ) {
        viewLink.hidden = true;
      
        viewLink.removeAttribute(
          "href"
        );
      }

      currentProject = null;
      currentImages = [];
      currentImageIndex = 0;

      if (
        lastFocusedElement instanceof
        HTMLElement
      ) {
        lastFocusedElement.focus({
          preventScroll: true,
        });
      }

      lastFocusedElement = null;
    };

    if (immediate) {
      finishClosing();
      return;
    }

    closeTimerId =
      window.setTimeout(
        finishClosing,
        380
      );
  }

  function handleCloseViewer() {
    closeViewer();
  }


  /*
   * 键盘操作：
   *
   * Escape：关闭
   * 左方向键：上一张
   * 右方向键：下一张
   */
  function handleKeyDown(event) {
    if (!viewerIsOpen) {
      return;
    }


    if (event.key === "Escape") {
      event.preventDefault();

      closeViewer();

      return;
    }


    if (event.key === "ArrowLeft") {
      event.preventDefault();

      showPreviousImage();

      return;
    }


    if (event.key === "ArrowRight") {
      event.preventDefault();

      showNextImage();
    }
  }


  
  /*
   * 恢复图片的默认位置。
   */
  function resetDragPosition() {
    image.style.removeProperty(
      "transform"
    );

    media?.classList.remove(
      "is-dragging"
    );
  }


  /*
   * 鼠标按下或手指触摸。
   */
  function handlePointerDown(event) {
    if (
      !viewerIsOpen ||
      imageIsChanging ||
      !(media instanceof HTMLElement)
    ) {
      return;
    }

    /*
     * 点击左右按钮时不拖动图片。
     */
    if (
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      return;
    }

    pointerIsDown = true;

    activePointerId =
      event.pointerId;

    pointerStartX =
      event.clientX;

    pointerCurrentX =
      event.clientX;

    media.classList.add(
      "is-dragging"
    );

    media.setPointerCapture(
      event.pointerId
    );
  }


  /*
   * 拖动过程中移动图片。
   */
  function handlePointerMove(event) {
    if (
      !pointerIsDown ||
      event.pointerId !==
        activePointerId
    ) {
      return;
    }

    pointerCurrentX =
      event.clientX;

    const distance =
      pointerCurrentX -
      pointerStartX;

    /*
     * 最多向左右拖动140px。
     */
    const limitedDistance =
      Math.max(
        -140,
        Math.min(140, distance)
      );

    image.style.transform =
      `translateX(${limitedDistance}px) ` +
      "scale(0.99)";
  }


  /*
   * 鼠标松开或手指离开。
   */
  function finishPointerGesture(event) {
    if (
      !pointerIsDown ||
      event.pointerId !==
        activePointerId
    ) {
      return;
    }

    const distance =
      pointerCurrentX -
      pointerStartX;

    pointerIsDown = false;
    activePointerId = null;

    resetDragPosition();

    /*
     * 不足55px时恢复原位，
     * 不切换图片。
     */
    if (
      Math.abs(distance) < 55
    ) {
      return;
    }

    if (distance < 0) {
      showNextImage();
    } else {
      showPreviousImage();
    }
  }


  /*
   * 禁止浏览器原生拖动图片。
   */
  function preventImageDrag(event) {
    event.preventDefault();
  }


  /*
   * 为每个作品首图绑定打开事件。
   *
   * 将handler保留下来，
   * 方便Astro切换页面时清理。
   */
  const openHandlers =
    openButtons.map(
      (button) => {
        const handler = () => {
          openViewer(button);
        };


        button.addEventListener(
          "click",
          handler
        );


        return {
          button,
          handler,
        };
      }
    );


  /*
   * 背景和关闭按钮
   * 都可以关闭查看器。
   */
  closeButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        handleCloseViewer
      );
    }
  );


  previousButton
    ?.addEventListener(
      "click",
      showPreviousImage
    );


  nextButton
    ?.addEventListener(
      "click",
      showNextImage
    );


  document.addEventListener(
    "keydown",
    handleKeyDown
  );


  media?.addEventListener(
    "pointerdown",
    handlePointerDown
  );

  media?.addEventListener(
    "pointermove",
    handlePointerMove
  );

  media?.addEventListener(
    "pointerup",
    finishPointerGesture
  );

  media?.addEventListener(
    "pointercancel",
    finishPointerGesture
  );

  image.addEventListener(
    "dragstart",
    preventImageDrag
  );


  /*
   * Astro页面切换时移除全部事件，
   * 防止重新进入页面时重复绑定。
   */
  stillViewerCleanup = () => {

    window.clearTimeout(
      closeTimerId
    );

    window.clearTimeout(
      changeTimerId
    );

    openHandlers.forEach(
      ({
        button,
        handler,
      }) => {
        button.removeEventListener(
          "click",
          handler
        );
      }
    );


    closeButtons.forEach(
      (button) => {
        button.removeEventListener(
          "click",
          handleCloseViewer
        );
      }
    );


    previousButton
      ?.removeEventListener(
        "click",
        showPreviousImage
      );


    nextButton
      ?.removeEventListener(
        "click",
        showNextImage
      );


    document.removeEventListener(
      "keydown",
      handleKeyDown
    );


    media?.removeEventListener(
      "pointerdown",
      handlePointerDown
    );

    media?.removeEventListener(
      "pointermove",
      handlePointerMove
    );

    media?.removeEventListener(
      "pointerup",
      finishPointerGesture
    );

    media?.removeEventListener(
      "pointercancel",
      finishPointerGesture
    );

    image.removeEventListener(
      "dragstart",
      preventImageDrag
    );


    closeViewer(true);

    document.documentElement
      .classList.remove(
        "still-viewer-open"
      );

    stillViewerCleanup = null;
  };
}


/*
 * 清理静态作品查看器。
 */
function cleanupStillImageViewer() {
  if (!stillViewerCleanup) {
    return;
  }


  stillViewerCleanup();

  stillViewerCleanup = null;
}



/* ==============================
   Page Events
============================== */

/*
 * 普通页面加载。
 */
initRenderingPage();

initStillImageViewer();


/*
 * Astro ClientRouter页面切换完成后，
 * 重新初始化Three.js窗口和静态查看器。
 */
document.addEventListener(
  "astro:page-load",
  initRenderingPage
);

document.addEventListener(
  "astro:page-load",
  initStillImageViewer
);


/*
 * Astro切换页面之前，
 * 清理旧页面中的Three.js场景
 * 和静态作品查看器。
 */
document.addEventListener(
  "astro:before-swap",
  cleanupRenderingPage
);

document.addEventListener(
  "astro:before-swap",
  cleanupStillImageViewer
);