# 0008 — Permissive email validation in the API

**Status:** accepted · Phase 1

`email-validator` (behind Pydantic's `EmailStr`) rejects special-use domains such as `.test`, but
the plan's dev users are `owner@local.test`, `admin@acme.test`, `pending@new.test`. The API uses
a simple syntax check (`domain/schemas.py: Email`) and lower-cases addresses. Real addresses are
verified by Entra External ID during sign-up, so stricter checks add nothing.
