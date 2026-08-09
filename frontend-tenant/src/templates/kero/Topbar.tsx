import React from 'react';
import { UserMenu } from '../../components/layout/UserMenu';

export const KeroTopbar: React.FC = () => {
  return (
    <header className="flex mt-3 mb-3 mx-2 md:mt-6 md:mb-6 md:mx-8 md:h-20 items-center justify-between px-4 md:px-8 h-16 flex-shrink-0 rounded-[1.4rem] bg-[#F8F9FD]">
      <div />
      <div className="flex items-center gap-4">
        <UserMenu variant="light" />
      </div>
    </header>
  );
};
