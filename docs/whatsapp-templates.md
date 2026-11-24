# WhatsApp: what to set up, and in what order

The quotation link goes out by email and by WhatsApp. The email half works the
moment Resend is configured. The WhatsApp half needs Meta's permission, and
that permission takes days rather than minutes — so this page is the order to
do it in, and the exact text to submit.

## Do you need a WhatsApp Business Account?

**Yes**, for real customers. Twilio sends through Meta's Cloud API, and Meta
will not carry a business message without a WhatsApp Business Account (WABA)
behind it.

Three things follow from that, and they are the whole reason this page exists.

**The number must be one you control and one that is not already on WhatsApp.**
If the works' number is signed in to the WhatsApp app on somebody's phone, it
has to be released from there first. A fresh number avoids the argument.

**A business may not simply message a customer.** Free text is allowed only
within **24 hours of the customer last writing to you**. Outside that window —
which is every quotation, because you are writing to them — the message must be
a **template Meta has approved in advance**. Approval is per template and takes
anywhere from minutes to a couple of days.

**The sandbox is for building, not for customers.** Twilio's sandbox will carry
plain text today, with no WABA, to anyone who has sent it the join code once.
That is how this feature was built and how you can test it end to end before
approval comes through. It is useless for real customers, who will not send a
join code to their supplier.

## The order to do it in

1. **Now — sandbox.** Twilio console → Messaging → Try it out → WhatsApp
   sandbox. Send the join code from your own phone. Put the three sandbox
   values in `.env` (below). Everything works, to your own number.
2. **Now — start the WABA.** Twilio console → Messaging → Senders → WhatsApp
   senders → new sender. This is the step with the waiting in it, so start it
   on the same day.
3. **While waiting — submit the two templates.** Text below. They are approved
   independently of the sender.
4. **When approved** — swap `TWILIO_WHATSAPP_FROM` to the works' own number and
   set the two content SIDs. No code changes.

## Environment

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
# Sandbox while waiting; the works' own number afterwards.
TWILIO_WHATSAPP_FROM=+14155238886

# Set these only once Meta has approved the templates. Without them the app
# sends plain text, which the sandbox accepts and a real number refuses.
TWILIO_TEMPLATE_QUOTATION_SENT=HX...
TWILIO_TEMPLATE_QUOTATION_ACCEPTED=HX...

# Where the works is told a customer has answered.
OFFICE_ALERT_EMAIL=office@example.com
OFFICE_WHATSAPP=+919876543210

# The public origin of the WEB app — this is what the accept link points at.
PUBLIC_APP_URL=https://quotations.example.com
```

All three Twilio values or none: the app refuses to boot half-configured,
rather than failing at the first message with an authentication error nobody
traces back to a missing line.

## Template 1 — sending a quotation

Submit in Twilio under **Content Template Builder**, category **Utility** (not
Marketing: this is a transactional message the customer asked for, and Utility
is both cheaper and approved more readily).

Name: `quotation_sent`

Body:

```
Quotation {{1}} from Yuva Polyprint & Packaging.
Total {{2}}.
View it and accept here: {{3}}
```

Variables, which must stay in step with `quotationTemplateVariables` in
`apps/api/src/modules/quotations/quotation-notify.ts`:

| Variable | Is                  | Sample for the submission                 |
| -------- | ------------------- | ----------------------------------------- |
| `{{1}}`  | quotation number    | `124`                                     |
| `{{2}}`  | total including GST | `Rs. 1,84,646 incl. GST`                  |
| `{{3}}`  | the accept link     | `https://quotations.example.com/q/abc123` |

## Template 2 — telling the works a customer answered

Name: `quotation_accepted`. Category **Utility**. This one goes to the works'
own number, not to a customer.

Body:

```
Quotation {{1}} accepted.
{{2}} — {{3}}.
Accepted by {{4}}.
Confirm it in the system to raise the order.
```

| Variable | Is                  | Sample                   |
| -------- | ------------------- | ------------------------ |
| `{{1}}`  | quotation number    | `124`                    |
| `{{2}}`  | customer            | `A S Agro`               |
| `{{3}}`  | total including GST | `Rs. 1,84,646 incl. GST` |
| `{{4}}`  | who accepted        | `Sunil Kale`             |

## Things that will go wrong, and what they mean

| Twilio code | What it really means                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| 63016       | Plain text outside the 24-hour window. The template is not set, or its SID is wrong.                 |
| 63007       | The `from` number is not a WhatsApp sender. On the sandbox: the customer has not sent the join code. |
| 21211       | Not a WhatsApp number. Usually a landline typed into the mobile box.                                 |

The app turns each of these into a sentence on the send dialog rather than a
failure — the email has already gone, and a quotation that was delivered must
not report itself as failed because one number was wrong.

## The confirmation to the customer

When a customer accepts, they get a WhatsApp confirmation too. That one is
**inside** the 24-hour window — they have just interacted with the business —
so it needs no template and is sent as plain text. Nothing to submit.
