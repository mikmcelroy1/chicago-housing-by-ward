-- The Matters view on each ward page links to the record's PDFs and shows its council history. Both come from the
-- copied matter (zoning_matters.attachments and .actions) and are written onto zoning_actions by
-- scripts/ingest-zoning.ts so the site reads one table. Applied with `npm run migrate -- 006_action_documents.sql`.
-- Additive: rows written by older code carry empty lists until the next run.
alter table zoning_actions add column documents jsonb not null default '[]';
alter table zoning_actions add column history jsonb not null default '[]';
