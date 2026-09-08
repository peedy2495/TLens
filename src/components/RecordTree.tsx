import type { JsonValue } from "../lib/data";

export function RecordTree({ value }: { value: JsonValue }) {
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
  return (
    <dl className="record-tree">
      {entries.map(([key, child]) => (
        <div key={key}>
          {child !== null && typeof child === "object" ? (
            <>
              <dt>
                <details open>
                  <summary>
                    {Array.isArray(value) ? Number(key) + 1 : key}{" "}
                    <span>({Object.keys(child).length})</span>
                  </summary>
                  <RecordTree value={child} />
                </details>
              </dt>
            </>
          ) : (
            <>
              <dt>{Array.isArray(value) ? Number(key) + 1 : key}</dt>
              <dd>
                <RecordTree value={child} />
              </dd>
            </>
          )}
        </div>
      ))}
    </dl>
  );
}
