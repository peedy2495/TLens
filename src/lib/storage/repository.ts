import type {
  Database,
  Sqlite3Static,
  SqlValue,
} from "@sqlite.org/sqlite-wasm";
import {
  detectTimeColumns,
  eventRange,
  filterTables,
  isDate,
  valueText,
  type JsonValue,
  type Row,
} from "../data";
import {
  limits,
  RecordLimit,
  type Dataset,
  type Entity,
  type Query,
  type QueryResult,
  type ChildPage,
} from "../ingestion/contracts";

const encoder = new TextEncoder();
export class Repository {
  private insert;
  private update;
  constructor(
    readonly db: Database,
    sqlite: Sqlite3Static,
  ) {
    db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA cache_size=-16384; PRAGMA temp_store=FILE;",
    );
    const version = Number(db.selectValue("PRAGMA user_version"));
    if (version > 2)
      throw new Error("Database was created by a newer DLens version.");
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL, generation TEXT, metadata TEXT);
        CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, dataset TEXT NOT NULL, status TEXT NOT NULL, started TEXT NOT NULL, error TEXT, bytes INTEGER DEFAULT 0, records INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS entities(generation TEXT NOT NULL, id INTEGER NOT NULL, parent INTEGER, position INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, path TEXT NOT NULL, table_path TEXT, PRIMARY KEY(generation,id));
        CREATE INDEX IF NOT EXISTS entity_parent ON entities(generation,parent,name,position);
        CREATE TABLE IF NOT EXISTS records(generation TEXT NOT NULL,id INTEGER NOT NULL,path TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(generation,id));
        CREATE INDEX IF NOT EXISTS record_path ON records(generation,path,id);
        CREATE TABLE IF NOT EXISTS fields(generation TEXT NOT NULL,record INTEGER NOT NULL,name TEXT NOT NULL,value TEXT NOT NULL,top INTEGER NOT NULL,scalar INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS field_lookup ON fields(generation,name);
        CREATE INDEX IF NOT EXISTS field_record ON fields(generation,record);
        CREATE TABLE IF NOT EXISTS migrations(fingerprint TEXT PRIMARY KEY,dataset TEXT NOT NULL);
        PRAGMA user_version=2;`);
      if (version < 2)
        db.exec(
          "DROP INDEX IF EXISTS field_lookup; CREATE INDEX field_lookup ON fields(generation,name);",
        );
    });
    this.insert = db.prepare("INSERT INTO entities VALUES(?,?,?,?,?,?,?,?,?)");
    this.update = db.prepare(
      "UPDATE entities SET value=? WHERE generation=? AND id=?",
    );
    db.createFunction("dlens_isdate", (_ctx, text) =>
      Number(isDate(String(text))),
    );
    db.createFunction("dlens_nonempty", (_ctx, text) =>
      Number(String(text).trim().length > 0),
    );
    db.createFunction("dlens_match", (_ctx, payload, query, filters) =>
      Number(
        filterTables(
          [{ path: [], rows: [JSON.parse(String(payload))] }],
          String(query),
          JSON.parse(String(filters)),
        ).length > 0,
      ),
    );
    db.createFunction("dlens_value", (_ctx, payload, field) =>
      valueText(JSON.parse(String(payload))[String(field)]),
    );
    db.createFunction("dlens_sort", (_ctx, payload, field) =>
      String(JSON.parse(String(payload))[String(field)] ?? ""),
    );
    db.createFunction("dlens_date", (_ctx, payload) => {
      const date = String(JSON.parse(String(payload)).Date ?? "");
      return isDate(date) ? date : "";
    });
    db.createFunction("dlens_time", (_ctx, payload, start, end, which) => {
      const row = JSON.parse(String(payload));
      const range = eventRange(row, String(start), String(end));
      return isDate(String(row.Date ?? "")) &&
        Number.isFinite(range.start) &&
        Number.isFinite(range.end)
        ? which === 0
          ? range.start
          : range.end
        : null;
    });
    const decoder = new TextDecoder();
    for (const language of ["de", "en"]) {
      const compare = new Intl.Collator(language, { numeric: true }).compare;
      sqlite.capi.sqlite3_create_collation_v2(
        db,
        `dlens_${language}`,
        sqlite.capi.SQLITE_UTF8,
        0,
        (_ctx, lenA, a, lenB, b) =>
          compare(
            decoder.decode(sqlite.wasm.heap8u().subarray(a, a + lenA)),
            decoder.decode(sqlite.wasm.heap8u().subarray(b, b + lenB)),
          ),
        0,
      );
      const valuesCompare = new Intl.Collator(language, {
        numeric: true,
        sensitivity: "base",
      }).compare;
      sqlite.capi.sqlite3_create_collation_v2(
        db,
        `values_${language}`,
        sqlite.capi.SQLITE_UTF8,
        0,
        (_ctx, lenA, a, lenB, b) =>
          valuesCompare(
            decoder.decode(sqlite.wasm.heap8u().subarray(a, a + lenA)),
            decoder.decode(sqlite.wasm.heap8u().subarray(b, b + lenB)),
          ),
        0,
      );
    }
  }
  recover() {
    for (const row of this.db.selectObjects(
      "SELECT id FROM imports WHERE status IN ('reading','indexing')",
    ))
      this.fail(String(row.id), "interrupted", "Previous worker stopped");
    for (const row of this.db.selectObjects(
      "SELECT DISTINCT generation FROM entities WHERE generation NOT IN (SELECT generation FROM datasets WHERE generation IS NOT NULL)",
    ))
      try {
        this.clean(String(row.generation));
      } catch {
        /* Existing datasets remain readable even when cleanup runs out of quota. */
      }
  }
  list(): Dataset[] {
    return this.db
      .selectValues(
        "SELECT metadata FROM datasets WHERE generation IS NOT NULL ORDER BY rowid",
      )
      .map((v) => JSON.parse(String(v)));
  }
  dataset(id: string): Dataset {
    const raw = this.db.selectValue(
      "SELECT metadata FROM datasets WHERE id=? AND generation IS NOT NULL",
      [id],
    );
    if (!raw) throw new Error("Dataset not found");
    return JSON.parse(String(raw));
  }
  begin(name: string, format: string, replace?: string) {
    const id = replace ?? crypto.randomUUID(),
      generation = crypto.randomUUID();
    if (replace) this.dataset(replace);
    this.db.transaction(() => {
      this.db.exec({
        sql: "INSERT OR IGNORE INTO datasets(id,name,format) VALUES(?,?,?)",
        bind: [id, name, format],
      });
      this.db.exec({
        sql: "INSERT INTO imports(id,dataset,status,started) VALUES(?,?,'reading',?)",
        bind: [generation, id, new Date().toISOString()],
      });
    });
    return { id, generation, name, format };
  }
  add(generation: string, entity: Entity) {
    if (entity.replaceExisting && entity.parent !== null) {
      const previous = this.db.selectObject(
        "SELECT id,position FROM entities WHERE generation=? AND parent=? AND name=?",
        [generation, entity.parent, entity.name],
      );
      if (previous) {
        entity.position = Number(previous.position);
        this.db.exec({
          sql: "WITH RECURSIVE subtree(id) AS (SELECT ? UNION ALL SELECT e.id FROM subtree s CROSS JOIN entities e ON e.parent=s.id WHERE e.generation=?) DELETE FROM entities WHERE generation=? AND id IN (SELECT id FROM subtree)",
          bind: [previous.id, generation, generation],
        });
      }
    }
    this.insert
      .bind([
        generation,
        entity.id,
        entity.parent,
        entity.position,
        entity.name,
        entity.kind,
        entity.value,
        JSON.stringify(entity.path),
        entity.tablePath ? JSON.stringify(entity.tablePath) : null,
      ])
      .stepReset();
  }
  updateEntity(generation: string, id: number, value: string) {
    this.update.bind([value, generation, id]).stepReset();
  }
  value(
    generation: string,
    id: number,
    budget = { bytes: 0, nodes: 0 },
    ceiling = { bytes: limits.rowBytes, nodes: 10000 },
  ): JsonValue {
    const node = this.db.selectObject(
      "SELECT * FROM entities WHERE generation=? AND id=?",
      [generation, id],
    );
    if (!node) throw new Error("Missing hierarchy node");
    budget.bytes += encoder.encode(String(node.value)).length + encoder.encode(String(node.name)).length;
    budget.nodes++;
    if (budget.bytes > ceiling.bytes || budget.nodes > ceiling.nodes) throw new RecordLimit();
    if (node.kind === "value") return JSON.parse(String(node.value));
    const children = this.db.selectObjects(
      `SELECT id,name FROM entities WHERE generation=? AND parent=? ORDER BY position,id ${Number.isFinite(ceiling.nodes) ? `LIMIT ${ceiling.nodes + 1}` : ""}`,
      [generation, id],
    );
    if (children.length > ceiling.nodes) throw new RecordLimit();
    if (node.kind === "array")
      return children.map((child) =>
        this.value(generation, Number(child.id), budget, ceiling),
      );
    if (node.kind === "xml") {
      const { attributes, text } = JSON.parse(String(node.value)) as {
        attributes: Row;
        text: string;
      };
      if (!children.length && !Object.keys(attributes).length) return text;
      const groups = new Map<string, JsonValue[]>();
      for (const child of children) {
        const name = String(child.name);
        const group = groups.get(name) ?? [];
        group.push(this.value(generation, Number(child.id), budget, ceiling));
        groups.set(name, group);
      }
      const result: Row = { ...attributes };
      for (const [name, group] of groups)
        Object.defineProperty(result, name, {
          value: group.length === 1 ? group[0] : group,
          enumerable: true,
          configurable: true,
        });
      if (text.trim()) result["#text"] = text;
      return result;
    }
    return Object.fromEntries(
      children.map((child) => [
        String(child.name),
        this.value(generation, Number(child.id), budget, ceiling),
      ]),
    );
  }
  prepareProjection(generation: string, xml: boolean) {
    this.db.exec({
      sql: "UPDATE imports SET status='indexing' WHERE id=?",
      bind: [generation],
    });
    if (!xml) {
      // Object-only documents are records too; preserve existing array table selection.
      this.db.exec({
        sql: `UPDATE entities SET table_path=path
          WHERE generation=? AND parent IS NULL AND kind='object'
          AND NOT EXISTS (SELECT 1 FROM entities WHERE generation=? AND table_path IS NOT NULL)`,
        bind: [generation, generation],
      });
    }
    if (xml) {
      // Persist row boundaries before walking the wrappers. The first selected
      // ancestor owns its subtree, exactly as the old DOM conversion did.
      this.db.exec(
        "DROP TABLE IF EXISTS temp.xml_siblings; CREATE TEMP TABLE xml_siblings(parent INTEGER,name TEXT,n INTEGER,PRIMARY KEY(parent,name)); DROP TABLE IF EXISTS temp.xml_selected; CREATE TEMP TABLE xml_selected(id INTEGER PRIMARY KEY,path TEXT);",
      );
      this.db.exec({
        sql: "INSERT INTO xml_siblings SELECT parent,name,count(*) FROM entities WHERE generation=? AND parent IS NOT NULL GROUP BY parent,name",
        bind: [generation],
      });
      this.db.exec({
        sql: `WITH RECURSIVE walk(id,path,selected) AS (
        SELECT e.id,e.path,
          (EXISTS(SELECT 1 FROM json_each(e.value,'$.attributes')) OR
           dlens_nonempty(json_extract(e.value,'$.text')) OR
           NOT EXISTS(SELECT 1 FROM entities c WHERE c.generation=e.generation AND c.parent=e.id) OR
           EXISTS(SELECT 1 FROM entities c WHERE c.generation=e.generation AND c.parent=e.id AND NOT EXISTS(SELECT 1 FROM entities g WHERE g.generation=c.generation AND g.parent=c.id)))
        FROM entities e WHERE e.generation=? AND e.parent IS NULL
        UNION ALL
        SELECT e.id,e.path,
          ((SELECT n FROM xml_siblings s WHERE s.parent=e.parent AND s.name=e.name)>1 OR
           EXISTS(SELECT 1 FROM json_each(e.value,'$.attributes')) OR dlens_nonempty(json_extract(e.value,'$.text')) OR
           NOT EXISTS(SELECT 1 FROM entities c WHERE c.generation=e.generation AND c.parent=e.id) OR
           EXISTS(SELECT 1 FROM entities c WHERE c.generation=e.generation AND c.parent=e.id AND NOT EXISTS(SELECT 1 FROM entities g WHERE g.generation=c.generation AND g.parent=c.id)))
        FROM walk w CROSS JOIN entities e ON e.parent=w.id WHERE e.generation=? AND w.selected=0)
        INSERT INTO xml_selected SELECT id,path FROM walk WHERE selected=1`,
        bind: [generation, generation],
      });
      this.db.exec({
        sql: "UPDATE entities SET table_path=(SELECT path FROM xml_selected s WHERE s.id=entities.id) WHERE generation=?",
        bind: [generation],
      });
    }
  }
  projectBatch(generation: string, after: number, ceiling = { bytes: limits.rowBytes, nodes: 10000 }) {
    const entities = this.db.selectObjects(
      "SELECT id,table_path FROM entities WHERE generation=? AND id>? AND table_path IS NOT NULL ORDER BY id LIMIT 100",
      [generation, after],
    );
    const insert = this.db.prepare("INSERT INTO records VALUES(?,?,?,?)");
    const field = this.db.prepare("INSERT INTO fields VALUES(?,?,?,?,?,?)");
    try {
      this.db.transaction(() => {
        for (const entity of entities) {
          const id = Number(entity.id),
            value = this.value(generation, id, undefined, ceiling);
          const row =
            value !== null && typeof value === "object" && !Array.isArray(value)
              ? value
              : { "#text": value };
          const payload = JSON.stringify(row);
          if (encoder.encode(payload).length > ceiling.bytes) throw new RecordLimit();
          insert.bind([generation, id, entity.table_path, payload]).stepReset();
          const visit = (value: JsonValue, top: boolean) => {
            if (Array.isArray(value)) {
              for (const item of value) visit(item, false);
              return;
            }
            if (value && typeof value === "object")
              for (const [name, nested] of Object.entries(value)) {
                if (name.length > limits.fieldNameChars)
                  throw new Error("Field name exceeds 1,024 characters.");
                field
                  .bind([
                    generation,
                    id,
                    name,
                    valueText(nested),
                    Number(top),
                    Number(nested === null || typeof nested !== "object"),
                  ])
                  .stepReset();
                visit(nested, false);
              }
          };
          visit(row, true);
        }
      });
    } finally {
      insert.finalize();
      field.finalize();
    }
    return {
      after: entities.length ? Number(entities.at(-1)!.id) : after,
      count: entities.length,
    };
  }
  complete(
    input: { id: string; generation: string; name: string; format: string },
    bytes: number,
    fingerprint?: string,
    allowEmpty = false,
  ): Dataset {
    const { id, generation, name, format } = input;
    const names = (where: string) =>
      this.db
        .selectValues(
          `SELECT DISTINCT name FROM fields WHERE generation=? ${where} ORDER BY rowid LIMIT 1001`,
          [generation],
        )
        .map(String);
    const columns = names("AND top=1"),
      scalarColumns = names("AND top=1 AND scalar=1"),
      filterColumns = names("");
    if (filterColumns.length > 1000)
      throw new Error("Dataset exceeds 1,000 distinct field names.");
    const count = Number(
      this.db.selectValue("SELECT count(*) FROM records WHERE generation=?", [
        generation,
      ]),
    );
    if (!count && !allowEmpty) throw new Error("Keine Tabellen gefunden / No tables found.");
    const mapping = detectTimeColumns(columns);
    const timeline = Boolean(
      this.db.selectValue(
        "SELECT 1 FROM records WHERE generation=? AND dlens_time(payload,?,?,0) IS NOT NULL LIMIT 1",
        [generation, mapping.start, mapping.end],
      ),
    );
    const metadata: Dataset = {
      ...JSON.parse(String(this.db.selectValue("SELECT metadata FROM datasets WHERE id=?", [id]) ?? "{}")),
      id,
      generation,
      name,
      format,
      columns,
      scalarColumns,
      filterColumns,
      count,
      paths: Number(
        this.db.selectValue(
          "SELECT count(DISTINCT path) FROM records WHERE generation=?",
          [generation],
        ),
      ),
      mapping,
      timeline,
    };
    const old = this.db.selectValue(
      "SELECT generation FROM datasets WHERE id=?",
      [id],
    );
    this.db.savepoint(() => {
      if (fingerprint)
        this.db.exec({
          sql: "INSERT INTO migrations VALUES(?,?)",
          bind: [fingerprint, id],
        });
      this.db.exec({
        sql: "UPDATE datasets SET generation=?,name=?,format=?,metadata=? WHERE id=?",
        bind: [generation, name, format, JSON.stringify(metadata), id],
      });
      this.db.exec({
        sql: "UPDATE imports SET status='completed',bytes=?,records=? WHERE id=?",
        bind: [bytes, count, generation],
      });
    });
    if (old && old !== generation) {
      try {
        this.clean(String(old));
      } catch {
        /* The active generation is committed; retry orphan cleanup at next startup. */
      }
    }
    return metadata;
  }
  clean(generation: string) {
    // Keep rollback journals bounded when reclaiming a large inactive import.
    for (const table of ["fields", "records", "entities"]) {
      do {
        this.db.exec({
          sql: `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE generation=? LIMIT 100)`,
          bind: [generation],
        });
      } while (this.db.changes() > 0);
    }
  }
  fail(generation: string, status: string, error: string) {
    if (
      this.db.selectValue("SELECT 1 FROM datasets WHERE generation=?", [
        generation,
      ])
    )
      return;
    try {
      this.db.exec({
        sql: "UPDATE imports SET status=?,error=? WHERE id=?",
        bind: [status, error.slice(0, 1000), generation],
      });
      this.db.exec("DELETE FROM datasets WHERE generation IS NULL");
      this.clean(generation);
    } catch {
      /* Retain an invisible incomplete generation until storage permits cleanup. */
    }
  }
  delete(id: string) {
    const data = this.dataset(id);
    this.db.transaction(() => {
      this.db.exec({ sql: "DELETE FROM datasets WHERE id=?", bind: [id] });
      this.db.exec({
        sql: "DELETE FROM migrations WHERE dataset=?",
        bind: [id],
      });
    });
    try {
      this.clean(data.generation);
    } catch {
      /* Retry invisible data cleanup on restart. */
    }
  }
  deleteRecord(id: string, generation: string, record: number) {
    const data = this.dataset(id);
    if (data.generation !== generation) throw new Error("Quelle wurde geändert / Source has changed.");
    this.db.transaction(() => {
      if (!this.db.selectValue("SELECT 1 FROM records WHERE generation=? AND id=?", [generation, record]))
        throw new Error("Datensatz nicht gefunden / Record not found.");
      this.db.exec({ sql: "DELETE FROM fields WHERE generation=? AND record=?", bind: [generation, record] });
      this.db.exec({ sql: "DELETE FROM records WHERE generation=? AND id=?", bind: [generation, record] });
      this.db.exec({
        sql: "WITH RECURSIVE subtree(id) AS (SELECT ? UNION ALL SELECT e.id FROM subtree s CROSS JOIN entities e ON e.parent=s.id WHERE e.generation=?) DELETE FROM entities WHERE generation=? AND id IN (SELECT id FROM subtree)",
        bind: [record, generation, generation],
      });
      const bytes = Number(this.db.selectValue("SELECT bytes FROM imports WHERE id=?", [generation]));
      this.complete(data, bytes, undefined, true);
    });
  }
  deleteAll() {
    // Commit visibility first; crash recovery can reclaim remaining inactive generations.
    this.db.transaction(() => {
      this.db.exec("DELETE FROM datasets; DELETE FROM migrations;");
    });
    for (const generation of this.db.selectValues("SELECT id FROM imports")) this.clean(String(generation));
    this.db.exec("DELETE FROM imports; VACUUM;");
  }
  where(q: Query) {
    const generation = this.dataset(q.dataset).generation;
    return {
      sql:
        q.query || q.filters.length
          ? "generation=? AND dlens_match(payload,?,?)=1"
          : "generation=?",
      bind: (q.query || q.filters.length
        ? [generation, q.query, JSON.stringify(q.filters)]
        : [generation]) as SqlValue[],
    };
  }
  order(q: Query, path: string) {
    const sort = q.sorts[JSON.stringify([q.dataset, JSON.parse(path)])];
    return sort
      ? {
          sql: `dlens_sort(payload,?) COLLATE dlens_${q.language === "de" ? "de" : "en"} ${sort.direction === 1 ? "ASC" : "DESC"},id`,
          bind: [sort.column],
        }
      : { sql: "id", bind: [] };
  }
  strings(sql: string, bind: SqlValue[], budget = limits.pageBytes): string[] {
    const statement = this.db.prepare(sql),
      values: string[] = [];
    let bytes = 0;
    try {
      statement.bind(bind);
      while (statement.step()) {
        const value = String(statement.get(0));
        bytes += value.length;
        if (bytes > budget)
          throw new Error(
            "Metadata exceeds page budget. Narrow the filter or select another field.",
          );
        values.push(value);
      }
      return values;
    } finally {
      statement.finalize();
    }
  }
  query(q: Query): QueryResult {
    const dataset = this.dataset(q.dataset),
      where = this.where(q);
    const paths = this.db.selectObjects(
      `SELECT path,count(*) AS total,min(id) AS first FROM records WHERE ${where.sql} GROUP BY path ORDER BY first LIMIT 20 OFFSET ?`,
      [...where.bind, (q.pathPage ?? 0) * 20],
    );
    const tables = paths.map((p) => {
      let pageBytes = 0;
      const path = JSON.parse(String(p.path)) as string[],
        order = this.order(q, String(p.path)),
        offset = q.pages[JSON.stringify(path)] ?? 0;
      const statement = this.db.prepare(
        `SELECT id,payload FROM records WHERE ${where.sql} AND path=? ORDER BY ${order.sql} LIMIT ? OFFSET ?`,
      );
      const rows: Row[] = [],
        ids: number[] = [];
      try {
        statement.bind([
          ...where.bind,
          p.path,
          ...order.bind,
          limits.pageRows,
          offset,
        ]);
        while (statement.step()) {
          const payload = String(statement.get(1));
          if (rows.length && pageBytes + payload.length > limits.pageBytes)
            break;
          pageBytes += payload.length;
          rows.push(JSON.parse(payload));
          ids.push(Number(statement.get(0)));
        }
      } finally {
        statement.finalize();
      }
      const columns = this.db
        .selectValues(
          `SELECT DISTINCT f.name FROM fields f JOIN records r ON r.generation=f.generation AND r.id=f.record WHERE r.${where.sql} AND r.path=? AND f.top=1`,
          [...where.bind, p.path],
        )
        .map(String);
      return { path, total: Number(p.total), rows, ids, columns, offset };
    });
    const language = q.language === "de" ? "de" : "en";
    const filterFields = this.strings(
      `SELECT DISTINCT f.name FROM fields f JOIN records r ON r.generation=f.generation AND r.id=f.record WHERE r.${where.sql} LIMIT 1001`,
      where.bind,
    );
    if (filterFields.length > 1000)
      throw new Error("Dataset exceeds 1,000 distinct field names.");
    const values = this.strings(
      `SELECT DISTINCT f.value FROM fields f JOIN records r ON r.generation=f.generation AND r.id=f.record WHERE r.${where.sql} AND f.name=? AND f.value!='' AND instr(lower(f.value),lower(?))>0 ORDER BY f.value COLLATE values_${language} DESC LIMIT 101 OFFSET ?`,
      [
        ...where.bind,
        q.filterColumn,
        q.filterValue ?? "",
        q.valuePage ?? 0,
      ],
    );
    if (values.reduce((n, value) => n + value.length, 0) > limits.pageBytes)
      throw new Error(
        "Filter values exceed 8 Mi characters. Narrow the value input.",
      );
    const dates = this.db
      .selectValues(
        `SELECT DISTINCT f.value FROM fields f WHERE f.generation=? AND f.name='Date' AND f.top=1 AND dlens_isdate(f.value)=1 ${q.query || q.filters.length ? `AND f.record IN (SELECT id FROM records WHERE ${where.sql})` : ""} ORDER BY f.value LIMIT 10001`,
        [
          dataset.generation,
          ...(q.query || q.filters.length ? where.bind : []),
        ],
      )
      .map(String);
    if (dates.length > 10000)
      throw new Error(
        "More than 10,000 distinct calendar days. Narrow the filters.",
      );
    const day = dates.includes(q.day)
      ? q.day
      : (dates.find((date) => date >= q.today) ?? dates.at(-1) ?? "");
    const total =
      q.query || q.filters.length
        ? Number(
            this.db.selectValue(
              `SELECT count(*) FROM records WHERE ${where.sql}`,
              where.bind,
            ),
          )
        : dataset.count;
    const tableCount =
      q.query || q.filters.length
        ? Number(
            this.db.selectValue(
              `SELECT count(DISTINCT path) FROM records WHERE ${where.sql}`,
              where.bind,
            ),
          )
        : dataset.paths;
    if (!dates.length || !q.mapping.start || !q.mapping.end)
      return {
        tables,
        total,
        tableCount,
        filterFields,
        values: values.slice(0, 100),
        moreValues: values.length > 100,
        dates,
        day,
        dayRows: [],
        dayCount: 0,
        start: 0,
        end: 1440,
        legend: [],
        timeline: false,
      };
    const dayWhere = `${where.sql} AND dlens_date(payload)=? AND dlens_time(payload,?,?,0) IS NOT NULL`;
    const dayBind = [...where.bind, day, q.mapping.start, q.mapping.end];
    const aggregate = this.db.selectObject(
      `SELECT count(*) AS count,min(dlens_time(payload,?,?,0)) AS start,max(dlens_time(payload,?,?,1)) AS end FROM records WHERE ${dayWhere}`,
      [
        q.mapping.start,
        q.mapping.end,
        q.mapping.start,
        q.mapping.end,
        ...dayBind,
      ],
    )!;
    const dayRows = this.db
      .selectValues(
        `SELECT payload FROM records WHERE ${dayWhere} ORDER BY id LIMIT 100 OFFSET ?`,
        [...dayBind, (q.timelinePage ?? 0) * 100],
      )
      .map((payload) => {
        const row = JSON.parse(String(payload));
        return Object.fromEntries(
          [
            "EventID",
            "Date",
            q.mapping.start,
            q.mapping.end,
            q.colorColumn,
          ].map((name) => [name, row[name] ?? null]),
        );
      });
    const legend = this.strings(
      `SELECT DISTINCT dlens_value(payload,?) FROM records WHERE ${dayWhere} LIMIT 1001`,
      [q.colorColumn, ...dayBind],
    ).sort();
    if (
      legend.length > 1000 ||
      legend.reduce((n, value) => n + value.length, 0) > limits.pageBytes
    )
      throw new Error(
        "More than 1,000 timeline colors. Select another color field.",
      );
    if (JSON.stringify(dayRows).length > limits.pageBytes)
      throw new Error(
        "Timeline fields exceed the page budget. Select a smaller color field.",
      );
    return {
      tables,
      total,
      tableCount,
      filterFields,
      values: values.slice(0, 100),
      moreValues: values.length > 100,
      dates,
      day,
      dayRows,
      dayCount: Number(aggregate.count),
      start: Math.floor(Number(aggregate.start ?? 0) / 60) * 60,
      end:
        aggregate.end === null
          ? 1440
          : Math.ceil(Number(aggregate.end) / 60) * 60,
      legend,
      timeline: Boolean(
        this.db.selectValue(
          "SELECT 1 FROM records WHERE generation=? AND dlens_time(payload,?,?,0) IS NOT NULL LIMIT 1",
          [dataset.generation, q.mapping.start, q.mapping.end],
        ),
      ),
    };
  }
  children(
    dataset: string,
    record: number,
    path: string[],
    offset: number,
  ): ChildPage {
    const generation = this.dataset(dataset).generation;
    const raw = this.db.selectValue(
      "SELECT payload FROM records WHERE generation=? AND id=?",
      [generation, record],
    );
    if (raw === undefined) throw new Error("Record no longer exists.");
    let value: JsonValue = JSON.parse(String(raw));
    for (const key of path) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
        throw new Error("Record path no longer exists.");
      value = (value as Record<string, JsonValue>)[key];
    }
    const kind = (value: JsonValue) =>
      Array.isArray(value)
        ? ("array" as const)
        : value !== null && typeof value === "object"
          ? ("object" as const)
          : ("value" as const);
    if (kind(value) === "value")
      return { kind: "value", value, total: 0, entries: [] };
    const entries = Object.entries(value as object);
    return {
      kind: kind(value),
      total: entries.length,
      entries: entries
        .slice(Math.max(0, offset), Math.max(0, offset) + 100)
        .map(([key, value]) => ({
          key,
          kind: kind(value),
          value: kind(value) === "value" ? value : undefined,
          count: kind(value) === "value" ? 0 : Object.keys(value).length,
        })),
    };
  }
  close() {
    this.insert.finalize();
    this.update.finalize();
    this.db.close();
  }
}
