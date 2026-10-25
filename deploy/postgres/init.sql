-- PRODUCTION roles and database (infra guide C4). Run once as the postgres superuser:
--   sudo -u postgres psql -f init.sql
-- Peer authentication maps the OS user `kloudrecon` to both roles (pg_hba/pg_ident snippets),
-- so no database passwords exist.
CREATE ROLE kloudrecon_owner LOGIN BYPASSRLS;   -- migrations + backups
CREATE ROLE kloudrecon_app LOGIN;               -- application, subject to RLS
CREATE DATABASE kloudrecon OWNER kloudrecon_owner;
\c kloudrecon
ALTER SCHEMA public OWNER TO kloudrecon_owner;
GRANT USAGE ON SCHEMA public TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kloudrecon_app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
