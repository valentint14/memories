# Data Model: Creare self-service a evenimentelor

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Data**: 2026-09-24

Extinde modelul din [001](../001-event-qr-upload/data-model.md). Toate tabelele noi au RLS
activ (principiul III). Sumele sunt în bani (1 leu = 100 bani), iar momentele sunt
`timestamptz`; calculele de zi se fac în `Europe/Bucharest`, ca în 001.

## Enumerări

| Enum | Valori | Schimbare |
| --- | --- | --- |
| `event_status` | `unconfirmed`, `awaiting_activation`, `active`, `suspended`, `expiring`, `expired`, `deleting` | +3 valori; `expiring` și `deleting` rămân etape interne (001) |
| `event_origin` | `admin`, `self_service` | nou |
| `status_change_source` | `organizer`, `admin`, `system`, `payment` | nou (FR-024) |
| `auth_request_purpose` | `create`, `login` | nou |
| `auth_request_status` | `pending`, `used`, `expired`, `invalidated` | nou |
| `legal_document_kind` | `terms`, `privacy` | nou |
| `notice_threshold` | + `activation_7d` | valoare nouă (FR-019) |

## Mașina de stări a evenimentului (FR-022)

```text
                 confirmare              activare (admin / plată)
 unconfirmed ───────────────► awaiting_activation ─────────────────► active ◄──┐
     │                              │                                 │  │     │ reactivare
     │ 24 h fără confirmare         │ termen FR-019 fără activare      │  └──► suspended
     ▼                              ▼                                 │          │
  (șters)                        (șters)                   data ștergerii (001)  │
                                                                      ▼          ▼
                                                            expiring ──► expired
 ștergere de către organizator/admin: orice stare vizibilă ──► deleting ──► (șters sau rând de facturare)
```

`event_status_transitions` (date de referință, doar citire):

| from_status | to_status | Declanșator |
| --- | --- | --- |
| `unconfirmed` | `awaiting_activation` | confirmarea cererii (sursa `organizer`) |
| `awaiting_activation` | `active` | `activate_event` (sursa `admin` sau `payment`) |
| `active` | `suspended` | administrator |
| `suspended` | `active` | administrator (reactivare) |
| `active` | `expiring` | job de expirare (001) |
| `suspended` | `expiring` | job de expirare (001) |
| `expiring` | `expired` | worker (001) |
| `awaiting_activation`, `active`, `suspended`, `expired` | `deleting` | ștergere de către organizator sau administrator |
| `active` | `active` | activare repetată (doar istoric, FR-026) |

Ștergerea completă a unui eveniment `unconfirmed` sau `awaiting_activation` nu e o tranziție:
rândul dispare (R6), iar pentru cele `awaiting_activation` se scrie un rând în `app_audit_log`.

## Tabele noi

### `packages`

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | |
| `code` | text unic | `'complete'` (singurul rând în 002) |
| `name` | text | 1–60 caractere |
| `price_minor` | bigint | ≥ 0 |
| `max_files_per_guest` | int | 1–10.000 |
| `max_photo_bytes` | bigint | 1 – 52.428.800 (plafonul 001/FR-001a) |
| `max_video_bytes` | bigint | 1 – 1.073.741.824 |
| `retention_option_id` | uuid FK → `retention_options` | opțiunea inclusă; trebuie să fie activă |
| `updated_at` | timestamptz | trigger `set_updated_at` |

RLS: citire pentru `authenticated` (organizatorul vede prețul curent, FR-018); modificare
doar pentru administrator (`is_admin()`, aal2). Modificările nu ating evenimentele existente
(FR-016): valorile se copiază în eveniment la activare.

### `self_service_settings` (un singur rând)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | boolean PK | `true`, cu `check (id)` |
| `max_awaiting_events_per_organizer` | int | 1–20, implicit 2 (FR-021) |
| `updated_at` | timestamptz | |

RLS: citire și modificare doar pentru administrator; funcțiile `security definer` o citesc.

### `event_status_transitions`

