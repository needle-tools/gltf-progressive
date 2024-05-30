'use client';

/* eslint-disable */
import * as React from 'react'
import { Canvas, useThree } from '@react-three/fiber'

import { useNeedleProgressive } from '@needle-tools/gltf-progressive'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

function MyModel() {
  const { gl } = useThree()
  const url = 'https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb'
  const { scene } = useGLTF(url, false, false, (loader) => {
    useNeedleProgressive(url, gl, loader as any)
  })
  return <primitive object={scene} />
}


export default function App() {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [25, 15, 25] }}>
      <OrbitControls target={[0 , 10, 0]} />
      <ambientLight intensity={1} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
      <pointLight position={[-10, -10, -10]} />
      <Environment
        files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/evening_road_01_2k.hdr"
      // ground={{ height: 5, radius: 40, scale: 10 }}
      />
      <MyModel />
    </Canvas>
  )
}


