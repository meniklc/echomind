-- EchoMind Migration 002 — Enable RLS and create policies
-- Idempotent: uses DO $$ IF NOT EXISTS $$ guards for every policy.
-- Run AFTER 001_create_tables.sql.

BEGIN;

-- Enable RLS on all tables
ALTER TABLE em_facts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_fact_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE em_turns          ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- em_facts policies
-- The backend uses the service-role key (bypasses RLS) for all server-side
-- reads/writes, scoped by owner_id programmatically.
-- These policies protect direct client-side access.
-- ──────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_facts' AND policyname='em_facts_owner_select') THEN
        CREATE POLICY em_facts_owner_select ON em_facts
            FOR SELECT USING (auth.uid() = owner_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_facts' AND policyname='em_facts_owner_insert') THEN
        CREATE POLICY em_facts_owner_insert ON em_facts
            FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_facts' AND policyname='em_facts_owner_update') THEN
        CREATE POLICY em_facts_owner_update ON em_facts
            FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_facts' AND policyname='em_facts_owner_delete') THEN
        CREATE POLICY em_facts_owner_delete ON em_facts
            FOR DELETE USING (auth.uid() = owner_id);
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- em_fact_conflicts: backend-only via service-role key; block all direct client access
-- ──────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_fact_conflicts' AND policyname='em_conflicts_no_direct_client') THEN
        CREATE POLICY em_conflicts_no_direct_client ON em_fact_conflicts
            FOR ALL USING (false);
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- em_sessions: owner full access
-- ──────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_sessions' AND policyname='em_sessions_owner_all') THEN
        CREATE POLICY em_sessions_owner_all ON em_sessions
            FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- em_turns: owner full access
-- ──────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='em_turns' AND policyname='em_turns_owner_all') THEN
        CREATE POLICY em_turns_owner_all ON em_turns
            FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
    END IF;
END $$;

COMMIT;
