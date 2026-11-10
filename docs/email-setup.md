# Email: Resend SMTP for Supabase Auth, and hello@scoutmind.app

Day 5, commit 3. Do **all of this before pushing** the commit that changes
`auth.html`: once confirmation is on, a sign-up with no working SMTP gets a
"Check your inbox" screen and no email.

What it gives us: confirmation and password-reset emails from
`hello@scoutmind.app`, sent by Resend (not Supabase's built-in sender, which
is rate-limited to a few emails an hour and lands in spam), and a working
`hello@scoutmind.app` inbox forwarded to Felipe.

Two things share the domain's DNS and must not collide:

| What | DNS records | Where |
|---|---|---|
| Resend (sending) | MX + TXT on the `send` subdomain, DKIM on `resend._domainkey`, DMARC on `_dmarc` | `send.scoutmind.app`, never the root |
| hello@ forwarding (receiving) | MX + SPF TXT on the root `@` | `scoutmind.app` |

---

## A. Forward hello@scoutmind.app (Namecheap)

1. Namecheap → **Domain List** → scoutmind.app → **Manage**.
2. **Domain** tab → section **Redirect Email** (shown when Mail Settings is
   "Email Forwarding"; if it is not, set **Advanced DNS → Mail Settings →
   Email Forwarding** first) → **Add forwarder**: Alias `hello` → Forward to
   your personal address → save. Add `privacy` → the same address if you want
   a second alias later; nothing points at it today.
3. Send a test to hello@scoutmind.app from another account; it should arrive
   within a few minutes. **Do this before section B.**

## B. Resend: account, domain, DNS

4. Create an account at **resend.com** (any plan; free covers 3,000 emails a
   month, 100 a day).
5. **Domains → Add Domain** → `scoutmind.app` → Region **São Paulo
   (sa-east-1)** (nearest to most readers) → Add.
6. Resend shows the records to add. Copy the **exact values it shows**; they
   depend on the region. You will see:
   - **MX** · host `send` · value `feedback-smtp.sa-east-1.amazonses.com` · priority `10`
   - **TXT** · host `send` · value `v=spf1 include:amazonses.com ~all`
   - **TXT** · host `resend._domainkey` · value `p=MIGfMA0G…` (a long key)
   - recommended, **TXT** · host `_dmarc` · value `v=DMARC1; p=none; rua=mailto:hello@scoutmind.app`
7. Namecheap → scoutmind.app → **Advanced DNS**. Namecheap only lets you add
   MX records in **Mail Settings → Custom MX**, and section A put the domain
   on "Email Forwarding". So:
   1. Note the forwarding MX records Namecheap shows now (normally
      `eforward1.registrar-servers.com` … `eforward5`, priorities 10/10/10/15/20)
      and the root SPF TXT (`v=spf1 include:spf.efwd.registrar-servers.com ~all`).
   2. Switch **Mail Settings → Custom MX**.
   3. Add back the five **forwarding MX** records on host `@` exactly as
      noted, and keep (or add) the root SPF TXT on host `@`.
   4. Add Resend's **MX** on host `send` (step 6).
   5. In **Host Records**, add the three **TXT** records from step 6. Type the
      host as `send`, `resend._domainkey`, `_dmarc` — Namecheap appends
      `.scoutmind.app` itself; do not type it.
   6. TTL: Automatic. Save all changes.
8. Send another test to hello@scoutmind.app. If it **no longer arrives** after
   switching to Custom MX, use a free forwarder that works with custom MX
   (ImprovMX: replace the five `@` MX records with `mx1.improvmx.com` 10 and
   `mx2.improvmx.com` 20, root SPF `v=spf1 include:spf.improvmx.com ~all`, and
   add the `hello` alias at improvmx.com). Resend's records stay as they are.
9. Resend → **Domains → scoutmind.app → Verify DNS records**. Wait until every
   row is **Verified** (minutes, sometimes a few hours).
10. Resend → **API Keys → Create API Key**: name `supabase-smtp`, permission
    **Sending access**, domain **scoutmind.app** → Create. Copy it now; Resend
    shows it once. Paste it only into Supabase (step 11) — not into the repo,
    not into Vercel.

## C. Supabase: SMTP, confirmation, templates

11. Supabase dashboard → project → **Authentication → Emails → SMTP
    Settings** → **Enable custom SMTP**:
    - Sender email: `hello@scoutmind.app`
    - Sender name: `ScoutMind`
    - Host: `smtp.resend.com`
    - Port: `465`
    - Username: `resend`
    - Password: the API key from step 10
    - Minimum interval between emails: `60` seconds → Save.
12. **Authentication → Rate Limits** → "Rate limit for sending emails":
    `100` per hour → Save. (Custom SMTP lifts Supabase's built-in limit; this is
    our own ceiling against abuse.)
13. **Authentication → URL Configuration**:
    - Site URL: `https://scoutmind.app`
    - Redirect URLs → Add: `https://scoutmind.app/**` (the confirm and reset
      links come back to `auth.html?confirmed=1` and `auth.html?reset=1`; the
      `**` glob covers both, query string included). Add
      `http://localhost:*/**` too if you test locally.
14. **Authentication → Sign In / Providers → Email**:
    - **Confirm email**: ON
    - **Secure email change**: ON
    - Minimum password length: `8` (matches `auth.html`) → Save.
15. **Authentication → Emails → Templates**: paste Subject and Message body
    from [`docs/auth-email-templates.md`](auth-email-templates.md) into
    **Confirm signup**, **Reset password** and **Change email address** →
    Save each.

## D. Check it, then push

16. In a private window, open `https://scoutmind.app/auth.html?tab=signup`
    (the old page is fine for this test) and sign up with an address you can
    read:
    - the email arrives from **ScoutMind &lt;hello@scoutmind.app&gt;**, not in spam;
    - with a Portuguese browser it is in Portuguese;
    - Resend → **Logs** shows it **Delivered**.
17. In the SQL editor, the profile row exists before you click the link
    (the `on_auth_user_created` trigger runs at sign-up). Expect one row with
    `email_confirmed_at` null:
    ```sql
    select p.id, p.name, u.email_confirmed_at
      from public.profiles p join auth.users u on u.id = p.id
     where u.email = '<the address>';
    ```
18. **Push** the commit. Then on the live site:
    - sign up → "Check your inbox" → **Resend email** works once a minute;
    - sign in before confirming → the same panel, not an error;
    - click the link → "Email confirmed" → **Continue** → signed in;
    - **Forgot password?** → email → link → "Choose a new password" → saved,
      signed in;
    - the "Already signed in as…" banner still appears when you open
      `auth.html` with a session.
19. Delete the test account (Profile → Account actions → Delete my account)
    once 024 is applied, or in Authentication → Users.

Accounts created while confirmation was off are already marked confirmed, so
no existing user is locked out.
