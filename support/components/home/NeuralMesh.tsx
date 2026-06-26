'use client'
import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 200
const CONNECTION_DISTANCE = 80
const MAX_CONNECTIONS = 3

// Max possible lines = PARTICLE_COUNT * MAX_CONNECTIONS (each particle connects to at most MAX_CONNECTIONS others)
// Each line needs 2 endpoints x 3 floats = 6 values
const MAX_LINE_VERTS = 200 * 3 * 2  // PARTICLE_COUNT * MAX_CONNECTIONS * 2 vertices * 3 components

function Particles({ mousePos }: { mousePos: { x: number; y: number } }) {
  const meshRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const velocities: number[] = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 400
      positions[i * 3 + 1] = (Math.random() - 0.5) * 400
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100
      velocities.push(
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.15,
        0,
      )
    }
    return { positions, velocities }
  }, [])

  const positionRef = useRef(positions.slice())
  const velRef      = useRef(velocities)

  // Pre-allocate reusable buffers -- avoids new Float32Array every frame
  const lineBuffer = useRef(new Float32Array(MAX_LINE_VERTS * 3))

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positionRef.current, 3))
    return geo
  }, [])

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    // Set initial attribute with full buffer; we'll update drawRange to show only active verts
    geo.setAttribute('position', new THREE.BufferAttribute(lineBuffer.current, 3))
    return geo
  }, [])

  const pointMaterial = useMemo(
    () => new THREE.PointsMaterial({ color: 0x2a4bd9, size: 2, transparent: true, opacity: 0.6, sizeAttenuation: true }),
    [],
  )
  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0x748bff, transparent: true, opacity: 0.15 }),
    [],
  )

  useFrame(() => {
    const pos = positionRef.current
    const vel = velRef.current
    const mouseInfluence = 0.3

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     += vel[i * 3]     + mousePos.x * mouseInfluence * 0.01
      pos[i * 3 + 1] += vel[i * 3 + 1] + mousePos.y * mouseInfluence * 0.01
      pos[i * 3 + 2] += vel[i * 3 + 2]

      if (pos[i * 3]     >  200) pos[i * 3]     = -200
      if (pos[i * 3]     < -200) pos[i * 3]     =  200
      if (pos[i * 3 + 1] >  200) pos[i * 3 + 1] = -200
      if (pos[i * 3 + 1] < -200) pos[i * 3 + 1] =  200
    }

    geometry.attributes.position.needsUpdate = true

    // Build connection lines into pre-allocated buffer
    const buf = lineBuffer.current
    let lineVertCount = 0
    const maxVerts = MAX_LINE_VERTS

    for (let i = 0; i < PARTICLE_COUNT && lineVertCount < maxVerts - 6; i++) {
      let connections = 0
      for (let j = i + 1; j < PARTICLE_COUNT && connections < MAX_CONNECTIONS && lineVertCount < maxVerts - 6; j++) {
        const dx = pos[i * 3]     - pos[j * 3]
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1]
        if (dx * dx + dy * dy < CONNECTION_DISTANCE * CONNECTION_DISTANCE) {
          const base = lineVertCount * 3
          buf[base]     = pos[i * 3];     buf[base + 1] = pos[i * 3 + 1]; buf[base + 2] = pos[i * 3 + 2]
          buf[base + 3] = pos[j * 3];     buf[base + 4] = pos[j * 3 + 1]; buf[base + 5] = pos[j * 3 + 2]
          lineVertCount += 2
          connections++
        }
      }
    }

    lineGeometry.attributes.position.needsUpdate = true
    lineGeometry.setDrawRange(0, lineVertCount)
  })

  return (
    <>
      <points ref={meshRef} geometry={geometry} material={pointMaterial} />
      <lineSegments ref={linesRef} geometry={lineGeometry} material={lineMaterial} />
    </>
  )
}

export function NeuralMesh() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const onMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: -(e.clientY / window.innerHeight - 0.5) * 2,
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-0 opacity-40">
      <Canvas
        camera={{ position: [0, 0, 300], fov: 60 }}
        dpr={Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        style={{ background: 'transparent' }}
      >
        <Particles mousePos={mousePos} />
      </Canvas>
    </div>
  )
}
