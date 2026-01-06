# Quick Start Guide - Replication Guide

## Prerequisites

Before replicating this project, ensure you have:

### Required Software
- **Node.js** 18+ and npm
- **Rust** 1.70+ (install via [rustup](https://rustup.rs/))
- **Git** for version control

### Platform-Specific Requirements

**macOS**:
```bash
xcode-select --install
brew install pkg-config
```

**Linux**:
```bash
sudo apt update
sudo apt install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

**Windows**:
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/lbjlaq/Antigravity-Manager.git
cd Antigravity-Manager

# Install frontend dependencies
npm install

# The Rust dependencies will be installed automatically on first build
```

## Step 2: Development

### Run in Development Mode

```bash
# Start Tauri dev mode (frontend + backend hot-reload)
npm run tauri dev
```

This will:
1. Start Vite dev server on `http://localhost:1420`
2. Compile Rust backend
3. Launch desktop window
4. Enable hot-reload for both frontend and backend

### Frontend Only

```bash
# Run only the React dev server
npm run dev
```

Visit `http://localhost:1420` in your browser (without Tauri features).

## Step 3: Build for Production

### Build Desktop App

```bash
# Build production bundle
npm run tauri build
```

**Output locations**:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Linux**: `src-tauri/target/release/bundle/deb/` or `appimage/`
- **Windows**: `src-tauri/target/release/bundle/msi/`

### Build Configuration

Edit `src-tauri/tauri.conf.json`:

```json
{
  "package": {
    "productName": "Antigravity Tools",
    "version": "3.3.15"
  },
  "build": {
    "distDir": "../dist",
    "devPath": "http://localhost:1420"
  },
  "bundle": {
    "identifier": "com.antigravity.tools",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.15"
    }
  }
}
```

## Step 4: Understanding Key Files

### Frontend Entry Point

**src/main.tsx**:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n'; // i18next setup
import './index.css'; // Global styles

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Backend Entry Point

**src-tauri/src/lib.rs**:
```rust
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize database
            let db = modules::db::init_database()?;
            
            // Run migrations
            modules::migration::run_migrations(&db)?;
            
            // Setup logger
            modules::logger::init_logger()?;
            
            // Create system tray
            modules::tray::create_tray(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::account::get_accounts,
            commands::account::switch_account,
            commands::proxy::start_proxy_server,
            // ... all IPC commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Step 5: Implementing Key Features

### Adding a New IPC Command

1. **Define command in `src-tauri/src/commands/`**:

```rust
// src-tauri/src/commands/example.rs
use tauri::State;

#[tauri::command]
pub async fn my_new_command(input: String) -> Result<String, String> {
    // Your logic here
    Ok(format!("Processed: {}", input))
}
```

2. **Register in lib.rs**:

```rust
.invoke_handler(tauri::generate_handler![
    commands::example::my_new_command,
    // ... other commands
])
```

3. **Call from frontend**:

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<string>('my_new_command', {
  input: 'test'
});
```

### Adding a New Page

1. **Create page component**:

```typescript
// src/pages/NewPage.tsx
export default function NewPage() {
  return (
    <div className="p-6">
      <h1>New Page</h1>
    </div>
  );
}
```

2. **Add route in App.tsx**:

```typescript
import NewPage from './pages/NewPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      // ... existing routes
      {
        path: 'new-page',
        element: <NewPage />,
      },
    ],
  },
]);
```

3. **Add navigation link**:

```typescript
<Link to="/new-page">New Page</Link>
```

### Adding Database Tables

1. **Create migration**:

```rust
// src-tauri/src/modules/migration.rs
fn migrate_v6(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE my_table (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}
```

2. **Update migration runner**:

```rust
if current_version < 6 {
    migrate_v6(conn)?;
    set_schema_version(conn, 6)?;
}
```

## Step 6: Common Customizations

### Change App Icon

Replace files in `src-tauri/icons/`:
- `icon.png` (512x512 or 1024x1024)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Regenerate with:
```bash
npm run tauri icon path/to/your/icon.png
```

### Change App Name

**package.json**:
```json
{
  "name": "your-app-name",
  "version": "1.0.0"
}
```

**src-tauri/tauri.conf.json**:
```json
{
  "package": {
    "productName": "Your App Name"
  },
  "bundle": {
    "identifier": "com.yourcompany.yourapp"
  }
}
```

**src-tauri/Cargo.toml**:
```toml
[package]
name = "your_app_name"
version = "1.0.0"
```

### Customize Proxy Port

**src-tauri/src/proxy/config.rs**:
```rust
const DEFAULT_PORT: u16 = 8080; // Change from 8045
```

## Step 7: Testing

### Run Tests

```bash
# Rust backend tests
cd src-tauri
cargo test

# Frontend tests (if configured)
npm test
```

### Manual Testing Checklist

- [ ] Account OAuth flow works
- [ ] Account switching updates UI
- [ ] Proxy server starts/stops
- [ ] API requests route correctly
- [ ] Configuration persists
- [ ] Database migrations run
- [ ] Logs are created

## Step 8: Deployment

### macOS

```bash
npm run tauri build

# Sign the app (requires Apple Developer account)
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name" \
  "src-tauri/target/release/bundle/macos/Antigravity Tools.app"

# Create DMG
hdiutil create -volname "Antigravity Tools" \
  -srcfolder "src-tauri/target/release/bundle/macos/Antigravity Tools.app" \
  -ov -format UDZO "Antigravity-Tools.dmg"
```

### Linux

```bash
npm run tauri build

# DEB package
dpkg-deb --info src-tauri/target/release/bundle/deb/*.deb

# AppImage
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
```

### Windows

```bash
npm run tauri build

# MSI installer at:
# src-tauri/target/release/bundle/msi/
```

## Step 9: Distribution

### GitHub Releases

1. Create a new release on GitHub
2. Upload build artifacts:
   - `.dmg` for macOS
   - `.deb` / `.AppImage` for Linux
   - `.msi` for Windows
3. Write release notes

### Homebrew (macOS)

Create a Cask formula:

```ruby
cask "your-app" do
  version "1.0.0"
  sha256 "..."
  
  url "https://github.com/you/your-app/releases/download/v#{version}/app.dmg"
  name "Your App"
  desc "Description"
  homepage "https://your-website.com"
  
  app "Your App.app"
end
```

## Troubleshooting

### Build Errors

**Error**: "webkit2gtk not found"
```bash
# Linux
sudo apt install libwebkit2gtk-4.0-dev
```

**Error**: "failed to run custom build command for tauri"
```bash
# Clear cache and rebuild
rm -rf src-tauri/target
cargo clean
npm run tauri build
```

### Runtime Errors

**Database locked**:
```rust
// Use WAL mode
conn.execute("PRAGMA journal_mode=WAL", [])?;
```

**CORS errors in proxy**:
```rust
// Check CORS middleware configuration
.layer(cors_layer())
```

## Next Steps

1. Read `01-PROJECT-OVERVIEW.md` for architecture understanding
2. Review `03-BACKEND-GUIDE.md` for Rust implementation details
3. Study `04-PROXY-SERVER.md` to understand the proxy system
4. Explore `06-FRONTEND-GUIDE.md` for React patterns
5. Check `07-DATABASE.md` for schema details

## Resources

- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Axum Documentation](https://docs.rs/axum/)
- [TailwindCSS](https://tailwindcss.com/)
