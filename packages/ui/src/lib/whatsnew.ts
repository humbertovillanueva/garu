/**
 * What's new: what the last release brought, in plain words, shown once on the phone after an update
 * (Home, until "Got it"), and again from Settings. One entry per release, newest first; the id is
 * what the phone remembers having seen, so bump it with every release that deserves a word.
 */
import { t } from "./i18n.svelte";

export interface Release {
  /** Bump with each release: the phone shows the card when it hasn't seen this id. */
  id: string;
  /** The version as the stores show it. */
  version: string;
  /** The lines, in the reader's language. */
  lines: () => string[];
}

export const RELEASES: Release[] = [
  {
    id: "build-5",
    version: "0.1.0 (5)",
    lines: () => [
      t("Each agent keeps a notebook you can read, add to and edit on its page."),
      t("The faces move: Bea hovers, tick plods, Tomay breathes, nudge hops; an agent at work breathes and one waiting on you knocks."),
      t("Swipe a card right to approve, left to decline. Or tap Edit, fix the draft, and approve your version."),
      t("The app's icon shows how many asks wait for you."),
      t("A run's page says why it did that: what went through on its own, what asked you, what was blocked, what stopped it."),
      t("An ask waits a day for you instead of half an hour; the run parks meanwhile and picks up when you answer."),
      t("A run's timeline says when your computer was asleep, when a run started late, how long it waited for you, and what an agent remembered or asked."),
      t("Two openers above an agent's message box, from its own job; Home greets you by name."),
    ],
  },
];

export const latest = RELEASES[0]!;
