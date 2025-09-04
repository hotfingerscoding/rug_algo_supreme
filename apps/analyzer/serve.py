#!/usr/bin/env python3
"""
Prediction API Server for Rugs Research
Supports model registry and versioning
"""

import json
import os
import pickle
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import numpy as np
import sqlite3

# Pydantic models for API
class PredictionRequest(BaseModel):
    x: float
    t: float
    slope: float
    vol: float
    players: int
    wager: float

class PredictionResponse(BaseModel):
    p_rug_5s: float
    p_rug_10s: float
    meta: Dict[str, Any]

class ModelInfo(BaseModel):
    trained: bool
    version: Optional[str] = None
    trained_at: Optional[str] = None
    rounds_count: Optional[int] = None
    features: Optional[List[str]] = None

class ModelVersion(BaseModel):
    filename: str
    trained_at: str
    rounds_count: Optional[int] = None
    is_current: bool = False

class ModelSwitchRequest(BaseModel):
    version: str

# Global model state
model_5s = None
model_10s = None
scaler = None
model_info = {"trained": False}
current_model_path = None

app = FastAPI(
    title="Rugs Research API",
    description="Prediction API for rugs.fun analysis",
    version="1.0.0"
)

def load_model(model_path: str = None) -> bool:
    """Load model from specified path or try registry paths"""
    global model_5s, model_10s, scaler, model_info, current_model_path
    
    # Try different model paths in order of preference
    model_paths = []
    
    if model_path:
        model_paths.append(model_path)
    
    # Try registry current model
    registry_current = "../models/current.json"
    if os.path.exists(registry_current):
        model_paths.append(registry_current)
    
    # Try default data model
    default_model = "../data/model.json"
    if os.path.exists(default_model):
        model_paths.append(default_model)
    
    for path in model_paths:
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Deserialize models and scaler
            model_5s = pickle.loads(bytes.fromhex(data['model_5s']))
            model_10s = pickle.loads(bytes.fromhex(data['model_10s']))
            scaler = pickle.loads(bytes.fromhex(data['scaler']))
            
            # Update model info
            model_info = {
                "trained": True,
                "version": os.path.basename(path),
                "trained_at": data.get('trained_at', 'unknown'),
                "rounds_count": data.get('rounds_count', 0),
                "features": data.get('features', [])
            }
            
            current_model_path = path
            print(f"✓ Model loaded from {path}")
            return True
            
        except Exception as e:
            print(f"Failed to load model from {path}: {e}")
            continue
    
    print("❌ No valid model found")
    return False

def get_db_stats() -> dict:
    """Get database statistics"""
    try:
        conn = sqlite3.connect('../data/rugs.sqlite')
        cursor = conn.cursor()
        
        # Get table counts
        cursor.execute("SELECT COUNT(*) FROM rounds")
        rounds_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM ticks")
        ticks_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM events")
        events_count = cursor.fetchone()[0]
        
        # Get latest round
        cursor.execute("SELECT MAX(ended_at) FROM rounds WHERE ended_at IS NOT NULL")
        latest_round = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            "rounds": rounds_count,
            "ticks": ticks_count,
            "events": events_count,
            "latest_round": latest_round
        }
    except Exception as e:
        return {"error": str(e)}

def get_available_models() -> List[ModelVersion]:
    """Get list of available model versions"""
    models_dir = "../models"
    if not os.path.exists(models_dir):
        return []
    
    models = []
    current_model = None
    
    # Try to read current model symlink
    current_path = os.path.join(models_dir, "current.json")
    if os.path.exists(current_path):
        try:
            if os.path.islink(current_path):
                current_model = os.path.basename(os.readlink(current_path))
            else:
                # On Windows or if it's a copy, read the file to get the version
                with open(current_path, 'r') as f:
                    data = json.load(f)
                    current_model = data.get('version', 'current.json')
        except:
            current_model = "current.json"
    
    # Scan for model files
    for filename in os.listdir(models_dir):
        if filename.startswith("model-") and filename.endswith(".json"):
            model_path = os.path.join(models_dir, filename)
            try:
                with open(model_path, 'r') as f:
                    data = json.load(f)
                
                models.append(ModelVersion(
                    filename=filename,
                    trained_at=data.get('trained_at', 'unknown'),
                    rounds_count=data.get('rounds_count', 0),
                    is_current=(filename == current_model)
                ))
            except Exception as e:
                print(f"Error reading model {filename}: {e}")
    
    # Sort by training date (newest first)
    models.sort(key=lambda x: x.trained_at, reverse=True)
    return models

def switch_model(version: str) -> bool:
    """Switch to a different model version"""
    global current_model_path
    
    models_dir = "../models"
    model_path = os.path.join(models_dir, version)
    
    if not os.path.exists(model_path):
        return False
    
    # Load the new model
    if load_model(model_path):
        # Update current.json symlink
        current_path = os.path.join(models_dir, "current.json")
        try:
            if os.path.exists(current_path):
                os.unlink(current_path)
            
            if os.name == 'nt':  # Windows
                import shutil
                shutil.copy2(model_path, current_path)
            else:  # Unix-like
                os.symlink(version, current_path)
            
            print(f"✓ Switched to model version: {version}")
            return True
        except Exception as e:
            print(f"Warning: Could not update current.json: {e}")
            return True  # Model loaded successfully, just symlink failed
    else:
        return False

@app.get("/")
async def root():
    """Root endpoint with basic info"""
    return {
        "service": "Rugs Research API",
        "version": "1.0.0",
        "status": "running",
        "model_loaded": model_info["trained"]
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    db_stats = get_db_stats()
    return {
        "status": "healthy",
        "model_loaded": model_info["trained"],
        "model_version": model_info.get("version", "none"),
        "database": db_stats,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/model-info", response_model=ModelInfo)
async def model_info_endpoint():
    """Get current model information"""
    return ModelInfo(**model_info)

@app.get("/models", response_model=List[ModelVersion])
async def list_models():
    """Get list of available model versions"""
    return get_available_models()

@app.post("/models/switch")
async def switch_model_endpoint(request: ModelSwitchRequest):
    """Switch to a different model version"""
    if switch_model(request.version):
        return {"success": True, "version": request.version}
    else:
        raise HTTPException(status_code=404, detail=f"Model version {request.version} not found")

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """Make a prediction"""
    if not model_info["trained"]:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Prepare features
        features = np.array([[
            request.x,
            request.t,
            request.slope,
            request.vol,
            request.players,
            request.wager
        ]])
        
        # Scale features
        features_scaled = scaler.transform(features)
        
        # Make predictions
        p_rug_5s = float(model_5s.predict_proba(features_scaled)[0][1])
        p_rug_10s = float(model_10s.predict_proba(features_scaled)[0][1])
        
        return PredictionResponse(
            p_rug_5s=p_rug_5s,
            p_rug_10s=p_rug_10s,
            meta={
                "version": model_info.get("version", "unknown"),
                "trained_at": model_info.get("trained_at", "unknown"),
                "features_used": model_info.get("features", []),
                "prediction_time": datetime.now().isoformat()
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.post("/reload-model")
async def reload_model():
    """Reload the current model"""
    if load_model():
        return {"success": True, "model_info": model_info}
    else:
        raise HTTPException(status_code=500, detail="Failed to reload model")

if __name__ == "__main__":
    print("Loading model...")
    load_model()
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    print(f"Starting API server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
