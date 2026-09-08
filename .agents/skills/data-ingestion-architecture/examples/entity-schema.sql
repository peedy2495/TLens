-- Example generic hierarchy schema.
-- Adapt names, constraints, and foreign keys to the real domain.

CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY,
    dataset_id INTEGER NOT NULL,
    import_id INTEGER,
    parent_id INTEGER,
    position INTEGER,
    entity_type TEXT,
    external_id TEXT,
    name TEXT,
    attributes JSON,
    source_path TEXT,

    FOREIGN KEY(parent_id)
        REFERENCES entities(id)
);

CREATE INDEX IF NOT EXISTS idx_entities_parent
    ON entities(parent_id);

CREATE INDEX IF NOT EXISTS idx_entities_dataset
    ON entities(dataset_id);

CREATE INDEX IF NOT EXISTS idx_entities_type
    ON entities(entity_type);

CREATE INDEX IF NOT EXISTS idx_entities_external
    ON entities(external_id);
