#!/usr/bin/env python3
"""
Market Regime Detection for Rugs Research
Detects low_vol, normal, high_vol regimes based on volatility and slope patterns
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Tuple, Literal, Any
from dataclasses import dataclass

@dataclass
class RegimeConfig:
    """Configuration for regime detection"""
    lookback_rounds: int = 200
    vol_low_threshold: float = 0.1
    vol_high_threshold: float = 0.3
    slope_low_threshold: float = 0.05
    slope_high_threshold: float = 0.15
    min_rounds_per_regime: int = 50

@dataclass
class RegimeInfo:
    """Information about a detected regime"""
    regime: Literal['low_vol', 'normal', 'high_vol']
    start_round: int
    end_round: int
    round_count: int
    avg_volatility: float
    avg_slope: float
    vol_std: float
    slope_std: float
    detected_at: str

class RegimeDetector:
    """Detects market regimes based on volatility and slope patterns"""
    
    def __init__(self, config_path: str = "config/regime.json"):
        self.config = self._load_config(config_path)
        self.regimes = []
    
    def _load_config(self, config_path: str) -> RegimeConfig:
        """Load configuration from JSON file"""
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config_dict = json.load(f)
                return RegimeConfig(**config_dict)
            else:
                print(f"Regime config file {config_path} not found, using defaults")
                return RegimeConfig()
        except Exception as e:
            print(f"Error loading regime config: {e}, using defaults")
            return RegimeConfig()
    
    def load_recent_data(self, db_path: str, lookback_rounds: int = None) -> pd.DataFrame:
        """Load recent rounds data for regime detection"""
        if lookback_rounds is None:
            lookback_rounds = self.config.lookback_rounds
        
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database not found at {db_path}")
        
        conn = sqlite3.connect(db_path)
        
        # Get recent rounds with their features
        query = """
        SELECT r.id, r.started_at, r.ended_at, r.rug_time_s, r.rug_x,
               AVG(t.x) as avg_x,
               STDDEV(t.x) as vol_x,
               AVG(ABS(t.slope)) as avg_slope,
               COUNT(t.id) as tick_count
        FROM rounds r
        LEFT JOIN ticks t ON r.id = t.round_id
        WHERE t.phase = 'live'
        GROUP BY r.id
        ORDER BY r.started_at DESC
        LIMIT ?
        """
        
        rounds_df = pd.read_sql_query(query, conn, params=(lookback_rounds,))
        conn.close()
        
        # Calculate additional features
        rounds_df['duration_s'] = (rounds_df['ended_at'] - rounds_df['started_at']) / 1000
        rounds_df['volatility'] = rounds_df['vol_x'] / (rounds_df['avg_x'] + 1e-6)
        rounds_df['slope_magnitude'] = rounds_df['avg_slope']
        
        # Remove rounds with insufficient data
        rounds_df = rounds_df[rounds_df['tick_count'] >= 10]
        
        print(f"Loaded {len(rounds_df)} rounds for regime detection")
        return rounds_df
    
    def detect_regime(self, data: pd.DataFrame) -> Literal['low_vol', 'normal', 'high_vol']:
        """Detect regime for a given dataset"""
        if len(data) < self.config.min_rounds_per_regime:
            return 'normal'  # Default to normal if insufficient data
        
        # Calculate aggregate statistics
        avg_vol = data['volatility'].mean()
        avg_slope = data['slope_magnitude'].mean()
        
        # Determine regime based on thresholds
        if avg_vol < self.config.vol_low_threshold and avg_slope < self.config.slope_low_threshold:
            return 'low_vol'
        elif avg_vol > self.config.vol_high_threshold or avg_slope > self.config.slope_high_threshold:
            return 'high_vol'
        else:
            return 'normal'
    
    def detect_regime_changes(self, data: pd.DataFrame) -> List[RegimeInfo]:
        """Detect regime changes over time"""
        if len(data) < self.config.min_rounds_per_regime:
            return []
        
        # Sort by start time (oldest first)
        data = data.sort_values('started_at').reset_index(drop=True)
        
        regimes = []
        current_regime = None
        regime_start = 0
        
        # Use sliding window approach
        window_size = min(self.config.min_rounds_per_regime, len(data) // 4)
        
        for i in range(0, len(data) - window_size + 1, window_size // 2):
            window_data = data.iloc[i:i + window_size]
            regime = self.detect_regime(window_data)
            
            if regime != current_regime:
                # End previous regime
                if current_regime is not None:
                    regime_info = RegimeInfo(
                        regime=current_regime,
                        start_round=data.iloc[regime_start]['id'],
                        end_round=data.iloc[i-1]['id'],
                        round_count=i - regime_start,
                        avg_volatility=data.iloc[regime_start:i]['volatility'].mean(),
                        avg_slope=data.iloc[regime_start:i]['slope_magnitude'].mean(),
                        vol_std=data.iloc[regime_start:i]['volatility'].std(),
                        slope_std=data.iloc[regime_start:i]['slope_magnitude'].std(),
                        detected_at=datetime.now().isoformat()
                    )
                    regimes.append(regime_info)
                
                # Start new regime
                current_regime = regime
                regime_start = i
        
        # Add final regime
        if current_regime is not None:
            regime_info = RegimeInfo(
                regime=current_regime,
                start_round=data.iloc[regime_start]['id'],
                end_round=data.iloc[-1]['id'],
                round_count=len(data) - regime_start,
                avg_volatility=data.iloc[regime_start:]['volatility'].mean(),
                avg_slope=data.iloc[regime_start:]['slope_magnitude'].mean(),
                vol_std=data.iloc[regime_start:]['volatility'].std(),
                slope_std=data.iloc[regime_start:]['slope_magnitude'].std(),
                detected_at=datetime.now().isoformat()
            )
            regimes.append(regime_info)
        
        return regimes
    
    def get_current_regime(self, db_path: str) -> RegimeInfo:
        """Get the current market regime"""
        data = self.load_recent_data(db_path)
        current_regime = self.detect_regime(data)
        
        # Create regime info for current state
        regime_info = RegimeInfo(
            regime=current_regime,
            start_round=data.iloc[0]['id'] if len(data) > 0 else 0,
            end_round=data.iloc[-1]['id'] if len(data) > 0 else 0,
            round_count=len(data),
            avg_volatility=data['volatility'].mean() if len(data) > 0 else 0,
            avg_slope=data['slope_magnitude'].mean() if len(data) > 0 else 0,
            vol_std=data['volatility'].std() if len(data) > 0 else 0,
            slope_std=data['slope_magnitude'].std() if len(data) > 0 else 0,
            detected_at=datetime.now().isoformat()
        )
        
        return regime_info
    
    def save_regime_thresholds(self, regime: str, thresholds: Dict[str, Any]) -> None:
        """Save regime-specific thresholds"""
        filename = f"data/thresholds_{regime}.json"
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        # Add regime metadata
        thresholds['regime'] = regime
        thresholds['detected_at'] = datetime.now().isoformat()
        
        with open(filename, 'w') as f:
            json.dump(thresholds, f, indent=2)
        
        print(f"Saved {regime} regime thresholds to {filename}")
    
    def create_regime_symlink(self, target_regime: str) -> None:
        """Create symlink from thresholds.json to regime-specific file"""
        source_file = f"data/thresholds_{target_regime}.json"
        target_file = "data/thresholds.json"
        
        if os.path.exists(source_file):
            # Remove existing symlink/file
            if os.path.exists(target_file):
                os.remove(target_file)
            
            # Create symlink (or copy on Windows)
            try:
                os.symlink(source_file, target_file)
                print(f"Created symlink: {target_file} -> {source_file}")
            except OSError:
                # Fallback to copy on systems that don't support symlinks
                import shutil
                shutil.copy2(source_file, target_file)
                print(f"Copied {source_file} to {target_file}")
        else:
            print(f"Warning: Source file {source_file} not found")

def main():
    """Main execution function for regime detection"""
    print("🎯 Market Regime Detection")
    print("=" * 40)
    
    try:
        detector = RegimeDetector()
        
        # Detect current regime
        current_regime = detector.get_current_regime("data/rugs.sqlite")
        
        print(f"Current regime: {current_regime.regime}")
        print(f"Rounds analyzed: {current_regime.round_count}")
        print(f"Average volatility: {current_regime.avg_volatility:.4f}")
        print(f"Average slope: {current_regime.avg_slope:.4f}")
        
        # Create regime-specific threshold files if they don't exist
        for regime in ['low_vol', 'normal', 'high_vol']:
            threshold_file = f"data/thresholds_{regime}.json"
            if not os.path.exists(threshold_file):
                # Create default thresholds for this regime
                default_thresholds = {
                    "cash_if_p5_gt": 0.25 if regime == 'low_vol' else 0.30 if regime == 'normal' else 0.35,
                    "sidebet_if_p10_gt": 0.35 if regime == 'low_vol' else 0.40 if regime == 'normal' else 0.45,
                    "min_confidence": 0.55,
                    "regime": regime,
                    "trained_at": datetime.now().isoformat(),
                    "rounds_used": 0,
                    "metrics": {
                        "total_return": 0.0,
                        "sharpe_ratio": 0.0,
                        "max_drawdown": 0.0,
                        "prob_ruin": 0.0
                    }
                }
                detector.save_regime_thresholds(regime, default_thresholds)
        
        # Set current regime as active
        detector.create_regime_symlink(current_regime.regime)
        
        print(f"\n✅ Regime detection completed. Active regime: {current_regime.regime}")
        
    except Exception as e:
        print(f"\n❌ Regime detection failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
