import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { AppFooter } from './AppFooter';
import { useSidebarState } from '../hooks/useSidebarState';
import { useBreakpoint } from '../hooks/useBreakpoint';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};

export function AppShell() {
  const { isExpanded, toggle, setExpanded } = useSidebarState();
  const breakpoint = useBreakpoint();
  const location = useLocation();

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isBuilder = /\/surveys\/[^/]+\/build/.test(location.pathname);

  useEffect(() => {
    if (isTablet) setExpanded(false);
  }, [isTablet]);

  const sidebarWidth = isMobile ? '0px' : isExpanded ? '16rem' : '3.5rem';

  return (
    <div
      className="min-h-screen bg-surface overflow-x-hidden"
      style={{ '--sidebar-width': sidebarWidth }}
    >
      {!isMobile && <SideNav isExpanded={isExpanded} onToggle={toggle} />}
      <TopBar onMenuToggle={toggle} />

      <main
        className="overflow-x-hidden min-h-screen flex flex-col"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: '4rem',
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
            {isBuilder ? (
              /* Builder gets the full viewport — no gutters, no footer, no BottomNav clearance */
              <Outlet />
            ) : (
              /* Standard pages: consistent gutters + BottomNav clearance + footer */
              <div className="px-6 md:px-8 pb-24 md:pb-8 w-full flex-1 flex flex-col">
                <Outlet />
                <AppFooter />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {isMobile && !isBuilder && <BottomNav />}
    </div>
  );
}
