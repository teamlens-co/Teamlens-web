--
-- PostgreSQL database dump
--

\restrict vzzAFQaV3aMheb5gJcycca7xPfVdnLHKf9giNNBjD6BopaCYMblre2RQimlSeHI

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ActivityCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ActivityCategory" AS ENUM (
    'PRODUCTIVE',
    'UNPRODUCTIVE',
    'NEUTRAL'
);


--
-- Name: ActivityTargetType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ActivityTargetType" AS ENUM (
    'APP',
    'DOMAIN',
    'URL'
);


--
-- Name: AgentTokenStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AgentTokenStatus" AS ENUM (
    'ACTIVE',
    'REVOKED'
);


--
-- Name: InviteStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InviteStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EXPIRED',
    'REVOKED'
);


--
-- Name: ManualTimeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ManualTimeStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'MANAGER',
    'EMPLOYEE'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'INVITED',
    'DISABLED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id integer NOT NULL,
    user_id text NOT NULL,
    session_id text,
    mouse_moves integer NOT NULL,
    key_presses integer NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    captured_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: activity_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_usage_logs (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    session_id text,
    target_type public."ActivityTargetType" NOT NULL,
    app_name text NOT NULL,
    window_title text,
    domain text,
    url text,
    category public."ActivityCategory" DEFAULT 'NEUTRAL'::public."ActivityCategory" NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    idle_seconds integer DEFAULT 0 NOT NULL,
    is_idle boolean DEFAULT false NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tokens (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    label text,
    status public."AgentTokenStatus" DEFAULT 'ACTIVE'::public."AgentTokenStatus" NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    revoked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: classification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classification_rules (
    id text NOT NULL,
    organization_id text NOT NULL,
    target_type public."ActivityTargetType" NOT NULL,
    target_value text NOT NULL,
    category public."ActivityCategory" NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invite_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_tokens (
    id text NOT NULL,
    organization_id text NOT NULL,
    invited_by_id text NOT NULL,
    email text NOT NULL,
    role public."UserRole" DEFAULT 'EMPLOYEE'::public."UserRole" NOT NULL,
    token text NOT NULL,
    status public."InviteStatus" DEFAULT 'PENDING'::public."InviteStatus" NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    accepted_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: live_screen_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_screen_sessions (
    id text NOT NULL,
    manager_id text NOT NULL,
    employee_id text NOT NULL,
    organization_id text NOT NULL,
    session_start timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    session_end timestamp(3) without time zone,
    status text DEFAULT 'REQUESTED'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: manual_time_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_time_requests (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    requested_by_id text NOT NULL,
    reviewed_by_id text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    duration_seconds integer NOT NULL,
    reason text NOT NULL,
    status public."ManualTimeStatus" DEFAULT 'PENDING'::public."ManualTimeStatus" NOT NULL,
    review_note text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: office_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.office_locations (
    id text NOT NULL,
    organization_id text NOT NULL,
    label text DEFAULT 'Main Office'::text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer DEFAULT 200 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    productivity_threshold_minutes integer DEFAULT 180 NOT NULL
);


--
-- Name: screen_recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screen_recordings (
    id text NOT NULL,
    manager_id text NOT NULL,
    employee_id text NOT NULL,
    organization_id text NOT NULL,
    live_session_id text,
    file_path text NOT NULL,
    file_size integer NOT NULL,
    duration_ms integer NOT NULL,
    mime_type text DEFAULT 'video/webm'::text NOT NULL,
    recorded_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: screenshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screenshots (
    id text NOT NULL,
    user_id text NOT NULL,
    session_id text,
    captured_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    file_path text NOT NULL,
    active_application text,
    window_title text,
    domain text,
    url text,
    employee_name text,
    project_name text
);


--
-- Name: team_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_memberships (
    id text NOT NULL,
    team_id text NOT NULL,
    user_id text NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id text NOT NULL,
    name text NOT NULL,
    manager_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    organization_id text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public."UserRole" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    invited_by_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: work_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    clock_in_at timestamp with time zone NOT NULL,
    clock_out_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision,
    location_type text
);


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: activity_usage_logs activity_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_usage_logs
    ADD CONSTRAINT activity_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_tokens agent_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tokens
    ADD CONSTRAINT agent_tokens_pkey PRIMARY KEY (id);


--
-- Name: classification_rules classification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_rules
    ADD CONSTRAINT classification_rules_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);


--
-- Name: live_screen_sessions live_screen_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_screen_sessions
    ADD CONSTRAINT live_screen_sessions_pkey PRIMARY KEY (id);


--
-- Name: manual_time_requests manual_time_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_time_requests
    ADD CONSTRAINT manual_time_requests_pkey PRIMARY KEY (id);


--
-- Name: office_locations office_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.office_locations
    ADD CONSTRAINT office_locations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: screen_recordings screen_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screen_recordings
    ADD CONSTRAINT screen_recordings_pkey PRIMARY KEY (id);


--
-- Name: screenshots screenshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshots
    ADD CONSTRAINT screenshots_pkey PRIMARY KEY (id);


--
-- Name: team_memberships team_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: work_sessions work_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_sessions
    ADD CONSTRAINT work_sessions_pkey PRIMARY KEY (id);


--
-- Name: activity_usage_logs_domain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_domain_idx ON public.activity_usage_logs USING btree (domain);


--
-- Name: activity_usage_logs_org_captured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_org_captured_idx ON public.activity_usage_logs USING btree (organization_id, captured_at);


--
-- Name: activity_usage_logs_organization_id_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_organization_id_captured_at_idx ON public.activity_usage_logs USING btree (organization_id, captured_at);


--
-- Name: activity_usage_logs_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_session_id_idx ON public.activity_usage_logs USING btree (session_id);


--
-- Name: activity_usage_logs_target_type_app_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_target_type_app_name_idx ON public.activity_usage_logs USING btree (target_type, app_name);


--
-- Name: activity_usage_logs_user_captured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_user_captured_idx ON public.activity_usage_logs USING btree (user_id, captured_at);


--
-- Name: activity_usage_logs_user_id_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_usage_logs_user_id_captured_at_idx ON public.activity_usage_logs USING btree (user_id, captured_at);


--
-- Name: agent_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_tokens_token_hash_key ON public.agent_tokens USING btree (token_hash);


--
-- Name: agent_tokens_user_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tokens_user_id_status_idx ON public.agent_tokens USING btree (user_id, status);


--
-- Name: classification_rules_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classification_rules_organization_id_idx ON public.classification_rules USING btree (organization_id);


--
-- Name: classification_rules_organization_id_target_type_target_value_k; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX classification_rules_organization_id_target_type_target_value_k ON public.classification_rules USING btree (organization_id, target_type, target_value);


--
-- Name: idx_activity_session_captured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_session_captured ON public.activity_logs USING btree (session_id, captured_at);


--
-- Name: idx_activity_user_captured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_user_captured ON public.activity_logs USING btree (user_id, captured_at);


--
-- Name: idx_sessions_user_clockin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_clockin ON public.work_sessions USING btree (user_id, clock_in_at);


--
-- Name: invite_tokens_organization_id_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invite_tokens_organization_id_email_idx ON public.invite_tokens USING btree (organization_id, email);


--
-- Name: invite_tokens_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invite_tokens_token_key ON public.invite_tokens USING btree (token);


--
-- Name: live_screen_sessions_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_screen_sessions_employee_id_idx ON public.live_screen_sessions USING btree (employee_id);


--
-- Name: live_screen_sessions_manager_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_screen_sessions_manager_id_idx ON public.live_screen_sessions USING btree (manager_id);


--
-- Name: live_screen_sessions_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_screen_sessions_organization_id_idx ON public.live_screen_sessions USING btree (organization_id);


--
-- Name: live_screen_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_screen_sessions_status_idx ON public.live_screen_sessions USING btree (status);


--
-- Name: manual_time_requests_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_time_requests_organization_id_status_idx ON public.manual_time_requests USING btree (organization_id, status);


--
-- Name: manual_time_requests_user_id_start_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_time_requests_user_id_start_at_idx ON public.manual_time_requests USING btree (user_id, start_at);


--
-- Name: organizations_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);


--
-- Name: screen_recordings_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screen_recordings_employee_id_idx ON public.screen_recordings USING btree (employee_id);


--
-- Name: screen_recordings_manager_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screen_recordings_manager_id_idx ON public.screen_recordings USING btree (manager_id);


--
-- Name: screen_recordings_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screen_recordings_organization_id_idx ON public.screen_recordings USING btree (organization_id);


--
-- Name: screen_recordings_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screen_recordings_recorded_at_idx ON public.screen_recordings USING btree (recorded_at);


--
-- Name: screenshots_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screenshots_session_id_idx ON public.screenshots USING btree (session_id);


--
-- Name: screenshots_user_id_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX screenshots_user_id_captured_at_idx ON public.screenshots USING btree (user_id, captured_at);


--
-- Name: team_memberships_team_id_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_memberships_team_id_user_id_key ON public.team_memberships USING btree (team_id, user_id);


--
-- Name: team_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_user_id_idx ON public.team_memberships USING btree (user_id);


--
-- Name: teams_manager_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_manager_id_idx ON public.teams USING btree (manager_id);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: agent_tokens agent_tokens_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tokens
    ADD CONSTRAINT agent_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_tokens agent_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tokens
    ADD CONSTRAINT agent_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invite_tokens invite_tokens_invited_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invite_tokens invite_tokens_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: manual_time_requests manual_time_requests_reviewed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_time_requests
    ADD CONSTRAINT manual_time_requests_reviewed_by_id_fkey FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: manual_time_requests manual_time_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_time_requests
    ADD CONSTRAINT manual_time_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_memberships team_memberships_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_memberships team_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: teams teams_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_invited_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict vzzAFQaV3aMheb5gJcycca7xPfVdnLHKf9giNNBjD6BopaCYMblre2RQimlSeHI

