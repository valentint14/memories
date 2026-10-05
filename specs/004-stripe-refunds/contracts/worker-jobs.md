# Contract: joburi worker (004)

Completează [003/contracts/worker-jobs.md](../../003-stripe-payment-activation/contracts/worker-jobs.md).

## `admin_payment_notice` — motiv nou

```ts
{ type: "admin_payment_notice"; payment_id: string; reason: "RETENTION_MANUAL" | /* motivele din 003 */ }
```

Trimis de `register_refund` când plata unei prelungiri e rambursată integral, evenimentul e activ,
dar păstrarea nu poate fi readusă automat (FR-008, FR-009).

Emailul (română, șablonul `plata-de-verificat`): subiectul și textul spun că plata prelungirii a
fost rambursată, iar păstrarea evenimentului trebuie ajustată manual din administrare; conține
evenimentul, organizatorul, suma, referința plății și linkul spre fișa evenimentului. Acțiunea
propusă: „Ajustează păstrarea din fișa evenimentului”.

Destinatarii și reîncercările: ca în 003.