`from_status event_status`, `to_status event_status`, PK compusă. Populat prin migrație. RLS:
fără acces pentru `anon`/`authenticated`; folosit de `transition_event`.

### `event_status_changes` (FR-024, imuabil)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `event_id` | uuid FK → `events` `on delete cascade` | |
| `from_status` | event_status | null la prima intrare (crearea) |
| `to_status` | event_status | |
| `source` | status_change_source | |
| `actor_user_id` | uuid null | persoana (admin/organizator); null pentru `system`/`payment` |
| `reason` | text null | 1–500 caractere; **obligatoriu** pentru acțiunile administratorului (FR-028) |
| `external_ref` | text null | referința plății; unic per (`event_id`, `external_ref`) |
| `note` | text null | de ex. „activare repetată” (FR-026) |
| `created_at` | timestamptz | `default now()` |

Doar inserare, prin `transition_event` / `activate_event`. Un trigger respinge `update` și
`delete`, cu excepția cascadei de la ștergerea evenimentului. RLS: administratorul citește tot;
organizatorul citește istoricul evenimentelor proprii (fără `actor_user_id` al
administratorului, printr-un view). La anonimizare (001/FR-047), `actor_user_id` și `reason` se
golesc.

### `auth_requests` (R4)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | uuid PK | aleator (`gen_random_uuid`), apare în link și în pagina de cod |
| `email` | citext | normalizat (trim + lowercase) |
| `purpose` | auth_request_purpose | |
| `event_id` | uuid FK → `events` `on delete cascade`, null | obligatoriu dacă `purpose = 'create'` |
| `status` | auth_request_status | implicit `pending` |
| `failed_attempts` | smallint | 0–5; la 5 → `invalidated` (FR-008) |
| `expires_at` | timestamptz | `created_at + 15 min` (FR-006) |
| `used_at` | timestamptz null | |
| `created_at` | timestamptz | |

O cerere nouă pentru aceeași adresă marchează cererile `pending` anterioare ca `invalidated`
(în concordanță cu tokenul Auth, care se înlocuiește). RLS: fără acces pentru clienți; doar
funcțiile server. Rândurile `used`/`expired`/`invalidated` se șterg după 7 zile (cron).

### `legal_documents` (FR-039)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `kind` | legal_document_kind | PK compusă cu `version` |
| `version` | text | format `AAAA-LL-ZZ` (data versiunii) |
| `effective_at` | timestamptz | |
| `content_sha256` | text | hash-ul fișierului Markdown din repository (verificat în test) |

RLS: citire publică (`anon`, `authenticated`); fără scriere pentru clienți (versiunile noi vin
prin migrații).

### `terms_acceptances` (FR-040)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `email` | citext | adresa care a acceptat |
| `user_id` | uuid null | setat la confirmare (sau imediat, dacă organizatorul e autentificat) |
| `event_id` | uuid FK → `events` `on delete set null` | evenimentul la a cărui creare s-a acceptat |
| `document_kind`, `version` | FK → `legal_documents` | |
| `accepted_at` | timestamptz | |

Cât timp evenimentul e `unconfirmed`, rândul se șterge odată cu el (trigger la ștergerea
evenimentelor neconfirmate). După confirmare, acceptarea rămâne și dacă evenimentul se șterge
ulterior (dovadă a acceptării). La anonimizarea tuturor datelor organizatorului (001/FR-047),
`email` și `user_id` se golesc. RLS: organizatorul își citește propriile acceptări;
administratorul citește tot.

### `activation_requests` (FR-018a)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `event_id` | uuid FK → `events` `on delete cascade` | |
| `requested_at` | timestamptz | ≥ 24 h după cererea anterioară pentru același eveniment |

RLS: organizatorul inserează doar prin funcția `request_activation`, citește ale lui;
administratorul citește tot.

### `app_audit_log`

`id`, `event_id` (fără FK), `action` (`auto_deleted_unactivated`,
`auto_deleted_unconfirmed_count`), `details jsonb` (fără date personale), `created_at`. Fără
acces pentru clienți; administratorul citește.

