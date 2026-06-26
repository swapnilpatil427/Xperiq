'use client'
import { useRef, useEffect, useState } from 'react'

// Three.js / R3F are imported lazily via a canvas component to keep SSR safe.
// The Canvas and Three references are resolved only on the client after mount.

const STATUS_COLORS = {
  operational: {
    cssGlow: '#00647c',
    cssBase: '#82deff',
  },
  degraded: {
    cssGlow: '#f59e0b',
    cssBase: '#fde68a',
  },
  outage: {
    cssGlow: '#b41340',
    cssBase: '#f74b6d',
  },
}

interface StatusOrbProps {
  status: 'operational' | 'degraded' | 'outage'
}

/**
 * Inner canvas component — only rendered client-side after react-three-fiber
 * is confirmed available. Imported dynamically below.
 */
function OrbCanvas({ status }: StatusOrbProps) {
  // Dynamic import of three / r3f at runtime so the SSR bundle stays clean.
  const [Scene, setScene] = useState<React.ComponentType<{ status: StatusOrbProps['status'] }> | null>(null)

  useEffect(() => {
    // Load Three.js and R3F only in the browser
    Promise.all([
      import('@react-three/fiber'),
      import('three'),
    ]).then(([{ Canvas, useFrame }, THREE]) => {
      function BreathingOrb({ status }: StatusOrbProps) {
        const meshRef = useRef<InstanceType<typeof THREE.Mesh>>(null)
        const colors = STATUS_COLORS[status]

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colors.cssGlow),
          transparent: true,
          opacity: 0.9,
          roughness: 0.1,
          metalness: 0.3,
        })

        useFrame(({ clock }) => {
          if (!meshRef.current) return
          const t = clock.getElapsedTime()
          const breathe = 1 + Math.sin(t * 1.2) * 0.08
          meshRef.current.scale.setScalar(breathe)
          material.opacity = 0.7 + Math.sin(t * 1.2) * 0.15
        })

        return (
          <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <pointLight
              position={[-10, -10, -10]}
              intensity={0.3}
              color={new THREE.Color(colors.cssGlow)}
            />
            <mesh ref={meshRef} material={material}>
              <sphereGeometry args={[1.5, 64, 64]} />
            </mesh>
          </>
        )
      }

      function CanvasScene({ status }: StatusOrbProps) {
        return (
          <Canvas
            camera={{ position: [0, 0, 5], fov: 40 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', borderRadius: '50%' }}
          >
            <BreathingOrb status={status} />
          </Canvas>
        )
      }

      setScene(() => CanvasScene)
    }).catch(() => {
      // R3F not available — stay in fallback
    })
  }, [])

  if (!Scene) {
    const colors = STATUS_COLORS[status]
    return (
      <div
        className="w-full h-full rounded-full animate-pulse"
        style={{ background: `radial-gradient(circle at 40% 35%, ${colors.cssBase}, ${colors.cssGlow})` }}
      />
    )
  }

  return <Scene status={status} />
}

export function StatusOrb({ status }: StatusOrbProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const glowColor = STATUS_COLORS[status].cssGlow

  if (!mounted) {
    return (
      <div className="w-32 h-32 mx-auto rounded-full bg-secondary-container/30 animate-pulse" />
    )
  }

  return (
    <div
      className="w-32 h-32 mx-auto relative"
      style={{ filter: `drop-shadow(0 0 30px ${glowColor}50)` }}
    >
      <OrbCanvas status={status} />
    </div>
  )
}
