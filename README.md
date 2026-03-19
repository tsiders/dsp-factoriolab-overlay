# DSP Factoriolab Overlay

An always-on-top Windows desktop overlay that loads [Factoriolab for Dyson Sphere Program](https://factoriolab.github.io/dsp) — so you can plan your factory without alt-tabbing.

---

## Features

- **Frameless, always-on-top window** — renders over borderless-windowed and fullscreen games
- **Hotkey toggle** — show/hide the overlay with a single key (default: `F9`)
- **Auto-detects DSP** — hotkey only activates while `DSPGAME.exe` is running; hides automatically when the game closes
- **Remembers position and size** between sessions
- **System tray** — lives in the tray with right-click Show/Hide/Quit options
- **Launches at Windows startup** automatically

---

## Installation

1. Download the latest `.exe` installer from [Releases](../../releases)
2. Run the installer and follow the prompts
3. The overlay will start minimized to the system tray

---

## Usage

1. Launch **DSP Factoriolab Overlay** (or it will auto-start with Windows)
2. Start **Dyson Sphere Program**
3. Once DSP is detected, press `F9` to show the overlay
4. Press `F9` again (or right-click the tray icon) to hide it
5. Drag and resize the window as needed — position is saved automatically

---

## Configuration

The config file is located at:

```
%APPDATA%\dsp-factoriolab-overlay\config.json
```

You can edit it with any text editor. Changes take effect on next launch.

### Options

| Key | Default | Description |
|-----|---------|-------------|
| `hotkey` | `"F9"` | Toggle hotkey. Uses [Electron accelerator syntax](https://www.electronjs.org/docs/latest/api/accelerator) (e.g. `"F9"`, `"Ctrl+Shift+D"`, `"Alt+F1"`) |
| `url` | `"https://factoriolab.github.io/dsp"` | The URL loaded in the overlay window |
| `window.width` | `1280` | Default window width (used only on first launch) |
| `window.height` | `800` | Default window height (used only on first launch) |

### Example config

```json
{
  "hotkey": "F8",
  "url": "https://factoriolab.github.io/dsp",
  "window": {
    "width": 1440,
    "height": 900
  }
}
```

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- Windows (required for packaging the Windows installer)

### Steps

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/dsp-factoriolab-overlay.git
cd dsp-factoriolab-overlay

# Install dependencies
npm install

# Run in development mode
npm start

# Build the Windows installer
npm run build
```

The installer will be output to `dist/`.

---

## Notes

- The overlay window is **fully interactive** (not click-through) when visible, so you can use the Factoriolab UI normally.
- To remove the app from Windows startup, open Task Manager → Startup tab and disable **DSP Factoriolab Overlay**, or uninstall the app.
- If the hotkey conflicts with another app, change it in `config.json` (see above).

---

## License

MIT
