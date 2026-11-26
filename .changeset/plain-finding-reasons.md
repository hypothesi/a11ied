---
'a11ied': minor
---

Audit findings now say why they fail. A new finding needs a `reason` for its criterion, and
each `alsoFails` entry is `{"criterion", "reason"}` instead of a criterion id. The report
shows the reasons under "Why it fails". A worker that confirms an automated finding must
describe it in the new `confirm` list of the submission, or dismiss it, so the report no
longer repeats axe-core's rule text. `a1 audit finding update --reason "<criterion>=<text>"`
and the `reasons` argument of `audit_finding` edit a reason. A note that refers to another
page is rejected. The worker guide and work packet explain how to write notes and findings
in plain, concrete language.
