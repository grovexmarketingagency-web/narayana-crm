# Bugs

| id | sev | summary | status |
| --- | --- | --- | --- |
| B1 | S2 | PIN pad dropped digits when keys were typed quickly (stale state in key handler) | fixed: PIN kept in a ref |
| B2 | S3 | Stock count "apply" used a browser confirm() that sandboxed pages block | fixed: two-step in-page confirm |

To check: first key typed within ~100 ms of page load is ignored by the PIN pad (only automation types that fast).
