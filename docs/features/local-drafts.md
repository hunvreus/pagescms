# Local content drafts

Entry and configuration editors keep unsaved work in IndexedDB on the current
browser/device. Drafts are not shared across devices. They retain content, the
original file SHA and original values; new-entry drafts also retain the filename.
Independent new entries have separate identities.

## Persistence and recovery

Editing waits for the local lookup. The Draft badge shows the last successful
local save and offers download or confirmed discard. Discard restores the latest
loaded or confirmed baseline without writing to the repository. Failed discards
retain the draft and can be retried. Local persistence does not produce a toast.

Writes are debounced and revision-checked. Another tab's changes cause a conflict
rather than being overwritten. Keep the tab open when local storage fails;
operations that require a successful flush stop on failure.

A changed field schema or root value shape (object versus list) retains the old
draft and blocks editing/saving until the previous configuration is restored or
the draft is explicitly discarded. Downloads preserve the original stored schema
and values. Recovery still
needs a separate view when the remote file or schema cannot load; see
[TODO](../../TODO.md).

Warm draft lookups cache at most 50 snapshots for 15 minutes, including absence.
Writes/discards update them; moves, deletions, cross-tab messages and focus
invalidate affected snapshots. This cache does not replace the editor's current
baseline. Overview's local work lists and loaded history pages also survive
navigation, refreshing when local data or confirmed content changes.

## Saving and navigation

Ordinary saves use one GitHub Contents API write with the original file SHA and
no preflight read. Existing entries remain editable while saving: the submitted
snapshot is committed, and later edits remain in the draft with the confirmed
SHA. A matching draft is cleared. Only one operation per file runs at a time;
ordinary writes have no automatic retry or queue.

Navigation flushes the draft before leaving. A pending operation survives editor
unmounting, and reopening shows its current state. Save/Create labels remain
stable with a spinner. Optional commit messages require
`settings.commit.allowCustomMessage` or the content-level override; cancelling
the prompt performs no remote write.

Before sending a save, the session stores the submitted snapshot. After an
interrupted request, a fresh remote value matching that snapshot at a changed SHA
proves the commit succeeded and allows newer edits to be rebased. Otherwise the
original SHA and normal conflict protection remain in effect.

Confirmed writes update cached entry data and refresh collections in the
background. Failed refreshes or loss of read access after committing do not repeat
the write. Configuration uses the same session behavior with a separate identity
for `.pages.yml`; invalid YAML stays local and cannot be saved remotely.

## Concurrent changes

A stale SHA opens a comparison of original, local and freshly fetched values.
Disjoint plain-object fields combine automatically, including nested fields.
Conflicting fields require a choice. Lists, polymorphic blocks, rich text and raw
source remain whole values. Replacing/deleting an object conflicts with edits
inside it. There is no list-item or text-level merge.

The dialog shows “Your changes” and “Latest saved version” using read-only field
controls, with configured labels and nested breadcrumbs. Columns stack on narrow
viewports; radio choices support keyboard use. Lists cannot be edited or reordered
inside the comparison. “Use all my changes” selects local values only for
conflicts; disjoint changes still combine.

“Save changes” rebases and saves against the latest SHA without another message
prompt. An unchanged result needs no write. Another intervening save requires a
fresh review. Failed saves retain choices for retry; cancelling before saving
keeps the original draft. Local changes made during review require reopening it.
Failed reads and
configuration changes never bypass access or version checks.

## Overview and operations

Overview shows quick links, [Activity](./activity.md), Drafts and Recently visited.
Each work list starts with five rows and expands independently in groups of five.
Visits retain at most 50 entries per account/repository/branch; drafts are never
pruned by visit or display limits. Draft rows resume editing; download and discard
live in the editor. Configuration drafts remain recoverable, but configuration,
media and administration visits do not populate Recently visited.

Fixed-file titles use their configured label/name; collection entries use their
primary value or filename. Media quick links upload directly to the configured
root and retain successful uploads after partial failure. Missing configuration
shows a text-only setup prompt and preserves existing drafts/activity. Cache
controls remain opt-in.

Creation shows a pending row until its real path is confirmed and does not
redirect a user who left. Rename retains the confirmed path while pending, then
moves draft/visit links after success. Delete restores its row on failure. Both
change local recovery data only after GitHub succeeds and the local revision
still matches. Media uploads happen immediately in separate commits; drafts
contain permanent references, not binary uploads. Folder rename and a save-first
colocated-media policy remain in TODO.

Other mutations retain completion callbacks after navigation. Status and
membership data become canonical only after confirmation. Account changes stop
remaining upload work and suppress stale UI effects; already submitted requests
can finish. Draft writes stay bound to their original account, checked around
persistence and before submission. A confirmed commit still acknowledges that
account's recovery record. Content, configuration and media share a client-side
physical-path guard; server file versions protect across tabs and users.

Save, create, rename, delete and conflict-apply failures use one action notification and retain recoverable drafts. Conflict-review read failures stay inside the review dialog and clear when it closes or recovery succeeds. If a write commits but local draft cleanup or relocation fails, the notification explains that the write completed and that recovery data was retained; it does not also announce success or offer to repeat the write. A conflict-review save closes after a known committed write even if updating its local view fails.

## Identity and icons

Drafts and visits use account, forge instance, stable repository ID, branch and
entry identity. Renames refresh links without losing local content. Transfers
retain drafts but still require current access. Branch/file reconciliation is
separate. Signing out or losing connectivity keeps drafts. Confirmed account
deletion removes only that account's local data; missing sessions alone never
authorize cleanup. See [account deletion](../development/authentication.md#account-changes-and-deletion).

Project history separately retains five recent repositories/latest branches,
deduplicated by known identity. It displays repository names and owner avatars,
never opens a project automatically, and falls back to available accounts when
browser storage is unavailable.

Collections, fixed files, and media libraries accept a Hugeicons `icon`,
such as `News01`, `Home01Icon`, or `Image01`. The `Icon` suffix is optional. Groups, individual media files, and
subfolders do not. Sidebar, shortcuts and parent badges reuse these icons, loaded
on demand with defaults for missing/unknown names. Media libraries and folders use
Hugeicons Folder02 (the plain open folder) by default; uploaded files keep their file-type icons.

```yaml
media:
  - name: images
    label: Images
    input: public/images
    output: /images
    icon: images
```

## Configuration recovery and editor loading

Configuration keeps a separate page and save service, using the shared code editor,
local drafts and conflict handling. It edits raw `.pages.yml` source, preserving
comments and formatting; normalized cached configuration serves content navigation.
Repository managers with a user token and write access can open the workspace and
repair malformed source. This bootstrap exception does not cache an empty
configuration or allow content operations to bypass parsing. Read-only and delegated
access still fail closed, and provider/database failures remain errors.

Code and rich-text editors show a plain skeleton matching their default minimum
height while their component or draft is loading. Rich text also retains that
shape during editor initialization. Ready editors remain mounted during saves and
validation. Empty configuration shows a placeholder without adding draft content.
