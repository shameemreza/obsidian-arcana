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
- **Conversation history** that persists across plugin reloads.
- **Auto-titling** that names conversations based on what was discussed, not just what was asked.

### Chat History

Conversations are saved as markdown files in your vault (default: `.arcana/chats/`). Each file has YAML frontmatter with the title, timestamps, and message count.

- **Auto-save** after every message exchange and when the chat panel closes.
- **History picker** (clock icon in the header) to browse, search, and load previous conversations.
- **Active conversation badge** so you always know which chat you're in.
- **Delete per conversation** with a trash icon on hover, or **Delete all** to clear history.
- **AI-generated titles** using both your message and the AI's response for accuracy. Slash command conversations get titled too.

The history folder is configurable in **Settings > Privacy > Chat history folder**.

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

#### `/breakdown` - Break down a task into subtasks

```
/breakdown
```

Opens the current task note, analyzes it with AI, and splits it into smaller, concrete subtasks. Each subtask becomes its own task note inside a subfolder named after the parent task, with a `parent_task` link back to the original. The parent task gets a `subtask_progress` field (like `"2/5"`) that updates automatically as you complete subtasks. Completing a subtask shows a brief checkmark animation as micro-win feedback.

The AI decides how many subtasks to create based on complexity (anywhere from 2 to 12+), generates short action-phrase titles, and writes detailed descriptions into each subtask's body. Subtasks inherit the parent's priority, tags, context, and due date.

#### `/evening` - End-of-day review

```
/evening
```

Pulls together your day:

1. What you completed today.
2. What's still open.
3. Asks what went well and what your top priority is for tomorrow.

Saves the review to your daily note, creating one if needed. Pairs with `/morning` for a full daily cycle.

### Custom Commands (Agent Skills)

Create your own slash commands as markdown files in `.arcana/commands/`. Each file defines a goal, available tools, and instructions. The AI acts as a lightweight agent that decides which tools to call, gathers data, and produces a final result.

#### Getting started

The `.arcana` folder is hidden by default in Obsidian's file explorer — Obsidian hides all dot-prefixed folders, just like the `.obsidian` configuration folder. The official docs explain how to find it: [Configuration folder](https://help.obsidian.md/configuration-folder) and [Vault settings](https://help.obsidian.md/data-storage#Vault+settings).

To access `.arcana/commands/`:

1. Open your vault folder in your OS file manager (Finder, Explorer, etc.).
2. Show hidden files:
   - **macOS**: press `Cmd+Shift+.` in Finder.
   - **Windows**: enable **Hidden items** in the Explorer View menu.
   - **Linux**: press `Ctrl+H` or enable hidden files in your file manager.
3. Navigate to `.arcana/commands/` and create or edit `.md` files there.

You can also open the folder from the terminal:

```bash
cd /path/to/your/vault/.arcana/commands
open .    # macOS
start .   # Windows
xdg-open . # Linux
```

