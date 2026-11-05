-- Trigger functions are not part of the API; only their triggers call them.
revoke all on function public.flood_events_guard() from public, anon, authenticated;
revoke all on function public.flood_events_audit() from public, anon, authenticated;
