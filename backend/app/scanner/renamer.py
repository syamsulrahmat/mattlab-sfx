import re
import os

GENERIC_NAMES = {
    'sfx', 'sound', 'fx', 'track', 'audio', 'file', 'sample', 'effect',
    'hit', 'whoosh', 'transition', 'button', 'buttons', 'click', 'clicks',
    'ambient', 'ambience', 'trailer', 'intro', 'loop', 'looped', 'outro'
}

def clean_segment(s: str) -> str:
    # Remove vendor IDs like [ 1372391 ]
    s = re.sub(r'\[\s*\d+\s*\]', '', s)
    # Remove leading numbering like "42. " or "01 - " or "10 "
    s = re.sub(r'^\s*\d+[\.\-_ ]+', '', s)
    # Remove extensions
    s = re.sub(r'\.(wav|mp3|flac|aif|aiff|ogg)$', '', s, flags=re.IGNORECASE)
    # Strip common library vendor prefixes (e.g. "BT ", "RH_", "ESM_")
    s = re.sub(r'^(BT|RH|ESM|SW|PSE|CINE)[\s\-_]+', '', s, flags=re.IGNORECASE)
    # Replace underscores, hyphens with spaces
    s = re.sub(r'[_\-]+', ' ', s)
    # Split camelCase
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s)
    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def generate_smart_name(filename: str, pack: str = "", folder: str = "", title: str = "") -> str:
    # 1. Use embedded metadata title if clean and meaningful
    if title and len(title) > 2 and not title.lower().startswith('untitled'):
        cleaned_title = clean_segment(title)
        if len(cleaned_title) > 2:
            return cleaned_title.title()

    base_name = os.path.splitext(filename)[0]
    cleaned_file = clean_segment(base_name)

    # Detect if filename is purely numeric or generic (e.g. "01", "SFX 01", "Impact 01")
    words = [w.lower() for w in re.findall(r'[a-zA-Z]+', cleaned_file)]
    is_mostly_generic = not words or all(w in GENERIC_NAMES for w in words) or len(cleaned_file) <= 3

    # If generic, incorporate immediate parent folder context
    if is_mostly_generic and folder:
        # Take the most specific folder segment
        folder_parts = [clean_segment(p) for p in folder.replace('\\', '/').split('/') if p.strip()]
        folder_parts = [p for p in folder_parts if p and not re.match(r'^[A-Z0-9]$', p, flags=re.IGNORECASE)]
        
        if folder_parts:
            context = folder_parts[-1]
            # Avoid repeating words
            if cleaned_file and cleaned_file.lower() not in context.lower():
                return f"{context.title()} - {cleaned_file.title()}".strip()
            return context.title()

    # If clean_file has content, title case it
    if cleaned_file:
        return cleaned_file.title()

    return base_name
