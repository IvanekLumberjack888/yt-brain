"""
brain/gmail_brief.py – Gmail daily digest pro AIVOS ranní brief
Používá IMAP + App Password (bez OAuth složitosti)
"""
import imaplib
import email
import os
from datetime import date, timedelta
from email.header import decode_header as _dh
import google.generativeai as genai

GMAIL_USER         = os.environ.get("GMAIL_USER", "ivousd@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

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
    """Dekóduje email header."""
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
    """Fetchne emaily z posledních 24h přes IMAP."""
    if not GMAIL_APP_PASSWORD:
        print("  ℹ️ GMAIL_APP_PASSWORD není nastaven – přeskakuji Gmail sekci.")
        return []

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        mail.select("inbox")

        since = (date.today() - timedelta(days=1)).strftime("%d-%b-%Y")
        _, ids = mail.search(None, f"SINCE {since}")

        msg_ids = ids[0].split()
        if not msg_ids:
            mail.logout()
            return []

        # Vezmi posledních max_emails (nejnovější)
        msg_ids = msg_ids[-max_emails:]

        # Ignorovat odesílatele
        SKIP_SENDERS = [
            "noreply@skool.com", "notifications@github.com",
            "no-reply@accounts.google.com", "no-reply@vercel.com",
            "noreply@medium.com", "digest@medium.com",
        ]

        results = []
        for mid in reversed(msg_ids):  # nejnovější první
            try:
                _, data = mail.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])

                sender  = _decode(msg.get("From", ""))
                subject = _decode(msg.get("Subject", ""))

                # Skip bulk senders
                if any(s in sender.lower() for s in SKIP_SENDERS):
                    continue

                # Tělo emailu
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
    except Exception as e:
        print(f"  ⚠️ Gmail IMAP error: {e}")
        return []


def generate_gmail_section(model) -> str:
    """
    Vrátí čistý text pro TTS – Gmail sekci ranního brefu.
    Pokud není App Password nebo žádné emaily → prázdný string.
    """
    emails = fetch_emails()
    if not emails:
        return ""

    emails_text = "\n\n".join(
        f"Od: {e['sender']}\nPředmět: {e['subject']}\nObsah: {e['body']}"
        for e in emails
    )

    try:
        result = model.generate_content(
            GMAIL_PROMPT.format(emails_text=emails_text)
        ).text.strip()
        print(f"  ✅ Gmail brief vygenerován ({len(result)} znaků)")
        return result
    except Exception as e:
        print(f"  ⚠️ Gmail Gemini error: {e}")
        n = len(emails)
        return f"Dnes ti přišlo {n} emailů. Podívej se do inboxu až budeš mít chvilku."
