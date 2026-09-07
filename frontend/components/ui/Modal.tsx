"use client";

import React, { useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  icon?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "600px",
  icon,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            {icon}
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            style={{ width: "30px", height: "30px" }}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ marginTop: "1.25rem", color: "var(--text-main)" }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  height?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  height = "75vh",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="drawer-bottom"
        style={{ maxHeight: height }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle pill */}
        <div
          style={{
            width: "40px",
            height: "4px",
            borderRadius: "9999px",
            background: "var(--border-color)",
            margin: "0 auto 1rem auto",
          }}
        />

        {/* Drawer Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            style={{ width: "30px", height: "30px" }}
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
};

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "ember";
  loading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="480px"
      icon={
        variant === "danger" ? (
          <div style={{ padding: "0.4rem", borderRadius: "8px", background: "var(--danger-bg)" }}>
            <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
          </div>
        ) : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "ember"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {message}
      </div>
    </Modal>
  );
};
