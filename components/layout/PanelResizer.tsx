'use client';

import { useCallback, useRef } from 'react';

interface PanelResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function PanelResizer({ direction, onResize, className = '' }: PanelResizerProps) {
  const isDragging = useRef(false);
  const startPos = useRef(0);
  // Use a ref to always have the latest onResize callback,
  // avoiding stale closures during drag operations
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResizeRef.current(delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction]
  );

  return (
    <div
      className={`resize-handle ${
        direction === 'horizontal' ? 'resize-handle-horizontal' : 'resize-handle-vertical'
      } ${className}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={direction}
      tabIndex={0}
      aria-label={`Resize ${direction === 'horizontal' ? 'panel width' : 'panel height'}`}
    />
  );
}
