-- ============================================================================
-- 019 · A preview is minutes, not a share of the film
--
-- Two ceilings have been wrong. `duration - 1` let a 54-second clip give away
-- 53 seconds. Half the running time replaced it and was rejected in turn: a
-- two-hour film does not get a one-hour preview, and a song does not give away
-- half the song.
--
-- The rule is now the smaller of five minutes and a third of the running time,
-- so the ceiling on anything long is a fixed number of minutes rather than a
-- proportion, while short pieces stay sensible:
--
--     54s clip        ->  18s     (53s of 54s is impossible)
--     3-minute song   ->  60s
--     10:53 concert   ->  3:37
--     2-hour film     ->  5:00
--
-- Videos still encoding have no duration yet, so nothing is decided for them
-- here; the application applies the same ceiling once the length arrives.
--
-- This only lowers values. A creator who had chosen a short preview keeps it,
-- and anyone whose preview is trimmed here can still pick any shorter number.
-- ============================================================================

update videos
   set free_preview_seconds = least(free_preview_seconds, 300, duration_seconds / 3)
 where coalesce(duration_seconds, 0) > 0
   and free_preview_seconds > least(300, duration_seconds / 3);

-- The platform default is handed to a new upload before its duration is known,
-- so it must be a number that is reasonable on its own. Five minutes is the
-- ceiling for a feature film, which makes it the worst possible default for a
-- three-minute song. Forty-five seconds suits a song, and a longer piece can
-- be raised by the creator up to its own ceiling.
update platform_settings
   set default_preview_seconds = 45
 where id = 1
   and default_preview_seconds > 45;
