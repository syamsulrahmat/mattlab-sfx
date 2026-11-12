import re

def tokenize_path(rel_path: str) -> list[str]:
    # Replace path separators, underscores, hyphens, dots with spaces
    cleaned = re.sub(r'[\/\\_\-\.\[\]\(\)\+]+', ' ', rel_path)
    # Split camelCase: "LaserShot" -> "Laser Shot"
    cleaned = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
    # Split numbers from letters: "Explosion01" -> "Explosion 01"
    cleaned = re.sub(r'([a-zA-Z])([0-9])', r'\1 \2', cleaned)
    cleaned = re.sub(r'([0-9])([a-zA-Z])', r'\1 \2', cleaned)
    
    tokens = [t.lower() for t in cleaned.split() if len(t) > 1 and not t.isdigit()]
    return list(dict.fromkeys(tokens))