## Modificări la `events` (001)

| Coloană | Tip | Reguli |
| --- | --- | --- |
| `origin` | event_origin | `not null default 'admin'` |
| `package_id` | uuid FK → `packages` null | setat la activare (sau la creare de către admin) |
| `activated_at` | timestamptz null | |
| `pending_purge_at` | timestamptz null | doar pentru `awaiting_activation`: sfârșitul zilei `event_date + 30` (ora României) (FR-019) |
| `status_before_suspension` | — | nu e nevoie: singura tranziție din `suspended` este spre `active` |

Constrângeri relaxate: `base_price_minor`, `retention_option_id`, `upload_starts_at`,
`upload_ends_at` și `purge_at` devin `null` permis doar când
`status in ('unconfirmed', 'awaiting_activation')` (check). Triggerul de retenție din 001 se
aplică doar când `retention_option_id` e setat.

Reguli noi:
- `event_date` între ziua curentă și +2 ani la creare și modificare (FR-002), `name` 1–120
  caractere.
- **Perioada de upload pentru `origin = 'self_service'`** (FR-034), calculată la activare și la
  schimbarea datei:
  - `upload_starts_at` = momentul activării;
  - `upload_ends_at` = sfârșitul zilei `max(event_date, data activării) + 1` (ora României).
- `purge_at` = `upload_ends_at` + retenția opțiunii (001/FR-040), la activare.

Politici RLS modificate:
- `events_organizer_select`: stările vizibile devin `awaiting_activation`, `active`,
  `suspended`, `expiring`, `expired` (fără `unconfirmed` și `deleting`).
- Nicio politică de `insert`/`update` pentru organizator: toate modificările trec prin funcții.

## Funcții SQL noi sau modificate (rezumat)

Semnăturile complete sunt în [contracts/database-functions.md](./contracts/database-functions.md).

| Funcție | Apelant | Rol |
| --- | --- | --- |
| `request_self_service_event` | server (service role) | creează evenimentul `unconfirmed`, acceptările și cererea `create` |
| `create_event_as_organizer` | organizator autentificat | creează direct `awaiting_activation` (FR-005), cu limita FR-021 |
| `request_login` | server | creează cererea `login` |
| `register_failed_code` | server | crește `failed_attempts`, invalidează la 5 |
| `complete_auth_request` | server, după `verifyOtp` | confirmă evenimentul, leagă acceptarea |
| `transition_event` | intern (`security definer`) | singura cale de schimbare a stării + istoric |
| `activate_event` | administrator; ulterior plăți | activare idempotentă (FR-025, FR-026) |
| `suspend_event` / `reactivate_event` | administrator | FR-028, cu motiv obligatoriu |
| `request_activation` | organizator | FR-018a |
| `organizer_update_event` | organizator | FR-033, FR-034 |
| `request_event_deletion` | administrator **și organizator** | extinsă pentru FR-035 |
| `resolve_event_for_guest`, `start_guest_session`, `reserve_upload` | invitat | refuză stările neactive cu `EVENT_NOT_ACTIVATED` / `EVENT_SUSPENDED` |
| `organizer_owns_active_event` | RLS media/arhive | acceptă și `suspended` pentru citire, descărcare și ștergere |
| `extend_retention` | organizator | refuză `suspended` și `awaiting_activation` (FR-020) |
| `purge_unconfirmed_events`, `purge_unactivated_events`, `enqueue_activation_notices`, `purge_stale_auth_users` | `pg_cron` | R6 |

## Coduri de eroare noi (`packages/shared`)

`EVENT_NOT_ACTIVATED`, `EVENT_SUSPENDED`, `AWAITING_LIMIT_REACHED`, `TERMS_OUTDATED`,
`CAPTCHA_FAILED`, `INVALID_CODE` (existent), `REQUEST_EXPIRED`, `REQUEST_INVALIDATED`,
`ACTIVATION_REQUEST_TOO_SOON`, `INVALID_TRANSITION`, `REASON_REQUIRED`.
