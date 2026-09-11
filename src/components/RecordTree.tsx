import { useState } from "react";
import {
  recordExistsFilter,
  recordScalarFilter,
  type Filter,
  type JsonValue,
} from "../lib/data";
import {
  RecordFilterMenu,
  menuPositionForRect,
  openRecordMenuAt,
  type RecordMenu,
} from "./RecordFilterMenu";

export function RecordTree({
  value,
  path = [],
  language = "de",
  onAddFilter,
}: {
  value: JsonValue;
  path?: (string | number)[];
  language?: "de" | "en";
  onAddFilter?: (filter: Filter) => void;
}) {
  const [menu, setMenu] = useState<RecordMenu>(null);
  const [menuFilter, setMenuFilter] = useState<Filter | null>(null);
  if (value === null || typeof value !== "object") {
    return (
      <span className="record-value">
        {value === null ? "null" : String(value)}
      </span>
    );
  }
  const entries = Object.entries(value);
  if (!entries.length)
    return (
      <span className="record-value">{Array.isArray(value) ? "[]" : "{}"}</span>
    );
  const isArray = Array.isArray(value);
  const openMenu = (
    client: { clientX: number; clientY: number },
    filter: Filter,
  ) => {
    if (!onAddFilter) return;
    setMenuFilter(filter);
    setMenu(openRecordMenuAt(client, filter.column));
  };
  return (
    <>
      <dl className="record-tree">
        {entries.map(([key, child]) => {
          const segment: string | number = isArray ? Number(key) : key;
          const childPath = [...path, segment];
          const label = isArray ? Number(key) + 1 : key;
          if (child !== null && typeof child === "object") {
            return (
              <div
                key={key}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMenu(event, recordExistsFilter(childPath));
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "ContextMenu" ||
                    (event.shiftKey && event.key === "F10")
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = (
                      event.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    openMenu(
                      menuPositionForRect(rect),
                      recordExistsFilter(childPath),
                    );
                  }
                }}
              >
                <dt>
                  <details
                    open
                    onToggle={(event) => event.stopPropagation()}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openMenu(event, recordExistsFilter(childPath));
                    }}
                  >
                    <summary>
                      {label} <span>({Object.keys(child).length})</span>
                    </summary>
                    <RecordTree
                      value={child}
                      path={childPath}
                      language={language}
                      onAddFilter={onAddFilter}
                    />
                  </details>
                </dt>
              </div>
            );
          }
          return (
            <div
              key={key}
              tabIndex={onAddFilter ? 0 : undefined}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openMenu(event, recordScalarFilter(childPath, child));
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = (
                    event.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  openMenu(
                    menuPositionForRect(rect),
                    recordScalarFilter(childPath, child),
                  );
                }
                if (event.key === "Escape" && menu) {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenu(null);
                }
              }}
            >
              <dt>{label}</dt>
              <dd>
                <RecordTree value={child} />
              </dd>
            </div>
          );
        })}
      </dl>
      {menu && menuFilter && onAddFilter && (
        <RecordFilterMenu
          menu={menu}
          language={language}
          onClose={() => setMenu(null)}
          onPick={() => {
            const picked = menuFilter;
            setMenu(null);
            setMenuFilter(null);
            onAddFilter(picked);
          }}
        />
      )}
    </>
  );
}
