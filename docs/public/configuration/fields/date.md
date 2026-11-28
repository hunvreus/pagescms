---
title: Date
description: A date or date-and-time picker with a configurable stored format.
---

A date picker, or a date-and-time picker with `time: true`.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: published_at
  type: date
  options:
    time: true
    format: "yyyy-MM-dd'T'HH:mm"
```

A saved value in YAML or Markdown front matter might look like:

```yaml
published_at: '2026-05-12T14:30'
```

New entries start with today's date (and the current time with `time: true`). To start empty, set `default: ""`. A date is just a value: it doesn't schedule anything.

## Options

| Option       | Description                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `time`       | `true` to include a time picker.                                                                                          |
| `format`     | How the value is stored, using [date-fns tokens](https://date-fns.org/docs/format), such as `yyyy-MM-dd` or `dd/MM/yyyy`. |
| `min`, `max` | Earliest and latest allowed values, such as `2026-01-01`.                                                                 |
| `step`       | Step of the picker: days for dates, seconds with `time: true`, such as `60` for whole minutes. `any` removes it.          |

Formats are applied on the server. If your `format` includes a timezone offset, it uses the server's timezone, so check the saved value.
