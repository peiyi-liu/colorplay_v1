-- The single-choice option triggers are DEFERRABLE INITIALLY DEFERRED, so
-- they fire at COMMIT time under whatever role the session holds — through
-- PostgREST that is `authenticated`, which has no EXECUTE on the internal
-- validator. The trigger functions therefore run as their owner so the
-- inner validate_single_choice_options() call keeps working; direct EXECUTE
-- stays revoked for api roles.

alter function public.enforce_single_choice_options() security definer;
alter function public.enforce_published_question_options() security definer;
