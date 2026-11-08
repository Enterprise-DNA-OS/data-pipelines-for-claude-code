CREATE TABLE pipelines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 name text NOT NULL, owner text NOT NULL DEFAULT '', purpose text NOT NULL DEFAULT '',
 personal_data boolean NOT NULL DEFAULT false, retention_days integer CHECK(retention_days > 0),
 review_on date, sla_hours integer NOT NULL DEFAULT 24 CHECK(sla_hours > 0),
 enabled boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid NOT NULL REFERENCES pipelines,
 status text NOT NULL CHECK(status IN ('succeeded','rejected')), as_of timestamptz NOT NULL,
 source_hash text NOT NULL, config jsonb NOT NULL, revision integer NOT NULL,
 input_rows integer NOT NULL CHECK(input_rows >= 0), inserted integer NOT NULL DEFAULT 0,
 changed integer NOT NULL DEFAULT 0, unchanged integer NOT NULL DEFAULT 0,
 issues jsonb NOT NULL DEFAULT '[]', actor text NOT NULL CHECK(length(trim(actor))>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'succeeded' OR input_rows = inserted + changed + unchanged)
);
CREATE TABLE records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid NOT NULL REFERENCES pipelines,
 record_key text NOT NULL, data jsonb NOT NULL, content_hash text NOT NULL,
 run_id uuid NOT NULL REFERENCES runs, source_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pipeline_id, record_key)
);
CREATE TABLE record_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES runs,
 pipeline_id uuid NOT NULL REFERENCES pipelines, record_key text NOT NULL,
 before_data jsonb, after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE package_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_hash text NOT NULL UNIQUE,
 name text NOT NULL, version text NOT NULL DEFAULT '', package jsonb NOT NULL,
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid NOT NULL REFERENCES pipelines,
 name text NOT NULL, owner text NOT NULL, due_on date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), evidence text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'done' OR length(trim(evidence)) > 0)
);
CREATE TABLE activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid REFERENCES pipelines,
 kind text NOT NULL, actor text NOT NULL, note text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['pipelines','runs','records','record_changes','package_imports','actions','activity'] LOOP
  EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
CREATE INDEX runs_pipeline_time ON runs(pipeline_id, created_at DESC);
CREATE INDEX changes_pipeline ON record_changes(pipeline_id, record_key);
CREATE VIEW pipeline_health AS
 SELECT p.id,p.code,p.name,p.owner,p.enabled,p.sla_hours,p.revision,
 (SELECT max(r.as_of) FROM runs r WHERE r.pipeline_id=p.id AND r.status='succeeded') AS last_source_at,
 (SELECT r.status FROM runs r WHERE r.pipeline_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS latest_status,
 (SELECT count(*)::integer FROM records d WHERE d.pipeline_id=p.id) AS record_count,
 CASE WHEN NOT p.enabled THEN 'paused'
 WHEN NOT EXISTS(SELECT 1 FROM runs r WHERE r.pipeline_id=p.id AND r.status='succeeded') THEN 'never run'
 WHEN (SELECT max(r.as_of) FROM runs r WHERE r.pipeline_id=p.id AND r.status='succeeded') < now()-p.sla_hours*interval '1 hour' THEN 'overdue'
 ELSE 'current' END AS freshness
 FROM pipelines p;
CREATE VIEW run_reconciliation AS
 SELECT r.id,p.code,r.status,r.as_of,r.input_rows,r.inserted,r.changed,r.unchanged,
 jsonb_array_length(r.issues) AS issues,r.actor,r.created_at
 FROM runs r JOIN pipelines p ON p.id=r.pipeline_id;
CREATE VIEW compliance_findings AS
 SELECT code,'OWNER' AS rule,'No accountable owner' AS finding FROM pipelines WHERE trim(owner)=''
 UNION ALL SELECT code,'PURPOSE','Personal data has no recorded purpose' FROM pipelines WHERE personal_data AND trim(purpose)=''
 UNION ALL SELECT code,'RETENTION','Personal data has no retention policy' FROM pipelines WHERE personal_data AND retention_days IS NULL
 UNION ALL SELECT code,'REVIEW','Personal-data review is missing or overdue' FROM pipelines WHERE personal_data AND (review_on IS NULL OR review_on < current_date)
 UNION ALL SELECT code,'FRESHNESS','Enabled pipeline is overdue or has never run' FROM pipeline_health WHERE enabled AND freshness IN ('overdue','never run')
 UNION ALL SELECT code,'VALIDATION','Latest transfer was rejected' FROM pipeline_health WHERE latest_status='rejected'
 UNION ALL SELECT p.code,'RETENTION_DUE','Stored records exceed the configured review age' FROM pipelines p WHERE retention_days IS NOT NULL AND EXISTS(SELECT 1 FROM records d WHERE d.pipeline_id=p.id AND d.created_at < now()-p.retention_days*interval '1 day');
REVOKE ALL ON pipeline_health,run_reconciliation,compliance_findings FROM PUBLIC;
