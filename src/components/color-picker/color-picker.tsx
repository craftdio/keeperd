import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { colorOptions, defaultTableColor } from '@/lib/colors';
import { normalizeHexColor } from '@/lib/color-hex';
import { cn } from '@/lib/utils';
import { hexToHsv, hsvToHex, type HsvColor } from './color-picker-color';
import './color-picker.css';

export interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    disabled?: boolean;
    mixed?: boolean;
    popoverOnMouseDown?: (e: React.MouseEvent) => void;
    popoverOnClick?: (e: React.MouseEvent) => void;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export const ColorPicker = React.forwardRef<
    HTMLButtonElement,
    ColorPickerProps
>(
    (
        {
            color,
            onChange,
            disabled,
            mixed = false,
            popoverOnMouseDown,
            popoverOnClick,
        },
        ref
    ) => {
        const { t } = useTranslation();
        const [open, setOpen] = useState(false);
        const [hexInput, setHexInput] = useState('');
        const [showError, setShowError] = useState(false);
        const [hasDraft, setHasDraft] = useState(!mixed);
        const [hsv, setHsv] = useState<HsvColor>(
            () => hexToHsv(color) ?? hexToHsv(defaultTableColor)!
        );
        const inputId = React.useId();
        const currentColor = normalizeHexColor(color);
        const normalizedInput = normalizeHexColor(hexInput);
        const hasError = !normalizedInput && (showError || hexInput.length > 0);
        const previewColor = hsvToHex(hsv);

        useEffect(() => {
            if (disabled) setOpen(false);
        }, [disabled]);

        const handleOpenChange = (nextOpen: boolean) => {
            if (disabled) return;
            if (nextOpen) {
                const initial = currentColor ?? defaultTableColor;
                setHsv(hexToHsv(initial)!);
                setHexInput(mixed ? '' : initial);
                setHasDraft(!mixed);
                setShowError(false);
            }
            setOpen(nextOpen);
        };

        const preview = (next: HsvColor) => {
            setHsv(next);
            setHexInput(hsvToHex(next));
            setHasDraft(true);
            setShowError(false);
        };

        const applyColor = () => {
            if (disabled) return;
            const normalized = normalizeHexColor(hexInput);
            if (!normalized) {
                setShowError(true);
                return;
            }
            onChange(normalized);
            setOpen(false);
        };

        const changeAreaFromPointer = (event: React.PointerEvent) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            preview({
                h: hsv.h,
                s: clamp(((event.clientX - bounds.left) / bounds.width) * 100),
                v: clamp(
                    100 - ((event.clientY - bounds.top) / bounds.height) * 100
                ),
            });
        };

        const handleAreaKeyDown = (event: React.KeyboardEvent) => {
            const step = event.shiftKey ? 10 : 2;
            let next = hsv;
            if (event.key === 'ArrowLeft')
                next = { ...hsv, s: clamp(hsv.s - step) };
            else if (event.key === 'ArrowRight')
                next = { ...hsv, s: clamp(hsv.s + step) };
            else if (event.key === 'ArrowUp')
                next = { ...hsv, v: clamp(hsv.v + step) };
            else if (event.key === 'ArrowDown')
                next = { ...hsv, v: clamp(hsv.v - step) };
            else return;
            event.preventDefault();
            event.stopPropagation();
            preview(next);
        };

        return (
            <Popover open={open && !disabled} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        ref={ref}
                        disabled={disabled}
                        aria-label={t('color_picker.choose_color')}
                        title={mixed ? t('color_picker.mixed') : color}
                        className={cn(
                            'h-6 w-8 shrink-0 cursor-pointer rounded-md border-2 border-muted transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            { 'cursor-default hover:shadow-none': disabled }
                        )}
                        style={{
                            backgroundColor: mixed ? undefined : color,
                            backgroundImage: mixed
                                ? 'linear-gradient(135deg, #ff6363 50%, #8eb7ff 50%)'
                                : undefined,
                        }}
                    />
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-[100001] max-h-[min(32rem,calc(100dvh-1.5rem))] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-2xl"
                    onMouseDown={popoverOnMouseDown}
                    onClick={popoverOnClick}
                >
                    <div className="mb-2 text-sm font-semibold">
                        {t('color_picker.choose_color')}
                    </div>
                    <div
                        role="slider"
                        tabIndex={0}
                        aria-label={t('color_picker.saturation_brightness')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(hsv.v)}
                        aria-valuetext={`${Math.round(hsv.s)}% ${t('color_picker.saturation')}, ${Math.round(hsv.v)}% ${t('color_picker.brightness')}`}
                        className="relative h-28 w-full cursor-crosshair touch-none overflow-hidden rounded-xl border border-border/70 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                        style={{
                            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
                        }}
                        onPointerDown={(event) => {
                            event.currentTarget.focus();
                            event.currentTarget.setPointerCapture?.(
                                event.pointerId
                            );
                            changeAreaFromPointer(event);
                        }}
                        onPointerMove={(event) => {
                            if (event.buttons) changeAreaFromPointer(event);
                        }}
                        onKeyDown={handleAreaKeyDown}
                    >
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_2px_5px_rgba(0,0,0,0.35)]"
                            style={{
                                left: `clamp(8px, ${hsv.s}%, calc(100% - 8px))`,
                                top: `clamp(8px, ${100 - hsv.v}%, calc(100% - 8px))`,
                            }}
                        />
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={360}
                        value={Math.round(hsv.h)}
                        aria-label={t('color_picker.hue')}
                        className="color-picker-hue mt-3 w-full cursor-pointer rounded-full border border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                        onChange={(event) =>
                            preview({ ...hsv, h: Number(event.target.value) })
                        }
                    />
                    <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5">
                        <div className="min-w-0">
                            <p className="mb-1 text-[11px] text-muted-foreground">
                                {t('color_picker.current')}
                            </p>
                            <div className="flex h-7 min-w-0 items-center gap-1.5">
                                <span
                                    aria-hidden="true"
                                    className="size-6 shrink-0 rounded-md border border-border/70"
                                    style={{
                                        backgroundColor: mixed
                                            ? undefined
                                            : (currentColor ?? color),
                                        backgroundImage: mixed
                                            ? 'linear-gradient(135deg, #ff6363 50%, #8eb7ff 50%)'
                                            : undefined,
                                    }}
                                />
                                <span className="truncate font-mono text-xs">
                                    {mixed
                                        ? t('color_picker.mixed')
                                        : (currentColor ?? color)}
                                </span>
                            </div>
                        </div>
                        <div className="min-w-0 border-l border-border/70 pl-2">
                            <p className="mb-1 text-[11px] text-muted-foreground">
                                {t('color_picker.preview')}
                            </p>
                            <div className="flex h-7 min-w-0 items-center gap-1.5">
                                <span
                                    aria-hidden="true"
                                    className="size-6 shrink-0 rounded-md border border-border/70"
                                    style={{
                                        backgroundColor: hasDraft
                                            ? previewColor
                                            : undefined,
                                        backgroundImage: hasDraft
                                            ? undefined
                                            : 'linear-gradient(135deg, #94a3b8 50%, #e2e8f0 50%)',
                                    }}
                                />
                                <span className="truncate font-mono text-xs">
                                    {hasDraft ? previewColor : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {t('color_picker.presets')}
                        </p>
                        <div className="grid grid-cols-8 gap-1">
                            {colorOptions.map((option) => {
                                const selected =
                                    normalizedInput ===
                                    normalizeHexColor(option);
                                return (
                                    <button
                                        type="button"
                                        key={option}
                                        aria-label={option}
                                        aria-pressed={selected}
                                        data-selected={selected}
                                        className="size-6 cursor-pointer rounded-full border border-border/70 shadow-sm transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[selected=true]:ring-2 data-[selected=true]:ring-ring data-[selected=true]:ring-offset-2 data-[selected=true]:ring-offset-popover"
                                        style={{ backgroundColor: option }}
                                        onClick={() =>
                                            preview(hexToHsv(option)!)
                                        }
                                    />
                                );
                            })}
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <label
                            className="mb-1.5 block text-xs font-medium text-muted-foreground"
                            htmlFor={inputId}
                        >
                            {t('color_picker.hex_color')}
                        </label>
                        <Input
                            id={inputId}
                            value={hexInput}
                            placeholder="#RRGGBB"
                            spellCheck={false}
                            autoComplete="off"
                            aria-invalid={hasError}
                            aria-describedby={
                                hasError ? `${inputId}-error` : undefined
                            }
                            className="h-10 rounded-lg bg-background font-mono text-sm uppercase"
                            onChange={(event) => {
                                const value = event.target.value;
                                setHexInput(value);
                                setShowError(false);
                                const normalized = normalizeHexColor(value);
                                if (normalized) {
                                    setHsv(hexToHsv(normalized)!);
                                    setHasDraft(true);
                                }
                            }}
                            onBlur={() => {
                                if (hexInput) setShowError(true);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    applyColor();
                                }
                            }}
                        />
                        <p
                            id={`${inputId}-error`}
                            role={hasError ? 'alert' : undefined}
                            className="mt-1 min-h-4 text-xs text-destructive"
                        >
                            {hasError
                                ? t('color_picker.invalid_hex')
                                : '\u00a0'}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-lg"
                            onClick={() => setOpen(false)}
                        >
                            {t('color_picker.cancel')}
                        </Button>
                        <Button
                            type="button"
                            className="h-9 rounded-lg"
                            onClick={applyColor}
                        >
                            {t('color_picker.apply')}
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        );
    }
);

ColorPicker.displayName = 'ColorPicker';
