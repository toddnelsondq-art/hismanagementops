# Store Document Email Intake

HIS OPS can accept store inspection documents by email and file them under the correct location in Resources → Documents. The importer validates Mailgun's webhook signature, restricts accepted senders, stores attachments in the tenant's private Supabase Storage path, and detects duplicate files.

## Netlify environment variables

Add these variables for the production site:

```text
STORE_DOCUMENT_INBOUND_ADDRESS=inspections@dqops.net
STORE_DOCUMENT_ALLOWED_SENDERS=approved@example.com,another-approved@example.com
MAILGUN_WEBHOOK_SIGNING_KEY=<the existing Mailgun webhook signing key>
```

Use commas between approved senders. `MAILGUN_WEBHOOK_SIGNING_KEY` is shared with the existing financial-report intake and should not be replaced if it is already working. Trigger a new production deployment after changing Netlify environment variables.

## Mailgun route

Create a new receiving route below the financial-report route:

```text
Expression: match_recipient("^inspections(?:\\+\\d{4,6})?@dqops\\.net$")
Action: forward("https://dqops.net/api/store-documents/email-ingest")
Action: stop()
```

The ordinary address is `inspections@dqops.net`. A store-specific alias such as `inspections+10204@dqops.net` is the strongest location signal.

## Location matching order

HIS OPS checks mapped 4- to 6-digit store numbers in the recipient address, subject, and attachment filename. It can also use one unambiguous DQ OPS location name in the subject or filename. Conflicting or unknown matches go to Needs Review.

Examples:

```text
To: inspections+10204@dqops.net
Subject: Fire inspection

To: inspections@dqops.net
Subject: Store 10204 health inspection

To: inspections@dqops.net
Attachment: 10204-quarterly-inspection.pdf
```

Directors and Owners can add store-number mappings and file unmatched documents from Resources → Documents → Email document intake. When a Needs Review entry contains exactly one store number, filing it also saves that mapping for future messages.

## Supported attachments

PDF, Word, Excel, CSV, text, JPEG, PNG, HEIC, WebP, and other image attachments are accepted. Each emailed attachment must be under 4 MB. Larger files should be uploaded directly in HIS OPS, where the secure direct uploader supports files up to 50 MB.
