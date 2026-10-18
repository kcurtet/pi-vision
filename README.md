# pi-vision

Vision tool for [pi](https://github.com/earendil-works/pi): lets **any** model — even
one without image support — "see" images.

The `vision` tool takes an image path (or URL) plus a question, runs a
vision-capable pi model headlessly, and returns its textual answer. The
calling agent never needs image support itself.

```
vision({ path: "screenshot.png", question: "Which button is focused?" })
→ [vision:zai-coding-cn/glm-5.3-flash] screenshot.png
  The button labeled "Deploy" is focused (blue outline).
```

## Install

```
pi install /path/to/pi-vision
```

or copy/symlink the directory into `~/.pi/agent/extensions/`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PI_VISION_MODEL` | `zai-coding-cn/glm-5.3-flash` | Vision model used headlessly |
| `PI_VISION_TIMEOUT_MS` | `60000` | Timeout per vision call |

## Notes

- Uses `pi --model <vision> --print @<image> --no-extensions` under the hood
  (`spawn` with stdin ignored — `execFile` makes headless pi hang).
- Local paths (`~`, relative to cwd) and `http(s)` URLs are supported.
- Failures are non-fatal: the tool returns `error: true` with the reason.
