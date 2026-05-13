import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useSidebarState } from '../hooks/useSidebarState';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { PageTitleProvider } from '../contexts/pageTitle';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
};

export function AppShell() {
  const { isExpanded, toggle, setExpanded } = useSidebarState();
  const breakpoint = useBreakpoint();
  const location = useLocation();

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';

  // Auto-collapse on tablet, but do NOT auto-expand on desktop (respect user preference)
  useEffect(() => {
    if (isTablet) setExpanded(false);
  }, [isTablet]);

  const sidebarWidth = isMobile ? '0px' : isExpanded ? '16rem' : '3.5rem';

  return (
    <PageTitleProvider>
      <div
        className="min-h-screen bg-surface overflow-x-hidden"
        style={{ '--sidebar-width': sidebarWidth }}
      >
        {/* Sidebar — desktop and tablet only */}
        {!isMobile && (
          <SideNav isExpanded={isExpanded} onToggle={toggle} />
        )}

        {/* Top bar — full-width with CSS var offset */}
        <TopBar />

        {/* Main content area */}
        <main
          className="overflow-x-hidden min-h-screen flex flex-col"
          style={{
            marginLeft: sidebarWidth,
            paddingTop: '4rem', // h-16 = 64px = 4rem
            transition: 'margin-left 250ms ease',
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1 flex flex-col overflow-x-hidden"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom nav — mobile only */}
        {isMobile && <BottomNav />}
      </div>
    </PageTitleProvider>
  );
}
