-- ============================================================
-- PostgreSQL Initialization Script
-- ONLY creates top-level schemas.
-- All table creation is handled by Drizzle ORM migrations
-- run by the application services on startup.
-- ============================================================

-- Schema for user identity, auth, and document ownership/permissions
-- Owned and migrated by: user-service
CREATE SCHEMA IF NOT EXISTS users_schema;

-- Schema for document binary snapshots and delta audit trail
-- Owned and migrated by: persist-worker
CREATE SCHEMA IF NOT EXISTS documents_schema;

-- ============================================================
-- pg_trgm extension for potential full-text search later
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Confirmation
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Schema initialization complete. Schemas: users_schema, documents_schema';
    RAISE NOTICE '   Table creation will be handled by Drizzle ORM migrations.';
END $$;