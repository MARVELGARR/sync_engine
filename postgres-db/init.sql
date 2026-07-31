-- ============================================================
-- PostgreSQL Initialization Script
-- Creates schemas for multi-tenant database architecture
-- ============================================================

-- Schema for user identity, auth, and document ownership/permissions
CREATE SCHEMA IF NOT EXISTS users_schema;

-- Schema for document binary snapshots and delta audit trail
CREATE SCHEMA IF NOT EXISTS documents_schema;

-- ============================================================
-- USERS SCHEMA TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users_schema.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users_schema.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    title VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users_schema.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON users_schema.documents (owner_id);

CREATE TYPE permission_level AS ENUM ('read', 'read-write');

CREATE TABLE IF NOT EXISTS users_schema.document_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    document_id UUID NOT NULL REFERENCES users_schema.documents (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users_schema.users (id) ON DELETE CASCADE,
    permission permission_level NOT NULL DEFAULT 'read',
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_perms_document_id ON users_schema.document_permissions (document_id);

CREATE INDEX IF NOT EXISTS idx_doc_perms_user_id ON users_schema.document_permissions (user_id);

-- ============================================================
-- DOCUMENTS SCHEMA TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS documents_schema.document_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    document_id UUID NOT NULL,
    snapshot_data BYTEA NOT NULL,
    snapshot_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (document_id, snapshot_version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_document_id ON documents_schema.document_snapshots (document_id);

CREATE TABLE IF NOT EXISTS documents_schema.document_deltas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    document_id UUID NOT NULL,
    delta_data BYTEA NOT NULL,
    user_id UUID,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deltas_document_id ON documents_schema.document_deltas (document_id);

-- ============================================================
-- Confirmation
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Database initialization complete. Schemas: users_schema, documents_schema';
END $$;