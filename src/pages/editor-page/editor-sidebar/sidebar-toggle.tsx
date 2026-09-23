import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useLayout } from '@/hooks/use-layout';

export const SidebarToggle: React.FC = () => {
    const { isSidePanelShowed, toggleSidePanel } = useLayout();
    const { t } = useTranslation();
    const label = t(
        isSidePanelShowed ? 'menu.view.hide_sidebar' : 'menu.view.show_sidebar'
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 rounded-lg border-border bg-background/80 text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:ring-2"
                    aria-label={label}
                    aria-controls="editor-sidebar-panel"
                    aria-expanded={isSidePanelShowed}
                    onClick={toggleSidePanel}
                >
                    {isSidePanelShowed ? (
                        <PanelLeftClose className="size-4" aria-hidden="true" />
                    ) : (
                        <PanelLeftOpen className="size-4" aria-hidden="true" />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
    );
};
