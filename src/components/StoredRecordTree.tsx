import { useEffect, useState } from "react";
import type { StorageClient } from "../lib/storage/client";
import type { ChildPage } from "../lib/ingestion/contracts";
import {
  recordExistsFilter,
  recordScalarFilter,
  type Filter,
} from "../lib/data";
import {
  RecordFilterMenu,
  menuPositionForRect,
  openRecordMenuAt,
  type RecordMenu,
} from "./RecordFilterMenu";

export function StoredRecordTree({
  client,
  dataset,
  record,
  path = [],
  language,
  onAddFilter,
}: {
  client: StorageClient;
  dataset: string;
  record: number;
  path?: (string | number)[];
  language: "de" | "en";
  onAddFilter?: (filter: Filter) => void;
}) {
  const [page, setPage] = useState<ChildPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const key = JSON.stringify(path);
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError("");
    client
      .request<ChildPage>({
        type: "children",
        dataset,
        record,
        path: path.map(String),
        offset,
      })
      .then((value) => {
        if (!cancelled) setPage(value);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [client, dataset, record, key, offset]);
  if (error) return <p role="alert">{error}</p>;
  if (!page)
    return (
      <span role="status">{language === "de" ? "Laden …" : "Loading …"}</span>
    );
  if (page.kind === "value")
    return <span className="record-value">{String(page.value ?? "null")}</span>;
  return (
    <>
      <dl className="record-tree">
        {page.entries.map((entry) => (
          <StoredBranch
            key={entry.key}
            entry={entry}
            client={client}
            dataset={dataset}
            record={record}
            parentPath={path}
            parentKind={page.kind === "value" ? "object" : page.kind}
            language={language}
            onAddFilter={onAddFilter}
          />
        ))}
      </dl>
      {!page.total && <span>{page.kind === "array" ? "[]" : "{}"}</span>}
      {page.total > 100 && (
        <div className="data-pagination">
          <button
            disabled={!offset}
            onClick={() => setOffset((n) => Math.max(0, n - 100))}
          >
            ←
          </button>
          {offset + 1}–{offset + page.entries.length} / {page.total}
          <button
            disabled={offset + page.entries.length >= page.total}
            onClick={() => setOffset(offset + page.entries.length)}
          >
            →
          </button>
        </div>
      )}
    </>
  );
}
function StoredBranch(props: {
  entry: ChildPage["entries"][number];
  client: StorageClient;
  dataset: string;
  record: number;
  parentPath: (string | number)[];
  parentKind: "object" | "array";
  language: "de" | "en";
  onAddFilter?: (filter: Filter) => void;
}) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<RecordMenu>(null);
  const { entry, parentPath, parentKind, onAddFilter, language } = props;
  const segment: string | number =
    parentKind === "array" ? Number(entry.key) : entry.key;
  const fullPath = [...parentPath, segment];
  const openMenu = (
    clientPoint: { clientX: number; clientY: number },
    filter: Filter,
  ) => {
    if (!onAddFilter) return;
    setPending(filter);
    setMenu(openRecordMenuAt(clientPoint, filter.column));
  };
  const [pending, setPending] = useState<Filter | null>(null);
  const pick = () => {
    const filter = pending;
    setMenu(null);
    setPending(null);
    if (filter && onAddFilter) onAddFilter(filter);
  };
  if (entry.kind === "value")
    return (
      <div
        tabIndex={onAddFilter ? 0 : undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openMenu(event, recordScalarFilter(fullPath, entry.value ?? null));
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
              recordScalarFilter(fullPath, entry.value ?? null),
            );
          }
          if (event.key === "Escape" && menu) {
            event.preventDefault();
            event.stopPropagation();
            setMenu(null);
          }
        }}
      >
        <dt>{entry.key}</dt>
        <dd>
          <span className="record-value">{String(entry.value ?? "null")}</span>
        </dd>
        {menu && (
          <RecordFilterMenu
            menu={menu}
            language={language}
            onClose={() => setMenu(null)}
            onPick={pick}
          />
        )}
      </div>
    );
  const { entry: _entry, ...tree } = props as unknown as {
    entry: unknown;
  } & Record<string, unknown>;
  void _entry;
  void tree;
  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openMenu(event, recordExistsFilter(fullPath));
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
          openMenu(menuPositionForRect(rect), recordExistsFilter(fullPath));
        }
      }}
    >
      <dt>
        <details
          open={open}
          onToggle={(event) => {
            event.stopPropagation();
            setOpen(event.currentTarget.open);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openMenu(event, recordExistsFilter(fullPath));
          }}
        >
          <summary>
            {entry.key} <span>({entry.count})</span>
          </summary>
          {open && (
            <StoredRecordTree
              client={props.client}
              dataset={props.dataset}
              record={props.record}
              path={fullPath}
              language={props.language}
              onAddFilter={props.onAddFilter}
            />
          )}
        </details>
      </dt>
      {menu && (
        <RecordFilterMenu
          menu={menu}
          language={language}
          onClose={() => setMenu(null)}
          onPick={pick}
        />
      )}
    </div>
  );
}
