-- EchoMind Migration 001 — Create core tables
-- Idempotent: safe to run multiple times (CREATE ... IF NOT EXISTS throughout).
-- Run in Supabase SQL Editor while connected as the postgres/service-role user.

BEGIN;

-- ──────────────────────────────────────────────
-- em_facts: every ingested knowledge fact
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_facts (
    id                  text        PRIMARY KEY,
    owner_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type         text        NOT NULL
                                    CHECK (entity_type IN (
                                        'project','experience','education',
                                        'skill','summary','certification','document'
                                    )),
    title               text        NOT NULL DEFAULT '',
    content             text        NOT NULL,
    source              text        NOT NULL
                                    CHECK (source IN (
                                        'github','linkedin_export','resume_file',
                                        'manual','verified_profile'
                                    )),
    source_url_or_file  text        NOT NULL DEFAULT '',
    import_date         timestamptz NOT NULL DEFAULT now(),
    verification_status text        NOT NULL DEFAULT 'pending_review'
                                    CHECK (verification_status IN (
                                        'verified','pending_review','rejected'
                                    )),
    visibility          text        NOT NULL DEFAULT 'private'
                                    CHECK (visibility IN ('public','private')),
    metadata            jsonb       NOT NULL DEFAULT '{}',
    reviewed_at         timestamptz,
    reviewed_by         uuid        REFERENCES auth.users(id),
    review_note         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- em_fact_conflicts: provenance history per fact
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_fact_conflicts (
    id              bigserial   PRIMARY KEY,
    fact_id         text        NOT NULL REFERENCES em_facts(id) ON DELETE CASCADE,
    conflict_type   text        NOT NULL
                                CHECK (conflict_type IN (
                                    'date_mismatch','duplicate','unsupported_claim'
                                )),
    description     text        NOT NULL,
    existing_value  text,
    proposed_value  text,
    severity        text        NOT NULL DEFAULT 'warning'
                                CHECK (severity IN ('warning','blocker')),
    detected_at     timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- em_sessions: conversation session metadata
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_sessions (
    id          text        PRIMARY KEY,
    owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text        NOT NULL DEFAULT 'Conversation',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- em_turns: individual conversation turns
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS em_turns (
    id          text        PRIMARY KEY,
    session_id  text        NOT NULL REFERENCES em_sessions(id) ON DELETE CASCADE,
    owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text        NOT NULL CHECK (role IN ('user','assistant')),
    content     text        NOT NULL,
    mode        text        CHECK (mode IN ('llm','fact_retrieval')),
    turn_references jsonb NOT NULL DEFAULT '[]',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_em_facts_owner_status_vis
    ON em_facts(owner_id, verification_status, visibility);

CREATE INDEX IF NOT EXISTS idx_em_facts_entity_type
    ON em_facts(owner_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_em_fact_conflicts_fact
    ON em_fact_conflicts(fact_id);

CREATE INDEX IF NOT EXISTS idx_em_sessions_owner_updated
    ON em_sessions(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_em_turns_session_time
    ON em_turns(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_em_turns_owner
    ON em_turns(owner_id);

-- ──────────────────────────────────────────────
-- updated_at trigger
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION em_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_em_facts_updated_at'
    ) THEN
        CREATE TRIGGER trg_em_facts_updated_at
            BEFORE UPDATE ON em_facts
            FOR EACH ROW EXECUTE FUNCTION em_set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_em_sessions_updated_at'
    ) THEN
        CREATE TRIGGER trg_em_sessions_updated_at
            BEFORE UPDATE ON em_sessions
            FOR EACH ROW EXECUTE FUNCTION em_set_updated_at();
    END IF;
END $$;

COMMIT;
