# Gmail and Google Calendar

Two of the agents in this repo work on your Google account:

- **Tomay** (`agents/tomay`) reads today's calendar every weekday at 7:00 and writes a prep note for each meeting from your recent email with the people in it, plus your free blocks. It only reads.
- **Bea** (`agents/bea`) files the last day's mail under four labels at 7:15 and drafts replies to what needs one. Every draft waits for your approval, and she has no way to send.

They talk to Google through `packages/mcp-google`, Garu's own Gmail and Calendar server. Google needs to know who is asking, so you make a free Google Cloud project once. It takes about fifteen minutes and costs nothing: no billing account, no card.

## What Garu asks Google for

| Agent | Permission | What it allows |
|---|---|---|
| Tomay | `calendar.calendarlist.readonly`, `calendar.events.readonly` | see your calendars and their events |
| Tomay | `gmail.readonly` | read your mail |
| Bea | `gmail.modify` | read, label and draft. Google describes it as "read, compose and send"; it is the only permission that allows labeling. Garu's server has no send tool, so Bea can't send. |

Each set of permissions is its own sign-in, so Tomay never holds a token that can write.

## 1. Create a project

Open [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate), name it `Garu` and press **Create**. "No organization" is normal for a personal account. You can ignore the free-trial banner; nothing here needs billing.

When it's created, pick **Garu** in the project picker at the top. Every step below happens inside it.

## 2. Turn on the two APIs

Open each of these and press **Enable**:

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) (not "CalDAV API")

It worked when the page shows a **Disable API** button.

## 3. Set up the sign-in screen

Search for **Google Auth Platform** in the console (or **APIs & Services → OAuth consent screen**) and press **Get started**:

1. **App information:** app name `Garu`, your email as the support email.
2. **Audience:** **External** ("Internal" is only for Workspace organizations).
3. **Contact information:** your email.
4. Agree to Google's user data policy and press **Create**.

Then open **Audience** in the left menu:

- Leave **Publishing status** on **Testing**. Don't publish.
- Under **Test users**, press **Add users** and add the Gmail address the agents should read. Only test users can sign in.

## 4. Create the client

Open **Clients → Create client**:

- **Application type: Desktop app.** Garu signs in through your own computer (`127.0.0.1`), which is what the Desktop type is for. Google's own guides show "Web application"; that is for apps hosted on a website.
- **Name:** anything, e.g. `Garu on my Mac`.
- If Google shows a box **Use this client for an AI-powered agent**, tick it. Garu was tested with it ticked, and Google's own Workspace MCP servers only accept clients marked this way.

Press **Create**. Before you close the window that follows, press **Download JSON**: Google shows the client secret only once.

## 5. Put the client in `.env`

From the downloaded file, copy `client_id` and `client_secret` into `.env` at the repo root (it's gitignored):

```sh
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Copy them from the file rather than retyping them from the screen: `l`, `I` and `1` look alike, and one wrong character makes Google refuse the sign-in without saying why. Then keep the JSON file somewhere private, or delete it.

## 6. Sign in, three times

```sh
npm run garu -- auth agents/tomay/Garufile.yaml calendar
npm run garu -- auth agents/tomay/Garufile.yaml gmail
npm run garu -- auth agents/bea/Garufile.yaml gmail
```

Each one opens your default browser:

1. Choose the account you added as a test user.
2. Google says **Google hasn't verified this app**. That's expected for your own app in Testing: press **Continue** (or **Advanced → Go to Garu (unsafe)**).
3. Check the permissions match the table above, tick them and press **Continue**.
4. The page says **Signed in**. Close it.

`npm run garu -- validate agents/bea/Garufile.yaml` shows `signed in` next to each server when it's done.

## 7. Make Bea's labels

In Gmail, press **+** next to **Labels** and create `Garu`. Then create four more, each with **Nest label under: Garu**: `Needs reply`, `FYI`, `Receipts`, `Newsletters`. Bea only adds your own labels; she can't create them, and she never touches Inbox, Spam or Trash.

## 8. Try them

Open the control room (`npm run garu -- ui --up`), go to **Agents**, and press **Run now** on Tomay, then on Bea. Tomay writes today's brief to `agents/tomay/briefs/`. Bea files the last day's mail, and any draft she writes appears in **Inbox** for you to approve or decline with a note. An approved draft goes to Gmail's **Drafts**; it is never sent.

If you run Garu as a login service, restart it so the schedules pick the agents up: `npm run garu -- service restart`.

## Good to know

- **The sign-in lasts 7 days in Testing.** Google expires it for apps that aren't published, because Gmail access is sensitive. The agent then shows **needs sign-in**; run its `garu auth` command again.
- **Your email goes to the model you chose.** The text of the threads the agents read is sent to the model in their Garufile (Gemini by default). A local model through Ollama keeps it on your machine.
- **Tokens stay on your computer**, in `.garu/auth/` (gitignored). `garu auth <Garufile> <server> --forget` removes one, and you can revoke Garu's access at any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Google's own Gmail and Calendar MCP servers** answer only projects enrolled in the Google Workspace Developer Preview Program. Garu's server uses the regular APIs instead, so it works with a personal account today.
