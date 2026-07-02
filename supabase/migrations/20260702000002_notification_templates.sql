-- =============================================================================
-- ADDON2 A2 — admin-editable notification templates
-- =============================================================================
-- Lets staff edit the copy for each notification `kind` per channel instead of
-- the strings being hard-coded in route handlers. lib/services/notificationTemplates.ts
-- renders {{var}} placeholders against a payload; lib/notifications/dispatch.ts
-- resolves a template by (kind, channel) when one is active, else falls back to
-- the caller-supplied title/message (so existing behaviour is unchanged until a
-- template row is activated). i18n-ready: copy lives in data, not code.
--
-- Seeds the two live donor-transparency templates (redemption / thank_you) from
-- the strings in app/api/vendor/redemptions/route.ts so the wired path is a
-- no-op swap. body_template uses {{vendor_name}} / {{value_inr}} placeholders.
--
-- Depends on M01 (notification_channel), M02 (set_updated_at, current_app_role).
-- snake_case · RLS on · reversible DOWN at the bottom.
-- =============================================================================

begin;

create table if not exists public.notification_templates (
    id            uuid primary key default gen_random_uuid(),
    -- matches notifications.kind (free-text category the dispatcher keys on)
    kind          text not null,
    channel       public.notification_channel not null default 'in_app',
    subject       text not null,
    -- message body with {{placeholder}} tokens resolved at send time
    body_template text not null,
    is_active     boolean not null default true,
    version       integer not null default 1,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (kind, channel)
);

comment on table public.notification_templates is
    'Admin-editable notification copy per (kind, channel). Rendered by lib/services/notificationTemplates.ts; resolved in dispatch.ts. Falls back to caller strings when no active row exists.';
comment on column public.notification_templates.body_template is
    'Message body with {{var}} placeholders (e.g. {{vendor_name}}, {{value_inr}}) substituted at send time.';

create index notification_templates_kind_idx on public.notification_templates (kind, channel)
    where is_active;

create trigger notification_templates_set_updated_at
    before update on public.notification_templates
    for each row execute function public.set_updated_at();

-- --- seed the two live donor-transparency templates -------------------------
insert into public.notification_templates (kind, channel, subject, body_template) values
    ('redemption', 'in_app',
     'Your token was redeemed',
     'A token you funded was redeemed at {{vendor_name}} for a ₹{{value_inr}} meal. Thank you for making it possible.'),
    ('thank_you', 'in_app',
     'Thank you — your gift became a meal',
     'Thanks to you, someone was served a meal at {{vendor_name}}. Tap to donate again and fund the next one.')
on conflict (kind, channel) do nothing;

-- =============================================================================
-- RLS — staff-only: admin manages; admin/compliance read. Service-role (server
-- dispatch) bypasses RLS. No donor/vendor/beneficiary access.
-- =============================================================================
alter table public.notification_templates enable row level security;

create policy notification_templates_select_staff on public.notification_templates
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy notification_templates_write_admin on public.notification_templates
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.notification_templates cascade;
-- commit;
