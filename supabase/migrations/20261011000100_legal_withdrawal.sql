-- Retragere și rambursări (documente legale 2026-10-11) și dovada renunțării la dreptul de retragere.
--
-- 1. Versiunile noi ale termenilor și ale politicii de confidențialitate: retragerea și rambursările,
--    cookie-urile, temeiurile prelucrării, furnizorii corectați (Resend, Oracle Cloud). Versiunea nouă
--    în vigoare cere organizatorilor o nouă acceptare.
-- 2. La plată, organizatorul cere expres ca serviciul să înceapă imediat și recunoaște că pierde
--    dreptul de retragere odată activat evenimentul; momentul se păstrează pe plată.

insert into public.legal_documents (kind, version, effective_at, content_sha256) values
  ('terms', '2026-10-11', '2026-10-11T00:00:00+03:00', '669c0848588137edc2fba79b885cea0b6988828d7d043a63d506bdffde6f4b74'),
  ('privacy', '2026-10-11', '2026-10-11T00:00:00+03:00', '99bccf399d80a9517cf7a739b1391a927351a1373e2f8351bd8191a4db59082e');

alter table public.payments add column withdrawal_waived_at timestamptz;

comment on column public.payments.withdrawal_waived_at is
  'Momentul în care organizatorul a cerut începerea imediată a serviciului și a renunțat la dreptul de retragere (bifa de pe foaia de plată); null la plățile dinainte de această cerință.';
