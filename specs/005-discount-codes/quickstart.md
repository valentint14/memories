# Quickstart: validarea codurilor de reducere (005)

Mediul local și Stripe în modul test: ca în
[003/quickstart.md](../003-stripe-payment-activation/quickstart.md).

## Teste automate

```powershell
corepack pnpm test:db                                   # generarea, aplicarea, limitele, plățile simultane
corepack pnpm test:unit
corepack pnpm --filter web exec playwright test tests/e2e/discount.spec.ts
```

## Scenarii manuale

| # | Pași | Rezultat așteptat | Cerințe |
| --- | --- | --- | --- |
| 1 | Admin: generează 3 coduri personale, 50 lei | 3 coduri `XXXX-XXXX` distincte, „disponibil”, „Copiază tot” | FR-001, FR-003 |
| 2 | Organizator: aplică un cod personal, perioada inclusă | prețul tăiat și prețul cu 50 lei mai mic | FR-007 |
| 3 | Plătește (card de test `4242…`) | Stripe încasează suma redusă; evenimentul e activ; codul „epuizat”, cu evenimentul | FR-009, FR-010 |
| 4 | Alt organizator: același cod | „Codul a fost deja folosit.” | FR-006, FR-011 |
| 5 | Admin: cod de campanie 20%, maxim 2 | 0 din 2 utilizări | FR-001, FR-002 |
| 6 | Doi organizatori îl folosesc și plătesc; al treilea îl aplică | primii doi plătesc cu 20% mai puțin; al treilea: „deja folosit” | FR-006 |
| 7 | Primul organizator, al doilea eveniment, același cod de campanie | „deja folosit” | FR-006 |
| 8 | Cod aplicat, plata începută și anulată la Stripe, apoi expirată | utilizarea se eliberează; codul redevine disponibil | FR-010 |
| 9 | Cod cu reducere mai mare decât prețul (de ex. 1000 lei) | prețul de plată 3,00 lei, reducerea afișată limitată | FR-006a |
| 10 | 11 coduri greșite la rând | „Prea multe încercări” | FR-011, SC-005 |
| 11 | Admin › eveniment › „Plăți” | prețul întreg, reducerea, codul, suma încasată | FR-014 |
| 12 | Admin: dezactivează un cod disponibil, organizatorul îl aplică | „nu mai este valabil” | FR-004 |
