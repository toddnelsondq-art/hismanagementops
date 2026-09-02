# FPC Report Email Intake

HIS OPS can accept completed Facility PRIDE Check PDF reports at `FPC@dqops.net`. It reads the store number, inspection date, inspector, failed standards, and deficiency descriptions. The original PDF is attached to the location's FPC record, and each actionable “No” response becomes an open, medium-priority repair item.

Informational “No” responses without a corresponding deficiency description are intentionally ignored. Duplicate PDFs and duplicate repair items are not imported twice.

## Netlify environment variables

Add these variables to the production site:

```text
FPC_INBOUND_ADDRESS=FPC@dqops.net
FPC_ALLOWED_SENDERS=approved@example.com,another-approved@example.com
MAILGUN_WEBHOOK_SIGNING_KEY=<the existing Mailgun webhook signing key>
```

Use commas between approved senders. If `FPC_ALLOWED_SENDERS` is omitted, HIS OPS falls back to `STORE_DOCUMENT_ALLOWED_SENDERS`, then `FINANCIAL_REPORT_ALLOWED_SENDERS`. Keeping a separate FPC sender list is recommended.

`MAILGUN_WEBHOOK_SIGNING_KEY` is shared with the existing financial and store-document intake. Do not replace it if those routes are already working. Trigger a new production deployment after changing the variables.

## Mailgun route

Create this receiving route:

```text
Expression: match_recipient("^fpc(?:\\+\\d{4,6})?@dqops\\.net$")
Action: forward("https://dqops.net/api/fpc/email-ingest")
Action: stop()
```

The ordinary address is `FPC@dqops.net`. A store-specific alias such as `FPC+10204@dqops.net` is also accepted and provides a strong location signal.

## Location matching and review

HIS OPS checks the store number printed in the PDF, the recipient alias, email subject, attachment filename, and recognizable location text. Store-number mappings are shared with the existing financial and document import tools.

If the location is unknown or conflicting, Directors and Owners can open Resources → FPC → Email FPC intake, choose the location and inspection date, and create the repair list. Providing the store number while reviewing also saves that mapping for future reports.

Only PDF attachments are accepted, and each attachment must be under 4 MB. A clean inspection with no actionable “No” responses is still filed with the original PDF and creates zero repair items.
