import os
import torch
import soundfile as sf
import librosa
import numpy as np
from transformers import pipeline

_classifier = None

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

def analyze_acoustic_features(audio: np.ndarray, sr: int) -> tuple[str, str]:
    """Extracts duration speed (Fast, Medium, Slow) and spectral tone (Deep, Air, Crisp)."""
    duration = len(audio) / sr
    
    # Speed modifier
    if duration < 0.6:
        speed = "Fast"
    elif duration < 1.8:
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

    return speed, tone

def classify_audio_sound(file_path: str, top_k: int = 5) -> list[tuple[str, float]]:
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

def predict_smart_name(file_path: str) -> str:
    try:
        audio, sr = sf.read(file_path)
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)
        speed, tone = analyze_acoustic_features(audio, sr)
    except Exception:
        speed, tone = "", ""

    predictions = classify_audio_sound(file_path, top_k=5)
    if not predictions:
        return "Unknown Sound"

    ignore = {'silence', 'music', 'sound effect', 'noise', 'white noise', 'inside, small room'}
    meaningful = [p for p in predictions if p[0].lower() not in ignore]
    if not meaningful:
        meaningful = predictions

    top_label, top_score = meaningful[0]
    clean_label = top_label.split(',')[0].strip().title()

    # Apply acoustic modifier if relevant to the sound class (e.g. Whooshes, Impacts, Hits, Sirens)
    whoosh_or_transient = any(k in clean_label.lower() for k in [
        'whoosh', 'swoosh', 'whip', 'swish', 'impact', 'slam', 'thump', 'hit',
        'zap', 'electric', 'explosion', 'laser', 'wind', 'splash'
    ])

    if whoosh_or_transient:
        modifiers = [m for m in [speed, tone] if m]
        if modifiers:
            return f"{' '.join(modifiers)} {clean_label}"

    return clean_label
