import React from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { Footer } from '../../components/layout/Footer';
import { useSidebar } from '../../hooks/useSidebar';

interface DefaultAppLayoutProps {
  children: React.ReactNode;
}

export function DefaultAppLayout({ children }: DefaultAppLayoutProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9]">
      <Navbar />
      <Sidebar />
      <main className={`flex-grow pt-12 pb-8 transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        <div className="w-full px-6 sm:px-8">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
