'use client';

/* eslint-disable */
import * as React from 'react'
import { Canvas, useThree } from '@react-three/fiber'

import { useNeedleProgressive } from '@needle-tools/gltf-progressive'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'

function MyModel() {
  const { gl } = useThree()
  const url = 'https://needle-cloud-preview-02-r26roub2hq-lz.a.run.app/api/v1/public/11908aa/26b46600a/'
  const { scene } = useGLTF(url, false, false, (loader) => {
    useNeedleProgressive(url, gl, loader)
  })
  return <primitive object={scene} />
}


export default function App() {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 0, .5] }}>
      <OrbitControls />
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


