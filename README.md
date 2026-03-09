# Arcana

Your vault's hidden intelligence.

Arcana is an all-in-one Obsidian plugin that brings together AI chat, task management, voice input, smart organization, and science-backed productivity into one experience. It learns your vault structure and helps you think, plan, and get things done.

## Features

### AI Chat Sidebar

Open the chat panel from the ribbon icon or with the **Toggle chat panel** command.

- **Streaming responses** with token-by-token rendering and a typing indicator.
- **Markdown rendering** so AI responses show as proper Obsidian markdown including code blocks, lists, and links.
- **Copy and Save** buttons on every AI response to clipboard or as a new note.
- **New conversation** button (+) to clear the chat and start fresh.

### Context Modes

The context picker at the top of the chat controls what vault content the AI sees.

| Mode | What the AI receives |
|------|---------------------|
| **Note** | The currently active note. |
| **Folder** | All markdown notes in the active folder. |
| **Vault** | Keyword-scored search across the full vault. |
| **None** | Nothing from the vault, only your message. |

Click a mode button to select it. Click the same button again to deselect, which switches to None mode. This is handy when you paste external content or ask general questions where vault context would add noise.

The context system also includes:

- **Token counter** showing estimated token usage, with a warning when you approach the limit.
- **Note mentions** using `@[[note name]]` syntax to pull any note into your message.
- **Auto-context** that picks up on keywords like "search vault" or "this folder" and adjusts the mode for you. Once you manually click a button, your choice sticks until you start a new conversation.

### Slash Commands

Type `/` in the chat input to open the command menu. Use arrow keys to navigate and Enter or Tab to pick one.

All slash commands run independently of the context picker. They don't load folder or vault content unless they specifically need it.

#### `/task` - Create a task

```
/task Review vendor submission by Friday #work priority:high
```

Parses your input with AI to pull out the title, due date, priority, tags, context, and time estimate. Creates a task note with full frontmatter in your task folder.

#### `/summarize` - Summarize content

```
/summarize
/summarize [paste any text here]
```

With no arguments, it summarizes the active note. With pasted text, it summarizes that directly. Good for articles, meeting notes, or anything you want condensed.

#### `/find` - Search your vault

```
/find meeting notes about Q3 budget
```

Scores vault notes by keyword relevance across titles, tags, headings, and frontmatter. Returns the top matches with preview lines.

#### `/organize` - Triage your inbox

```
/organize
```

Reads all notes in your inbox folder (default: `Inbox/`, configurable in settings), compares them against your vault's folder structure, and suggests where each one belongs.

#### `/connect` - Find related notes

```
/connect
```

Looks at the active note's content, pulls out key themes, and finds related notes through keyword overlap, shared tags, and backlinks. Suggests wikilinks worth adding.

#### `/template` - Generate a note template

```
/template meeting notes for weekly standup
/template project planning doc
```

AI builds a complete Obsidian note template with YAML frontmatter, headings, placeholders, and checkboxes. Saves it as a new note and opens it for you.

#### `/focus` - Start a focus timer

```
/focus
/focus 30
```

Starts a countdown in the chat. Uses your configured work duration by default, or pass a number to set custom minutes. Shows a live timer that updates every second and tells you when time is up.

#### `/next` - Get your next task

```
/next
```

AI looks at all open tasks in your task folder, considers the time of day, your chronotype, due dates, and priorities, then picks exactly one task for you to work on right now. Not a list, not options. One task and one concrete first step to get started.

#### `/worktogether` - Body-double session

```
/worktogether reviewing vendor proposals 45
/worktogether writing blog post
```

Starts a co-working session. Tell it what you're working on and how long. The AI sends a start message, checks in at regular intervals (default: every 15 minutes, configurable), and wraps up with a summary when time runs out.

Research shows body doubling helps with task initiation and sustained focus, particularly for people with ADHD.

#### `/dump` - Brain dump

```
/dump I need to call the dentist and finish the Q3 report, oh and remind me to buy milk. Had an idea about restructuring the onboarding flow...
```

Pour out whatever is on your mind. AI processes the raw text and sorts it into:

- **Tasks** for action items.
- **Notes** for ideas and thoughts.
- **Reminders** for time-sensitive things.

Each item gets created as a proper file in your vault. Based on the Zeigarnik effect: writing things down frees up the mental space you were using to hold them.

#### `/evening` - End-of-day review

```
/evening
```

Pulls together your day:

1. What you completed today.
2. What's still open.
3. Asks what went well and what your top priority is for tomorrow.

Saves the review to your daily note, creating one if needed. Will pair with a future `/morning` command for a full daily cycle.

### AI Providers

Configure your provider in settings.

| Provider | How to set up |
|----------|--------------|
| **Anthropic (Claude)** | API key from console.anthropic.com. |
| **Google Gemini** | API key from aistudio.google.com. |
| **Ollama (local)** | Local install at localhost:11434, no key needed. |

All three stream responses. Use the **Test connection** button in settings to verify everything works.

### Vault Intelligence

