-- Participants could select every frozen question (prompt and options for all
-- positions) from the lobby onward, defeating the speed-scored match by
-- pre-reading upcoming questions. Participants now see a question row only
-- once the host has opened it; the host keeps full visibility of the own
-- session's frozen set.

drop policy live_session_questions_member_select on public.live_session_questions;

create policy live_session_questions_host_select
on public.live_session_questions
for select
to authenticated
using (public.is_live_session_host(session_id));

create policy live_session_questions_participant_select
on public.live_session_questions
for select
to authenticated
using (
  public.is_active_live_participant(session_id)
  and opened_at is not null
);
