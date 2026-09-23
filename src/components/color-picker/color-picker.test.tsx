import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ColorPicker } from './color-picker';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'color_picker.choose_color': 'Choose color',
                'color_picker.hex_color': 'HEX color',
                'color_picker.invalid_hex': 'Enter a 6-digit HEX color.',
                'color_picker.apply': 'Apply',
                'color_picker.cancel': 'Cancel',
                'color_picker.mixed': 'Mixed colors',
                'color_picker.current': 'Current',
                'color_picker.preview': 'Preview',
                'color_picker.presets': 'Preset colors',
                'color_picker.hue': 'Hue',
                'color_picker.saturation_brightness':
                    'Saturation and brightness',
                'color_picker.saturation': 'saturation',
                'color_picker.brightness': 'brightness',
            })[key] ?? key,
    }),
}));

it('accepts a six-digit HEX value and preserves the preset palette', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#ff6363" onChange={onChange} />);

    fireEvent.click(screen.getByTitle('#ff6363'));
    const input = await screen.findByLabelText('HEX color');
    expect(document.querySelector('input[type="color"]')).toBeNull();
    fireEvent.change(input, { target: { value: '0fa958' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith('#0FA958');

    fireEvent.click(screen.getByTitle('#ff6363'));
    fireEvent.click(await screen.findByRole('button', { name: '#ff6363' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenLastCalledWith('#FF6363');
});

it('previews presets and cancels without changing the stored color', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#ff6363" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('#ff6363'));
    expect(await screen.findByText('Current')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '#8eb7ff' }));
    expect(screen.getByLabelText('HEX color')).toHaveValue('#8EB7FF');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('#ff6363'));
    expect(await screen.findByLabelText('HEX color')).toHaveValue('#FF6363');
    expect(onChange).not.toHaveBeenCalled();
});

it('discards a draft on Escape or outside click', async () => {
    const onChange = vi.fn();
    render(
        <div>
            <ColorPicker color="#ff6363" onChange={onChange} />
            <button type="button">Outside</button>
        </div>
    );
    fireEvent.click(screen.getByTitle('#ff6363'));
    fireEvent.change(await screen.findByLabelText('HEX color'), {
        target: { value: '#0fa958' },
    });
    fireEvent.keyDown(screen.getByLabelText('HEX color'), { key: 'Escape' });
    await waitFor(() =>
        expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByTitle('#ff6363'));
    expect(await screen.findByLabelText('HEX color')).toHaveValue('#FF6363');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    await waitFor(() =>
        expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();
});

it('supports keyboard color-area and hue selection before Apply', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#FF0000" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('#FF0000'));
    const area = await screen.findByRole('slider', {
        name: 'Saturation and brightness',
    });
    fireEvent.keyDown(area, { key: 'ArrowLeft', shiftKey: true });
    expect(screen.getByLabelText('HEX color')).toHaveValue('#FF1919');
    fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), {
        target: { value: '120' },
    });
    expect(screen.getByLabelText('HEX color')).toHaveValue('#19FF19');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith('#19FF19');
});

it('uses pointer position for the color area without applying early', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#FF0000" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('#FF0000'));
    const area = await screen.findByRole('slider', {
        name: 'Saturation and brightness',
    });
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
    } as DOMRect);
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 210, clientY: 20 });
    expect(screen.getByLabelText('HEX color')).toHaveValue('#FF0000');
    fireEvent.pointerMove(area, {
        pointerId: 1,
        buttons: 1,
        clientX: 210,
        clientY: 120,
    });
    expect(screen.getByLabelText('HEX color')).toHaveValue('#000000');
    expect(onChange).not.toHaveBeenCalled();
});

it('starts mixed colors without an assumed HEX and applies only a selected draft', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#FF6363" mixed onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Mixed colors'));
    expect(await screen.findByLabelText('HEX color')).toHaveValue('');
    expect(screen.getByText('—')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a 6-digit HEX color.'
    );
    fireEvent.click(screen.getByRole('button', { name: '#8eb7ff' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith('#8EB7FF');
});

it.each(['#abc', '#0FA958FF', 'GGAA00', ''])(
    'does not apply invalid HEX input %s',
    async (value) => {
        const onChange = vi.fn();
        render(<ColorPicker color="#ff6363" onChange={onChange} />);
        fireEvent.click(screen.getByTitle('#ff6363'));
        fireEvent.change(await screen.findByLabelText('HEX color'), {
            target: { value },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Enter a 6-digit HEX color.'
        );
    }
);

it('blocks the picker entirely in read-only mode', async () => {
    const onChange = vi.fn();
    render(<ColorPicker color="#ff6363" onChange={onChange} disabled />);
    expect(screen.getByTitle('#ff6363')).toBeDisabled();
    fireEvent.click(screen.getByTitle('#ff6363'));
    await waitFor(() => {
        expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
});

it('closes an open picker when editing becomes read-only', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
        <ColorPicker color="#ff6363" onChange={onChange} />
    );
    fireEvent.click(screen.getByTitle('#ff6363'));
    expect(await screen.findByLabelText('HEX color')).toBeInTheDocument();
    rerender(<ColorPicker color="#ff6363" onChange={onChange} disabled />);
    await waitFor(() => {
        expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument();
    });
    rerender(<ColorPicker color="#ff6363" onChange={onChange} />);
    expect(screen.queryByLabelText('HEX color')).not.toBeInTheDocument();
});
