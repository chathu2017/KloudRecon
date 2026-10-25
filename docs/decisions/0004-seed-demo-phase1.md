# 0004 — `seed-demo` in Phase 1 creates only the Contoso Demo org shell

**Status:** accepted · Phase 1

The local commands include `python -m kloudrecon.cli seed-demo`, but the Demo Mode dataset
(600 resources, costs, attack paths) is Phase 2, step 8. In Phase 1 the command exists, is
idempotent, and creates the active "Contoso Demo" organization (with `settings.demo=true`) so the
documented commands work unchanged. Phase 2 fills it with data. `admin@acme.test` is a normal
active customer (Acme Corp) with no Azure data yet.
