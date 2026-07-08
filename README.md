# Internal App 

---

## Features & UX Enhancements

- **Live Welcome Dashboard**: Real-time stats are queried directly from each module's database upon startup and returning to the home screen.
- **macOS style Dock**: A beautiful navigation dock with magnify-on-hover scaling, dynamic tooltips, and an active module status indicator.
- **JSON Databases**: Data is read and saved directly on the filesystem in the respective module folders (`modules/{module}/db.json`).
- **Standards & Skills Repository**: Features a searchable catalog, contributor rankings, and **Likes/Upvotes** that persist to the database.
- **Procedural Guide Library**: Converts step-by-step instructions into interactive, checkable checklists to help developers track their execution progress.
- **Meetings Manager**: Computes meeting urgency status (Upcoming, In Progress, Past) and groups minutes.
- **Secure Message Tunnel**: Decrypts cryptographic XOR feeds on-the-fly inside the browser when a matching security key is input.
- **glossary**: A-Z dictionary indexes with dynamic letter headers to quickly filter company jargon.

---

## How to Start the App

To launch the local web server and open the portal:

**Run the start file**:
   ```bash
   ./start.sh
   ```
---

## Project Structure

```
├── app.js               # Root portal controller (loads iframe & dashboard metrics)
├── index.html           # Main entry point (Header dashboard, Glowing background, macOS dock)
├── server.js            # Zero-dependency HTTP static and REST API backend server
├── styles.css           # Premium theme styling variables, keyframes & dock magnification
└── modules/
    ├── apps/            # App registry module (HTML, JS, CSS, physical db.json)
    ├── calendar/        # Scheduler & event calendar module (HTML, JS, physical db.json)
    ├── glossary/        # A-Z dictionary module (HTML, JS, physical db.json)
    ├── goals/           # Weekly progress & leaderboard module (HTML, JS, physical db.json)
    ├── meetings/        # Meeting minutes tracker module (HTML, JS, physical db.json)
    ├── messages/        # XOR-based secure messaging module (HTML, JS, physical db.json)
    ├── procedures/      # Interactive runbooks checklist module (HTML, JS, physical db.json)
    └── skills/          # Upvotable standards repository module (HTML, JS, physical db.json)
```
