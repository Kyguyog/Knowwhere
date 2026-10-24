These are development checks added while fixing the website. They verify playtime inactivity and upload throttling, AI quota policy, and browser behavior such as navigation, chat attachments, image previews, profiles, and the banned counter.

They are not loaded by the website and are not required to run it.

Run the local logic checks from the repository root:

```bash
node --test tests/*.test.cjs
```

`browser.cjs` checks the site using mocked Firebase/Gemini data; it does not access production accounts. `swf-browser.cjs` additionally checks the real Ruffle runtime. Browser dependencies and commands are documented in [the validation notes](../docs/todo-notes.md).

The Backup tool has its own independent tests under `tools/Backup/test/`.
