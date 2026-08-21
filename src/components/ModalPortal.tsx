"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Portals its children to document.body behind a full-screen dimmed +
 *  blurred backdrop. Always use this (never a plain `position: fixed` div
 *  inline in a component) for any modal/dialog — portaling to <body>
 *  is what guarantees the dialog covers the true viewport instead of
 *  getting trapped inside an ancestor that happens to set a CSS
 *  `transform` (which creates a new containing block for `fixed`
 *  descendants and would otherwise clip/mis-position the dialog). */
export function ModalPortal({
  onOverlayClick,
  children,
  maxWidth = 480,
}: {
  onOverlayClick?: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      onClick={onOverlayClick}
      className="modalOverlayAnim"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,13,24,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
        padding: "24px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modalPop"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          margin: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: "var(--r2)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
