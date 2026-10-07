# Contract: interfața web (005)

Completează [003/contracts/web-interface.md](../../003-stripe-payment-activation/contracts/web-interface.md).

## Organizatorul — foaia de plată a activării

În `PayActivationForm`, sub lista perioadelor de păstrare:

- câmpul **„Cod de reducere”** (text, `autocapitalize="characters"`, `autocomplete="off"`) și
  butonul **„Aplică”** (`formAction` = `applyDiscountForm`);
- cu un cod aplicat: rândul „Cod {COD} · reducere {sumă}” și butonul **„Elimină codul”**; fiecare
  perioadă arată prețul întreg tăiat și prețul redus;
- câmpurile ascunse: `discountCode` și `amount_{id}` cu sumele reduse;
- „Plătește și activează” trimite codul la `startPaymentForm` → `prepare_payment(…, p_discount_code)`.

Mesaje (`errors.*` în `messages/ro.ts`, `role="alert"` lângă câmp):

| Cod | Text |
| --- | --- |
| `DISCOUNT_INVALID` | Codul nu există sau nu mai este valabil. |
| `DISCOUNT_UNAVAILABLE` | Codul a fost deja folosit. |
| `DISCOUNT_RESERVED` | Codul este folosit într-o plată în curs. Încearcă din nou peste câteva minute. |
| `RATE_LIMITED` | (existent) |

O reducere limitată de minimul de plată (R4) arată reducerea efectiv aplicată.

## Server Actions

- `applyDiscountForm(prev, formData)`: `eventId`, `discountCode` → `discount_quote(…, hashedClientIp())`;
  întoarce opțiunile reduse sau eroarea.
- `startPaymentForm`: citește în plus `discountCode` (opțional) și îl trimite la `prepare_payment`.
- Admin: `generateDiscountCodes(input)`, `disableDiscountCode(id)` (cu `requireAdmin`).

## Administrare — `/admin/discounts`

Link nou în meniul de administrare: „Coduri de reducere”.

- **Foaia „Generează coduri”**: felul (personal / de campanie), tipul (sumă fixă în lei / procent),
  valoarea, câte coduri (personal, 1–100) sau numărul maxim de utilizări (campanie, 2–1000),
  expirarea (opțional, `DateField`), nota. După generare, formularul se golește și se deschide o
  **fereastră de succes**: „N coduri generate”, rezumatul (reducerea, felul, expirarea), codurile
  (fiecare cu buton de copiere; lista se derulează la multe coduri), „Copiază tot” și „Închide”.
- **Foaia „Coduri”**: lista, filtrabilă după stare (disponibil, epuizat, expirat, dezactivat):
  codul, felul, reducerea, utilizări „x din y”, expirarea, nota, data; extinsă: utilizările
  (eveniment cu link, organizator, data sau „plată în curs”), „Dezactivează” (cod disponibil) și
  „Șterge” (cod fără utilizări), fiecare cu fereastră de confirmare.

## Foaia „Plăți” (administrare › eveniment)

Pentru o plată cu cod: „Preț întreg {sumă} · reducere {sumă} (cod {COD})” deasupra sumei încasate.
