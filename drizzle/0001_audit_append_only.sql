-- The audit trail is append-only. Refuse UPDATE and DELETE at the database,
-- so not even a bug in the application, or someone with its credentials
-- running ad hoc SQL, can rewrite who did what. (TRUNCATE is refused too.)
CREATE OR REPLACE FUNCTION audit_logs_refuse_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_refuse_change();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_refuse_change();
