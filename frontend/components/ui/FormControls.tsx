"use client";

import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftIcon, rightIcon, className = "", style, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
          </label>
        )}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          {leftIcon && (
            <div
              style={{
                position: "absolute",
                left: "0.85rem",
                display: "flex",
                alignItems: "center",
                color: "var(--text-subtle)",
                pointerEvents: "none",
              }}
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`form-control ${className}`}
            style={{
              paddingLeft: leftIcon ? "2.4rem" : undefined,
              paddingRight: rightIcon ? "2.4rem" : undefined,
              borderColor: error ? "var(--danger)" : undefined,
              ...style,
            }}
            {...props}
          />
          {rightIcon && (
            <div
              style={{
                position: "absolute",
                right: "0.85rem",
                display: "flex",
                alignItems: "center",
                color: "var(--text-subtle)",
              }}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <span style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.2rem" }}>
            {error}
          </span>
        ) : helperText ? (
          <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, options, children, className = "", style, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        {label && (
          <label htmlFor={selectId} className="form-label">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`form-select ${className}`}
          style={{
            borderColor: error ? "var(--danger)" : undefined,
            cursor: "pointer",
            ...style,
          }}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.2rem" }}>
            {error}
          </span>
        )}
        {!error && helperText && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, className = "", style, id, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="form-group" style={{ marginBottom: "1rem" }}>
        {label && (
          <label htmlFor={textareaId} className="form-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`form-control ${className}`}
          style={{
            borderColor: error ? "var(--danger)" : undefined,
            ...style,
          }}
          {...props}
        />
        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "0.2rem" }}>
            {error}
          </span>
        )}
        {!error && helperText && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = "", style, id, ...props }, ref) => {
    const checkId = id || (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <label
        htmlFor={checkId}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.65rem",
          cursor: "pointer",
          userSelect: "none",
          ...style,
        }}
      >
        <input
          ref={ref}
          id={checkId}
          type="checkbox"
          style={{
            width: "18px",
            height: "18px",
            marginTop: "0.15rem",
            accentColor: "var(--primary-500)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          {...props}
        />
        <div>
          <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--text-main)", lineHeight: 1.3 }}>
            {label}
          </div>
          {description && (
            <div style={{ fontSize: "0.76rem", color: "var(--text-subtle)", marginTop: "0.15rem" }}>
              {description}
            </div>
          )}
        </div>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";
