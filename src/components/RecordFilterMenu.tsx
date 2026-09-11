import { useEffect, useRef } from "react";

export type RecordMenu = {
  x: number;
  y: number;
  label: string;
} | null;

export function openRecordMenuAt(
  event: { clientX: number; clientY: number },
  label: string,
): NonNullable<RecordMenu> {
  const width = 240;
  const height = 64;
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - width));
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - height));
  return { x, y, label };
}

export function menuPositionForRect(rect: { left: number; bottom: number }): {
  clientX: number;
  clientY: number;
} {
  return { clientX: rect.left + 24, clientY: rect.bottom + 4 };
}

export function RecordFilterMenu({
  menu,
  language,
  onPick,
  onClose,
}: {
  menu: NonNullable<RecordMenu>;
  language: "de" | "en";
  onPick: () => void;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-record-menu]")) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);
  return (
    <div
      data-record-menu
      role="menu"
      aria-label={menu.label}
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 80,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(20,30,50,.22)",
        padding: 6,
        minWidth: 220,
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        ref={buttonRef}
        role="menuitem"
        type="button"
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          borderRadius: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
        }}
        onClick={(event) => {
          event.stopPropagation();
          onPick();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {language === "de" ? "Als Filter hinzufügen" : "Add as filter"}
      </button>
    </div>
  );
}
