"use client";

import React, { useState, useRef } from "react";
import { api, MediaItem } from "@/lib/api";
import { Upload, X, ArrowUp, ArrowDown, Image as ImageIcon, Loader2 } from "lucide-react";

interface ImageUploaderProps {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ media, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const newItems: MediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File ${file.name} exceeds 5MB limit.`);
        }
        const uploaded = await api.uploadMedia(file);
        newItems.push(uploaded);
      }
      onChange([...media, ...newItems]);
    } catch (err: any) {
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = (index: number) => {
    const next = media.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const next = [...media];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;

    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: "2px dashed var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          cursor: uploading ? "not-allowed" : "pointer",
          backgroundColor: "var(--bg-input)",
          transition: "var(--transition)",
        }}
      >
        {uploading ? (
          <Loader2 size={24} color="var(--primary-500)" style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Upload size={24} color="var(--slate-400)" />
        )}
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {uploading ? "Uploading & validating image..." : "Click to upload diagram/formula images (PNG, JPEG, WebP, GIF ≤ 5MB)"}
        </span>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: "0.8rem", padding: "0.4rem 0" }}>
          {error}
        </div>
      )}

      {media.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {media.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.5rem 0.75rem",
                backgroundColor: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", overflow: "hidden" }}>
                <img
                  src={item.url}
                  alt={item.original_filename}
                  style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "4px", backgroundColor: "#000" }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "250px" }}>
                    {item.original_filename}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                    {item.width}×{item.height} px • {(item.file_size / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => handleMove(idx, "up")}
                  disabled={idx === 0}
                  className="btn btn-secondary btn-sm"
                  title="Move up"
                  style={{ padding: "0.25rem 0.4rem" }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, "down")}
                  disabled={idx === media.length - 1}
                  className="btn btn-secondary btn-sm"
                  title="Move down"
                  style={{ padding: "0.25rem 0.4rem" }}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="btn btn-danger btn-sm"
                  title="Remove image"
                  style={{ padding: "0.25rem 0.4rem" }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
