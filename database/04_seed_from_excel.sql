-- =====================================================================
--  YOUR FAMILY DATA  —  generated from data/Master_Family_Tree_Database.xlsx (sheet "Family_Data")
--  Regenerate with:  node tools/build_seed_sql.cjs
--                    node tools/build_seed_sql.cjs --insert-only
--
--  38 people, existing rows are UPDATED to match the spreadsheet.
--
--  Run AFTER 01_schema.sql:
--    Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
--  Parents are inserted before their children, so parent_id resolves against the
--  legacy_id column (the old Individual_ID) — no manual UUID work needed.
--  This only ever touches rows whose legacy_id is in the spreadsheet; people you
--  added in the website keep their own ids and are not listed here.
-- =====================================================================
begin;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('A001', null, 'Male', 'Syed Azeemuddin Nahri', null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Setup sheet (anchor placeholder)')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('A002', (select id from public.people where legacy_id = 'A001'), 'Male', 'Syed Qutbuddin Nahri', null, 'Syed Azeemuddin Nahri', null, null, null, null, null, null, null, null, null, null, null, null, 'Setup sheet (anchor placeholder)')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('A011', (select id from public.people where legacy_id = 'A002'), 'Male', 'Syed Ibrahim Nahri', null, 'Syed Qutbuddin Nahri', null, 'Syeda Qamarunnisa', null, null, null, null, null, null, null, null, null, null, 'Setup sheet (anchor placeholder)')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('A022', (select id from public.people where legacy_id = 'A002'), 'Male', 'Syed Mazharuddin Nahri', null, 'Syed Qutbuddin Nahri', null, null, null, null, null, null, null, null, null, null, null, null, 'Setup sheet (anchor placeholder)')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('AZ01-001', (select id from public.people where legacy_id = 'A011'), 'Male', 'Syed Azamuddin Nahri', 'Murtuza', 'Syed Ibrahim Nahri', 'Syeda Qamarunnisa', 'Syeda Nikhat Fathima', 'Syed Zaheeruddin Nahri', null, null, null, null, null, null, null, null, null, 'AZ01_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('AZ01-002', (select id from public.people where legacy_id = 'A011'), 'Female', 'Syeda Jamalunnisa', 'Nuzhat', 'Syed Ibrahim Nahri', 'Syeda Qamarunnisa', 'Syed Bahauddin Nahri', 'Syed Mazharuddin Nahri', null, null, null, null, null, null, null, null, null, 'AZ01_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('AZ01-003', (select id from public.people where legacy_id = 'A011'), 'Male', 'Syeda Kamaalunnisa', 'Ifhat', 'Syed Ibrahim Nahri', 'Syeda Qamarunnisa', 'Mahmood Ali', null, null, null, null, null, null, null, null, null, null, 'AZ01_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B001', (select id from public.people where legacy_id = 'A022'), 'Male', 'Syed Bahauddin Nahri', 'Farooq', 'Syed Mazharuddin Nahri', 'Syeda Hafeezunnisa', 'Syeda Jamalunnisa', null, null, null, null, null, null, null, null, null, null, 'A011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B002', (select id from public.people where legacy_id = 'A022'), 'Male', 'Syed Afzaluddin Nahri', 'Iqbal', 'Syed Mazharuddin Nahri', 'Syeda Hafeezunnisa', 'Syeda Nusrat Nahri', null, null, null, null, null, null, null, null, null, null, 'A011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B011-001', (select id from public.people where legacy_id = 'B001'), 'Male', 'Syed Ejazuddin Nahri', 'Masood', 'Syed Bahauddin Nahri', 'Syeda Jamalunnisa', 'Mohsina', 'Habeebuddin', '1970-03-01', '01/03/1970', 'Aurangabad', 'M Pham', '2019-10-01', '1/10/2019', 'Bahrain', null, null, 'B011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B012-001', (select id from public.people where legacy_id = 'B001'), 'Male', 'Syed Ehteshamuddin Nahri', 'Mubeen', 'Syed Bahauddin Nahri', 'Syeda Jamalunnisa', 'Shakera', null, null, null, null, null, null, null, null, null, null, 'B012_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-001', (select id from public.people where legacy_id = 'B001'), 'Female', 'Syeda Nasreen Fatima Nahri', 'Nasreen', 'Syed Bahaduddin Nahri', 'Syeda Jamalunnisa', 'Syed Taqiuddin Nahri', 'Syed Afzaluddin', '1976-03-01', '01/03/1976', 'Aurangabad', 'MSc IT', null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B014-001', (select id from public.people where legacy_id = 'B001'), 'Male', 'Syed Ikramuddin Nahri', 'Masood', 'Syed Bahauddin Nahri', 'Syeda Jamalunnisa', 'Seema', null, null, null, null, null, null, null, null, null, null, 'B014_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-001', (select id from public.people where legacy_id = 'B002'), 'Male', 'Syed Naeemuddin Nahri', 'Zafar', 'Syed Afzaluddin Nahri', 'Syeda Nusrat Nahri', 'Sarwat', null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-002', (select id from public.people where legacy_id = 'B002'), 'Female', 'Syeda Rafat Nahri', 'Rafat', 'Syed Afzaluddin Nahri', 'Syeda Nusrat Nahri', 'Zaidi', null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-003', (select id from public.people where legacy_id = 'B002'), 'Male', 'Syed Basith Nahri', 'Basith', 'Syed Afzaluddin Nahri', 'Syeda Nusrat Nahri', 'Shaheena', null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-004', (select id from public.people where legacy_id = 'B002'), 'Male', 'Syed Raziuddin', 'Mohsin', 'Syed Afzaluddin Nahri', 'Syeda Nusrat Nahri', 'Rahat', null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-006', (select id from public.people where legacy_id = 'B002'), 'Female', 'Syeda Talat Nahri', 'Talat', 'Syed Afzaluddin Nahri', 'Syeda Nusrat Nahri', 'Majid Nahri', null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B011-002', (select id from public.people where legacy_id = 'B011-001'), 'Male', 'Syed Hyder hussaini', 'Ibrahim', 'Syed Ejazuddin Nahri', 'Mohsina', null, null, null, null, null, null, null, null, null, null, null, 'B011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B011-003', (select id from public.people where legacy_id = 'B011-001'), 'Male', 'Ghouse Hussaini', 'Ghouse', 'Syed Ejazuddin Nahri', 'Mohsina', null, null, null, null, null, null, null, null, null, null, null, 'B011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B011-004', (select id from public.people where legacy_id = 'B011-001'), 'Female', 'Amina Fatima', 'Amina', 'Syed Ejazuddin Nahri', 'Mohsina', null, null, null, null, null, null, null, null, null, null, null, 'B011_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B012-002', (select id from public.people where legacy_id = 'B012-001'), 'Male', 'Syed Mohammed Muhib Nahri', 'Muhib', 'Syed Ehteshamuddin Nahri', 'Shakera', null, null, '2008-09-23', '23/09/2008', 'Hyderabad', 'Inter', null, null, null, null, null, 'B012_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B012-003', (select id from public.people where legacy_id = 'B012-001'), 'Male', 'Syed Mohammed Mahad Nahri', 'Madad', 'Syed Ehteshamuddin Nahri', 'Shakera', null, null, '2010-09-02', '02/09/2010', 'Hyderabad', 'Inter 1st', null, null, null, null, null, 'B012_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B012-004', (select id from public.people where legacy_id = 'B012-001'), 'Female', 'Syeda Sheza Fatima Nahri', 'Sheza', 'Syed Ehteshamuddin Nahri', 'Shakera', null, null, '2012-06-22', '22/06/2012', 'Hyderabad', '9th', null, null, null, null, null, 'B012_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-002', (select id from public.people where legacy_id = 'B013-001'), 'Female', 'Nosheen', 'Nosheen', 'Syed Taqiuddin Nahri', 'Syeda Nasreen Fatima Nahri', 'Muneer', null, '2008-09-23', '23/09/2008', 'Hyderabad', 'Inter', null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-003', (select id from public.people where legacy_id = 'B013-001'), 'Male', 'Najeeb', 'Najeeb', 'Syed Taqiuddin Nahri', 'Syeda Nasreen Fatima Nahri', 'Nusra', null, '2010-09-02', '02/09/2010', 'Hyderabad', 'Inter 1st', null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B014-002', (select id from public.people where legacy_id = 'B014-001'), 'Female', 'Syeda Madhia Nahri', 'Madiha', 'Syed Ikramuddin Nahri', 'Seema', 'Tabish', null, null, null, null, null, null, null, null, null, null, 'B014_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B014-003', (select id from public.people where legacy_id = 'B014-001'), 'Male', 'Syed Md Ali Nahri', 'Md Ali', 'Syed Ikramuddin Nahri', 'Seema', null, null, null, null, null, null, null, null, null, null, null, 'B014_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B014-004', (select id from public.people where legacy_id = 'B014-001'), 'Female', 'Syeda Tayyaba Nahri', 'Tayyaba', 'Syed Ikramuddin Nahri', 'Seema', null, null, null, null, null, null, null, null, null, null, null, 'B014_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B021-005', (select id from public.people where legacy_id = 'B021-001'), 'Male', 'Syed Faizan Nahri', 'Faizan', 'Syed Naeemuddin Nahri', 'Sarwat', null, null, null, null, null, null, null, null, null, null, null, 'B021_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-004', (select id from public.people where legacy_id = 'B013-002'), 'Male', 'Hadi', 'Hadi', 'Muneer', 'Nosheen', 'Spouse', null, '2012-06-22', '22/06/2012', 'Hyderabad', '9th', null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-005', (select id from public.people where legacy_id = 'B013-002'), 'Male', 'Haseeb', 'Haseeb', 'Muneer', 'Nosheen', null, null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-006', (select id from public.people where legacy_id = 'B013-003'), 'Female', 'Inaya', 'Inaya', 'Najeeb', 'Nusra', null, null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-007', (select id from public.people where legacy_id = 'B013-003'), 'Male', 'Osman', 'Osman', 'Najeeb', 'Nusra', null, null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-008', (select id from public.people where legacy_id = 'B013-003'), 'Female', 'Aliza', 'Aliza', 'Najeeb', 'Nusra', null, null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-009', (select id from public.people where legacy_id = 'B013-004'), 'Female', 'Baby', null, 'Hadi', 'Spouse', 'BabySpouse', null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-011', (select id from public.people where legacy_id = 'B013-009'), 'Male', 'BABAR', null, 'BabySpouse', 'Baby', 'Fathima', null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

insert into public.people (legacy_id, parent_id, gender, full_name, nick_name, fathers_name, mothers_name, spouse_name, spouse_father_name, dob, dob_text, place_of_birth, qualification, dod, dod_text, place_of_burial, name_ur, name_hi, source)
  values ('B013-012', (select id from public.people where legacy_id = 'B013-011'), 'Male', 'Akbar', null, 'BABAR', 'Fathima', null, null, null, null, null, null, null, null, null, null, null, 'B013_Familytree.xlsx')
  on conflict (legacy_id) do update set
    parent_id = excluded.parent_id,
    gender = excluded.gender,
    full_name = excluded.full_name,
    nick_name = excluded.nick_name,
    fathers_name = excluded.fathers_name,
    mothers_name = excluded.mothers_name,
    spouse_name = excluded.spouse_name,
    spouse_father_name = excluded.spouse_father_name,
    dob = excluded.dob,
    dob_text = excluded.dob_text,
    place_of_birth = excluded.place_of_birth,
    qualification = excluded.qualification,
    dod = excluded.dod,
    dod_text = excluded.dod_text,
    place_of_burial = excluded.place_of_burial,
    name_ur = excluded.name_ur,
    name_hi = excluded.name_hi,
    source = excluded.source;

commit;
-- 38 people written
