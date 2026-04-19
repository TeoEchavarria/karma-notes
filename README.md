# Karma Notes

An Obsidian plugin that adds a Reddit-style voting system to your notes.

## Features

- **Daily ±1 range**: Each note can move ±1 point per day from its daily base score
- **Vote freely**: Click ↑ or ↓ multiple times, but score stays within daily range
- **Auto-decay**: Notes lose 1 point if not opened in 2 weeks
- **Starts at 2**: New notes begin with 2 karma points
- **Sidebar view**: Sort, filter, and manage all notes by karma
- **Status bar**: Shows active note's karma with emoji (🔥 ⭐ ❄️)

## How it works

Each day, a note's score can only be between `[base-1, base+1]`. For example, if a note has 5 points today, it can be voted to 4, 5, or 6—but no lower or higher until tomorrow when the base resets.

Use the sidebar (trophy icon) to view all notes with filters by karma range, tags, and other frontmatter properties.