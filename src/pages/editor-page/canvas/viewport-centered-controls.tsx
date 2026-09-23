import React from 'react';
import { Controls } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface ViewportCenteredControlsProps extends React.ComponentProps<
    typeof Controls
> {
    desktop: boolean;
}

export const ViewportCenteredControls: React.FC<
    ViewportCenteredControlsProps
> = ({ desktop, className, ...props }) => (
    <Controls {...props} className={cn(className, desktop && '!fixed !z-20')} />
);
