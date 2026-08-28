# Joblio server update — multi status + optional order name (0.4.10)

Run this on the PC that hosts Joblio Docker (or wherever `docker compose` for Joblio lives).

## What this does

1. Lets job `designer_status` store multiple values (JSON), including **urgent**
2. Makes order `job_id` optional and adds `order_name` for name-only orders

## Steps for Cursor / operator

1. Copy `self-host/sql/multi_status_and_orders.sql` onto the server (or open it from the repo).
2. Apply it inside the Postgres container, for example:

```powershell
Get-Content ".\self-host\sql\multi_status_and_orders.sql" -Raw |
  docker compose -f ".\self-host\docker-compose.yml" exec -T db psql -U joblio -d joblio
```

(Adjust compose path / service name / user / db if your server layout differs.)

3. Confirm PostgREST reloaded (`NOTIFY pgrst` is in the SQL). If schema still looks old, restart the `rest` container once.
4. Staff then install / auto-update to **Joblio 0.4.10** (after it is published to the updates share).

## Verify

- Create a job with statuses **Urgent** + **Proofing** — board card should be red and show both pills
- Create an order with **Enter name** (no job) — should save and list
- Create an order with **Link job** — still works as before
