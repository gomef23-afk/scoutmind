# Auth email templates (Supabase → Authentication → Emails → Templates)

Paste each **Subject** and **Message body** into the matching template. Every
body is one template that picks its language from the account's
`user_metadata.lang`, which `auth.html` sets at sign-up (`pt-BR` for a
Portuguese browser, `en` otherwise). Accounts with no `lang` get English.

Subjects carry both languages, because the subject line is the first thing
people see and the safest place not to rely on a template branch.

Placeholders are Supabase's own: `{{ .ConfirmationURL }}`, `{{ .Data.lang }}`
(user_metadata), `{{ .Email }}`. Do not add images: nothing external is loaded,
so the mail looks the same in every client and leaks nothing on open.

---

## 1. Confirm signup

**Subject**

```
Confirm your ScoutMind account · Confirme sua conta
```

**Message body**

```html
<div style="background:#07090f;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0d1117;border:1px solid #1a2540;border-radius:12px;padding:28px 24px;color:#edf2f7;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#00e5a0;margin-bottom:18px;">SCOUT<span style="color:#edf2f7;">MIND</span></div>
    {{ if eq .Data.lang "pt-BR" }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Falta um passo: confirme que este e-mail é seu.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Confirmar meu e-mail</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">Se você não criou uma conta no ScoutMind, ignore este e-mail.</p>
    {{ else }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">One step left: confirm this email address is yours.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Confirm my email</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">If you didn't create a ScoutMind account, ignore this email.</p>
    {{ end }}
  </div>
  <p style="max-width:480px;margin:14px auto 0;font-size:11px;color:#5a6a85;text-align:center;">ScoutMind · scoutmind.app · hello@scoutmind.app</p>
</div>
```

---

## 2. Reset password

**Subject**

```
Reset your ScoutMind password · Redefinir sua senha
```

**Message body**

```html
<div style="background:#07090f;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0d1117;border:1px solid #1a2540;border-radius:12px;padding:28px 24px;color:#edf2f7;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#00e5a0;margin-bottom:18px;">SCOUT<span style="color:#edf2f7;">MIND</span></div>
    {{ if eq .Data.lang "pt-BR" }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Recebemos um pedido para redefinir a senha da sua conta.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Escolher nova senha</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
    {{ else }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">We got a request to reset your account's password.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Choose a new password</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">If it wasn't you, ignore this email: your password stays the same.</p>
    {{ end }}
  </div>
  <p style="max-width:480px;margin:14px auto 0;font-size:11px;color:#5a6a85;text-align:center;">ScoutMind · scoutmind.app · hello@scoutmind.app</p>
</div>
```

---

## 3. Change email address

**Subject**

```
Confirm your new ScoutMind email · Confirme seu novo e-mail
```

**Message body**

```html
<div style="background:#07090f;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0d1117;border:1px solid #1a2540;border-radius:12px;padding:28px 24px;color:#edf2f7;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#00e5a0;margin-bottom:18px;">SCOUT<span style="color:#edf2f7;">MIND</span></div>
    {{ if eq .Data.lang "pt-BR" }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Confirme a troca do e-mail da sua conta para este endereço.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Confirmar novo e-mail</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">Se não foi você, escreva para hello@scoutmind.app.</p>
    {{ else }}
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Confirm changing your account's email to this address.</p>
    <p style="margin:0 0 22px;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#00e5a0;color:#000;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Confirm new email</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:0;">If it wasn't you, write to hello@scoutmind.app.</p>
    {{ end }}
  </div>
  <p style="max-width:480px;margin:14px auto 0;font-size:11px;color:#5a6a85;text-align:center;">ScoutMind · scoutmind.app · hello@scoutmind.app</p>
</div>
```

---

**If a template branch does not render** (the email shows raw `{{ if ... }}`
text, or always English for a Portuguese sign-up), replace the body with the
English and Portuguese paragraphs one after the other, no `if`. The template
language is Go's `text/template`; `.Data` is `user_metadata`.
