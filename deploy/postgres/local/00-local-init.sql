-- LOCAL DEVELOPMENT ONLY (mounted by docker-compose.dev.yml). Never used in production.
-- Production roles are created by deploy/postgres/init.sql and use peer auth (no passwords).
--
-- The container superuser `kloudrecon` runs migrations and owns the tables (like
-- kloudrecon_owner in production). The application connects as `kloudrecon_app`, which is not a
-- superuser, so Row-Level Security is enforced locally exactly as in production.
CREATE ROLE kloudrecon_app LOGIN PASSWORD 'kloudrecon_app';
GRANT CONNECT ON DATABASE kloudrecon TO kloudrecon_app;
GRANT USAGE ON SCHEMA public TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kloudrecon_app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE DATABASE kloudrecon_test OWNER kloudrecon;
