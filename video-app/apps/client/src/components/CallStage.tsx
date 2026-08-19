import { ReactNode } from 'react';

interface CallStageProps {
  children: ReactNode;
}

export function CallStage({ children }: CallStageProps) {
  return (
    <div className="fixed inset-0 z-30 h-dvh w-screen overflow-hidden bg-bg">
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}
