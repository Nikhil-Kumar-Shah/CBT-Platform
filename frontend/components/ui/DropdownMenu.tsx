"use client";

import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null> | React.MutableRefObject<HTMLElement | null> | { current: HTMLElement | null };
  children: React.ReactNode;
  minWidth?: number | string;
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  isOpen,
  onClose,
  triggerRef,
  children,
  minWidth = 190,
  align = "right",
  className = "",
  style,
}) => {
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!isOpen || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    // If trigger element has been unmounted or has zero dimensions
    if (triggerRect.width === 0 && triggerRect.height === 0) {
      onClose();
      return;
    }

    const menuEl = menuRef.current;
    const menuHeight = menuEl ? menuEl.offsetHeight : 260;
    const menuWidth = menuEl
      ? menuEl.offsetWidth
      : typeof minWidth === "number"
      ? minWidth
      : 190;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const GAP = 4;
    const PADDING = 8;

    const nextCoords: { top?: number; bottom?: number; left?: number; right?: number } = {};

    // Vertical placement: detect bottom viewport collision
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (spaceBelow < menuHeight + GAP && spaceAbove > spaceBelow) {
      // Position above the trigger (upward direction)
      nextCoords.bottom = Math.max(PADDING, viewportHeight - triggerRect.top + GAP);
    } else {
      // Position below the trigger (downward direction)
      nextCoords.top = Math.max(PADDING, triggerRect.bottom + GAP);
    }

    // Horizontal placement: right-aligned by default
    if (align === "right") {
      const rightDistance = viewportWidth - triggerRect.right;
      // If aligning to right would overflow the left edge of viewport:
      if (rightDistance + menuWidth > viewportWidth - PADDING) {
        nextCoords.left = PADDING;
      } else {
        nextCoords.right = Math.max(PADDING, rightDistance);
      }
    } else {
      // Left-aligned
      if (triggerRect.left + menuWidth > viewportWidth - PADDING) {
        nextCoords.right = PADDING;
      } else {
        nextCoords.left = Math.max(PADDING, triggerRect.left);
      }
    }

    setCoords(nextCoords);
  }, [isOpen, triggerRef, align, minWidth, onClose]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    } else {
      setCoords(null);
    }
  }, [isOpen, updatePosition]);

  // Handle click outside, Escape key, and scroll/resize updates
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, onClose, triggerRef, updatePosition]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={className}
      style={{
        position: "fixed",
        top: coords?.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords?.bottom !== undefined ? `${coords.bottom}px` : undefined,
        left: coords?.left !== undefined ? `${coords.left}px` : undefined,
        right: coords?.right !== undefined ? `${coords.right}px` : undefined,
        minWidth,
        maxWidth: "calc(100vw - 16px)",
        background: "var(--bg-dropdown)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "0.35rem",
        zIndex: 9999,
        boxShadow: "var(--shadow-lg)",
        textAlign: "left",
        opacity: coords ? 1 : 0,
        pointerEvents: coords ? "auto" : "none",
        transition: "opacity 0.12s ease",
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
};

export interface DropdownMenuItemProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  onClick,
  icon,
  children,
  variant = "default",
  disabled = false,
  style,
}) => {
  const [hovered, setHovered] = useState(false);

  let textColor = "var(--text-main)";
  let hoverBg = "var(--bg-dropdown-hover)";

  if (variant === "danger") {
    textColor = "var(--danger)";
    hoverBg = "var(--danger-bg)";
  } else if (variant === "warning") {
    textColor = "var(--warning)";
    hoverBg = "var(--warning-bg)";
  } else if (variant === "success") {
    textColor = "var(--success)";
    hoverBg = "var(--success-bg)";
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        background: hovered ? hoverBg : "transparent",
        border: "none",
        color: textColor,
        padding: "0.45rem 0.75rem",
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: "0.82rem",
        fontWeight: variant !== "default" ? 600 : 500,
        fontFamily: "var(--font-family)",
        textAlign: "left",
        transition: "background-color 0.12s ease, color 0.12s ease",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
};

export const DropdownMenuSeparator: React.FC = () => (
  <div
    style={{
      height: "1px",
      background: "var(--border-color)",
      margin: "0.3rem 0",
    }}
  />
);
