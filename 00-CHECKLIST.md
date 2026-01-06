# REPLICATION CHECKLIST

Use this checklist when replicating the Antigravity Manager project.

## 📋 Setup Phase

- [ ] Install Node.js 18+ and npm
- [ ] Install Rust 1.70+ via rustup
- [ ] Install platform-specific dependencies
  - [ ] macOS: Xcode command line tools, pkg-config
  - [ ] Linux: webkit2gtk, build-essential, libssl-dev
  - [ ] Windows: Visual Studio Build Tools, WebView2
- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Verify `npm run tauri dev` works

## 🏗️ Architecture Understanding

- [ ] Read `01-PROJECT-OVERVIEW.md`
- [ ] Understand the three-tier architecture
- [ ] Review technology stack choices
- [ ] Understand frontend ↔ backend communication (IPC)
- [ ] Review data flow diagrams in `02-ARCHITECTURE.md`

## 🦀 Backend Implementation

- [ ] Read `03-BACKEND-GUIDE.md` thoroughly
- [ ] Understand Tauri entry points (main.rs, lib.rs)
- [ ] Review command system (IPC handlers)
- [ ] Study account management (OAuth flow)
- [ ] Understand database operations (SQLite)
- [ ] Review process management
- [ ] Study the proxy server integration

## 🌐 Proxy Server

- [ ] Read `04-PROXY-SERVER.md`
- [ ] Understand Axum server architecture
- [ ] Study middleware stack (CORS, auth, monitor)
- [ ] Review protocol mappers (OpenAI, Claude, Gemini)
- [ ] Understand token manager & account rotation
- [ ] Review rate limiting & retry logic
- [ ] Study streaming responses (SSE)
- [ ] Test proxy endpoints with curl

## 🛣️ Routing System

- [ ] Read `05-ROUTING-SYSTEM.md`
- [ ] Understand model mapping (3-layer system)
- [ ] Review built-in mappings
- [ ] Study smart routing features
  - [ ] Background task detection
  - [ ] Image model routing
  - [ ] Thinking mode routing
- [ ] Understand account selection algorithm
- [ ] Test custom model mappings

## ⚛️ Frontend Development

- [ ] Read `06-FRONTEND-GUIDE.md`
- [ ] Understand React + TypeScript setup
- [ ] Review routing (React Router v7)
- [ ] Study state management (Zustand)
- [ ] Review key pages:
  - [ ] Dashboard
  - [ ] Accounts
  - [ ] API Proxy
  - [ ] Monitor
  - [ ] Settings
- [ ] Understand component architecture
- [ ] Review styling (TailwindCSS + DaisyUI)
- [ ] Test internationalization (i18next)

## 💾 Database

- [ ] Read `07-DATABASE.md`
- [ ] Understand SQLite schema
- [ ] Review data models
- [ ] Study CRUD operations
- [ ] Understand migration system
- [ ] Test database backup/restore
- [ ] Review monitoring logs table

## 🚀 Quick Start

- [ ] Follow `08-QUICK-START.md`
- [ ] Build development version
- [ ] Build production version
- [ ] Test on target platform
- [ ] Create distribution package

## 🔧 Customization

- [ ] Change app name and identifier
- [ ] Replace app icon
- [ ] Customize default configuration
- [ ] Adjust proxy default port (if needed)
- [ ] Update branding/colors
- [ ] Modify translations

## ✅ Testing

- [ ] Test OAuth flow
  - [ ] Authorization URL generation
  - [ ] Callback server
  - [ ] Token exchange
  - [ ] Token refresh
- [ ] Test account management
  - [ ] Add account
  - [ ] Switch account
  - [ ] Delete account
  - [ ] Quota refresh
- [ ] Test proxy server
  - [ ] Start/stop
  - [ ] OpenAI protocol
  - [ ] Claude protocol
  - [ ] Gemini protocol
  - [ ] Model mapping
  - [ ] Account rotation
  - [ ] Rate limiting
  - [ ] Error handling
- [ ] Test configuration
  - [ ] Settings persistence
  - [ ] Hot-reload
  - [ ] Export/import
- [ ] Test monitoring
  - [ ] Request logging
  - [ ] Log viewing
  - [ ] Statistics

## 📦 Build & Distribution

- [ ] Build for macOS
  - [ ] Create .dmg
  - [ ] Code sign (if applicable)
- [ ] Build for Linux
  - [ ] Create .deb
  - [ ] Create AppImage
- [ ] Build for Windows
  - [ ] Create .msi
  - [ ] Test installer
- [ ] Create GitHub release
- [ ] Write release notes
- [ ] Upload artifacts

## 📚 Documentation

- [ ] Document your customizations
- [ ] Update README if needed
- [ ] Create user guide
- [ ] Document API endpoints
- [ ] Create troubleshooting guide

## 🐛 Troubleshooting

Common issues to check:

- [ ] Database path is correct for your platform
- [ ] OAuth redirect URI matches config
- [ ] Proxy port is not already in use
- [ ] All dependencies are installed
- [ ] Rust version is compatible
- [ ] Node version is compatible
- [ ] Build tools are installed
- [ ] Filesystem permissions are correct

## 📝 Notes

Use this space to track your specific customizations or issues:

```
Date: _______________

Customizations:
- 
- 

Issues encountered:
- 
- 

Solutions:
- 
- 
```

## 🎯 Project Milestones

Track your progress:

- [ ] Basic setup complete
- [ ] Can run in dev mode
- [ ] Understands architecture
- [ ] Can modify backend
- [ ] Can modify frontend
- [ ] Can build production app
- [ ] Can create installer
- [ ] Ready to customize
- [ ] Ready to deploy

---

**Good luck with your replication!** 🚀

If you get stuck, refer back to the detailed markdown files in this folder:
1. 01-PROJECT-OVERVIEW.md
2. 02-ARCHITECTURE.md
3. 03-BACKEND-GUIDE.md
4. 04-PROXY-SERVER.md
5. 05-ROUTING-SYSTEM.md
6. 06-FRONTEND-GUIDE.md
7. 07-DATABASE.md
8. 08-QUICK-START.md
