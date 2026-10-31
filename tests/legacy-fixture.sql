-- Data in the pre-generic (June 2026) format, used to test upgrades.
INSERT INTO "Physician"(id,"fullName","updatedAt","canWorkCarson","canWorkEaton","icsToken","nightEligible","minNights","maxNights","maxShifts") VALUES
 ('p1','Dr A',now(),true,false,'t1',true,2,8,25),('p2','Dr B',now(),false,true,'t2',true,2,8,25),('p3','Dr C',now(),false,false,'t3',true,2,8,25),
 ('p4','Dr D',now(),false,false,'t4',true,2,8,25),('p5','Dr E',now(),false,false,'t5',true,2,8,25),('p6','Dr F',now(),true,true,'t6',true,2,8,25),
 ('p7','Dr G',now(),false,false,'t7',false,0,0,25),('p8','Dr H',now(),false,false,'t8',true,2,8,25);
INSERT INTO "ScheduleMonth"(id,year,month,"rounderCount","carsonRounderCount","eatonRounderCount",status) VALUES ('m1',2026,6,3,1,0,'GENERATED');
INSERT INTO "ShiftAssignment"(id,"scheduleMonthId",date,"endDate","shiftType",hospital,"rounderIndex","startTime","endTime","physicianId","updatedAt","isLocked") VALUES
 ('a1','m1','2026-06-29','2026-06-29','ROUNDER','MAIN',3,'07:00','17:00','p1',now(),true),
 ('a2','m1','2026-06-29','2026-06-30','NIGHT_ADMIT_2','MAIN',NULL,'19:00','07:00','p2',now(),false),
 ('a3','m1','2026-06-30','2026-07-01','NIGHT_ADMIT_2','MAIN',NULL,'19:00','07:00','p2',now(),false),
 ('a4','m1','2026-06-30','2026-06-30','ROUNDER','CARSON',1,'07:00','17:00','p6',now(),false);
