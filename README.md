# 🚀 Enterprise Portal (PORTAL OS)

Welcome to the newly rebuilt **Enterprise Portal**. This project has been refactored from a simple mockup to a high-end, responsive company hub with custom dark theme aesthetics, glassmorphic UI components, and **physical JSON databases** in place of client-side `localStorage`.

---

## ✨ Features & UX Enhancements

- **📊 Live Welcome Dashboard**: Real-time stats are queried directly from each module's database upon startup and returning to the home screen.
- **🏝️ macOS style Dock**: A beautiful navigation dock with magnify-on-hover scaling, dynamic tooltips, and an active module status indicator.
- **📂 Physical JSON Databases**: Data is read and saved directly on the filesystem in the respective module folders (`modules/{module}/db.json`).
- **🗃️ Standards & Skills Repository**: Features a searchable catalog, contributor rankings, and **Likes/Upvotes** that persist to the database.
- **📜 Procedural Guide Library**: Converts step-by-step instructions into interactive, checkable checklists to help developers track their execution progress.
- **⏰ Meetings Manager**: Computes meeting urgency status (Upcoming, In Progress, Past) and groups minutes.
- **🔑 Secure Message Tunnel**: Decrypts cryptographic XOR feeds on-the-fly inside the browser when a matching security key is input.
- **📖 Alphabetical glossary**: A-Z dictionary indexes with dynamic letter headers to quickly filter company jargon.

---

## 🛠️ How to Start the App

The application features a zero-dependency backend server built using Node.js's native HTTP core modules. You do not need to install any node modules (`npm install`) to run it!

To launch the local web server and open the portal:

1. **Run the Server**:
   ```bash
   node server.js
   ```
2. **Open your Browser**:
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 📂 Project Structure

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
