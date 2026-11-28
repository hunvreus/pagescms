// Canonical app-owned diagnostics. English wire messages and technical provider details stay stable.
import { msg } from '@lingui/core/macro'
import type { ErrorTranslation } from './errors'

export const errors: readonly ErrorTranslation[] = [
  {
    source: 'The repository identity changed. Reload before continuing.',
    message: msg({
      message: 'The repository identity changed. Reload before continuing.',
    }),
  },
  {
    source: 'GitHub credentials could not be decrypted. Reconnect GitHub.',
    message: msg({
      id: 'core.error.oauth-credential-decrypt',
      message: 'GitHub credentials could not be decrypted. Reconnect GitHub.',
    }),
  },
  {
    source: 'Too many sign-in emails; try again later',
    message: msg({
      id: 'core.error.login-email-limit',
      message: 'Too many sign-in emails; try again later',
    }),
  },
  {
    source: 'The invitation was revoked',
    message: msg({
      id: 'core.error.invitation-revoked',
      message: 'The invitation was revoked',
    }),
  },
  {
    source: '“{value0}” succeeded',
    message: msg({ message: '“{value0}” succeeded' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ succeeded$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” failed',
    message: msg({ message: '“{value0}” failed' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ failed$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” was cancelled',
    message: msg({ message: '“{value0}” was cancelled' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ was\\ cancelled$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” timed out',
    message: msg({ message: '“{value0}” timed out' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ timed\\ out$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” was skipped',
    message: msg({ message: '“{value0}” was skipped' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ was\\ skipped$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” failed to start',
    message: msg({ message: '“{value0}” failed to start' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ failed\\ to\\ start$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” needs attention',
    message: msg({ message: '“{value0}” needs attention' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ needs\\ attention$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” became stale',
    message: msg({ message: '“{value0}” became stale' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ became\\ stale$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” completed',
    message: msg({ message: '“{value0}” completed' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ completed$'),
    values: ['value0'],
  },
  {
    source: '“{value0}” is running',
    message: msg({ message: '“{value0}” is running' }),
    pattern: new RegExp('^\u201c([\\s\\S]*?)\u201d\\ is\\ running$'),
    values: ['value0'],
  },
  { source: 'Cancel', message: msg({ message: 'Cancel' }) },
  {
    source: '{value0} invitations sent',
    message: msg({ message: '{value0} invitations sent' }),
    pattern: new RegExp('^([\\s\\S]*?)\\ invitations\\ sent$'),
    values: ['value0'],
  },
  {
    source: '{value0} collaborators added',
    message: msg({ message: '{value0} collaborators added' }),
    pattern: new RegExp('^([\\s\\S]*?)\\ collaborators\\ added$'),
    values: ['value0'],
  },
  {
    source: 'Branch “{value0}” created',
    message: msg({ message: 'Branch “{value0}” created' }),
    pattern: new RegExp('^Branch\\ \u201c([\\s\\S]*?)\u201d\\ created$'),
    values: ['value0'],
  },
  {
    source: 'Could not complete the operation.',
    message: msg({ message: 'Could not complete the operation.' }),
  },
  {
    source: "Alias '*{value0}' creates a circular reference.",
    message: msg({
      message: "Alias ''*{value0}'' creates a circular reference.",
    }),
    pattern: new RegExp(
      "^Alias\\ '\\*([\\s\\S]*?)'\\ creates\\ a\\ circular\\ reference\\.$",
    ),
    values: ['value0'],
  },
  {
    source: "Alias '*{value0}' must reference an earlier anchor.",
    message: msg({
      message: "Alias ''*{value0}'' must reference an earlier anchor.",
    }),
    pattern: new RegExp(
      "^Alias\\ '\\*([\\s\\S]*?)'\\ must\\ reference\\ an\\ earlier\\ anchor\\.$",
    ),
    values: ['value0'],
  },
  {
    source: "'actions' must be an array of action definitions.",
    message: msg({
      message: "''actions'' must be an array of action definitions.",
    }),
  },
  {
    source: "'blockKey' attribute is only valid when 'type' is 'block'.",
    message: msg({
      message:
        "''blockKey'' attribute is only valid when ''type'' is ''block''.",
    }),
  },
  {
    source: "'blockKey' cannot be empty.",
    message: msg({ message: "''blockKey'' cannot be empty." }),
  },
  {
    source: "'blockKey' must be a string.",
    message: msg({ message: "''blockKey'' must be a string." }),
  },
  {
    source: "'blocks' must be an array of field definitions.",
    message: msg({
      message: "''blocks'' must be an array of field definitions.",
    }),
  },
  {
    source: "'cache' must be a boolean.",
    message: msg({ message: "''cache'' must be a boolean." }),
  },
  {
    source: "'cancelable' must be a boolean.",
    message: msg({ message: "''cancelable'' must be a boolean." }),
  },
  {
    source: "'categories' must be an array of strings.",
    message: msg({ message: "''categories'' must be an array of strings." }),
  },
  {
    source:
      "'collapsible' must be either a boolean or an object with 'collapsed' and 'summary' properties.",
    message: msg({
      message:
        "''collapsible'' must be either a boolean or an object with ''collapsed'' and ''summary'' properties.",
    }),
  },
  {
    source: "'commit' must be an object.",
    message: msg({ message: "''commit'' must be an object." }),
  },
  {
    source: "'component' must be a string.",
    message: msg({ message: "''component'' must be a string." }),
  },
  {
    source: "'config' must be a boolean.",
    message: msg({ message: "''config'' must be a boolean." }),
  },
  {
    source: "'confirm' must be a boolean or an object.",
    message: msg({ message: "''confirm'' must be a boolean or an object." }),
  },
  {
    source: "'content' must be an array of objects with at least one entry.",
    message: msg({
      message:
        "''content'' must be an array of objects with at least one entry.",
    }),
  },
  {
    source: "'content' must be an object.",
    message: msg({ message: "''content'' must be an object." }),
  },
  {
    source: "'create' must be a string.",
    message: msg({ message: "''create'' must be a string." }),
  },
  {
    source:
      "'default' must be an object with 'search', 'sort' and 'order' attributes.",
    message: msg({
      message:
        "''default'' must be an object with ''search'', ''sort'' and ''order'' attributes.",
    }),
  },
  {
    source: "'delete' must be a string.",
    message: msg({ message: "''delete'' must be a string." }),
  },
  {
    source: "'delimiters' must be a string or array of 2 strings.",
    message: msg({
      message: "''delimiters'' must be a string or array of 2 strings.",
    }),
  },
  {
    source: "'exclude' must be an array of strings.",
    message: msg({ message: "''exclude'' must be an array of strings." }),
  },
  {
    source: "'extensions' must be an array of strings.",
    message: msg({ message: "''extensions'' must be an array of strings." }),
  },
  {
    source: "'field' must be a boolean or 'create'.",
    message: msg({ message: "''field'' must be a boolean or ''create''." }),
  },
  {
    source: "'fields' must be an array of action field definitions.",
    message: msg({
      message: "''fields'' must be an array of action field definitions.",
    }),
  },
  {
    source: "'fields' must be an array of field definitions.",
    message: msg({
      message: "''fields'' must be an array of field definitions.",
    }),
  },
  {
    source: "'fields' must be an array of strings.",
    message: msg({ message: "''fields'' must be an array of strings." }),
  },
  {
    source: "'fields[].name' must be alphanumeric with dashes and underscores.",
    message: msg({
      message:
        "''fields[].name'' must be alphanumeric with dashes and underscores.",
    }),
  },
  {
    source: "'fields[].options' is only allowed for select fields.",
    message: msg({
      message: "''fields[].options'' is only allowed for select fields.",
    }),
  },
  {
    source: "'fields[].options' is required for select fields.",
    message: msg({
      message: "''fields[].options'' is required for select fields.",
    }),
  },
  {
    source:
      "'fields[].type' must be 'text', 'textarea', 'select', 'checkbox', or 'number'.",
    message: msg({
      message:
        "''fields[].type'' must be ''text'', ''textarea'', ''select'', ''checkbox'', or ''number''.",
    }),
  },
  {
    source: "'filename' must be a string or an object.",
    message: msg({ message: "''filename'' must be a string or an object." }),
  },
  {
    source: "'filename' object must contain 'template' and optionally 'field'.",
    message: msg({
      message:
        "''filename'' object must contain ''template'' and optionally ''field''.",
    }),
  },
  {
    source: "'foldersFirst' must be a boolean.",
    message: msg({ message: "''foldersFirst'' must be a boolean." }),
  },
  {
    source:
      "'format' must be 'yaml-frontmatter', 'json-frontmatter', 'tom-frontmatter', 'yaml', 'json', 'toml', 'datagrid', 'code' or 'raw'.",
    message: msg({
      message:
        "''format'' must be ''yaml-frontmatter'', ''json-frontmatter'', ''tom-frontmatter'', ''yaml'', ''json'', ''toml'', ''datagrid'', ''code'' or ''raw''.",
    }),
  },
  {
    source: "'hidden' must be a boolean.",
    message: msg({ message: "''hidden'' must be a boolean." }),
  },
  {
    source: "'hide' must be a boolean.",
    message: msg({ message: "''hide'' must be a boolean." }),
  },
  {
    source: "'hideDirs' must be one of 'nodes', 'others', or 'all'.",
    message: msg({
      message: "''hideDirs'' must be one of ''nodes'', ''others'', or ''all''.",
    }),
  },
  {
    source:
      "'icon' must be a Hugeicons name, with or without the Icon suffix (e.g. News01 or News01Icon).",
    message: msg({
      message:
        "''icon'' must be a Hugeicons name, with or without the Icon suffix (e.g. News01 or News01Icon).",
    }),
  },
  {
    source: "'identity' must be either 'app' or 'user'.",
    message: msg({
      message: "''identity'' must be either ''app'' or ''user''.",
    }),
  },
  {
    source: "'input' cannot escape the repository root.",
    message: msg({ message: "''input'' cannot escape the repository root." }),
  },
  {
    source: "'input' is required.",
    message: msg({ message: "''input'' is required." }),
  },
  {
    source:
      "'input' must be a valid relative path (no leading or trailing slash).",
    message: msg({
      message:
        "''input'' must be a valid relative path (no leading or trailing slash).",
    }),
  },
  {
    source: "'items' must be an array of content entries.",
    message: msg({ message: "''items'' must be an array of content entries." }),
  },
  {
    source: "'label' must be a string or 'false'.",
    message: msg({ message: "''label'' must be a string or ''false''." }),
  },
  {
    source: "'layout' must be either 'tree' or 'list'.",
    message: msg({
      message: "''layout'' must be either ''tree'' or ''list''.",
    }),
  },
  {
    source:
      "'list' must be either a boolean or an object with 'min' and 'max' properties.",
    message: msg({
      message:
        "''list'' must be either a boolean or an object with ''min'' and ''max'' properties.",
    }),
  },
  {
    source: "'media' cannot escape the repository root.",
    message: msg({ message: "''media'' cannot escape the repository root." }),
  },
  {
    source:
      "'media' must be a string, an object, or an array of named media configurations.",
    message: msg({
      message:
        "''media'' must be a string, an object, or an array of named media configurations.",
    }),
  },
  {
    source:
      "'media' must be a valid relative path (no leading or trailing slash).",
    message: msg({
      message:
        "''media'' must be a valid relative path (no leading or trailing slash).",
    }),
  },
  {
    source: "'merge' must be a boolean.",
    message: msg({ message: "''merge'' must be a boolean." }),
  },
  {
    source: "'message' must be a string.",
    message: msg({ message: "''message'' must be a string." }),
  },
  {
    source: "'name' must be alphanumeric with dashes and underscores.",
    message: msg({
      message: "''name'' must be alphanumeric with dashes and underscores.",
    }),
  },
  {
    source:
      "'node' must be a string or an object with 'filename' and 'hideDirs'.",
    message: msg({
      message:
        "''node'' must be a string or an object with ''filename'' and ''hideDirs''.",
    }),
  },
  {
    source:
      "'node' must be a string or an object with 'filename' and optionally 'hideDirs' attributes.",
    message: msg({
      message:
        "''node'' must be a string or an object with ''filename'' and optionally ''hideDirs'' attributes.",
    }),
  },
  {
    source: "'node' must contain 'filename' and optionally 'hideDirs'.",
    message: msg({
      message:
        "''node'' must contain ''filename'' and optionally ''hideDirs''.",
    }),
  },
  {
    source: "'operations.create' must be a boolean.",
    message: msg({ message: "''operations.create'' must be a boolean." }),
  },
  {
    source: "'operations.delete' must be a boolean.",
    message: msg({ message: "''operations.delete'' must be a boolean." }),
  },
  {
    source: "'operations.rename' must be a boolean.",
    message: msg({ message: "''operations.rename'' must be a boolean." }),
  },
  {
    source: "'order' must be either 'asc' or 'desc'.",
    message: msg({ message: "''order'' must be either ''asc'' or ''desc''." }),
  },
  {
    source: "'output' is required.",
    message: msg({ message: "''output'' is required." }),
  },
  {
    source: "'output' must be a valid path with no trailing slash.",
    message: msg({
      message: "''output'' must be a valid path with no trailing slash.",
    }),
  },
  {
    source: "'path' cannot escape the repository root.",
    message: msg({ message: "''path'' cannot escape the repository root." }),
  },
  {
    source:
      "'path' must be a valid relative path (no leading or trailing slash).",
    message: msg({
      message:
        "''path'' must be a valid relative path (no leading or trailing slash).",
    }),
  },
  {
    source:
      "'pattern' must be a string (regex) or an object with 'regex' and optionally 'message' properties.",
    message: msg({
      message:
        "''pattern'' must be a string (regex) or an object with ''regex'' and optionally ''message'' properties.",
    }),
  },
  {
    source: "'pattern' must be a valid regex string.",
    message: msg({ message: "''pattern'' must be a valid regex string." }),
  },
  {
    source: "'primary' must be a string.",
    message: msg({ message: "''primary'' must be a string." }),
  },
  {
    source: "'readonly' must be a boolean.",
    message: msg({ message: "''readonly'' must be a boolean." }),
  },
  {
    source: "'ref' must be a string.",
    message: msg({ message: "''ref'' must be a string." }),
  },
  {
    source: "'rename' must be a boolean, 'safe', or 'random'.",
    message: msg({
      message: "''rename'' must be a boolean, ''safe'', or ''random''.",
    }),
  },
  {
    source: "'rename' must be a string.",
    message: msg({ message: "''rename'' must be a string." }),
  },
  {
    source: "'required' must be a boolean.",
    message: msg({ message: "''required'' must be a boolean." }),
  },
  {
    source: "'scope' must be 'collection', 'entry', 'sidebar', or 'overview'.",
    message: msg({
      message:
        "''scope'' must be ''collection'', ''entry'', ''sidebar'', or ''overview''.",
    }),
  },
  {
    source: "'search' must be a string.",
    message: msg({ message: "''search'' must be a string." }),
  },
  {
    source: "'search' must be an array of strings.",
    message: msg({ message: "''search'' must be an array of strings." }),
  },
  {
    source: "'settings' must be a boolean or an object.",
    message: msg({ message: "''settings'' must be a boolean or an object." }),
  },
  {
    source: "'settings' must be an object.",
    message: msg({ message: "''settings'' must be an object." }),
  },
  {
    source: "'sort' must be a string.",
    message: msg({ message: "''sort'' must be a string." }),
  },
  {
    source: "'sort' must be an array of strings.",
    message: msg({ message: "''sort'' must be an array of strings." }),
  },
  {
    source: "'subfolders' must be a boolean.",
    message: msg({ message: "''subfolders'' must be a boolean." }),
  },
  {
    source: "'type' cannot be empty.",
    message: msg({ message: "''type'' cannot be empty." }),
  },
  {
    source: "'type' must be 'group'.",
    message: msg({ message: "''type'' must be ''group''." }),
  },
  {
    source: "'type' must be a string.",
    message: msg({ message: "''type'' must be a string." }),
  },
  {
    source: "'type' must be a valid field type.",
    message: msg({ message: "''type'' must be a valid field type." }),
  },
  {
    source: "'update' must be a string.",
    message: msg({ message: "''update'' must be a string." }),
  },
  {
    source:
      "'view' must be an object with 'fields', 'primary', 'sort', 'search' and 'default' attributes.",
    message: msg({
      message:
        "''view'' must be an object with ''fields'', ''primary'', ''sort'', ''search'' and ''default'' attributes.",
    }),
  },
  {
    source: '“{value0}” is queued',
    message: msg({ message: '“{value0}” is queued' }),
    pattern: new RegExp('^“([\\s\\S]*?)” is queued$'),
    values: ['value0'],
  },
  {
    source: '{value0} {value1}',
    message: msg({ message: '{value0} {value1}' }),
  },
  {
    source: '{value0} allows at most {value1} items',
    message: msg({ message: '{value0} allows at most {value1} items' }),
    pattern: new RegExp('^([\\s\\S]*?) allows at most ([\\s\\S]*?) items$'),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} allows at most {value1} selections',
    message: msg({ message: '{value0} allows at most {value1} selections' }),
    pattern: new RegExp(
      '^([\\s\\S]*?) allows at most ([\\s\\S]*?) selections$',
    ),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} exceeds the 20 MB limit',
    message: msg({ message: '{value0} exceeds the 20 MB limit' }),
    pattern: new RegExp('^([\\s\\S]*?) exceeds the 20 MB limit$'),
    values: ['value0'],
  },
  {
    source: '{value0} failed with status {value1}',
    message: msg({ message: '{value0} failed with status {value1}' }),
    pattern: new RegExp('^([\\s\\S]*?) failed with status ([\\s\\S]*?)$'),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} has an invalid date or date format',
    message: msg({ message: '{value0} has an invalid date or date format' }),
    pattern: new RegExp('^([\\s\\S]*?) has an invalid date or date format$'),
    values: ['value0'],
  },
  {
    source: '{value0} is already a collaborator',
    message: msg({ message: '{value0} is already a collaborator' }),
    pattern: new RegExp('^([\\s\\S]*?) is already a collaborator$'),
    values: ['value0'],
  },
  {
    source: '{value0} is empty; enter a value or remove this item',
    message: msg({
      message: '{value0} is empty; enter a value or remove this item',
    }),
    pattern: new RegExp(
      '^([\\s\\S]*?) is empty; enter a value or remove this item$',
    ),
    values: ['value0'],
  },
  {
    source: '{value0} is required',
    message: msg({ message: '{value0} is required' }),
    pattern: new RegExp('^([\\s\\S]*?) is required$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be a list',
    message: msg({ message: '{value0} must be a list' }),
    pattern: new RegExp('^([\\s\\S]*?) must be a list$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be a list of {value1}',
    message: msg({ message: '{value0} must be a list of {value1}' }),
    pattern: new RegExp('^([\\s\\S]*?) must be a list of ([\\s\\S]*?)$'),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} must be a non-empty value',
    message: msg({ message: '{value0} must be a non-empty value' }),
    pattern: new RegExp('^([\\s\\S]*?) must be a non-empty value$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be a number',
    message: msg({ message: '{value0} must be a number' }),
    pattern: new RegExp('^([\\s\\S]*?) must be a number$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be an object',
    message: msg({ message: '{value0} must be an object' }),
    pattern: new RegExp('^([\\s\\S]*?) must be an object$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be an object keyed by locale',
    message: msg({ message: '{value0} must be an object keyed by locale' }),
    pattern: new RegExp('^([\\s\\S]*?) must be an object keyed by locale$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be text',
    message: msg({ message: '{value0} must be text' }),
    pattern: new RegExp('^([\\s\\S]*?) must be text$'),
    values: ['value0'],
  },
  {
    source: '{value0} must be true or false',
    message: msg({ message: '{value0} must be true or false' }),
    pattern: new RegExp('^([\\s\\S]*?) must be true or false$'),
    values: ['value0'],
  },
  {
    source: '{value0} must select a block type',
    message: msg({ message: '{value0} must select a block type' }),
    pattern: new RegExp('^([\\s\\S]*?) must select a block type$'),
    values: ['value0'],
  },
  {
    source: '{value0} must use a configured option',
    message: msg({ message: '{value0} must use a configured option' }),
    pattern: new RegExp('^([\\s\\S]*?) must use a configured option$'),
    values: ['value0'],
  },
  {
    source: '{value0} requires a translation',
    message: msg({ message: '{value0} requires a translation' }),
    pattern: new RegExp('^([\\s\\S]*?) requires a translation$'),
    values: ['value0'],
  },
  {
    source: '{value0} requires at least {value1} items',
    message: msg({ message: '{value0} requires at least {value1} items' }),
    pattern: new RegExp('^([\\s\\S]*?) requires at least ([\\s\\S]*?) items$'),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} requires at least {value1} selections',
    message: msg({ message: '{value0} requires at least {value1} selections' }),
    pattern: new RegExp(
      '^([\\s\\S]*?) requires at least ([\\s\\S]*?) selections$',
    ),
    values: ['value0', 'value1'],
  },
  {
    source: '{value0} sign-in is temporarily unavailable. Try again.',
    message: msg({
      message: '{value0} sign-in is temporarily unavailable. Try again.',
    }),
    pattern: new RegExp(
      '^([\\s\\S]*?) sign-in is temporarily unavailable\\. Try again\\.$',
    ),
    values: ['value0'],
  },
  {
    source: '{value0} uses a disallowed file extension',
    message: msg({ message: '{value0} uses a disallowed file extension' }),
    pattern: new RegExp('^([\\s\\S]*?) uses a disallowed file extension$'),
    values: ['value0'],
  },
  {
    source: '{value0} uses an unknown block type',
    message: msg({ message: '{value0} uses an unknown block type' }),
    pattern: new RegExp('^([\\s\\S]*?) uses an unknown block type$'),
    values: ['value0'],
  },
  {
    source: '{value0}: {value1}',
    message: msg({ message: '{value0}: {value1}' }),
  },
  {
    source: 'A database URL or D1 binding is required',
    message: msg({ message: 'A database URL or D1 binding is required' }),
  },
  {
    source:
      'A destination has a local draft. Keep or discard it before renaming.',
    message: msg({
      message:
        'A destination has a local draft. Keep or discard it before renaming.',
    }),
  },
  {
    source: 'A GitHub access token is required',
    message: msg({ message: 'A GitHub access token is required' }),
  },
  {
    source:
      'A localized container already includes its children; remove descendant localized flags',
    message: msg({
      message:
        'A localized container already includes its children; remove descendant localized flags',
    }),
  },
  {
    source: 'Aborted upload path does not match its request',
    message: msg({ message: 'Aborted upload path does not match its request' }),
  },
  { source: 'Access denied', message: msg({ message: 'Access denied' }) },
  {
    source: 'Account access could not be verified. Try again later.',
    message: msg({
      message: 'Account access could not be verified. Try again later.',
    }),
  },
  {
    source: 'Account not found',
    message: msg({ message: 'Account not found' }),
  },
  { source: 'Action', message: msg({ message: 'Action' }) },
  {
    source: 'Action {value0} was not found',
    message: msg({ message: 'Action {value0} was not found' }),
    pattern: new RegExp('^Action ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: 'Action context {value0} was not found',
    message: msg({ message: 'Action context {value0} was not found' }),
    pattern: new RegExp('^Action context ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: 'Action context name is required',
    message: msg({ message: 'Action context name is required' }),
  },
  {
    source: 'Action context path is outside its configured root',
    message: msg({
      message: 'Action context path is outside its configured root',
    }),
  },
  {
    source: 'Action context root is invalid',
    message: msg({ message: 'Action context root is invalid' }),
  },
  {
    source: 'Action run not found',
    message: msg({ message: 'Action run not found' }),
  },
  { source: 'Add', message: msg({ message: 'Add' }) },
  {
    source: 'Admin access required',
    message: msg({ message: 'Admin access required' }),
  },
  {
    source: 'Admin search is too long',
    message: msg({ message: 'Admin search is too long' }),
  },
  {
    source: 'Admin user id is required',
    message: msg({ message: 'Admin user id is required' }),
  },
  {
    source: 'after is only valid for custom folder positioning',
    message: msg({
      message: 'after is only valid for custom folder positioning',
    }),
  },
  {
    source: 'All sessions revoked',
    message: msg({ message: 'All sessions revoked' }),
  },
  {
    source: 'An entry already exists at {value0}',
    message: msg({ message: 'An entry already exists at {value0}' }),
    pattern: new RegExp('^An entry already exists at ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'An unexpected authentication error occurred.',
    message: msg({ message: 'An unexpected authentication error occurred.' }),
  },
  {
    source: 'Application database is required',
    message: msg({ message: 'Application database is required' }),
  },
  {
    source: 'Authentication required',
    message: msg({ message: 'Authentication required' }),
  },
  {
    source: 'BETTER_AUTH_SECRET must contain at least 32 characters',
    message: msg({
      message: 'BETTER_AUTH_SECRET must contain at least 32 characters',
    }),
  },
  {
    source: 'BETTER_AUTH_URL must be a valid HTTP URL',
    message: msg({ message: 'BETTER_AUTH_URL must be a valid HTTP URL' }),
  },
  {
    source:
      "Blocks must have a 'fields' attribute or inherit one from a component.",
    message: msg({
      message:
        "Blocks must have a ''fields'' attribute or inherit one from a component.",
    }),
  },
  { source: 'Cache cleared', message: msg({ message: 'Cache cleared' }) },
  {
    source: 'Cache database is required',
    message: msg({ message: 'Cache database is required' }),
  },
  {
    source: 'Cache management is disabled for this repository',
    message: msg({
      message: 'Cache management is disabled for this repository',
    }),
  },
  {
    source: 'Cannot {value0} media property {value1}',
    message: msg({ message: 'Cannot {value0} media property {value1}' }),
    pattern: new RegExp('^Cannot ([\\s\\S]*?) media property ([\\s\\S]*?)$'),
    values: ['value0', 'value1'],
  },
  {
    source: 'Cannot encode an empty route segment',
    message: msg({ message: 'Cannot encode an empty route segment' }),
  },
  {
    source: 'Choose a picture smaller than 100 KB.',
    message: msg({ message: 'Choose a picture smaller than 100 KB.' }),
  },
  {
    source: 'Choose a picture smaller than 5 MB.',
    message: msg({ message: 'Choose a picture smaller than 5 MB.' }),
  },
  {
    source: 'Choose a PNG, JPEG or WebP picture.',
    message: msg({ message: 'Choose a PNG, JPEG or WebP picture.' }),
  },
  {
    source: 'Choose a version for every conflicting field.',
    message: msg({ message: 'Choose a version for every conflicting field.' }),
  },
  {
    source: 'Choose one picture at a time.',
    message: msg({ message: 'Choose one picture at a time.' }),
  },
  {
    source: 'Circular component reference: {value0}',
    message: msg({ message: 'Circular component reference: {value0}' }),
    pattern: new RegExp('^Circular component reference: ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Collaborator added',
    message: msg({ message: 'Collaborator added' }),
  },
  {
    source: 'collaborator permissions',
    message: msg({ message: 'collaborator permissions' }),
  },
  {
    source: 'Collaborators cannot change repository configuration',
    message: msg({
      message: 'Collaborators cannot change repository configuration',
    }),
  },
  {
    source: 'Collection {value0} was not found',
    message: msg({ message: 'Collection {value0} was not found' }),
    pattern: new RegExp('^Collection ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: 'Collection action context is invalid',
    message: msg({ message: 'Collection action context is invalid' }),
  },
  {
    source:
      "Collection actions must define a 'scope' of 'collection' or 'entry'.",
    message: msg({
      message:
        "Collection actions must define a ''scope'' of ''collection'' or ''entry''.",
    }),
  },
  {
    source: 'Collection filename template is missing',
    message: msg({ message: 'Collection filename template is missing' }),
  },
  {
    source: 'Collection path is outside its configured root',
    message: msg({ message: 'Collection path is outside its configured root' }),
  },
  { source: 'Command Palette', message: msg({ message: 'Command Palette' }) },
  {
    source: 'Commit message must be at most 4096 characters',
    message: msg({ message: 'Commit message must be at most 4096 characters' }),
  },
  {
    source: 'Completed content operations cannot be replayed.',
    message: msg({
      message: 'Completed content operations cannot be replayed.',
    }),
  },
  {
    source: 'Completed media operations cannot be replayed.',
    message: msg({ message: 'Completed media operations cannot be replayed.' }),
  },
  {
    source: 'Completed operations cannot be replayed.',
    message: msg({ message: 'Completed operations cannot be replayed.' }),
  },
  {
    source: 'Completed upload path does not match its request',
    message: msg({
      message: 'Completed upload path does not match its request',
    }),
  },
  {
    source: 'Component key must be alphanumeric with dashes and underscores.',
    message: msg({
      message:
        'Component key must be alphanumeric with dashes and underscores.',
    }),
  },
  { source: 'Configuration', message: msg({ message: 'Configuration' }) },
  {
    source: 'Configuration fields and blocks must be objects',
    message: msg({
      message: 'Configuration fields and blocks must be objects',
    }),
  },
  {
    source: 'Configuration root must be an object',
    message: msg({ message: 'Configuration root must be an object' }),
  },
  {
    source: 'Configuration settings are invalid',
    message: msg({ message: 'Configuration settings are invalid' }),
  },
  {
    source: 'Configuration source exceeds the 1 MB limit',
    message: msg({ message: 'Configuration source exceeds the 1 MB limit' }),
  },
  {
    source: 'Conflicting media property {value0}',
    message: msg({ message: 'Conflicting media property {value0}' }),
    pattern: new RegExp('^Conflicting media property ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Conflicting standalone page namespace {value0}',
    message: msg({ message: 'Conflicting standalone page namespace {value0}' }),
    pattern: new RegExp('^Conflicting standalone page namespace ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  { source: 'Content', message: msg({ message: 'Content' }) },
  {
    source: 'Content allows at most {value0} items',
    message: msg({ message: 'Content allows at most {value0} items' }),
    pattern: new RegExp('^Content allows at most ([\\s\\S]*?) items$'),
    values: ['value0'],
  },
  {
    source: 'Content entries must be objects',
    message: msg({ message: 'Content entries must be objects' }),
  },
  {
    source: 'Content i18n must specify a scheme',
    message: msg({ message: 'Content i18n must specify a scheme' }),
  },
  {
    source: 'Content requires at least {value0} items',
    message: msg({ message: 'Content requires at least {value0} items' }),
    pattern: new RegExp('^Content requires at least ([\\s\\S]*?) items$'),
    values: ['value0'],
  },
  {
    source: 'Content schema {value0} was not found',
    message: msg({ message: 'Content schema {value0} was not found' }),
    pattern: new RegExp('^Content schema ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: 'Content validation failed',
    message: msg({ message: 'Content validation failed' }),
  },
  {
    source: 'Could not cancel “{value0}”',
    message: msg({ message: 'Could not cancel “{value0}”' }),
    pattern: new RegExp('^Could not cancel “([\\s\\S]*?)”$'),
    values: ['value0'],
  },
  {
    source: 'Could not create repository identity',
    message: msg({ message: 'Could not create repository identity' }),
  },
  {
    source: 'Could not read {value0}',
    message: msg({ message: 'Could not read {value0}' }),
    pattern: new RegExp('^Could not read ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Could not record action run',
    message: msg({ message: 'Could not record action run' }),
  },
  {
    source: 'Could not record repository identity',
    message: msg({ message: 'Could not record repository identity' }),
  },
  {
    source: 'Could not sign out. Try again.',
    message: msg({ message: 'Could not sign out. Try again.' }),
  },
  {
    source: 'Could not update “{value0}”. Check Actions for its status.',
    message: msg({
      message: 'Could not update “{value0}”. Check Actions for its status.',
    }),
    pattern: new RegExp(
      '^Could not update “([\\s\\S]*?)”\\. Check Actions for its status\\.$',
    ),
    values: ['value0'],
  },
  {
    source: 'Could not update action runs. Refresh Actions to try again.',
    message: msg({
      message: 'Could not update action runs. Refresh Actions to try again.',
    }),
  },
  {
    source: 'Could not upload media.',
    message: msg({ message: 'Could not upload media.' }),
  },
  {
    source: 'Could not verify the code.',
    message: msg({ message: 'Could not verify the code.' }),
  },
  {
    source: 'Could not verify the sign-in code. Try again.',
    message: msg({ message: 'Could not verify the sign-in code. Try again.' }),
  },
  {
    source: 'Creating entries is disabled for this collection',
    message: msg({
      message: 'Creating entries is disabled for this collection',
    }),
  },
  {
    source: 'Creating this content is disabled',
    message: msg({ message: 'Creating this content is disabled' }),
  },
  { source: 'Creating…', message: msg({ message: 'Creating…' }) },
  {
    source: 'CRYPTO_KEY must be a base64-encoded 32-byte key',
    message: msg({
      message: 'CRYPTO_KEY must be a base64-encoded 32-byte key',
    }),
  },
  {
    source: 'Custom after must be a directory, not the content file',
    message: msg({
      message: 'Custom after must be a directory, not the content file',
    }),
  },
  {
    source:
      'Custom after must be an exact ancestor directory of the content path',
    message: msg({
      message:
        'Custom after must be an exact ancestor directory of the content path',
    }),
  },
  {
    source: 'Custom filenames are disabled for this collection',
    message: msg({
      message: 'Custom filenames are disabled for this collection',
    }),
  },
  {
    source: 'D1 bindings require the Cloudflare request bootstrap',
    message: msg({
      message: 'D1 bindings require the Cloudflare request bootstrap',
    }),
  },
  {
    source: 'DATABASE binding is required with CACHE_DATABASE',
    message: msg({
      message: 'DATABASE binding is required with CACHE_DATABASE',
    }),
  },
  {
    source: 'DATABASE D1 binding is required',
    message: msg({ message: 'DATABASE D1 binding is required' }),
  },
  {
    source: 'Database readiness check timed out',
    message: msg({ message: 'Database readiness check timed out' }),
  },
  {
    source: 'Deleting this content is disabled',
    message: msg({ message: 'Deleting this content is disabled' }),
  },
  {
    source: 'Delimiters must be strings',
    message: msg({ message: 'Delimiters must be strings' }),
  },
  {
    source: 'Direct upload is unavailable',
    message: msg({ message: 'Direct upload is unavailable' }),
  },
  {
    source: 'Directory refresh failed. Retry to update the cache.',
    message: msg({
      message: 'Directory refresh failed. Retry to update the cache.',
    }),
  },
  { source: 'Display name', message: msg({ message: 'Display name' }) },
  {
    source: 'Duplicate {value0} name "{value1}". Also defined at {value2}.',
    message: msg({
      message: 'Duplicate {value0} name "{value1}". Also defined at {value2}.',
    }),
    pattern: new RegExp(
      '^Duplicate ([\\s\\S]*?) name "([\\s\\S]*?)"\\. Also defined at ([\\s\\S]*?)\\.$',
    ),
    values: ['value0', 'value1', 'value2'],
  },
  { source: 'Edit', message: msg({ message: 'Edit' }) },
  { source: 'Email', message: msg({ message: 'Email' }) },
  {
    source: 'Email provider is unavailable',
    message: msg({ message: 'Email provider is unavailable' }),
  },
  {
    source: 'Email sign-in is temporarily unavailable. Try again.',
    message: msg({
      message: 'Email sign-in is temporarily unavailable. Try again.',
    }),
  },
  {
    source: 'Encryption key must contain exactly 32 bytes',
    message: msg({ message: 'Encryption key must contain exactly 32 bytes' }),
  },
  {
    source: 'Enter a valid email address for each person',
    message: msg({ message: 'Enter a valid email address for each person' }),
  },
  {
    source: 'Enter a valid email address.',
    message: msg({ message: 'Enter a valid email address.' }),
  },
  {
    source: 'Enter at least one email address',
    message: msg({ message: 'Enter at least one email address' }),
  },
  {
    source: 'Enter the 6-digit code.',
    message: msg({ message: 'Enter the 6-digit code.' }),
  },
  {
    source: 'Enter your account email to confirm deletion.',
    message: msg({ message: 'Enter your account email to confirm deletion.' }),
  },
  {
    source: 'Enter your email to confirm account deletion.',
    message: msg({ message: 'Enter your email to confirm account deletion.' }),
  },
  {
    source:
      "Entries in the 'categories' array must be 'image', 'document', 'video', 'audio', 'compressed', 'code', 'font', or 'spreadsheet'.",
    message: msg({
      message:
        "Entries in the ''categories'' array must be ''image'', ''document'', ''video'', ''audio'', ''compressed'', ''code'', ''font'', or ''spreadsheet''.",
    }),
  },
  {
    source: "Entries in the 'exclude' array must be strings.",
    message: msg({
      message: "Entries in the ''exclude'' array must be strings.",
    }),
  },
  {
    source: "Entries in the 'extensions' array must be strings.",
    message: msg({
      message: "Entries in the ''extensions'' array must be strings.",
    }),
  },
  {
    source: "Entries in the 'fields' array must be strings.",
    message: msg({
      message: "Entries in the ''fields'' array must be strings.",
    }),
  },
  {
    source: "Entries in the 'search' array must be strings.",
    message: msg({
      message: "Entries in the ''search'' array must be strings.",
    }),
  },
  {
    source: "Entries in the 'sort' array must be strings.",
    message: msg({ message: "Entries in the ''sort'' array must be strings." }),
  },
  {
    source: 'Entry action context is invalid',
    message: msg({ message: 'Entry action context is invalid' }),
  },
  {
    source: 'Entry exceeds the 5 MB limit',
    message: msg({ message: 'Entry exceeds the 5 MB limit' }),
  },
  {
    source: 'Entry extension does not match its content schema',
    message: msg({
      message: 'Entry extension does not match its content schema',
    }),
  },
  {
    source: 'Entry path does not match its configured locale path',
    message: msg({
      message: 'Entry path does not match its configured locale path',
    }),
  },
  {
    source: 'Entry path is outside its configured content root',
    message: msg({
      message: 'Entry path is outside its configured content root',
    }),
  },
  {
    source: 'Expected {value0} to be a directory',
    message: msg({ message: 'Expected {value0} to be a directory' }),
    pattern: new RegExp('^Expected ([\\s\\S]*?) to be a directory$'),
    values: ['value0'],
  },
  {
    source: 'Expected {value0} to be a file',
    message: msg({ message: 'Expected {value0} to be a file' }),
    pattern: new RegExp('^Expected ([\\s\\S]*?) to be a file$'),
    values: ['value0'],
  },
  {
    source: 'Expected a JSON object',
    message: msg({ message: 'Expected a JSON object' }),
  },
  {
    source: 'Expected a list at the root of this content file',
    message: msg({
      message: 'Expected a list at the root of this content file',
    }),
  },
  {
    source: 'Failed to read image file.',
    message: msg({ message: 'Failed to read image file.' }),
  },
  {
    source: "Field must have exactly one of 'type' or 'component'.",
    message: msg({
      message: "Field must have exactly one of ''type'' or ''component''.",
    }),
  },
  {
    source: "Fields with type 'block' must have a 'blocks' attribute.",
    message: msg({
      message: "Fields with type ''block'' must have a ''blocks'' attribute.",
    }),
  },
  {
    source: "Fields with type 'object' must have a 'fields' attribute.",
    message: msg({
      message: "Fields with type ''object'' must have a ''fields'' attribute.",
    }),
  },
  {
    source: 'File {value0} was not found',
    message: msg({ message: 'File {value0} was not found' }),
    pattern: new RegExp('^File ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: 'File action context is invalid',
    message: msg({ message: 'File action context is invalid' }),
  },
  {
    source: "File actions cannot define a 'scope'.",
    message: msg({ message: "File actions cannot define a ''scope''." }),
  },
  {
    source: 'Enter a valid filename without a folder path',
    message: msg({ message: 'Enter a valid filename without a folder path' }),
  },
  {
    source: 'Filename position must be prefix or suffix',
    message: msg({ message: 'Filename position must be prefix or suffix' }),
  },
  {
    source: 'Filename separator must contain only dots, underscores or hyphens',
    message: msg({
      message:
        'Filename separator must contain only dots, underscores or hyphens',
    }),
  },
  {
    source: 'Fix the configuration errors before saving.',
    message: msg({ message: 'Fix the configuration errors before saving.' }),
  },
  {
    source: 'Folder name is invalid',
    message: msg({ message: 'Folder name is invalid' }),
  },
  {
    source:
      'Folder position collection requires a collection; use parent for a fixed file',
    message: msg({
      message:
        'Folder position collection requires a collection; use parent for a fixed file',
    }),
  },
  {
    source: 'Folder position must be root, collection, parent or custom',
    message: msg({
      message: 'Folder position must be root, collection, parent or custom',
    }),
  },
  {
    source: 'Frontmatter content must contain an object',
    message: msg({ message: 'Frontmatter content must contain an object' }),
  },
  {
    source: 'Frontmatter delimiters must be one string or two strings',
    message: msg({
      message: 'Frontmatter delimiters must be one string or two strings',
    }),
  },
  {
    source: 'Frontmatter must contain an object',
    message: msg({ message: 'Frontmatter must contain an object' }),
  },
  {
    source:
      'Filename template must produce a relative path with valid, non-empty segments',
    message: msg({
      message:
        'Filename template must produce a relative path with valid, non-empty segments',
    }),
  },
  {
    source: 'Git path "{value0}" is outside root "{value1}"',
    message: msg({ message: 'Git path "{value0}" is outside root "{value1}"' }),
    pattern: new RegExp(
      '^Git path "([\\s\\S]*?)" is outside root "([\\s\\S]*?)"$',
    ),
    values: ['value0', 'value1'],
  },
  {
    source: 'Git path cannot contain control characters',
    message: msg({ message: 'Git path cannot contain control characters' }),
  },
  {
    source: 'Git path cannot escape the repository root',
    message: msg({ message: 'Git path cannot escape the repository root' }),
  },
  {
    source: 'GitHub App credentials are required for collaborator access',
    message: msg({
      message: 'GitHub App credentials are required for collaborator access',
    }),
  },
  {
    source: 'GitHub authentication is required',
    message: msg({ message: 'GitHub authentication is required' }),
  },
  {
    source: 'GitHub installation was not found',
    message: msg({ message: 'GitHub installation was not found' }),
  },
  {
    source: 'GitHub OAuth credentials must be provided together',
    message: msg({
      message: 'GitHub OAuth credentials must be provided together',
    }),
  },
  {
    source: 'GitHub profile request failed ({value0})',
    message: msg({ message: 'GitHub profile request failed ({value0})' }),
    pattern: new RegExp('^GitHub profile request failed \\(([\\s\\S]*?)\\)$'),
    values: ['value0'],
  },
  {
    source:
      'GitHub returned an incomplete Git tree; this folder cannot be listed completely',
    message: msg({
      message:
        'GitHub returned an incomplete Git tree; this folder cannot be listed completely',
    }),
  },
  {
    source: 'GitHub returned an invalid {value0}',
    message: msg({ message: 'GitHub returned an invalid {value0}' }),
    pattern: new RegExp('^GitHub returned an invalid ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'GitHub returned an invalid App response',
    message: msg({ message: 'GitHub returned an invalid App response' }),
  },
  {
    source: 'GitHub returned an invalid branch response',
    message: msg({ message: 'GitHub returned an invalid branch response' }),
  },
  {
    source: 'GitHub returned an invalid installation',
    message: msg({ message: 'GitHub returned an invalid installation' }),
  },
  {
    source: 'GitHub returned an invalid installation token',
    message: msg({ message: 'GitHub returned an invalid installation token' }),
  },
  {
    source: 'GitHub returned an invalid profile',
    message: msg({ message: 'GitHub returned an invalid profile' }),
  },
  {
    source: 'GitHub returned an invalid repository',
    message: msg({ message: 'GitHub returned an invalid repository' }),
  },
  {
    source: 'GitHub returned an invalid repository installation',
    message: msg({
      message: 'GitHub returned an invalid repository installation',
    }),
  },
  {
    source: 'GitHub returned an invalid token expiry',
    message: msg({ message: 'GitHub returned an invalid token expiry' }),
  },
  {
    source: 'GitHub returned an invalid workflow run',
    message: msg({ message: 'GitHub returned an invalid workflow run' }),
  },
  {
    source: 'GitHub returned an unsupported account type',
    message: msg({ message: 'GitHub returned an unsupported account type' }),
  },
  {
    source: 'GitHub returned an unsupported blob encoding',
    message: msg({ message: 'GitHub returned an unsupported blob encoding' }),
  },
  {
    source: 'GitHub returned an unsupported repository selection',
    message: msg({
      message: 'GitHub returned an unsupported repository selection',
    }),
  },
  {
    source: 'GitHub returned invalid commits',
    message: msg({ message: 'GitHub returned invalid commits' }),
  },
  {
    source: 'GitHub returned invalid directory entries',
    message: msg({ message: 'GitHub returned invalid directory entries' }),
  },
  {
    source: 'GITHUB_APP_ID must be a positive integer',
    message: msg({ message: 'GITHUB_APP_ID must be a positive integer' }),
  },
  {
    source:
      'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and CRYPTO_KEY must be provided together',
    message: msg({
      message:
        'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and CRYPTO_KEY must be provided together',
    }),
  },
  {
    source: 'GITHUB_APP_NAME must be a GitHub App slug',
    message: msg({ message: 'GITHUB_APP_NAME must be a GitHub App slug' }),
  },
  {
    source: 'GITHUB_APP_PRIVATE_KEY must be a PEM private key',
    message: msg({
      message: 'GITHUB_APP_PRIVATE_KEY must be a PEM private key',
    }),
  },
  {
    source: 'Google OAuth credentials must be provided together',
    message: msg({
      message: 'Google OAuth credentials must be provided together',
    }),
  },
  {
    source: 'History page must be a positive integer',
    message: msg({ message: 'History page must be a positive integer' }),
  },
  {
    source: 'i18n.locales must be unique, including letter case',
    message: msg({
      message: 'i18n.locales must be unique, including letter case',
    }),
  },
  {
    source: 'i18n.locales must contain between 1 and 50 locales',
    message: msg({
      message: 'i18n.locales must contain between 1 and 50 locales',
    }),
  },
  {
    source: 'i18n.path applies only to the files scheme',
    message: msg({ message: 'i18n.path applies only to the files scheme' }),
  },
  {
    source: 'i18n.path.default must be omit or explicit',
    message: msg({ message: 'i18n.path.default must be omit or explicit' }),
  },
  {
    source: 'i18n.path.type must be filename or folder',
    message: msg({ message: 'i18n.path.type must be filename or folder' }),
  },
  {
    source: 'i18n.scheme must be files or fields',
    message: msg({ message: 'i18n.scheme must be files or fields' }),
  },
  {
    source: 'Image uploaded, but preview failed to load',
    message: msg({ message: 'Image uploaded, but preview failed to load' }),
  },
  {
    source: 'Invalid account deletion request.',
    message: msg({ message: 'Invalid account deletion request.' }),
  },
  {
    source: 'Invalid action context',
    message: msg({ message: 'Invalid action context' }),
  },
  {
    source: 'Invalid action dispatch',
    message: msg({ message: 'Invalid action dispatch' }),
  },
  {
    source: 'Invalid action management request',
    message: msg({ message: 'Invalid action management request' }),
  },
  {
    source: 'Invalid action request',
    message: msg({ message: 'Invalid action request' }),
  },
  {
    source: 'Invalid activity page',
    message: msg({ message: 'Invalid activity page' }),
  },
  {
    source: 'Invalid activity request',
    message: msg({ message: 'Invalid activity request' }),
  },
  {
    source: 'Invalid admin action',
    message: msg({ message: 'Invalid admin action' }),
  },
  {
    source: 'Invalid admin page',
    message: msg({ message: 'Invalid admin page' }),
  },
  {
    source: 'Invalid atomic rename plan',
    message: msg({ message: 'Invalid atomic rename plan' }),
  },
  {
    source: 'Invalid base64 content',
    message: msg({ message: 'Invalid base64 content' }),
  },
  {
    source: 'Invalid branch creation',
    message: msg({ message: 'Invalid branch creation' }),
  },
  {
    source: 'Invalid branch name',
    message: msg({ message: 'Invalid branch name' }),
  },
  {
    source: 'Invalid cache action',
    message: msg({ message: 'Invalid cache action' }),
  },
  {
    source: 'Invalid cache filter',
    message: msg({ message: 'Invalid cache filter' }),
  },
  {
    source: 'Invalid cache page',
    message: msg({ message: 'Invalid cache page' }),
  },
  {
    source: 'Invalid cache request',
    message: msg({ message: 'Invalid cache request' }),
  },
  {
    source: 'Invalid cache target',
    message: msg({ message: 'Invalid cache target' }),
  },
  {
    source: 'Invalid collaborator emails',
    message: msg({ message: 'Invalid collaborator emails' }),
  },
  {
    source: 'Invalid collaborator id',
    message: msg({ message: 'Invalid collaborator id' }),
  },
  {
    source: 'Invalid collaborator request',
    message: msg({ message: 'Invalid collaborator request' }),
  },
  {
    source: 'Invalid collection request',
    message: msg({ message: 'Invalid collection request' }),
  },
  {
    source: 'Invalid configuration request',
    message: msg({ message: 'Invalid configuration request' }),
  },
  {
    source: 'Invalid configuration schema contribution in plugin {value0}',
    message: msg({
      message: 'Invalid configuration schema contribution in plugin {value0}',
    }),
    pattern: new RegExp(
      '^Invalid configuration schema contribution in plugin ([\\s\\S]*?)$',
    ),
    values: ['value0'],
  },
  {
    source: 'Invalid configuration update',
    message: msg({ message: 'Invalid configuration update' }),
  },
  {
    source: 'Invalid editing preferences.',
    message: msg({ message: 'Invalid editing preferences.' }),
  },
  {
    source: 'Invalid encoded route segment',
    message: msg({ message: 'Invalid encoded route segment' }),
  },
  {
    source: 'Invalid entry creation',
    message: msg({ message: 'Invalid entry creation' }),
  },
  {
    source: 'Invalid entry deletion',
    message: msg({ message: 'Invalid entry deletion' }),
  },
  {
    source: 'Invalid entry move',
    message: msg({ message: 'Invalid entry move' }),
  },
  {
    source: 'Invalid entry payload',
    message: msg({ message: 'Invalid entry payload' }),
  },
  {
    source: 'Invalid entry rename',
    message: msg({ message: 'Invalid entry rename' }),
  },
  {
    source: 'Invalid entry request',
    message: msg({ message: 'Invalid entry request' }),
  },
  {
    source: 'Invalid entry update',
    message: msg({ message: 'Invalid entry update' }),
  },
  {
    source: 'Invalid file request',
    message: msg({ message: 'Invalid file request' }),
  },
  { source: 'Invalid filename', message: msg({ message: 'Invalid filename' }) },
  {
    source: 'Invalid folder creation',
    message: msg({ message: 'Invalid folder creation' }),
  },
  {
    source: 'Invalid GitHub installation id',
    message: msg({ message: 'Invalid GitHub installation id' }),
  },
  {
    source: 'Invalid GitHub webhook payload',
    message: msg({ message: 'Invalid GitHub webhook payload' }),
  },
  {
    source: 'Invalid immediate tree entry',
    message: msg({ message: 'Invalid immediate tree entry' }),
  },
  {
    source: 'Invalid invitation token',
    message: msg({ message: 'Invalid invitation token' }),
  },
  {
    source: 'Invalid language preference.',
    message: msg({ message: 'Invalid language preference.' }),
  },
  {
    source: 'Invalid locale code: {value0}',
    message: msg({ message: 'Invalid locale code: {value0}' }),
    pattern: new RegExp('^Invalid locale code: ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Invalid media deletion',
    message: msg({ message: 'Invalid media deletion' }),
  },
  {
    source: 'Invalid media delivery provider',
    message: msg({ message: 'Invalid media delivery provider' }),
  },
  {
    source: 'Invalid media delivery request',
    message: msg({ message: 'Invalid media delivery request' }),
  },
  {
    source: 'Invalid media folder creation',
    message: msg({ message: 'Invalid media folder creation' }),
  },
  {
    source: 'Invalid media move',
    message: msg({ message: 'Invalid media move' }),
  },
  {
    source: 'Invalid media path',
    message: msg({ message: 'Invalid media path' }),
  },
  {
    source: 'Invalid media property {value0} in plugin {value1}',
    message: msg({
      message: 'Invalid media property {value0} in plugin {value1}',
    }),
    pattern: new RegExp(
      '^Invalid media property ([\\s\\S]*?) in plugin ([\\s\\S]*?)$',
    ),
    values: ['value0', 'value1'],
  },
  {
    source: 'Invalid media rename',
    message: msg({ message: 'Invalid media rename' }),
  },
  {
    source: 'Invalid media request',
    message: msg({ message: 'Invalid media request' }),
  },
  {
    source: 'Invalid media storage provider',
    message: msg({ message: 'Invalid media storage provider' }),
  },
  {
    source: 'Invalid media upload',
    message: msg({ message: 'Invalid media upload' }),
  },
  {
    source: 'Invalid media upload completion',
    message: msg({ message: 'Invalid media upload completion' }),
  },
  {
    source: 'Invalid media upload initiation',
    message: msg({ message: 'Invalid media upload initiation' }),
  },
  {
    source: 'Invalid media variant',
    message: msg({ message: 'Invalid media variant' }),
  },
  {
    source: 'Invalid preferences.',
    message: msg({ message: 'Invalid preferences.' }),
  },
  {
    source: 'Invalid profile update.',
    message: msg({ message: 'Invalid profile update.' }),
  },
  {
    source: 'Invalid project account',
    message: msg({ message: 'Invalid project account' }),
  },
  {
    source: 'Invalid project template',
    message: msg({ message: 'Invalid project template' }),
  },
  {
    source: 'Invalid raw entry creation',
    message: msg({ message: 'Invalid raw entry creation' }),
  },
  {
    source: 'Invalid reference continuation',
    message: msg({ message: 'Invalid reference continuation' }),
  },
  {
    source: 'Invalid reference request',
    message: msg({ message: 'Invalid reference request' }),
  },
  {
    source: 'Invalid repository {value0}',
    message: msg({ message: 'Invalid repository {value0}' }),
    pattern: new RegExp('^Invalid repository ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Invalid repository ID',
    message: msg({ message: 'Invalid repository ID' }),
  },
  {
    source: 'Invalid repository identity',
    message: msg({ message: 'Invalid repository identity' }),
  },
  {
    source: 'Invalid repository name',
    message: msg({ message: 'Invalid repository name' }),
  },
  {
    source: 'Invalid repository page',
    message: msg({ message: 'Invalid repository page' }),
  },
  {
    source: 'Invalid repository request',
    message: msg({ message: 'Invalid repository request' }),
  },
  {
    source: 'Invalid repository search',
    message: msg({ message: 'Invalid repository search' }),
  },
  {
    source: 'Invalid schema for media property {value0}',
    message: msg({ message: 'Invalid schema for media property {value0}' }),
    pattern: new RegExp('^Invalid schema for media property ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Invalid structured entry update',
    message: msg({ message: 'Invalid structured entry update' }),
  },
  {
    source: 'Invalid template request',
    message: msg({ message: 'Invalid template request' }),
  },
  {
    source: 'Invalid tracked actions',
    message: msg({ message: 'Invalid tracked actions' }),
  },
  {
    source: 'Invalid translation preference.',
    message: msg({ message: 'Invalid translation preference.' }),
  },
  {
    source: 'Invalid translation rename confirmation',
    message: msg({ message: 'Invalid translation rename confirmation' }),
  },
  {
    source: 'Invalid upload rename policy',
    message: msg({ message: 'Invalid upload rename policy' }),
  },
  {
    source: 'Invitation expired',
    message: msg({ message: 'Invitation expired' }),
  },
  {
    source: 'Invitation pending',
    message: msg({ message: 'Invitation pending' }),
  },
  { source: 'Invitation sent', message: msg({ message: 'Invitation sent' }) },
  {
    source: 'Item {value0} is empty; enter a value or remove this item',
    message: msg({
      message: 'Item {value0} is empty; enter a value or remove this item',
    }),
    pattern: new RegExp(
      '^Item ([\\s\\S]*?) is empty; enter a value or remove this item$',
    ),
    values: ['value0'],
  },
  {
    source: 'Item {value0} must be an object',
    message: msg({ message: 'Item {value0} must be an object' }),
    pattern: new RegExp('^Item ([\\s\\S]*?) must be an object$'),
    values: ['value0'],
  },
  { source: 'Items', message: msg({ message: 'Items' }) },
  {
    source:
      'Keep the current language suffix or folder when renaming a translation',
    message: msg({
      message:
        'Keep the current language suffix or folder when renaming a translation',
    }),
  },
  { source: 'Loading editor', message: msg({ message: 'Loading editor' }) },
  {
    source:
      'Locale codes overlap with the filename separator; choose another separator',
    message: msg({
      message:
        'Locale codes overlap with the filename separator; choose another separator',
    }),
  },
  {
    source: 'Locale folder anchor is outside the entry path',
    message: msg({ message: 'Locale folder anchor is outside the entry path' }),
  },
  {
    source: 'localized is only valid with i18n.scheme: fields',
    message: msg({
      message: 'localized is only valid with i18n.scheme: fields',
    }),
  },
  {
    source: 'Media {value0} was not found',
    message: msg({ message: 'Media {value0} was not found' }),
    pattern: new RegExp('^Media ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source: "Media actions cannot use a 'scope' of 'sidebar' or 'overview'.",
    message: msg({
      message:
        "Media actions cannot use a ''scope'' of ''sidebar'' or ''overview''.",
    }),
  },
  {
    source: 'Media asset path must identify a file',
    message: msg({ message: 'Media asset path must identify a file' }),
  },
  {
    source: 'Media configuration must be a string, object, or array',
    message: msg({
      message: 'Media configuration must be a string, object, or array',
    }),
  },
  {
    source: 'Media delivery is unavailable',
    message: msg({ message: 'Media delivery is unavailable' }),
  },
  {
    source: 'Media entries must be objects',
    message: msg({ message: 'Media entries must be objects' }),
  },
  {
    source: 'Media file exceeds the 20 MB limit',
    message: msg({ message: 'Media file exceeds the 20 MB limit' }),
  },
  {
    source: 'Media file not found',
    message: msg({ message: 'Media file not found' }),
  },
  {
    source: 'Media filename must be a non-empty file name',
    message: msg({ message: 'Media filename must be a non-empty file name' }),
  },
  {
    source: 'Media folder name is invalid',
    message: msg({ message: 'Media folder name is invalid' }),
  },
  {
    source: 'Media path is outside its configured root',
    message: msg({ message: 'Media path is outside its configured root' }),
  },
  {
    source:
      'Media property {value0} is required by core and cannot be modified',
    message: msg({
      message:
        'Media property {value0} is required by core and cannot be modified',
    }),
    pattern: new RegExp(
      '^Media property ([\\s\\S]*?) is required by core and cannot be modified$',
    ),
    values: ['value0'],
  },
  {
    source: 'Media session changed',
    message: msg({ message: 'Media session changed' }),
  },
  {
    source: 'Missing HTML policy handler',
    message: msg({ message: 'Missing HTML policy handler' }),
  },
  {
    source: 'Missing media path',
    message: msg({ message: 'Missing media path' }),
  },
  { source: 'Moving…', message: msg({ message: 'Moving…' }) },
  {
    source: 'Name must contain between 1 and 120 characters.',
    message: msg({
      message: 'Name must contain between 1 and 120 characters.',
    }),
  },
  { source: 'New entry', message: msg({ message: 'New entry' }) },
  {
    source: 'No image types are allowed in this media library.',
    message: msg({
      message: 'No image types are allowed in this media library.',
    }),
  },
  {
    source: 'No renderer is registered for field type "{value0}"',
    message: msg({
      message: 'No renderer is registered for field type "{value0}"',
    }),
    pattern: new RegExp(
      '^No renderer is registered for field type "([\\s\\S]*?)"$',
    ),
    values: ['value0'],
  },
  { source: 'Not found', message: msg({ message: 'Not found' }) },
  {
    source: 'OAuth authorization URL missing',
    message: msg({ message: 'OAuth authorization URL missing' }),
  },
  {
    source: 'Only GitHub users can manage the cache',
    message: msg({ message: 'Only GitHub users can manage the cache' }),
  },
  {
    source: 'Only GitHub users can run this action again',
    message: msg({ message: 'Only GitHub users can run this action again' }),
  },
  {
    source: 'PAGESCMS_REQUIRE_ACCESS_POLICY must be true or false',
    message: msg({
      message: 'PAGESCMS_REQUIRE_ACCESS_POLICY must be true or false',
    }),
  },
  { source: 'Picture', message: msg({ message: 'Picture' }) },
  {
    source: "Press '/' for commands",
    message: msg({ message: "Press ''/'' for commands" }),
  },
  {
    source: "Property '{value0}' isn't valid and will be ignored.",
    message: msg({
      message: "Property ''{value0}'' isn''t valid and will be ignored.",
    }),
    pattern: new RegExp(
      "^Property '([\\s\\S]*?)' isn't valid and will be ignored\\.$",
    ),
    values: ['value0'],
  },
  {
    source: 'Random upload names require an idempotency key',
    message: msg({ message: 'Random upload names require an idempotency key' }),
  },
  {
    source: 'Reference collection {value0} was not found',
    message: msg({ message: 'Reference collection {value0} was not found' }),
    pattern: new RegExp('^Reference collection ([\\s\\S]*?) was not found$'),
    values: ['value0'],
  },
  {
    source:
      'Reference collection has too many directories to browse. Narrow its configured path.',
    message: msg({
      message:
        'Reference collection has too many directories to browse. Narrow its configured path.',
    }),
  },
  {
    source: 'Reference pagination did not advance',
    message: msg({ message: 'Reference pagination did not advance' }),
  },
  {
    source: 'Reference request is too large',
    message: msg({ message: 'Reference request is too large' }),
  },
  { source: 'Remove', message: msg({ message: 'Remove' }) },
  {
    source: 'Renaming this content is disabled',
    message: msg({ message: 'Renaming this content is disabled' }),
  },
  { source: 'Renaming…', message: msg({ message: 'Renaming…' }) },
  {
    source: 'Repository configuration not found',
    message: msg({ message: 'Repository configuration not found' }),
  },
  {
    source: 'Repository ID is missing',
    message: msg({ message: 'Repository ID is missing' }),
  },
  {
    source: 'Repository identity is required for a draft',
    message: msg({ message: 'Repository identity is required for a draft' }),
  },
  {
    source: 'Repository mutation is already running',
    message: msg({ message: 'Repository mutation is already running' }),
  },
  {
    source: 'Repository search is too long',
    message: msg({ message: 'Repository search is too long' }),
  },
  { source: 'Rich text editor', message: msg({ message: 'Rich text editor' }) },
  {
    source: 'Runtime environment is invalid',
    message: msg({ message: 'Runtime environment is invalid' }),
  },
  {
    source: 'Schema is not a collection',
    message: msg({ message: 'Schema is not a collection' }),
  },
  {
    source: 'Search for a command to run...',
    message: msg({ message: 'Search for a command to run...' }),
  },
  {
    source: 'Select existing media or upload new files.',
    message: msg({ message: 'Select existing media or upload new files.' }),
  },
  { source: 'Select…', message: msg({ message: 'Select…' }) },
  {
    source: 'Sign in again before deleting your account.',
    message: msg({ message: 'Sign in again before deleting your account.' }),
  },
  {
    source: 'Sign in before modifying content.',
    message: msg({ message: 'Sign in before modifying content.' }),
  },
  {
    source: 'Sign in before modifying media.',
    message: msg({ message: 'Sign in before modifying media.' }),
  },
  {
    source: 'Sign in before running this operation.',
    message: msg({ message: 'Sign in before running this operation.' }),
  },
  {
    source: 'Sign in before uploading media.',
    message: msg({ message: 'Sign in before uploading media.' }),
  },
  {
    source: 'Sign in to continue.',
    message: msg({ message: 'Sign in to continue.' }),
  },
  {
    source: 'Sign-in could not be completed.',
    message: msg({ message: 'Sign-in could not be completed.' }),
  },
  {
    source:
      'Your sign-in provider did not confirm a verified email address. Verify your email with that provider and try again.',
    message: msg({
      message:
        'Your sign-in provider did not confirm a verified email address. Verify your email with that provider and try again.',
    }),
  },
  { source: 'Started', message: msg({ message: 'Started' }) },
  { source: 'Status', message: msg({ message: 'Status' }) },
  {
    source: 'Stopped tracking “{value0}”',
    message: msg({ message: 'Stopped tracking “{value0}”' }),
    pattern: new RegExp('^Stopped tracking “([\\s\\S]*?)”$'),
    values: ['value0'],
  },
  {
    source: 'That code has expired. Request a new one.',
    message: msg({ message: 'That code has expired. Request a new one.' }),
  },
  {
    source: 'That code is incorrect.',
    message: msg({ message: 'That code is incorrect.' }),
  },
  {
    source: 'The account is missing.',
    message: msg({ message: 'The account is missing.' }),
  },
  {
    source: 'The branch changed. Review and confirm the rename again.',
    message: msg({
      message: 'The branch changed. Review and confirm the rename again.',
    }),
  },
  {
    source:
      'The content configuration changed. Reload before reviewing your draft.',
    message: msg({
      message:
        'The content configuration changed. Reload before reviewing your draft.',
    }),
  },
  {
    source:
      'The content configuration changed. Your local draft is retained; restore the previous configuration before reopening it.',
    message: msg({
      message:
        'The content configuration changed. Your local draft is retained; restore the previous configuration before reopening it.',
    }),
  },
  {
    source:
      'The default locale must belong to i18n.locales; specify a local default when overriding the list',
    message: msg({
      message:
        'The default locale must belong to i18n.locales; specify a local default when overriding the list',
    }),
  },
  {
    source: 'The entry cannot be removed by a merge.',
    message: msg({ message: 'The entry cannot be removed by a merge.' }),
  },
  {
    source: 'The entry changed; refresh before renaming',
    message: msg({ message: 'The entry changed; refresh before renaming' }),
  },
  {
    source: 'The fields scheme requires a structured content format',
    message: msg({
      message: 'The fields scheme requires a structured content format',
    }),
  },
  {
    source: 'The file changed since the supplied revision',
    message: msg({ message: 'The file changed since the supplied revision' }),
  },
  {
    source: 'The file is already in this folder',
    message: msg({ message: 'The file is already in this folder' }),
  },
  {
    source:
      'The file was deleted, but a newer local draft was retained for download.',
    message: msg({
      message:
        'The file was deleted, but a newer local draft was retained for download.',
    }),
  },
  {
    source:
      'The file was renamed, but its local draft changed in another tab or the destination has a draft. The draft is retained for download.',
    message: msg({
      message:
        'The file was renamed, but its local draft changed in another tab or the destination has a draft. The draft is retained for download.',
    }),
  },
  {
    source: 'The filename has not changed',
    message: msg({ message: 'The filename has not changed' }),
  },
  {
    source: 'The filename or folder conflicts with a reserved locale name',
    message: msg({
      message: 'The filename or folder conflicts with a reserved locale name',
    }),
  },
  {
    source: 'The files scheme requires i18n.path',
    message: msg({ message: 'The files scheme requires i18n.path' }),
  },
  {
    source: 'The operation could not be completed.',
    message: msg({ message: 'The operation could not be completed.' }),
  },
  {
    source: 'The operation failed',
    message: msg({ message: 'The operation failed' }),
  },
  {
    source: 'The operation limit has been reached.',
    message: msg({ message: 'The operation limit has been reached.' }),
  },
  {
    source: 'The path has not changed',
    message: msg({ message: 'The path has not changed' }),
  },
  {
    source: 'The picture could not be read.',
    message: msg({ message: 'The picture could not be read.' }),
  },
  {
    source: 'The profile account is missing',
    message: msg({ message: 'The profile account is missing' }),
  },
  {
    source:
      'The raw Markdown body cannot be localized within one file; use separate files or a structured rich-text field',
    message: msg({
      message:
        'The raw Markdown body cannot be localized within one file; use separate files or a structured rich-text field',
    }),
  },
  {
    source: 'The repository at this address changed. Reload before continuing.',
    message: msg({
      message:
        'The repository at this address changed. Reload before continuing.',
    }),
  },
  {
    source: 'The repository at this address changed. Reload before saving.',
    message: msg({
      message: 'The repository at this address changed. Reload before saving.',
    }),
  },
  {
    source: 'The repository configuration is invalid',
    message: msg({ message: 'The repository configuration is invalid' }),
  },
  {
    source: 'The repository provider did not respond',
    message: msg({ message: 'The repository provider did not respond' }),
  },
  {
    source: 'The repository provider is rate limiting requests',
    message: msg({
      message: 'The repository provider is rate limiting requests',
    }),
  },
  {
    source: 'The repository provider is unavailable',
    message: msg({ message: 'The repository provider is unavailable' }),
  },
  {
    source: 'The signed-in account changed. This operation was not sent.',
    message: msg({
      message: 'The signed-in account changed. This operation was not sent.',
    }),
  },
  {
    source:
      'The source translation no longer exists. Refresh the language list and try again.',
    message: msg({
      message:
        'The source translation no longer exists. Refresh the language list and try again.',
    }),
  },
  {
    source: 'This account was deleted. Its local drafts cannot be saved.',
    message: msg({
      message: 'This account was deleted. Its local drafts cannot be saved.',
    }),
  },
  {
    source: 'This action cannot be cancelled',
    message: msg({ message: 'This action cannot be cancelled' }),
  },
  {
    source: 'This action cannot be cancelled yet',
    message: msg({ message: 'This action cannot be cancelled yet' }),
  },
  {
    source: 'This action has finished',
    message: msg({ message: 'This action has finished' }),
  },
  {
    source: 'This action is no longer configured for this run',
    message: msg({
      message: 'This action is no longer configured for this run',
    }),
  },
  {
    source: 'This browser could not prepare your picture.',
    message: msg({ message: 'This browser could not prepare your picture.' }),
  },
  {
    source: 'This collection does not allow subfolders',
    message: msg({ message: 'This collection does not allow subfolders' }),
  },
  {
    source: 'This content schema does not use a structured format',
    message: msg({
      message: 'This content schema does not use a structured format',
    }),
  },
  {
    source: 'This draft changed in another tab. Reload before continuing.',
    message: msg({
      message: 'This draft changed in another tab. Reload before continuing.',
    }),
  },
  {
    source: 'This feature is not available for this account.',
    message: msg({
      message: 'This feature is not available for this account.',
    }),
  },
  {
    source: 'This file already has an operation in progress.',
    message: msg({
      message: 'This file already has an operation in progress.',
    }),
  },
  {
    source: 'This file does not exist and creating it is disabled',
    message: msg({
      message: 'This file does not exist and creating it is disabled',
    }),
  },
  {
    source: 'This file extension is not allowed',
    message: msg({ message: 'This file extension is not allowed' }),
  },
  {
    source: 'This media item already has an operation in progress.',
    message: msg({
      message: 'This media item already has an operation in progress.',
    }),
  },
  {
    source: 'This operation is already in progress.',
    message: msg({ message: 'This operation is already in progress.' }),
  },
  {
    source: 'This picture could not be read.',
    message: msg({ message: 'This picture could not be read.' }),
  },
  {
    source: 'This picture could not be read. Try another image.',
    message: msg({
      message: 'This picture could not be read. Try another image.',
    }),
  },
  {
    source: 'This picture is too large. Try another image.',
    message: msg({ message: 'This picture is too large. Try another image.' }),
  },
  {
    source: 'This will start a GitHub Actions workflow.',
    message: msg({ message: 'This will start a GitHub Actions workflow.' }),
  },
  {
    source: 'TOML documents cannot contain a list at the root',
    message: msg({
      message: 'TOML documents cannot contain a list at the root',
    }),
  },
  {
    source: 'Too many tracked actions',
    message: msg({ message: 'Too many tracked actions' }),
  },
  {
    source:
      "Top-level actions may only use a 'scope' of 'sidebar' or 'overview'.",
    message: msg({
      message:
        "Top-level actions may only use a ''scope'' of ''sidebar'' or ''overview''.",
    }),
  },
  { source: 'Triggered by', message: msg({ message: 'Triggered by' }) },
  { source: 'Try again', message: msg({ message: 'Try again' }) },
  {
    source: 'Unknown content locale',
    message: msg({ message: 'Unknown content locale' }),
  },
  { source: 'Unknown user', message: msg({ message: 'Unknown user' }) },
  {
    source: 'Upload response omitted the ETag for {value0}',
    message: msg({ message: 'Upload response omitted the ETag for {value0}' }),
    pattern: new RegExp('^Upload response omitted the ETag for ([\\s\\S]*?)$'),
    values: ['value0'],
  },
  {
    source: 'Upload stopped because the signed-in account changed.',
    message: msg({
      message: 'Upload stopped because the signed-in account changed.',
    }),
  },
  { source: 'Uploading…', message: msg({ message: 'Uploading…' }) },
  {
    source:
      'Use the collection creation flow to create a new translation group',
    message: msg({
      message:
        'Use the collection creation flow to create a new translation group',
    }),
  },
  {
    source: 'User sessions revoked',
    message: msg({ message: 'User sessions revoked' }),
  },
  {
    source: 'useSidebar must be used within a SidebarProvider.',
    message: msg({
      message: 'useSidebar must be used within a SidebarProvider.',
    }),
  },
  {
    source: 'Verified repository identity is required for {value0}/{value1}',
    message: msg({
      message: 'Verified repository identity is required for {value0}/{value1}',
    }),
    pattern: new RegExp(
      '^Verified repository identity is required for ([\\s\\S]*?)/([\\s\\S]*?)$',
    ),
    values: ['value0', 'value1'],
  },
  {
    source: 'You can only cancel your own action runs',
    message: msg({ message: 'You can only cancel your own action runs' }),
  },
  {
    source: 'You do not have permission to do this.',
    message: msg({ message: 'You do not have permission to do this.' }),
  },
  {
    source:
      'Your draft changed during review. Close this dialog and review again.',
    message: msg({
      message:
        'Your draft changed during review. Close this dialog and review again.',
    }),
  },
  {
    source: 'Your draft is not ready. Reload and try again.',
    message: msg({ message: 'Your draft is not ready. Reload and try again.' }),
  },
  {
    source: 'Your signed-in account changed. Reload and try again.',
    message: msg({
      message: 'Your signed-in account changed. Reload and try again.',
    }),
  },

  {
    source: 'Uploading {current} of {total} files…',
    message: msg({
      message:
        '{total, plural, one {Uploading file…} other {Uploading {current} of # files…}}',
    }),
    pattern: /^Uploading (\d+) of (\d+) files…$/,
    values: ['current', 'total'],
  },
  {
    source: '{count} uploaded',
    message: msg({
      message:
        '{count, plural, one {# file uploaded} other {# files uploaded}}',
    }),
    pattern: /^(\d+) files? uploaded$/,
    values: ['count'],
  },
  {
    source: '{uploaded} of {total} files uploaded',
    message: msg({
      message:
        '{total, plural, one {{uploaded} of # file uploaded} other {{uploaded} of # files uploaded}}',
    }),
    pattern: /^(\d+) of (\d+) files uploaded$/,
    values: ['uploaded', 'total'],
  },
  {
    source: '{value0} must be a non-negative integer',
    message: msg({ message: '{value0} must be a non-negative integer' }),
    pattern: /^(.+) must be a non-negative integer$/,
    values: ['value0'],
  },
  {
    source: '{value0} must be a non-negative integer or -1',
    message: msg({ message: '{value0} must be a non-negative integer or -1' }),
    pattern: /^(.+) must be a non-negative integer or -1$/,
    values: ['value0'],
  },

  {
    source: '{value0} must be a list of file paths',
    message: msg({ message: '{value0} must be a list of file paths' }),
    pattern: /^([\s\S]*?) must be a list of file paths$/,
    values: ['value0'],
  },
  {
    source: '{value0} must be a list of valid values',
    message: msg({ message: '{value0} must be a list of valid values' }),
    pattern: /^([\s\S]*?) must be a list of valid values$/,
    values: ['value0'],
  },
  { source: 'Invalid value', message: msg({ message: 'Invalid value' }) },
]
