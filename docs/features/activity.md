# Repository activity

Overview uses the same narrow single column as the editor, with Quick links first, Activity second and Drafts and Recently visited lists below. Each event begins with a small 24-pixel action icon in a rounded secondary badge. Markers describe the action: Pencil for edits and updates, Plus for additions, Trash2 for deletion or removal, Upload for uploads, ArrowRightLeft for renames, UserPlus for invitations and Zap (a lightning bolt) for runs. The action subject retains its Play icon. A vertical line connects the markers and stops at the last event. The sentence retains the actor's full name, an explicit action and its subject; an unavailable actor is labelled Unknown user. Subjects use regular-foreground icons beside their names. Collection and media destinations use secondary badges with their configured labels and icons. Media subjects reuse the same file-type icons as media fields, including FileImage for images, audio/video, documents, archives, code, fonts and spreadsheets.

Content subjects use their saved primary-field title when captured, or their current cached primary value; fixed files use their configured label, and uncached content or media falls back to its filename. Malformed or missing cache content never triggers a GitHub request. Linked activity subjects underline their text on hover; their icons and destination badges do not. Activity subjects and destination badges have no hover tooltips. Action subjects use the configured action label. Renames include the previous path beneath the sentence. Deleted file subjects are not links. Relative timestamps match the row text at 14px, align right and expose the full date in a tooltip. There are no date groups, day separators, colored event markers or per-event Edit/View buttons.

The feed initially shows five events. Show more adds five without replacing existing events, using ten-event server pages as needed. The left-aligned secondary button matches the work lists and disappears after the final event. Its skeleton has five connected marker rows. The heading uses 16px medium text with 16px below it, matching Drafts and Recently visited, including while loading. Configured repositories with no events show No activity yet. Project changes will appear here. in muted 14px text without extra borders, padding or icons, matching the work-list empty states. Unconfigured repositories omit an empty feed while preserving existing authorized history and errors.

The application retains the latest 50 activity events per repository provider,
owner, repository and branch. These are events: editing one file repeatedly keeps
separate entries, up to the retention limit. The feed starts collecting when this
feature is installed; it does not backfill Git history.

A synthetic 10,000-event SQLite measurement of this schema, including its indexes but before optional profile image URLs were added,
used approximately 480 bytes per event, or 24 KB per 50-event scope. Actual storage
depends on path, actor and repository-name lengths; this is not a production or
throughput measurement.

## Capture and scope

- Successful CMS content/file creation, editing, deletion and rename operations;
  completed media uploads, deletion and rename operations; and configuration saves.
  Media writes are labelled Uploaded rather than guessing creation versus replacement
  when a storage provider does not report that distinction.
- GitHub push changes to configured collections, fixed files, media paths and
  `.pages.yml`. Match configured roots, extensions, exclusions and subfolder rules;
  never require an existing directory snapshot. Internal `.gitkeep` files are omitted.
- Collaborator invitations, immediate access grants, removals and permission changes.
  These use a repository-wide scope with its own 50-event limit. Invitation acceptance
  does not create an activity event. Existing memberships are not backfilled.
- Existing action-run records contribute to the list without a second event copy or
  GitHub status polling. Their existing retention and Actions-page behavior continue.

The merged, authorized feed exposes at most 50 entries. Activity contains paths,
operation kinds, actor names, profile image URLs and timestamps, never entry bodies, media binaries,
workflow inputs, invitation tokens or credentials. Collaborator subjects may contain
their email addresses and are visible only through repository-management checks.

Webhooks use the cached normalized configuration and their supplied commit metadata.
They do not fetch history, file content or credentials just for activity. Changes to
uncached directories are captured once the repository's configuration is known.
Without a configuration snapshot, only configuration-file activity can be identified;
opening the repository initializes that snapshot. Incomplete or missing webhook
deliveries cannot provide a complete audit trail. Fetching a directory never invents
creation or deletion events. New-branch copies do not manufacture activity.

CMS operations snapshot the actor's current profile image and stable application user ID alongside their name. On reads, a single batched lookup by ID supplies the current profile image. IDs remain internal and are not returned in the activity response. Existing action runs reuse their stored user ID and profile image. Name-only legacy rows can reuse an image already attached to an authorized record with that same display name within the feed, only when its known records identify a single stable account. Multiple account IDs sharing a name prevent this fallback. The inferred legacy image is not written back; there is no account lookup by display name or extra GitHub request. The current feed displays action icons and full actor names instead of avatars; profile metadata remains available in stored events. Webhooks use an explicitly supplied author avatar, or the sender avatar only when the author's username matches the sender login.

Successful content saves also retain the primary-field title from their canonical result. Older or externally created events resolve missing titles from one scoped, batched cache read for the current page, after subject read authorization. Only display titles are returned, never cached source or entry bodies. Cache clearing can make an older subject fall back to its filename; it does not remove the activity record or its captured title.

## Deduplication and ordering

Git-backed events use a stable identifier derived from provider, repository, branch,
commit and path. CMS metadata takes precedence over its matching webhook event.
A CMS rename records old and new paths and replaces the webhook's corresponding
delete/add pair in either delivery order. An external rename remains delete/add
unless explicitly established; matching names or contents are not guessed.

Commit timestamps order Git-backed changes. CMS operations without a supplied
commit timestamp use their completion time. Late events cannot evict newer entries
merely because they arrived later. Inserts, rename reconciliation and indexed pruning
run in an atomic SQLite/D1 batch. Media uploads with no Git revision deduplicate
using their upload idempotency key or completion ticket, hashed into the event ID.

Activity is separate from cache state. Cache clearing does not erase it. Current
client query caches are separated by signed-in user, and successful mutations
invalidate activity without refreshing unrelated editors or media leases. Current
configuration and read permissions are checked again when listing events, including
both paths of a rename. Changes to no-longer-configured content are hidden rather
than described as deletions. Access-policy failures fail closed.

Action activity requires `action.read` and access to the run's content or media
context for every principal, including collaborators. Viewing these records does

Capture failures are logged as structured `activity_capture_failed` or
`activity_webhook_capture_failed` events. A reporting failure cannot turn a completed
GitHub write into a retryable save failure. No production throughput claim follows
from the local SQLite/D1 conformance tests; mixed remote D1 load testing remains a
release gate.

`recordActivity` is the shared capture point for future event subscriptions.
Notification subscriptions, queue delivery and an outbox are not implemented.
Reliable delivery must persist pending publication atomically with the event, retry
queue publication and deduplicate consumers by event ID. Feed pruning must remain
independent of pending notifications; retaining 50 rows is not a delivery guarantee.

Membership services own collaborator event capture, including bulk removals and revocation webhooks. The generic operation observer must not record these events again.