**Tip**: The community plugin [Show Hidden Files](https://github.com/polyipseity/obsidian-show-hidden-files) makes dotfolders like `.arcana` visible directly in Obsidian's file explorer so you can edit command files without leaving the app.

Once you add or edit a `.md` file in `.arcana/commands/`, Arcana picks it up automatically and the new `/command` appears in the slash menu. No restart needed.

#### File format

```markdown
---
name: morning
description: Morning briefing with tasks and priorities
icon: sunrise
output: chat
output_folder: Daily Notes
tools:
  - name: open_tasks
    source: vault
    description: Search for open tasks in the vault.
  - name: daily_note
    source: note
    description: Read today's daily note.
  - name: project_notes
    source: folder
    description: Read notes from a folder.
---

You are a morning briefing assistant.

Use the available tools to understand what's on the user's plate today.
Write a brief, energizing morning briefing covering:

1. Today's tasks sorted by priority.
2. Overdue items flagged clearly.
3. Suggested focus for the day.

If a tool returns nothing, skip that section and work with what you have.
```

#### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | The slash command name. Users type `/name` in chat. |
| `description` | No | Shown in the autocomplete dropdown. Defaults to "Custom command: name". |
| `icon` | No | A [Lucide](https://lucide.dev/icons/) icon name (up to v0.446.0). Defaults to `terminal`. |
| `output` | No | Where the result goes: `chat` (default), `note` (creates a new note), or `both`. |
| `output_folder` | No | Target folder when output includes `note`. |
| `tools` | No | List of tools the AI can call. See below. |

#### Tool sources

| Source | Input | What it does |
|--------|-------|-------------|
| `vault` | `query` | Keyword search across the entire vault. Returns matching notes with excerpts. |
| `note` | `name` | Read a specific note by name or path. |
| `folder` | `folder` | Read all markdown files in a folder. |
| `mcp` | — | Call an MCP server tool. Not available yet — coming in a future update. |

Each tool needs a `name`, `source`, and `description`. The description helps the AI understand when to use it.

#### How it works

1. User types `/morning` in chat.
2. Arcana loads the command file and parses frontmatter + instructions.
3. The AI receives the instructions and a list of available tools.
4. The AI decides which tools to call and in what order (agent loop).
5. Tool results feed back into the AI context for reasoning.
6. The AI produces the final output.
7. Output is routed to chat, a new note, or both based on the `output` field.

The agent loop runs up to 6 iterations. If a tool fails or returns nothing, the AI skips it and works with what it has.

#### Icons

Obsidian ships Lucide icons up to **v0.446.0**. Browse the full set at [lucide.dev/icons](https://lucide.dev/icons/). Some good picks for commands:

`sunrise` `moon` `lightbulb` `calendar-check` `brain` `search` `terminal` `zap` `list-checks` `pen-line` `sparkles` `clipboard-list` `compass` `rocket` `target` `book-open` `git-branch` `database` `cpu` `shield`

#### Shipped examples

Arcana creates three example commands on first run:

- **`/morning`** — Morning briefing with tasks and priorities.
- **`/weekly-review`** — Weekly review saved as a note.
- **`/brainstorm`** — Brainstorm ideas using vault context.

Edit or delete these to make them your own.

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
time_estimate: 30 min
---
```

Statuses: `inbox`, `todo`, `doing`, `waiting`, `done`, `cancelled`.

Priorities: `urgent`, `high`, `medium`, `low`, `none`.

Natural language input supports tags (`#work`), priority markers (`priority:high`, `!!!`, `ASAP`), and due dates (`by Friday`, `due next Monday`, `before March 15`, `in 3 days`).

#### Time estimates

Time estimates are stored with human-readable units: `10 min`, `1 hr`, `1 hr 30 min`, `1 day`. When you enter a number in the task modal, it is treated as minutes and formatted automatically. Legacy bare numbers (like `30`) are still read correctly.

#### Task chunking and subtasks

Use the **Break down current task into subtasks** command (or `/breakdown` in chat) to split any task into smaller pieces. AI analyzes the task and creates concrete subtasks, each as its own note inside a subfolder:

```
Tasks/
  Personal/
    Review vendor submission/
      Review vendor submission.md           <-- parent task
      2026-03-10-check-pricing.md           <-- subtask
      2026-03-10-verify-references.md       <-- subtask
      2026-03-10-draft-summary.md           <-- subtask
```

Each subtask has a `parent_task` frontmatter field linking back to the parent. The parent has a `subtask_progress` field like `"1/3"` that updates automatically when subtasks are completed. Completing a subtask triggers a brief checkmark animation.

Subtasks inherit the parent's priority, tags, context, due date, and scheduled date. The AI generates short titles and writes detailed instructions into each subtask's body.

#### Bases views

Run **Generate task views** from the command palette to create `.base` files for the Obsidian Bases plugin. Views include Upcoming, Task Schedule, and a Kanban board, all showing parent task links and subtask progress columns.

#### Property types

Arcana registers frontmatter property types on load so Obsidian displays the correct icons in the Properties panel. Fields like `parent_task`, `subtask_progress`, `status`, `priority`, `context`, and `time_estimate` all get proper type indicators instead of the default question mark.

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

### Custom Commands

- Shows how many custom commands are loaded and their names.
- See [Custom Commands (Agent Skills)](#custom-commands-agent-skills) above for how to create and edit commands.

### Privacy

- **Context scope** setting the default mode (note, folder, vault).
- **Max context tokens** to cap how much vault content goes to the AI.
- **Chat history folder** for where conversations get stored.

## Icons

Arcana uses Lucide icons, which ship with Obsidian as the built-in icon set (up to v0.446.0). No external icon dependencies are needed. Browse the full icon set at [lucide.dev/icons](https://lucide.dev/icons/). All icons come from the `setIcon()` API provided by Obsidian.

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
│   ├── chat-history.ts             # Conversation persistence as markdown files.
│   ├── commands/
│   │   ├── types.ts                # CustomCommand, ToolDefinition types.
│   │   ├── skill-loader.ts         # Scan .arcana/commands/, parse YAML.
│   │   ├── skill-runner.ts         # Agent loop with tool-calling.
│   │   └── vault-tools.ts          # Vault/note/folder tool implementations.
│   └── vault/
│       ├── vault-intel.ts          # Vault scanning and intelligence.
│       ├── note-creator.ts         # Note and task creation.
│       ├── task-parser.ts          # Natural language to task parsing.
│       ├── task-scanner.ts         # Task discovery and indexing.
│       ├── task-lifecycle.ts       # Status changes, completion, recurrence.
│       ├── task-chunking.ts        # AI subtask generation and progress.
│       └── recurrence.ts           # Recurring task date computation.
├── ui/
│   ├── chat/
│   │   ├── ChatView.ts             # Main chat sidebar (ItemView).
│   │   ├── ChatInput.ts            # Input with mention and slash autocomplete.
│   │   ├── MessageList.ts          # Message rendering and streaming.
│   │   ├── ContextPicker.ts        # Note/Folder/Vault/None mode selector.
│   │   ├── ConversationPicker.ts   # History browser modal with delete.
│   │   └── slash-commands/
│   │       ├── types.ts            # Command interface.
│   │       ├── registry.ts         # Command registry with dynamic registration.
│   │       └── commands/
│   │           ├── task.ts         # /task
│   │           ├── summarize.ts    # /summarize
│   │           ├── find.ts         # /find
│   │           ├── organize.ts     # /organize
│   │           ├── connect.ts      # /connect
│   │           ├── template.ts     # /template
│   │           ├── focus.ts        # /focus
│   │           ├── next.ts         # /next
│   │           ├── worktogether.ts # /worktogether
│   │           ├── dump.ts         # /dump
│   │           ├── evening.ts      # /evening
│   │           └── breakdown.ts    # /breakdown
│   └── tasks/
│       ├── TaskModal.ts            # Full task creation/edit modal.
│       ├── QuickTaskModal.ts       # Quick capture modal.
│       └── ExtractTasksModal.ts    # Extract tasks from note content.
└── utils/
    ├── dates.ts                    # Natural language date parsing.
    ├── frontmatter.ts              # YAML frontmatter and time formatting.
    └── bases.ts                    # .base file generator for Bases plugin.
```

## License

MIT. See [LICENSE](LICENSE) for the full text.
