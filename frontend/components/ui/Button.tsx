"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "ember" | "violet" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    let variantClass = "btn-ember";
    if (variant === "violet") variantClass = "btn-violet";
    else if (variant === "secondary") variantClass = "btn-secondary";
    else if (variant === "outline") variantClass = "btn-outline";
    else if (variant === "ghost") variantClass = "btn-ghost";
    else if (variant === "danger") variantClass = "btn-danger";
    else if (variant === "primary") variantClass = "btn-ember";

    let sizeClass = "";
    if (size === "sm") sizeClass = "btn-sm";
    else if (size === "lg") sizeClass = "btn-lg";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`btn ${variantClass} ${sizeClass} ${className}`}
        style={{
          width: fullWidth ? "100%" : undefined,
          ...style,
        }}
        {...props}
      >
        {loading && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: "default" | "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
  tooltip?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = "default", size = "md", tooltip, className = "", style, ...props }, ref) => {
    const dim = size === "sm" ? 30 : size === "lg" ? 44 : 36;
    return (
      <button
        ref={ref}
        type="button"
        className={`icon-btn ${className}`}
        title={tooltip}
        aria-label={tooltip || "icon button"}
        style={{
          width: `${dim}px`,
          height: `${dim}px`,
          ...style,
        }}
        {...props}
      >
        {icon}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";
