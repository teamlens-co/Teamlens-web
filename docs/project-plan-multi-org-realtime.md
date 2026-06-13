# TeamLens Project Plan: Multi-Organization Access and Live Activities

## Objective

Build support for one admin/owner managing multiple organizations, with separate company views, optional combined company views, and an Activities page that can update automatically for big-screen/projector use.

## Current State

- The current system supports one active organization per user session.
- The Activities page fetches timeline data on page load/date changes, but does not live-update continuously.
- Some other screens already use polling, so phase 1 for Activities can use the same practical pattern before investing in push-based real time.

## Recommended Delivery Phases

### Phase 0: Product and Technical Discovery

- Confirm roles: owner, admin, manager, employee.
- Confirm whether one email should own multiple companies.
- Confirm whether employees can belong to multiple companies.
- Confirm whether combined reporting is owner/admin only.
- Confirm live Activities target latency and projector display needs.

### Phase 1: Multi-Organization Foundation

- Add organization membership model.
- Backfill current users into memberships.
- Update auth/login/me responses to include available organizations.
- Add organization switching.
- Add dashboard organization switcher.
- Preserve existing single-org behavior for current users.

### Phase 2: Separate and Combined Organization Views

- Add combined activity timeline API.
- Include organization metadata in timeline responses.
- Add dashboard filters for current org, selected orgs, and all orgs.
- Add company color coding and grouping/sorting.

### Phase 3: Live Activities Phase 1

- Add polling to Activities page every 15-30 seconds.
- Preserve scroll position, selected time range, and filter state.
- Show live indicator, last updated time, pause/resume, and manual refresh.
- Optimize backend timeline query for frequent refresh.

### Phase 4: Live Activities Phase 2

- Add WebSocket/SSE event stream if near real-time graph growth is required.
- Push activity/session/usage changes to subscribed dashboards.
- Merge incoming events into the timeline without full-page refresh.

## ClickUp Import

Use `docs/clickup-tasks-multi-org-realtime.csv` as the initial ClickUp task import file.

Suggested ClickUp hierarchy:

- Space: TeamLens
- Folder: Product Roadmap
- List: Multi-Org and Live Activities
- Statuses: To Do, In Progress, Blocked, Review, Done

## Management Notes

- Treat multi-organization access as a security-sensitive project. Most bugs here become data leakage bugs.
- Deliver polling-based live Activities first unless the manager explicitly needs sub-second real-time updates.
- Keep combined-company reporting permissioned to owner/admin roles only until the product rules are fully defined.
