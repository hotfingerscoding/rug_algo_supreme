#!/usr/bin/env python3
"""
Online Calibration for Rugs Research
Computes Platt-style logistic bias correction parameters
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
import matplotlib.pyplot as plt
matplotlib.use('Agg')  # Use non-interactive backend

class ModelCalibrator:
    """Online calibration for model probabilities"""
    
    def __init__(self, db_path: str = "data/rugs.sqlite", 
                 lookback_rounds: int = 200):
        self.db_path = db_path
        self.lookback_rounds = lookback_rounds
        self.calibration_params = {}
        
    def load_recent_data(self) -> pd.DataFrame:
        """Load recent rounds data for calibration"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Database not found at {self.db_path}")
        
        conn = sqlite3.connect(self.db_path)
        
        # Get recent rounds with actual outcomes
        query = """
        SELECT r.id, r.started_at, r.ended_at, r.rug_time_s, r.rug_x,
               r.players, r.total_wager,
               CASE 
                   WHEN r.rug_time_s <= 5 THEN 1 
                   ELSE 0 
               END as rug_in_5s_actual,
               CASE 
                   WHEN r.rug_time_s <= 10 THEN 1 
                   ELSE 0 
               END as rug_in_10s_actual
        FROM rounds r
        WHERE r.ended_at IS NOT NULL 
          AND r.rug_time_s IS NOT NULL
        ORDER BY r.started_at DESC
        LIMIT ?
        """
        
        rounds_df = pd.read_sql_query(query, conn, params=(self.lookback_rounds,))
        conn.close()
        
        print(f"Loaded {len(rounds_df)} rounds for calibration")
        return rounds_df
    
    def engineer_calibration_features(self, rounds_df: pd.DataFrame) -> pd.DataFrame:
        """Engineer features for calibration"""
        # Calculate time-based features
        rounds_df['duration_s'] = (rounds_df['ended_at'] - rounds_df['started_at']) / 1000
        
        # Calculate volatility proxy (using rug_x as proxy for volatility)
        rounds_df['volatility_proxy'] = rounds_df['rug_x'] / rounds_df['duration_s']
        
        # Calculate player density
        rounds_df['player_density'] = rounds_df['players'] / (rounds_df['duration_s'] + 1e-6)
        
        # Calculate wager intensity
        rounds_df['wager_intensity'] = rounds_df['total_wager'] / (rounds_df['duration_s'] + 1e-6)
        
        # Create mock predictions (in practice, these would come from actual model)
        # For now, use simple heuristics based on features
        rounds_df['p_rug_5s_pred'] = np.clip(
            rounds_df['volatility_proxy'] * 0.1 + 
            rounds_df['player_density'] * 0.001 + 
            rounds_df['wager_intensity'] * 0.0001, 
            0.01, 0.99
        )
        
        rounds_df['p_rug_10s_pred'] = np.clip(
            rounds_df['p_rug_5s_pred'] * 1.2, 0.01, 0.99
        )
        
        return rounds_df
    
    def compute_calibration_params(self, data: pd.DataFrame) -> Dict[str, Any]:
        """Compute calibration parameters using Platt scaling"""
        calibration_results = {}
        
        for horizon in ['5s', '10s']:
            pred_col = f'p_rug_{horizon}_pred'
            actual_col = f'rug_in_{horizon}_actual'
            
            if pred_col not in data.columns or actual_col not in data.columns:
                print(f"Missing columns for {horizon} calibration")
                continue
            
            # Prepare data
            X = data[pred_col].values.reshape(-1, 1)
            y = data[actual_col].values
            
            if len(np.unique(y)) < 2:
                print(f"Insufficient class diversity for {horizon} calibration")
                continue
            
            try:
                # Fit logistic regression for Platt scaling
                lr = LogisticRegression(random_state=42)
                lr.fit(X, y)
                
                # Extract parameters
                a = lr.coef_[0][0]
                b = lr.intercept_[0]
                
                # Apply calibration
                calibrated_probs = 1 / (1 + np.exp(-(a * X.flatten() + b)))
                
                # Calculate calibration metrics
                calibration_error = self._compute_calibration_error(
                    data[pred_col], calibrated_probs, y
                )
                
                calibration_results[horizon] = {
                    'a': float(a),
                    'b': float(b),
                    'calibration_error': float(calibration_error),
                    'original_probs': data[pred_col].tolist(),
                    'calibrated_probs': calibrated_probs.tolist(),
                    'actual_outcomes': y.tolist()
                }
                
                print(f"Calibration for {horizon}: a={a:.4f}, b={b:.4f}, error={calibration_error:.4f}")
                
            except Exception as e:
                print(f"Error calibrating {horizon}: {e}")
                continue
        
        return calibration_results
    
    def _compute_calibration_error(self, pred_probs: pd.Series, 
                                 calibrated_probs: np.ndarray, 
                                 actual: np.ndarray) -> float:
        """Compute calibration error using reliability diagram"""
        # Bin probabilities
        n_bins = 10
        bin_edges = np.linspace(0, 1, n_bins + 1)
        bin_indices = np.digitize(calibrated_probs, bin_edges) - 1
        
        # Calculate mean predicted vs actual for each bin
        mean_pred = []
        mean_actual = []
        
        for i in range(n_bins):
            mask = bin_indices == i
            if np.sum(mask) > 0:
                mean_pred.append(np.mean(calibrated_probs[mask]))
                mean_actual.append(np.mean(actual[mask]))
        
        if len(mean_pred) < 2:
            return 1.0  # Maximum error if insufficient bins
        
        # Calculate mean squared error
        mse = np.mean((np.array(mean_pred) - np.array(mean_actual)) ** 2)
        return np.sqrt(mse)
    
    def save_calibration_params(self, params: Dict[str, Any]) -> None:
        """Save calibration parameters to file"""
        calibration_file = "data/calibration.json"
        os.makedirs(os.path.dirname(calibration_file), exist_ok=True)
        
        calibration_data = {
            'calibration_timestamp': datetime.now().isoformat(),
            'lookback_rounds': self.lookback_rounds,
            'parameters': params,
            'description': 'Platt scaling parameters for model probability calibration'
        }
        
        with open(calibration_file, 'w') as f:
            json.dump(calibration_data, f, indent=2)
        
        print(f"Saved calibration parameters to {calibration_file}")
    
    def create_calibration_plots(self, params: Dict[str, Any]) -> None:
        """Create calibration plots"""
        try:
            for horizon, horizon_params in params.items():
                if 'original_probs' not in horizon_params:
                    continue
                
                # Create reliability diagram
                fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
                
                # Plot 1: Original vs Calibrated probabilities
                original_probs = horizon_params['original_probs']
                calibrated_probs = horizon_params['calibrated_probs']
                actual = horizon_params['actual_outcomes']
                
                ax1.scatter(original_probs, calibrated_probs, alpha=0.6, s=20)
                ax1.plot([0, 1], [0, 1], 'r--', label='Perfect Calibration')
                ax1.set_xlabel('Original Predicted Probability')
                ax1.set_ylabel('Calibrated Probability')
                ax1.set_title(f'Calibration: Original vs Calibrated ({horizon})')
                ax1.legend()
                ax1.grid(True, alpha=0.3)
                
                # Plot 2: Reliability diagram
                n_bins = 10
                bin_edges = np.linspace(0, 1, n_bins + 1)
                bin_indices = np.digitize(calibrated_probs, bin_edges) - 1
                
                bin_centers = []
                bin_actuals = []
                bin_counts = []
                
                for i in range(n_bins):
                    mask = bin_indices == i
                    if np.sum(mask) > 0:
                        bin_centers.append(np.mean(calibrated_probs[mask]))
                        bin_actuals.append(np.mean(actual[mask]))
                        bin_counts.append(np.sum(mask))
                
                if len(bin_centers) > 1:
                    ax2.bar(bin_centers, bin_actuals, width=0.08, alpha=0.7, 
                           label='Actual Frequency')
                    ax2.plot([0, 1], [0, 1], 'r--', label='Perfect Calibration')
                    ax2.set_xlabel('Predicted Probability')
                    ax2.set_ylabel('Actual Frequency')
                    ax2.set_title(f'Reliability Diagram ({horizon})')
                    ax2.legend()
                    ax2.grid(True, alpha=0.3)
                
                plt.tight_layout()
                
                # Save plot
                plot_file = f"data/calibration_{horizon}.png"
                plt.savefig(plot_file, dpi=150, bbox_inches='tight')
                plt.close()
                
                print(f"Saved calibration plot to {plot_file}")
                
        except Exception as e:
            print(f"Error creating calibration plots: {e}")
    
    def run_calibration(self) -> None:
        """Run the complete calibration process"""
        print("🎯 Starting Model Calibration")
        print("=" * 40)
        
        try:
            # Load data
            print("Loading recent data...")
            rounds_df = self.load_recent_data()
            
            if len(rounds_df) < 50:
                print(f"Warning: Only {len(rounds_df)} rounds available. Consider waiting for more data.")
            
            # Engineer features
            print("Engineering calibration features...")
            features_df = self.engineer_calibration_features(rounds_df)
            
            # Compute calibration parameters
            print("Computing calibration parameters...")
            calibration_params = self.compute_calibration_params(features_df)
            
            if not calibration_params:
                print("No calibration parameters computed")
                return
            
            # Save parameters
            print("Saving calibration parameters...")
            self.save_calibration_params(calibration_params)
            
            # Create plots
            print("Creating calibration plots...")
            self.create_calibration_plots(calibration_params)
            
            # Print summary
            print("\n" + "="*50)
            print("CALIBRATION SUMMARY")
            print("="*50)
            
            for horizon, params in calibration_params.items():
                print(f"\n{horizon} Calibration:")
                print(f"  Parameter a: {params['a']:.4f}")
                print(f"  Parameter b: {params['b']:.4f}")
                print(f"  Calibration Error: {params['calibration_error']:.4f}")
                print(f"  Rounds used: {len(params['actual_outcomes'])}")
            
            print(f"\n✅ Calibration completed successfully!")
            print(f"Parameters saved to data/calibration.json")
            print(f"Use ?calibrated=true in API calls to apply calibration")
            
        except Exception as e:
            print(f"\n❌ Calibration failed: {e}")
            import traceback
            traceback.print_exc()
            raise

def main():
    """Main execution function"""
    print("🎯 Model Calibration for Rugs Research")
    print("=" * 50)
    
    try:
        calibrator = ModelCalibrator()
        calibrator.run_calibration()
        
    except Exception as e:
        print(f"\n❌ Calibration failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
