-- Seeds the sign-in history from the sessions that already exist.
--
-- login_events starts empty, which would leave the monitor page blank on the
-- day it ships even though people have plainly been signing in. Every session
-- row is a real sign-in with a real timestamp, so the last week of them can be
-- recovered exactly.
--
-- Two things are approximated, and both are visible rather than hidden: the
-- username and display name are the account's *current* values, not what they
-- were at the time, and the address and browser were never recorded, so they
-- stay null and the page shows them as unknown.
--
-- Sessions that have already expired are gone, so this reaches back seven days
-- at most. It runs once; every sign-in after this is recorded as it happens.
INSERT INTO "login_events" ("id", "user_id", "username", "display_name", "created_at")
SELECT
    'bf' || substr(md5(s."id"), 1, 23),
    u."id",
    u."username",
    u."display_name",
    s."created_at"
FROM "sessions" s
JOIN "users" u ON u."id" = s."user_id";
