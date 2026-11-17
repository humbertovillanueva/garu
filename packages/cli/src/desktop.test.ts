import { describe, expect, it } from "vitest";
import { desktopNotifyEnabled, notificationCommand } from "./desktop.js";

describe("desktop notifications", () => {
  it("builds the macOS and Linux commands, escaping what AppleScript would trip on", () => {
    expect(notificationCommand("Garu: approval needed (bea)", 'bea wants gmail.create_draft\nreason: a "draft" in your name', "darwin")).toEqual({
      cmd: "osascript",
      args: ["-e", 'display notification "bea wants gmail.create_draft reason: a \\"draft\\" in your name" with title "Garu: approval needed (bea)"'],
    });
    expect(notificationCommand("t", "b", "linux")).toEqual({ cmd: "notify-send", args: ["--app-name=Garu", "t", "b"] });
    expect(notificationCommand("t", "b", "win32")).toBeNull();
  });
  it("is on unless GARU_DESKTOP_NOTIFY=0", () => {
    expect(desktopNotifyEnabled({})).toBe(true);
    expect(desktopNotifyEnabled({ GARU_DESKTOP_NOTIFY: "0" })).toBe(false);
  });
});
