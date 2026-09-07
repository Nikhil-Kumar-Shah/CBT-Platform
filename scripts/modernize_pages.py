import re

def update_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Replace hardcoded dark-only colors with theme CSS variables
    text = text.replace('color: "#ffffff"', 'color: "var(--text-main)"')
    text = text.replace("color: '#ffffff'", "color: 'var(--text-main)'")
    text = text.replace('color = "#ffffff"', 'color = "var(--text-main)"')
    text = text.replace("color = '#ffffff'", "color = 'var(--text-main)'")
    text = text.replace('background: "#090d16"', 'background: "var(--bg-main)"')
    text = text.replace('backgroundColor: "#090d16"', 'backgroundColor: "var(--bg-main)"')
    text = text.replace('borderBottom: "1px solid rgba(255, 255, 255, 0.05)"', 'borderBottom: "1px solid var(--border-color)"')
    text = text.replace('borderBottom: "1px solid rgba(255, 255, 255, 0.06)"', 'borderBottom: "1px solid var(--border-color)"')
    text = text.replace('borderBottom: "1px solid rgba(255, 255, 255, 0.08)"', 'borderBottom: "1px solid var(--border-color)"')
    text = text.replace('border: "1px solid rgba(255, 255, 255, 0.08)"', 'border: "1px solid var(--border-color)"')
    text = text.replace('background: "rgba(255, 255, 255, 0.03)"', 'background: "var(--bg-surface-elevated)"')
    text = text.replace('background: "rgba(255, 255, 255, 0.02)"', 'background: "var(--bg-surface-elevated)"')
    text = text.replace('"rgba(255, 255, 255, 0.04)"', '"var(--bg-surface-elevated)"')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"Successfully processed {path}")

if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        update_file(p)