On load, Arcana scans your vault to learn its structure:

- **Folder patterns** like by-project, by-date, by-type, or flat.
- **Tag taxonomy** including frequency, co-occurrence, and which folders use which tags.
- **Frontmatter schema** showing common properties across your notes.

This powers folder suggestions when creating notes and tag suggestions for new content. The cache refreshes automatically when files change.

### Task System

Tasks live as individual markdown files with YAML frontmatter:

```yaml
---
title: Review vendor submission
status: inbox
priority: high
created: 2026-03-09
due: 2026-03-14
tags:
  - work
  - vendors
context: Q3 review
time_estimate: 30
---
```

Statuses: `inbox`, `todo`, `doing`, `waiting`, `done`, `cancelled`.

Priorities: `urgent`, `high`, `medium`, `low`, `none`.

Natural language input supports tags (`#work`), priority markers (`priority:high`, `!!!`, `ASAP`), and due dates (`by Friday`, `due next Monday`, `before March 15`, `in 3 days`).

## Settings

Open via **Settings > Community plugins > Arcana**.

### General

- **AI provider** to pick between Anthropic, Gemini, or Ollama.
- **API key or endpoint** depending on provider.
- **Model** selection per provider.
- **Test connection** button to verify setup.
- **Debug logging** for verbose console output.

### Tasks

- **Task folder** where task notes go (default: `Tasks/`).

### Voice

- **Voice provider** choosing Web Speech API (free), OpenAI Whisper (cloud), or Local Whisper.

### Dashboard

- **Open on startup** to show the dashboard when Obsidian starts.
- **Auto morning briefing** to generate one on the first open of the day.

### Focus and Wellbeing

- **Chronotype** setting (morning lark, neutral, night owl) that shapes `/next` recommendations.
- **Focus work and break duration** for timer presets.
- **Flow protection** to defer break notifications while you are actively typing.
- **Body double check-in interval** controlling how often `/worktogether` checks in (default: 15 min).
- **Streak tracking** for daily task completion with configurable grace days.
- **Notification level** from none to verbose, with an ADHD-friendly minimal option.

### Privacy

- **Context scope** setting the default mode (note, folder, vault).
- **Max context tokens** to cap how much vault content goes to the AI.
- **Chat history folder** for where conversations get stored.

## Icons

Arcana uses Lucide icons, which ship with Obsidian as the built-in icon set. No external icon dependencies are needed. All icons (sparkles, send, copy, file-plus, timer, moon, brain, and others) come from the `setIcon()` API provided by Obsidian.

## Installation

### From source

```bash
git clone <repo-url> /path/to/vault/.obsidian/plugins/obsidian-arcana
cd /path/to/vault/.obsidian/plugins/obsidian-arcana
pnpm install
pnpm build
```

Enable the plugin in **Settings > Community plugins**.

### Development

```bash
pnpm dev     # Watch mode with auto-rebuild.
pnpm build   # Production build.
pnpm lint    # Run ESLint.
```

## Architecture

```
src/
├── main.ts                          # Plugin entry point.
├── settings.ts                      # Settings interface and UI.
├── constants.ts                     # Shared constants.
├── types.ts                         # TypeScript types.
├── core/
│   ├── ai/
│   │   ├── ai-engine.ts            # Provider registry and chat API.
│   │   ├── context.ts              # Context modes and note mentions.
│   │   ├── streaming.ts            # SSE/NDJSON parsers, retry logic.
│   │   └── providers/
│   │       ├── anthropic.ts        # Claude Messages API.
│   │       ├── gemini.ts           # Gemini REST API.
│   │       └── ollama.ts           # Local Ollama.
│   └── vault/
│       ├── vault-intel.ts          # Vault scanning and intelligence.
│       ├── note-creator.ts         # Note and task creation.
│       └── task-parser.ts          # Natural language to task parsing.
├── ui/
│   └── chat/
│       ├── ChatView.ts             # Main chat sidebar (ItemView).
│       ├── ChatInput.ts            # Input with mention and slash autocomplete.
│       ├── MessageList.ts          # Message rendering and streaming.
│       ├── ContextPicker.ts        # Note/Folder/Vault/None mode selector.
│       └── slash-commands/
│           ├── types.ts            # Command interface.
│           ├── registry.ts         # Command registry and parser.
│           └── commands/
│               ├── task.ts         # /task
│               ├── summarize.ts    # /summarize
│               ├── find.ts         # /find
│               ├── organize.ts     # /organize
│               ├── connect.ts      # /connect
│               ├── template.ts     # /template
│               ├── focus.ts        # /focus
│               ├── next.ts         # /next
│               ├── worktogether.ts # /worktogether
│               ├── dump.ts         # /dump
│               └── evening.ts      # /evening
└── utils/
    ├── dates.ts                    # Natural language date parsing.
    ├── frontmatter.ts              # YAML frontmatter generation.
    └── bases.ts                    # .base file generator.
```

## License

MIT. See [LICENSE](LICENSE) for the full text.
