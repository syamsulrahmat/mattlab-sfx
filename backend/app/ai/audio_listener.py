import os
import torch
import soundfile as sf
import librosa
import numpy as np
import re
from transformers import pipeline

_classifier = None

MUSIC_CLASSES = {
    'music', 'musical instrument', 'song', 'singing', 'orchestra', 'choir',
    'acoustic guitar', 'electric guitar', 'piano', 'synthesizer', 'theme music',
    'background music', 'jingle', 'drum kit', 'percussion', 'bass guitar',
    'ambient music', 'electronic music', 'soundtrack'
}

IGNORE_CLASSES = {
    'silence', 'sound effect', 'noise', 'white noise', 'inside, small room', 'sound',
    'static', 'distortion', 'radio'
}

def get_classifier():
    global _classifier
    if _classifier is None:
        print("Loading MIT Audio Spectrogram Transformer (AST)...")
        _classifier = pipeline(
            "audio-classification",
            model="MIT/ast-finetuned-audioset-10-10-0.4593",
            device="cpu"
        )
        print("AST Acoustic Classifier Ready!")
    return _classifier

def analyze_acoustic_features(audio: np.ndarray, sr: int) -> tuple[str, str, float]:
    duration = len(audio) / sr
    
    # Speed modifier
    if duration < 0.6:
        speed = "Fast"
    elif duration < 2.0:
        speed = "Medium"
    else:
        speed = "Slow"

    try:
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr).mean()
        if centroid < 1200:
            tone = "Deep"
        elif centroid > 3400:
            tone = "Air"
        else:
            tone = "Crisp"
    except Exception:
        tone = ""

    return speed, tone, duration

def classify_audio_sound(file_path: str, top_k: int = 6) -> list[tuple[str, float]]:
    try:
        classifier = get_classifier()
        audio, sr = sf.read(file_path)
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)

        max_samples = int(sr * 5.0)
        audio_clip = audio[:max_samples]

        results = classifier({"raw": audio_clip.astype(np.float32), "sampling_rate": sr}, top_k=top_k)
        return [(r["label"], float(r["score"])) for r in results]
    except Exception as e:
        print(f"Error classifying {file_path}: {e}")
        return []

def predict_smart_name(file_path: str, orig_name: str = "") -> tuple[str, bool]:
    """
    Returns (display_name, is_music).
    If music/song, preserves original title as-is.
    If SFX, generates 3 to 4 Title Case comma-separated keywords.
    """
    try:
        audio, sr = sf.read(file_path)
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)
        speed, tone, duration = analyze_acoustic_features(audio, sr)
    except Exception:
        speed, tone, duration = "", "", 0.0

    predictions = classify_audio_sound(file_path, top_k=6)
    if not predictions:
        return orig_name or "Unknown Sound", False

    # Check if this is a song/instrumental track (long duration > 35s or top prediction is music)
    top_label_lower = predictions[0][0].lower()
    is_music_class = any(mc in top_label_lower for mc in MUSIC_CLASSES)
    
    # Also check if file or path has music/bgm indications
    norm_path = file_path.lower()
    has_music_path = any(mkw in norm_path for mkw in ['/bgm/', '/music/', 'film score', 'instrumental', 'soundtrack'])

    if (duration > 35.0 and is_music_class) or (duration > 60.0) or (duration > 25.0 and has_music_path):
        # Keep music title as-is
        base = os.path.splitext(orig_name or os.path.basename(file_path))[0]
        # Clean obvious file brackets like [ 14882501 ] or (preview)
        clean_music_title = re.sub(r'\[\s*\d+\s*\]', '', base)
        clean_music_title = re.sub(r'\(preview\)', '', clean_music_title, flags=re.IGNORECASE)
        clean_music_title = re.sub(r'[_\-]+', ' ', clean_music_title).strip().title()
        return clean_music_title or base, True

    # Build 3 to 4 comma-separated Title Case keywords for SFX
    keywords = []

    # 1. Primary acoustic classes from predictions
    for label, score in predictions:
        parts = [p.strip().title() for p in label.replace('/', ',').split(',') if p.strip()]
        for part in parts:
            part_lower = part.lower()
            if part_lower not in IGNORE_CLASSES and part not in keywords:
                if not any(k.lower() in part_lower or part_lower in k.lower() for k in keywords):
                    keywords.append(part)
        if len(keywords) >= 2:
            break

    # 2. Add physical traits (Speed & Tone)
    if speed and speed not in keywords:
        keywords.append(speed)
    if tone and tone not in keywords:
        keywords.append(tone)

    # 3. If still fewer than 3 keywords, take additional classes from predictions
    if len(keywords) < 3:
        for label, score in predictions[2:]:
            parts = [p.strip().title() for p in label.replace('/', ',').split(',') if p.strip()]
            for part in parts:
                part_lower = part.lower()
                if part_lower not in IGNORE_CLASSES and part not in keywords:
                    if not any(k.lower() in part_lower or part_lower in k.lower() for k in keywords):
                        keywords.append(part)
                if len(keywords) >= 3:
                    break
            if len(keywords) >= 3:
                break

    # Limit strictly to 3 or 4 keywords
    selected = keywords[:4] if len(keywords) >= 4 else keywords[:3]

    if not selected:
        return orig_name or "Sound Effect", False

    return ", ".join(selected), False
