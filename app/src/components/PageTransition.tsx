import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type React from 'react';

const variants: Variants = {
  initial: {
    opacity: 0,
    rotateX: 3,
    y: 24,
    scale: 0.98,
    transformOrigin: 'top center',
  },
  animate: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    scale: 1,
    transformOrigin: 'top center',
    transition: {
      duration: 0.38,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    rotateX: -3,
    y: -16,
    scale: 0.97,
    transformOrigin: 'top center',
    transition: {
      duration: 0.22,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  },
};

interface AnimatedRoutesProps {
  children: React.ReactNode;
}

export function AnimatedRoutes({ children }: AnimatedRoutesProps) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ perspective: 1200, perspectiveOrigin: '50% 0%' }}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
