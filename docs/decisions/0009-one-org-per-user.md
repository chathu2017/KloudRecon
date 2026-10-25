# 0009 — One organization per user in v1

**Status:** accepted · Phase 1

`users.org_id` is a single column (plan Section 12). A person belongs to one organization; an
invitation can only be accepted by an identity that has no KloudRecon profile yet. Consultant
multi-org switching (Enterprise, "org switcher" in the top bar) will add a membership table later
without breaking this model. Platform Owners have no organization (`org_id = NULL`).
