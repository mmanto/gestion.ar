import React from 'react';
import { UserMenu } from '../../components/layout/UserMenu';

export const KeroTopbar: React.FC = () => {
  return (
    <header className="hidden md:flex mt-6 mb-6 mx-8 h-20 items-center justify-between px-8 flex-shrink-0 rounded-[1.4rem] bg-[#F8F9FD]">
      <div />
      <div className="flex items-center gap-4">
        <UserMenu variant="light" />
      </div>
    </header>
  );
};
