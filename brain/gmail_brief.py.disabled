"""
brain/gmail_brief.py – Gmail daily digest pro AIVOS ranní brief
Používá IMAP + App Password (bez OAuth složitosti)
"""
import imaplib
import email
import os
import time
import socket
from datetime import date, timedelta
from email.header import decode_header as _dh
import google.generativeai as genai

GMAIL_USER         = os.environ.get("GMAIL_USER", "ivousd@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
IMAP_TIMEOUT       = 20  # seconds

GMAIL_PROMPT = """Jsi osobní asistent Iva (Junior Data Engineer, ADHD-PI, INTJ).
Analyzuj dnešní emaily a vytvoř stručný přehled pro ranní poslech v autě.
Mluv česky, přátelsky ale věcně. Max 2-3 minuty čteného textu.

Kategorie:
🔴 AKCE: emaily které vyžadují odpověď nebo akci dnes
🟡 PŘEČÍST: zajímavé newslettery, info k přečtení odpoledne
🟢 INFO: potvrzení, receipty (zmínit jednou větou nebo přeskočit)

Pro každý 🔴 email: kdo to je, co chce, jak rychle reagovat
Pro každý 🟡 email: téma, proč by ho Ivo zajímal
Spam, Skool notifikace, bulk promo: úplně ignoruj

Emaily za posledních 24 hodin:
{emails_text}

DŮLEŽITÉ: výstup je čistý text pro text-to-speech. Žádný markdown, žádné hvězdičky,
žádné emoji v textu – jen slova. Říkej "červená priorita" nebo "k přečtení" místo emoji.
"""


def _decode(value: str) -> str:
    try:
        parts = _dh(value or "")
        out = []
        for part, charset in parts:
            if isinstance(part, bytes):
                out.append(part.decode(charset or "utf-8", errors="ignore"))
            else:
                out.append(str(part))
        return " ".join(out).strip()
    except Exception:
        return str(value or "")


def fetch_emails(max_emails: int = 25) -> list[dict]:
    if not GMAIL_APP_PASSWORD:
        print("  ℹ️ GMAIL_APP_PASSWORD není nastaven – přeskakuji Gmail sekci.")
        return []

    try:
        # Nastav socket timeout před připojením
        socket.setdefaulttimeout(IMAP_TIMEOUT)

        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        mail.select("inbox")

        since = (date.today() - timedelta(days=1)).strftime("%d-%b-%Y")
        _, ids = mail.search(None, f"SINCE {since}")

        msg_ids = ids[0].split()
        if not msg_ids:
            mail.logout()
            return []

        msg_ids = msg_ids[-max_emails:]

        SKIP_SENDERS = [
            "noreply@skool.com", "notifications@github.com",
            "no-reply@accounts.google.com", "no-reply@vercel.com",
            "noreply@medium.com", "digest@medium.com",
        ]

        results = []
        for mid in reversed(msg_ids):
            try:
                _, data = mail.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])

                sender  = _decode(msg.get("From", ""))
                subject = _decode(msg.get("Subject", ""))

                if any(s in sender.lower() for s in SKIP_SENDERS):
                    continue

                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        ct = part.get_content_type()
                        if ct == "text/plain":
                            try:
                                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")[:400]
                                break
                            except Exception:
                                pass
                else:
                    try:
                        body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")[:400]
                    except Exception:
                        pass

                results.append({
                    "sender":  sender[:80],
                    "subject": subject[:100],
                    "body":    body[:300].strip(),
                })
            except Exception as e:
                print(f"  ⚠️ Email parse error: {e}")
                continue

        mail.logout()
        print(f"  📬 Gmail: {len(results)} emailů načteno")
        return results

    except imaplib.IMAP4.error as e:
        print(f"  ⚠️ Gmail auth error: {e}")
        return []
    except socket.timeout:
        print(f"  ⚠️ Gmail IMAP timeout po {IMAP_TIMEOUT}s – přeskakuji")
        return []
    except Exception as e:
        print(f"  ⚠️ Gmail IMAP error: {e}")
        return []
    finally:
        # Reset socket timeout na default
        socket.setdefaulttimeout(None)


def generate_gmail_section(model=None) -> str:
    emails = fetch_emails()
    if not emails:
        return ""

    emails_text = "\n\n".join(
        f"Od: {e['sender']}\nPředmět: {e['subject']}\nObsah: {e['body']}"
        for e in emails
    )

    prompt = GMAIL_PROMPT.format(emails_text=emails_text)
    models_to_try = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash-8b-latest"]

    for model_name in models_to_try:
        for attempt in range(3):
            try:
                m = genai.GenerativeModel(model_name)
                result = m.generate_content(prompt).text.strip()
                print(f"  ✅ Gmail brief vygenerován ({len(result)} znaků) [{model_name}]")
                return result
            except Exception as e:
                if "429" in str(e):
                    if attempt < 2:
                        wait = (attempt + 1) * 20
                        print(f"  ⏳ Rate limit ({model_name}), čekám {wait}s...")
                        time.sleep(wait)
                    else:
                        print(f"  ⚠️ {model_name} rate limit vyčerpán, zkouším další model...")
                        break
                else:
                    print(f"  ⚠️ Gmail Gemini error ({model_name}): {e}")
                    break

    n = len(emails)
    return f"Dnes ti přišlo {n} emailů. Podívej se do inboxu až budeš mít chvilku."
