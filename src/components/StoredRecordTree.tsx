import { useEffect, useState } from "react";
import type { StorageClient } from "../lib/storage/client";
import type { ChildPage } from "../lib/ingestion/contracts";

export function StoredRecordTree({
  client,
  dataset,
  record,
  path = [],
  language,
}: {
  client: StorageClient;
  dataset: string;
  record: number;
  path?: string[];
  language: "de" | "en";
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
      .request<ChildPage>({ type: "children", dataset, record, path, offset })
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
            path={[...path, entry.key]}
            language={language}
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
  path: string[];
  language: "de" | "en";
}) {
  const [open, setOpen] = useState(true);
  const { entry, ...tree } = props;
  if (entry.kind === "value")
    return (
      <div>
        <dt>{entry.key}</dt>
        <dd>
          <span className="record-value">{String(entry.value ?? "null")}</span>
        </dd>
      </div>
    );
  return (
    <div>
      <dt>
        <details
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary>
            {entry.key} <span>({entry.count})</span>
          </summary>
          {open && <StoredRecordTree {...tree} />}
        </details>
      </dt>
    </div>
  );
}
