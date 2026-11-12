UCS_CATEGORIES = {
    "AMB": ("Ambience", ["ambience", "atmosphere", "background", "roomtone", "hum", "wind", "rain", "forest", "city", "ocean", "beach"]),
    "WPN": ("Weapons", ["weapon", "gun", "laser", "shot", "blaster", "bullet", "reload", "sword", "knife", "explosion", "bomb", "grenade", "cannon"]),
    "FOY": ("Foley", ["foley", "footstep", "step", "walk", "run", "cloth", "rustle", "movement", "handling", "grab", "drop"]),
    "WSH": ("Whooshes", ["whoosh", "swoosh", "transition", "passby", "flyby", "whip"]),
    "HIT": ("Impacts & Hits", ["hit", "impact", "punch", "smash", "thud", "crash", "strike", "slam"]),
    "VEH": ("Vehicles", ["vehicle", "car", "engine", "motor", "drive", "plane", "airplane", "jet", "helicopter", "ship", "boat", "train", "siren"]),
    "SCI": ("Sci-Fi", ["scifi", "sci-fi", "alien", "robot", "cyber", "teleport", "forcefield", "warp", "drone", "space"]),
    "UI":  ("User Interface", ["ui", "button", "click", "beep", "notification", "select", "interface", "menu", "pop", "alert", "error", "confirm"]),
    "VOX": ("Voices & Vocals", ["vocal", "voice", "scream", "grunt", "laugh", "cry", "breath", "cough", "whisper", "shout"]),
    "MUS": ("Musical & Stingers", ["stinger", "riser", "drop", "hit", "trailer", "cinematic", "accent", "chord", "braam", "downer"]),
    "ANI": ("Animals", ["animal", "dog", "bark", "cat", "meow", "bird", "chirp", "roar", "growl", "insect", "horse"]),
    "WAT": ("Water", ["water", "splash", "drip", "bubble", "stream", "flow", "underwater", "pour", "liquid"]),
    "CRD": ("Crowds", ["crowd", "applause", "cheer", "audience", "chatter", "clapping"])
}

def match_ucs(tokens: list[str]) -> tuple[str, str]:
    token_set = {t.lower() for t in tokens}
    for code, (cat_name, keywords) in UCS_CATEGORIES.items():
        for kw in keywords:
            if kw in token_set:
                return code, cat_name
    return "MISC", "Miscellaneous"
