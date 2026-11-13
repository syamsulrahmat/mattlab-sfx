import os
import torch
import soundfile as sf
import numpy as np
from transformers import pipeline

_classifier = None

def get_classifier():
    global _classifier
    if _classifier is None:
        print("Loading MIT Audio Spectrogram Transformer (AST) trained on AudioSet...")
        _classifier = pipeline(
            "audio-classification",
            model="MIT/ast-finetuned-audioset-10-10-0.4593",
            device="cpu"
        )
        print("AST Acoustic Classifier Ready!")
    return _classifier

def classify_audio_sound(file_path: str, top_k: int = 5) -> list[tuple[str, float]]:
    try:
        classifier = get_classifier()
        # Read with soundfile
        audio, sr = sf.read(file_path)
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1) # Downmix to mono

        # Trim or pad to first 5 seconds
        max_samples = int(sr * 5.0)
        audio = audio[:max_samples]

        results = classifier({"raw": audio.astype(np.float32), "sampling_rate": sr}, top_k=top_k)
        return [(r["label"], float(r["score"])) for r in results]
    except Exception as e:
        print(f"Error classifying {file_path}: {e}")
        return []

def predict_smart_name(file_path: str) -> str:
    predictions = classify_audio_sound(file_path, top_k=5)
    if not predictions:
        return "Unknown Sound"

    # Filter out generic background labels
    ignore = {'silence', 'music', 'sound effect', 'noise', 'white noise', 'inside, small room'}
    meaningful = [p for p in predictions if p[0].lower() not in ignore]
    if not meaningful:
        meaningful = predictions

    top_label, top_score = meaningful[0]
    # Clean label formatting (e.g. "Air horn, truck horn" -> "Air Horn")
    clean_label = top_label.split(',')[0].strip()
    return clean_label.title()
