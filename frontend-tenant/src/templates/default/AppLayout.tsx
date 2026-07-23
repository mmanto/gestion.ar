import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { Footer } from '../../components/layout/Footer';
import { useSidebar } from '../../hooks/useSidebar';
import { useSidebarVisible } from '../../hooks/useSidebarVisible';

interface DefaultAppLayoutProps {
  children: React.ReactNode;
}

export function DefaultAppLayout({ children }: DefaultAppLayoutProps) {
  const { collapsed } = useSidebar();
  const sidebarVisible = useSidebarVisible();
  const mainMargin = !sidebarVisible ? 'md:ml-0' : collapsed ? 'md:ml-16' : 'md:ml-64';

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9]">
      <Navbar />
      {sidebarVisible && <Sidebar />}
      <main className={`flex-grow pt-12 pb-8 transition-all duration-300 ${mainMargin}`}>
        <div className="w-full px-6 sm:px-8">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
