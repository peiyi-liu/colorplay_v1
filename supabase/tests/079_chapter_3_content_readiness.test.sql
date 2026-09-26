begin;

set local search_path = public, extensions;
select plan(20);

select id as readiness_chapter_id from public.chapters
where stable_code = 'chapter-3' and status = 'published' \gset

select is((select count(*)::text from public.courses
  where stable_code = 'color-theory' and status = 'published'), '1',
  'canonical course is published exactly once');
select is((select count(*)::text from public.chapters
  where stable_code = 'chapter-3' and status = 'published'), '1',
  'Chapter 3 is published exactly once');
select is((select count(*)::text from public.sections
  where chapter_id = :'readiness_chapter_id' and status = 'published'
    and stable_code in ('sheet-3-1','sheet-3-2','sheet-3-3')), '3',
  'Chapter 3 has three canonical sections');
select is((select count(*)::text from public.subtopics subtopic
  join public.sections section on section.id = subtopic.section_id
  where section.chapter_id = :'readiness_chapter_id'
    and section.stable_code in ('sheet-3-1','sheet-3-2','sheet-3-3')
    and subtopic.status = 'published'), '3',
  'Chapter 3 has three canonical review subtopics');
select is((select count(*)::text from public.review_cards card
  join public.subtopics subtopic on subtopic.id = card.subtopic_id
  join public.sections section on section.id = subtopic.section_id
  where section.chapter_id = :'readiness_chapter_id'
    and section.stable_code in ('sheet-3-1','sheet-3-2','sheet-3-3')
    and card.status = 'published'), '8',
  'Chapter 3 has eight current published review cards');

select is((select count(*)::text from public.assessment_banks
  where section_id in (select id from public.sections
    where chapter_id = :'readiness_chapter_id')
    and kind = 'QB' and status = 'published'), '3',
  'Chapter 3 routes three QB banks under sections');
select is((select count(*)::text from public.assessment_banks
  where chapter_id = :'readiness_chapter_id'
    and kind = 'CR' and status = 'published'), '1',
  'Chapter 3 routes one CR bank under the chapter');
select is((select count(*)::text from public.assessment_banks
  where section_id in (select id from public.sections
    where chapter_id = :'readiness_chapter_id')
    and kind = 'LT' and status = 'published'), '3',
  'Chapter 3 routes three LT banks under sections');

select is((select count(*)::text from public.questions question
  join public.assessment_banks bank on bank.id = question.bank_id
  where bank.section_id in (select id from public.sections
    where chapter_id = :'readiness_chapter_id')
    and bank.kind = 'QB' and question.status = 'published'), '111',
  'Chapter 3 has 111 current QB questions');
select is((select count(*)::text from public.questions question
  join public.assessment_banks bank on bank.id = question.bank_id
  where bank.chapter_id = :'readiness_chapter_id'
    and bank.kind = 'CR' and question.status = 'published'), '62',
  'Chapter 3 has 62 current CR questions');
select is((select count(*)::text from public.questions question
  join public.assessment_banks bank on bank.id = question.bank_id
  where bank.section_id in (select id from public.sections
    where chapter_id = :'readiness_chapter_id')
    and bank.kind = 'LT' and question.status = 'published'), '60',
  'Chapter 3 has 60 current LT questions');

select is((select count(*)::text from public.assessment_banks bank
  where (bank.chapter_id = :'readiness_chapter_id' or bank.section_id in (
    select id from public.sections where chapter_id = :'readiness_chapter_id'))
    and ((bank.kind in ('QB','LT') and (bank.section_id is null or bank.chapter_id is not null))
      or (bank.kind = 'CR' and (bank.chapter_id is null or bank.section_id is not null)))),
  '0', 'QB/LT/CR parent routing has no violations');
select is((select count(*)::text from public.questions question
  where question.status = 'published' and question.bank_id is null
    and question.stable_code ~ '^(QB|CR|LT)3'), '0',
  'every current Chapter 3 question belongs to a canonical bank');
select is((select count(*)::text from (
  select stable_code from public.questions
  where stable_code ~ '^(QB|CR|LT)3'
  group by stable_code having count(*) > 1) duplicate), '0',
  'Chapter 3 question stable codes are unique');
select is((select count(*)::text from (
  select question.id from public.questions question
  join public.question_options option on option.question_id = question.id
  where question.stable_code ~ '^(QB|CR|LT)3'
  group by question.id having count(option.id) not between 2 and 4
    or count(option.id) filter (where option.is_correct) <> 1) invalid), '0',
  'all Chapter 3 questions have one correct answer and valid option counts');
select is((select count(*)::text from public.review_cards
  where stable_code = 'sheet-card-draft-probe' and status = 'published'), '0',
  'legacy draft probe never enters the current required set');

select is(content_private.publication_impact(
  'review_card', '{"content":"錯字"}', '{"content":"正字"}', 'nonsemantic'),
  'compatible', 'nonsemantic correction preserves current progress');
select is(content_private.publication_impact(
  'review_card', '{"content":"舊語意"}', '{"content":"新語意"}', 'semantic'),
  'requires_recompletion', 'semantic review change requires recompletion');
select is(content_private.publication_impact(
  'question', '{"prompt":"舊題意"}', '{"prompt":"新題意"}', 'semantic'),
  'requires_requalification', 'semantic question change requires requalification');
select is(content_private.publication_impact(
  'question', null, '{"prompt":"新增必答題"}', 'nonsemantic'),
  'requires_requalification', 'new required question never receives grandfathering');

select * from finish();
rollback;
