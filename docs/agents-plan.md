# The Google agents: Tomay and Bea

Garu's two real chores run on Gmail and Google Calendar through Garu's own MCP server
(`packages/mcp-google`), on Google's regular APIs. Google's hosted Gmail and Calendar MCP servers
need the Workspace Developer Preview, which a personal account can't join today; the tool names
are the same as theirs, so the policies would carry over if that changes.

- **Tomay** (`agents/tomay/Garufile.yaml`), weekdays 7:00: reads today's calendar, writes a prep
  note per meeting from recent email with the attendees, lists free blocks. Read-only scopes; its
  one write is `briefs/<date>.md`; it posts nothing.
- **Bea** (`agents/bea/Garufile.yaml`), weekdays 7:15: files new threads under the Gmail labels
  Garu/Needs reply, Garu/FYI, Garu/Receipts, Garu/Newsletters (create them once, nested under
  Garu) and drafts replies. Labeling is `allow`; a draft is `ask`; a draft to an automated
  address is blocked by rule and refused by the server; nothing can send, because no send tool
  exists. She needs `gmail.modify`, the one scope that allows labeling.

Learned on real mail: file in batches (`label_thread` takes many thread ids); automated senders
(noreply@, notifications@, a `notification.` domain, mailing lists) are Newsletters or FYI and
never get a draft; bank, card and account alerts are FYI; a model may write "\n" as two
characters, so the server fixes line breaks before saving a draft.

Setup for anyone cloning: `docs/google.md` (a Cloud project, the Gmail and Calendar APIs, a
consent screen in Testing, a Desktop OAuth client, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
in `.env`, then `garu auth`). In Testing mode Google expires the sign-in every 7 days; the agent
then shows "needs sign-in". Email text goes to the model; a local model keeps it on the machine.
