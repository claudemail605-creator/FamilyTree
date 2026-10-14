-- =====================================================================
--  04_name_ur_hi.sql — Urdu and Hindi spellings for every person.
--
--  WHY: the website switches each person's displayed name to the active
--  language (English / اردو / हिन्दी), but the live database stores
--  name_ur and name_hi as NULL for all 32 people, so Urdu and Hindi show
--  the English name as the fallback. Run this file ONCE in Supabase →
--  SQL Editor to fill them in.
--
--  IMPORTANT: the transliterations below are best-effort and SHOULD BE
--  REVIEWED BY A FAMILY MEMBER who reads Urdu and Hindi. The Edit
--  dialog's "Name (Urdu script)" / "Name (Hindi)" fields can correct any
--  of them afterwards.
--
--  Safe to re-run: every update matches by legacy_id and writes the same
--  values. People are never inserted or deleted here.
--
--  NOTE: spouse names on the tree cards come from the plain text column
--  spouse_name (one language only, the language the family typed it in).
--  Translating those would need a schema change, deliberately not attempted.
-- =====================================================================

begin;

update public.people set name_ur = 'سید مظہر الدین نہری',              name_hi = 'सैयद मज़हरउद्दीन नहरी'  where legacy_id = 'A001';
update public.people set name_ur = 'سید بہاء الدین نہری',              name_hi = 'सैयद बहाउद्दीन नहरी'    where legacy_id = 'B001';
update public.people set name_ur = 'سید افضل الدین نہری',              name_hi = 'सैयद अफ़ज़लउद्दीन नहरी'  where legacy_id = 'B002';
update public.people set name_ur = 'سید اعجاز الدین نہری',             name_hi = 'सैयद इज़ाज़उद्दीन नहरी'  where legacy_id = 'B011-001';
update public.people set name_ur = 'سید احتشام الدین نہری',            name_hi = 'सैयद एहतेशामउद्दीन नहरी' where legacy_id = 'B012-001';
update public.people set name_ur = 'سیدہ نسرین فاطمہ نہری',            name_hi = 'सैयदा नसरीन फ़ातिमा नहरी' where legacy_id = 'B013-001';
update public.people set name_ur = 'سید اکرام الدین نہری',             name_hi = 'सैयद इकरामउद्दीन नहरी'   where legacy_id = 'B014-001';
update public.people set name_ur = 'سید نعیم الدین نہری',              name_hi = 'सैयद नईमउद्दीन नहरी'    where legacy_id = 'B021-001';
update public.people set name_ur = 'سیدہ رفات نہری',                   name_hi = 'सैयदा रफ़्अत नहरी'       where legacy_id = 'B021-002';
update public.people set name_ur = 'سید باسیت نہری',                   name_hi = 'सैयद बासित नहरी'        where legacy_id = 'B021-003';
update public.people set name_ur = 'سید رضی الدین',                    name_hi = 'सैयद रज़ीउद्दीन'         where legacy_id = 'B021-004';
update public.people set name_ur = 'سیدہ طلعت نہری',                   name_hi = 'सैयदा तलत नहरी'         where legacy_id = 'B021-006';
update public.people set name_ur = 'سید حیدر حسینی',                   name_hi = 'सैयद हैदर हुसैनी'        where legacy_id = 'B011-002';
update public.people set name_ur = 'غوث حسینی',                        name_hi = 'ग़ौस हुसैनी'            where legacy_id = 'B011-003';
update public.people set name_ur = 'آمینہ فاطمہ',                      name_hi = 'अमीना फ़ातिमा'           where legacy_id = 'B011-004';
update public.people set name_ur = 'سید محمد محب نہری',                name_hi = 'सैयद मोहम्मद मुहिब नहरी' where legacy_id = 'B012-002';
update public.people set name_ur = 'سید محمد مہاد نہری',               name_hi = 'सैयद मोहम्मद महद नहरी'   where legacy_id = 'B012-003';
update public.people set name_ur = 'سیدہ شیزا فاطمہ نہری',             name_hi = 'सैयदा शेज़ा फ़ातिमा नहरी'  where legacy_id = 'B012-004';
update public.people set name_ur = 'نوشین',                            name_hi = 'नौशीन'                 where legacy_id = 'B013-002';
update public.people set name_ur = 'نجیب',                             name_hi = 'नजीब'                  where legacy_id = 'B013-003';
update public.people set name_ur = 'سیدہ مدیحہ نہری',                  name_hi = 'सैयदा मदिहा नहरी'       where legacy_id = 'B014-002';
update public.people set name_ur = 'سید محمد علی نہری',                name_hi = 'सैयद मोहम्मद अली नहरी'   where legacy_id = 'B014-003';
update public.people set name_ur = 'سیدہ طیبہ نہری',                   name_hi = 'सैयदा तैयबा नहरी'        where legacy_id = 'B014-004';
update public.people set name_ur = 'سید فیضان نہری',                   name_hi = 'सैयद फ़ैज़ान नहरी'       where legacy_id = 'B021-005';
update public.people set name_ur = 'ہادی',                             name_hi = 'हादी'                  where legacy_id = 'B013-004';
update public.people set name_ur = 'حسیب',                             name_hi = 'हसीब'                  where legacy_id = 'B013-005';
update public.people set name_ur = 'عنایہ',                            name_hi = 'इनाया'                 where legacy_id = 'B013-006';
update public.people set name_ur = 'عثمان',                            name_hi = 'उस्मान'                where legacy_id = 'B013-007';
update public.people set name_ur = 'علیزہ',                            name_hi = 'अलीज़ा'                where legacy_id = 'B013-008';
update public.people set name_ur = 'بیبی',                             name_hi = 'बेबी'                  where legacy_id = 'B013-009';
update public.people set name_ur = 'بابر',                             name_hi = 'बाबर'                  where legacy_id = 'B013-011';
update public.people set name_ur = 'اکبر',                             name_hi = 'अकबर'                  where legacy_id = 'B013-012';

commit;

-- Check afterwards: this should return 32.
-- select count(*) from public.people where name_ur is not null and name_hi is not null;
