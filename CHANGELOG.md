# Changelog

Every issue we find and how it was fixed, newest first. Changes wait under
**Unreleased** until they ship together in the next version.

## Unreleased

### Added
- **One-person mode.** Leave the second name empty in Settings and the app
  is for one person: no Combined or per-person tabs, no owner column, and
  the trade form no longer asks whose trade it is. Type a second name to
  switch back. New installs start as one person, named "Me". If the second
  person still has trades, the two-person view stays so nothing is hidden.
- **A real Mac app.** **Taiwan Stock Tracker** now opens in its own window,
  with the red seal in the Dock and no browser tabs or Terminal window.
  Quitting the app (⌘Q) stops the tracker too. Start Tracker still works
  and opens the tracker in the browser, as before.

### Issues fixed
- **The app was hard to find after installing.** The installer put it in
  the Applications folder inside your home folder, not the main
  Applications folder where people look, and it didn't appear in Launchpad
  or Spotlight. The installer now adds **Taiwan Stock Tracker**, with the
  red seal icon, to the main Applications folder.
- **The app looked like a website.** Opening it showed the tracker in a
  browser tab. It now has its own window (see Added).
- **Building the app on each Mac was unreliable.** Apple's developer tools
  can be out of step with each other (on one Mac the Swift compiler
  couldn't read its own macOS SDK), so the app is now built once for each
  release, for both Apple Silicon and Intel Macs, instead of on every Mac.

### Changed
- Updates now also bring the newest changelog and app icon.
- The install line only adds the Mac app when the release includes it, so
  it keeps working the old way with releases from before the app existed.

### Known issues
- **Gray icon in the Clear and Tinted Dock styles.** macOS can only show
  an icon as see-through glass when it's made with Apple's Icon Composer
  and Xcode. Ours is a single picture, so in those styles macOS turns it
  into a plain gray square. Planned fix: rebuild the icon with Xcode.

## 1.0.2 (2026-11-25)

### Issues fixed
- **Opening the app twice showed an error.** Double-clicking Start Tracker
  while the app was already running said "Could not start". It now opens
  the page again instead, and only shows an error when a different program
  is using the app's address.
- **Opening Try Demo twice could reset the open demo.** The sample trades
  are now restored only after the demo has started.

## 1.0.1 (2026-11-25)

### Added
- The red seal logo with 台, in the browser tab, next to the title and on
  the project page.

## 1.0.0 (2026-11-25)

First public release.

### Issues fixed before release
- **New users would have started with someone else's names.** The default
  names are now "Person 1" and "Person 2", set in Settings.
- **Older Macs couldn't run the app.** The app needed Python 3.9; it now
  works with 3.8, which older Macs have.
- **Downloaded files triggered the macOS "unknown developer" warning.**
  Added the one-line Terminal installer, which avoids it. The README
  explains the Open Anyway step for the zip download.
- **Nobody would find out about new versions.** Added one-click updates
  from GitHub releases that replace only the app's own files.
