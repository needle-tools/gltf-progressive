'use client';

/* eslint-disable */
import * as React from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { useNeedleProgressive } from '@needle-tools/gltf-progressive'
// @ts-ignore shared plain JS example helpers
import { MODEL_URLS } from '../../shared/example-utils.js'

function RoomEnvironmentSetup() {
  const { gl, scene } = useThree()

  React.useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment

    return () => {
      scene.environment = null
      environment.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  return null
}

function Model({ controlsRef, url }: { controlsRef: React.MutableRefObject<any>, url: string }) {
  const { gl, camera } = useThree()
  const { scene } = useGLTF(url, false, false, (loader) => {
    useNeedleProgressive(loader as any, gl as any)
  })

  React.useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxSize = Math.max(size.x, size.y, size.z, 0.0001)
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2)) * 1.55
    const direction = new THREE.Vector3(0.45, 0.35, 1).normalize()

    perspectiveCamera.position.copy(center).addScaledVector(direction, distance)
    perspectiveCamera.near = Math.max(0.01, distance / 100)
    perspectiveCamera.far = Math.max(100, distance * 100)
    perspectiveCamera.updateProjectionMatrix()

    const controls = controlsRef.current
    if (controls) {
      controls.target.copy(center)
      controls.minDistance = distance * 0.1
      controls.maxDistance = distance * 10
      controls.update()
    }
  }, [camera, controlsRef, scene])

  return <primitive object={scene} />
}

export default function App() {
  const controlsRef = React.useRef<any>(null)
  const [sceneIndex, setSceneIndex] = React.useState(0)
  const modelUrl = MODEL_URLS[sceneIndex % MODEL_URLS.length]

  React.useEffect(() => {
    ;(globalThis as any).__GLTF_PROGRESSIVE_R3F_EXAMPLE__ = {
      currentUrl: modelUrl,
      sceneIndex,
    }
  }, [modelUrl, sceneIndex])

  return (
    <>
      <div className="example-toolbar">
        <button type="button" onClick={() => setSceneIndex((sceneIndex + 1) % MODEL_URLS.length)}>Change scene</button>
      </div>
      <Canvas
        camera={{ position: [0.5, 1.3, 2], fov: 60, near: 0.01, far: 200 }}>
        <RoomEnvironmentSetup />
        <gridHelper args={[50, 50, 0x444444, 0x666666]} />
        <directionalLight position={[-50, 20, 50]} intensity={1} />
        <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} target={[0, 0.5, 0]} />
        <React.Suspense fallback={null}>
          <Model key={modelUrl} controlsRef={controlsRef} url={modelUrl} />
        </React.Suspense>
      </Canvas>
    </>
  )
}
