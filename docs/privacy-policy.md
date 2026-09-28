# RecallLater privacy policy

_Last updated: 29 September 2026_

RecallLater turns things you share with it (screenshots, PDFs, messages, links) into reminders.
It is built to work entirely on your phone.

## What stays on your phone

Everything you save: the items, their details, the files you shared, your reminders and your
settings. They are stored in the app's private storage and are not uploaded anywhere. The app
has no account, no sign-in, no analytics, no advertising and no crash reporting.

Text is read from images and PDFs on the device (Google ML Kit on Android, Apple Vision on
iOS). Links you share are stored as text; the app does not open them to fetch a preview.

On iOS, the app's database and files are excluded from iCloud backup. On Android, system
backup is turned off for the app.

## What can leave your phone, and only if you choose

- **AI understanding (optional, off unless you turn it on).** When you use it, only the
  _text_ read from the item is sent, never the image or file, and phone numbers, email
  addresses, card numbers, Aadhaar and PAN numbers, and labelled account or customer numbers
  are removed first. The text goes to our server, which
  forwards it to OpenAI to suggest the item's type, title, dates and amounts, and does not
  store it. OpenAI's API data policy applies to that request. Every answer is checked against
  the original text on your phone before it is shown.
- **Backups you export.** "Back up to a file" creates one file and opens your phone's share
  sheet; you decide where it goes. You can protect it with a passphrase (AES-256 encryption);
  without one, anyone with the file can read it.
- **Calendar.** "Add to calendar" opens your calendar app with the event filled in; you save it.

## Permissions

| Permission | When it's asked | Why |
|---|---|---|
| Notifications | When you first set a reminder | To remind you |
| Camera | When you tap "Take a photo" | To photograph a paper bill or ticket |
| Fingerprint / face / screen lock | When you turn on App lock | To unlock the app |

The app never asks for your photo library, contacts, location, microphone or files; the system
pickers show you your photos and files, and the app only sees what you pick.

## Deleting your data

Settings → Delete all data removes every item, file and reminder from the phone. Uninstalling
the app removes everything too.

## Children

RecallLater is not directed at children under 13.

## Contact

Questions: srbmaury@gmail.com
