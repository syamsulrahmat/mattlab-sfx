# MattLab SFX

Fast, self-hosted sound effects asset manager and search engine tailored for 30,000+ audio assets.

## Features
- **Instant Preview**: Pre-calculated waveform peak caching renders waveforms in `< 5ms`.
- **High-Speed Search**: SQLite FTS5 index covering filenames, path tokens, BWF/iXML metadata, and Universal Category System (UCS) codes.
- **Auto Metadata Harvester**: Extracts Broadcast Wave Format (BWF), iXML chunks, and ID3 tags.
- **Path & Tokenizer**: Deconstructs folder hierarchies and camel/snake_case file names into search tokens.
- **Universal Category System (UCS)**: Automatic category mapping (e.g. `AMB`, `WPN`, `WHOOSH`, `FOLEY`).
- **Desktop Workflow**: Spacebar play/pause, up/down navigation, one-click Windows SMB path copy (`\\MATTLAB\Assets\Sound effects\...`).
