# Local content drafts

Entry and configuration editors save unsaved content to IndexedDB on the current device after a short debounce. Existing entries restore content and the original file SHA on reload. New entries retain content and filename, with separate draft identities for independently opened new entries. Drafts are scoped to the signed-in account, repository provider, repository, branch, and entry or creation directory.

The loading status clears when the local lookup finishes without a draft; a clean editor shows no draft status or empty status gap. Routine draft feedback appears beside Save (or Create entry): a muted pencil icon is shown only while local changes exist and persistence has completed. Its accessible label and tooltip are “Unsaved changes”, referring to changes not yet committed to GitHub; the tooltip is available on hover or keyboard focus. New typing clears the acknowledgement until persisted again. Clean editors and initial draft checks show no routine message; remote saving uses the action button. Recovery errors and download/discard actions remain above the form. No toast or dismissal timer is used for routine local saves. Keep the tab open if local storage fails. Resolve the storage error or download the draft before leaving; operations that must flush the draft stop when persistence fails. A configuration mismatch retains the draft and offers download/discard recovery and blocks saving until the draft is discarded or the previous configuration is restored. Concurrent local writes use revision checks and report a conflict rather than overwriting another tab's draft.

Repository Overview lists resumable drafts, recently opened entries, configured collection create shortcuts, and fixed-file edit shortcuts. Recent visits retain at most 50 records per account, provider, owner, repository and branch when an entry is opened; Overview shows the latest 10 for that scope. Repeat visits update the same entry. Pruning visit records never removes drafts. Both drafts and visits remain local to this browser/device. Discarding a listed draft asks for confirmation and checks its local revision.

Custom messages are optional: enable `settings.commit.allowCustomMessage`, or override it with `commit.allowCustomMessage` on a content definition. Canceling the message dialog does not write to GitHub.

Save uses the normal single-file GitHub Contents API. A restored draft whose remote file changed is rejected by its original file SHA. Existing entries remain editable while saving. The submitted snapshot is the one being committed; later edits remain unsaved in the draft. Successful saves update its baseline and file SHA, immediately persist newer edits with that SHA, and clear the draft only when it matches the committed content. One operation may run per file at a time, with no automatic retry or queue.

Navigation within the app flushes the latest draft before leaving. The operation continues after its editor unmounts, and reopening the entry shows the same pending save and current edits. A failed operation retains the draft and reports the error. Canonical entry data is returned only when read access is allowed; a read-permission failure after committing does not fail or repeat the write. Confirmed entry data updates the query cache immediately; collection refreshes run in the background and do not extend the save or turn a successful write into a failure.

Closing or reloading the tab can interrupt an in-flight request. Before saving, the draft records the submitted snapshot locally. On reload, a fresh remote file value matching that snapshot at a changed SHA proves it committed and permits rebasing newer edits. Otherwise the original SHA remains in effect and normal conflict protection applies. No server save journal, automatic write retry, or batch commit is used.

Create shows a pending collection row without an entry link until the real path is confirmed. Background creation updates the collection without redirecting a user who already left. Rename displays its proposed filename while retaining the confirmed path; after success it migrates the draft and recent-entry link to the new path. Delete removes its row while pending and restores it on failure. Its confirmation warns about unsaved changes. Rename and delete change local recovery data only after GitHub succeeds and only if its revision still matches. Drafts changed in another tab are retained for download from Overview.

Media uploads occur immediately through the existing upload flow. Drafts contain permanent media references, not pending binary files. Content and media use separate commits. Local drafts are not shared or synchronized across devices. Folder rename and a save-first colocated-media policy are tracked in TODO.

Configuration uses the same draft session and navigation flush as entries, with a separate draft identity for `.pages.yml`. It remains editable while saving; later edits keep the confirmed file SHA. Invalid YAML stays in the local draft and cannot be saved remotely. Configuration changes refresh workspace data in the background after confirmation.

Media browsing remains usable during uploads and file operations. Pending upload/folder rows cannot be selected or opened; rename retains the confirmed path until the response arrives. Pending delete and move overlays affect only their own file, so failure restores that row without undoing other confirmed operations. Confirmed uploads update the directory one file at a time, and partial failures retain successful uploads. Upload files are held only while their request runs, not in IndexedDB. The existing direct-upload confirmation retry remains unchanged; ordinary media mutations do not retry automatically.

Workflow dispatch, cancel/rerun, branch creation, collaborator changes and cache management keep their completion callbacks after navigation. They update confirmed data and refresh in the background. Workflow statuses and collaborator membership are never invented before the server confirms them. Closing a pending dispatch or branch dialog lets the request continue; branch creation redirects only if its original dialog and page are still active. Content, configuration and media writes share a physical-path guard within the current query client. Server file versions remain the conflict protection across tabs and users.

Changing the signed-in account stops remaining upload initiations, transfers and confirmations in a batch; an already submitted request can still finish. Upload progress from the old account is dismissed. Field upload completion merges into the latest selection and callback, preserving intervening edits, and does not modify an editor field after it unmounts. Successfully uploaded assets remain available in Media.

Draft-backed writes remain bound to the account that opened their draft session. They check the current account before and after local persistence, before sending the request. Completion effects recheck the account after asynchronous work; the original account's recovery record is still acknowledged after its confirmed commit. Branch creation redirects only through the still-mounted originating dialog, including when browser history leaves and returns to the same URL. Media lease refreshes affect only the folders touched by the operation.

## Content icons

Collections and fixed files can set an optional `icon` using a Lucide name in kebab-case:

```yaml
content:
  - name: posts
    type: collection
    path: content/posts
    icon: newspaper
  - name: home
    type: file
    path: content/home.md
    icon: house
```

The sidebar and Overview shortcuts use the configured icon. Defaults remain visible while loading and for unknown names or failed loads. The local catalogue lookup and selected icon modules load on demand only when a configured icon is used; no external icon service or full icon picker is loaded by Overview.
